const REWARD_MS = 6 * 60 * 60 * 1000;
const MAX_MS = 72 * 60 * 60 * 1000;
const CLAIM_MS = 10 * 60 * 1000;
const MAX_REWARDED_HOURS = 72;

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUser(request, env);
        if (!user) return json({ success: false, error: "Unauthorized" }, 401);
        if (String(user.role).toLowerCase() === "admin") return json({ success: true, required: false, reason: "admin" });
        if (isPremium(user)) return json({ success: true, required: false, reason: "premium" });

        const key = await getLatestKey(env.DB, user.id);
        if (!key) return json({ success: true, required: true, has_key: false, key: null });

        const now = Date.now();
        const expiry = Number(key.expires_at || 0);
        const rewardedHours = Math.max(0, Number(key.rewarded_hours || 0));
        const active = expiry > now;

        return json({
            success: true,
            required: true,
            has_key: true,
            key: {
                id: key.id,
                key: key.key,
                duration_days: key.duration_days,
                rewarded_hours: rewardedHours,
                remaining_reward_hours: Math.max(0, MAX_REWARDED_HOURS - rewardedHours),
                status: active ? "active" : "expired",
                created_at: key.created_at,
                activated_at: key.activated_at,
                expires_at: key.expires_at,
                remaining_ms: active ? expiry - now : 0
            }
        });
    } catch (error) {
        console.error("FREE KEY GET ERROR:", error);
        return json({ success: false, error: "Internal server error" }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUser(request, env);
        if (!user) return json({ success: false, error: "Unauthorized" }, 401);
        if (String(user.role).toLowerCase() === "admin") return json({ success: false, error: "Admin does not need Free Key" }, 403);
        if (isPremium(user)) return json({ success: false, error: "Premium users do not need Free Key" }, 403);

        const now = Date.now();
        let key = await getLatestKey(env.DB, user.id);

        if (!key) {
            const newKey = generateKey();
            await env.DB.prepare(`
                INSERT OR IGNORE INTO license_keys
                    (key,user_id,duration_days,status,created_at,rewarded_hours)
                VALUES (?1,?2,0,'unused',?3,0)
            `).bind(newKey, user.id, now).run();
            key = await getLatestKey(env.DB, user.id);
        }

        if (!key) return json({ success: false, error: "LICENSE_KEY_CREATE_FAILED" }, 500);

        const rewardedHours = Math.max(0, Number(key.rewarded_hours || 0));
        if (rewardedHours >= MAX_REWARDED_HOURS) {
            return json({
                success: true,
                capped: true,
                requires_linkvertise: false,
                message: "Free Key sudah mencapai maksimum 72 jam total.",
                key: {
                    id: key.id,
                    key: key.key,
                    status: Number(key.expires_at || 0) > now ? "active" : "expired",
                    expires_at: key.expires_at,
                    rewarded_hours: rewardedHours,
                    remaining_reward_hours: 0
                }
            });
        }

        let claim = await env.DB.prepare(`
            SELECT id, claim_token, created_at, expires_at
            FROM free_key_claims
            WHERE user_id=?1 AND key_id=?2 AND status='pending' AND expires_at>?3
            ORDER BY created_at DESC
            LIMIT 1
        `).bind(user.id, key.id, now).first();

        if (!claim) {
            const claimToken = generateToken();
            const claimExpires = now + CLAIM_MS;
            const inserted = await env.DB.prepare(`
                INSERT INTO free_key_claims
                    (user_id,key_id,claim_token,status,created_at,expires_at)
                VALUES (?1,?2,?3,'pending',?4,?5)
            `).bind(user.id, key.id, claimToken, now, claimExpires).run();
            if (!inserted.success) return json({ success: false, error: "CLAIM_CREATE_FAILED" }, 500);
            claim = { claim_token: claimToken, expires_at: claimExpires };
        }

        const linkvertise = String(env.LINKVERTISE_URL || "").trim();
        if (!linkvertise) {
            if (claim.id) await env.DB.prepare(`DELETE FROM free_key_claims WHERE id=?1 AND status='pending'`).bind(claim.id).run();
            return json({ success: false, error: "LINKVERTISE_URL is not configured" }, 500);
        }

        const startUrl = buildStartUrl(request, claim.claim_token);
        return json({
            success: true,
            requires_linkvertise: true,
            claim_pending: true,
            link: startUrl,
            start_url: startUrl,
            // Do not expose the publisher URL to the client. The browser must visit
            // /start first so the claim cookie is set before the Linkvertise redirect.
            linkvertise_url: null,
            reward_hours: 6,
            max_hours: MAX_REWARDED_HOURS,
            remaining_reward_hours: Math.max(0, MAX_REWARDED_HOURS - rewardedHours),
            claim_expires_at: Number(claim.expires_at)
        });
    } catch (error) {
        console.error("FREE KEY POST ERROR:", error);
        return json({ success: false, error: "Internal server error" }, 500);
    }
}

async function getLatestKey(db, userId) {
    return db.prepare(`
        SELECT id,key,duration_days,status,created_at,activated_at,expires_at,rewarded_hours
        FROM license_keys
        WHERE user_id=?1
        ORDER BY created_at DESC,id DESC
        LIMIT 1
    `).bind(userId).first();
}

function buildStartUrl(request, claimToken) {
    const url = new URL("/api/free-key/start", request.url);
    url.searchParams.set("claim", claimToken);
    return url.toString();
}

function isPremium(user) {
    return String(user.plan || "").toLowerCase() === "premium" &&
        (user.premium_expires_at === null || Number(user.premium_expires_at) > Date.now());
}

async function getUser(request, env) {
    const token = getCookie(request.headers.get("Cookie") || "", "bilsx_session");
    if (!token) return null;
    try {
        const tokenHash = await sha256(token);
        return env.DB.prepare(`
            SELECT u.id,u.username,u.email,u.role,u.status,u.plan,u.premium_expires_at
            FROM sessions s
            INNER JOIN users u ON u.id=s.user_id
            WHERE s.token_hash=?1 AND s.expires_at>?2 AND u.status='active'
            LIMIT 1
        `).bind(tokenHash, Date.now()).first();
    } catch { return null; }
}

function getCookie(header, name) {
    for (const item of header.split(";")) {
        const index = item.indexOf("=");
        if (index === -1) continue;
        if (item.slice(0, index).trim() === name) {
            try { return decodeURIComponent(item.slice(index + 1).trim()); } catch { return null; }
        }
    }
    return null;
}

async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(x => x.toString(16).padStart(2, "0")).join("");
}

function generateToken() {
    const bytes = new Uint8Array(32);
    crypto.getRandomValues(bytes);
    return [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function generateKey() {
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const part = length => {
        const bytes = new Uint8Array(length);
        crypto.getRandomValues(bytes);
        return [...bytes].map(byte => chars[byte % chars.length]).join("");
    };
    return `BLSX-FREE-${part(4)}-${part(4)}`;
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }
    });
}
