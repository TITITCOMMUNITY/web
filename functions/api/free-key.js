const MAX_MS = 72 * 60 * 60 * 1000;
const CLAIM_MS = 10 * 60 * 1000;

export async function onRequestGet({ request, env }) {
    try {
        const user = await getUser(request, env);
        if (!user) return json({ success: false, error: "Unauthorized" }, 401);

        if (String(user.role).toLowerCase() === "admin") {
            return json({ success: true, required: false, reason: "admin" });
        }

        if (isPremium(user)) {
            return json({ success: true, required: false, reason: "premium" });
        }

        const key = await getLatestKey(env.DB, user.id);
        if (!key) {
            return json({ success: true, required: true, has_key: false, key: null });
        }

        const now = Date.now();
        const expiry = Number(key.expires_at || 0);
        const status = expiry > 0 && expiry <= now ? "expired" : key.status;
        const remaining = expiry ? Math.max(0, expiry - now) : null;

        return json({
            success: true,
            required: true,
            has_key: true,
            key: {
                id: key.id,
                key: key.key,
                duration_days: key.duration_days,
                status,
                created_at: key.created_at,
                activated_at: key.activated_at,
                expires_at: key.expires_at,
                remaining_ms: remaining
            }
        });
    } catch (error) {
        console.error("FREE KEY GET ERROR:", error);
        return json({ success: false, error: String(error) }, 500);
    }
}

export async function onRequestPost({ request, env }) {
    try {
        const user = await getUser(request, env);
        if (!user) return json({ success: false, error: "Unauthorized" }, 401);

        if (String(user.role).toLowerCase() === "admin") {
            return json({ success: false, error: "Admin does not need Free Key" }, 403);
        }

        if (isPremium(user)) {
            return json({ success: false, error: "Premium users do not need Free Key" }, 403);
        }

        const now = Date.now();
        let key = await getLatestKey(env.DB, user.id);

        if (!key) {
            const newKey = generateKey();
            await env.DB.prepare(`
                INSERT INTO license_keys (key,user_id,duration_days,status,created_at)
                VALUES (?1,?2,0,'unused',?3)
            `).bind(newKey, user.id, now).run();
            key = await getLatestKey(env.DB, user.id);
        }

        if (!key) return json({ success: false, error: "LICENSE_KEY_CREATE_FAILED" }, 500);

        const currentExpiry = Number(key.expires_at || 0) > now ? Number(key.expires_at) : now;
        const maxExpiry = now + MAX_MS;

        if (currentExpiry >= maxExpiry) {
            return json({
                success: true,
                capped: true,
                requires_linkvertise: false,
                message: "Free Key sudah mencapai maksimum 72 jam.",
                key: { id: key.id, key: key.key, status: "active", expires_at: key.expires_at }
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
            await env.DB.prepare(`
                INSERT INTO free_key_claims (user_id,key_id,claim_token,status,created_at,expires_at)
                VALUES (?1,?2,?3,'pending',?4,?5)
            `).bind(user.id, key.id, claimToken, now, claimExpires).run();
            claim = { claim_token: claimToken, expires_at: claimExpires };
        }

        const linkvertise = String(env.LINKVERTISE_URL || "").trim();
        if (!linkvertise) {
            await env.DB.prepare(`DELETE FROM free_key_claims WHERE id=?1 AND status='pending'`).bind(claim.id).run();
            return json({ success: false, error: "LINKVERTISE_URL is not configured" }, 500);
        }

        const startUrl = buildStartUrl(request, claim.claim_token);

        return json({
            success: true,
            requires_linkvertise: true,
            claim_pending: true,
            link: startUrl,
            start_url: startUrl,
            linkvertise_url: linkvertise,
            reward_hours: 6,
            max_hours: 72,
            claim_expires_at: Number(claim.expires_at)
        });
    } catch (error) {
        console.error("FREE KEY POST ERROR:", error);
        return json({ success: false, error: String(error) }, 500);
    }
}

async function getLatestKey(db, userId) {
    return db.prepare(`
        SELECT id,key,duration_days,status,created_at,activated_at,expires_at
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
    return String(user.plan).toLowerCase() === "premium" &&
        (user.premium_expires_at === null || Number(user.premium_expires_at) > Date.now());
}

async function getUser(request, env) {
    const cookie = request.headers.get("Cookie") || "";
    let token = null;

    for (const item of cookie.split(";")) {
        const index = item.indexOf("=");
        if (index === -1) continue;
        if (item.slice(0, index).trim() === "bilsx_session") {
            token = item.slice(index + 1).trim();
            break;
        }
    }

    if (!token) return null;
    try { token = decodeURIComponent(token); } catch {}

    const tokenHash = await sha256(token);
    return env.DB.prepare(`
        SELECT u.id,u.username,u.email,u.role,u.status,u.plan,u.premium_expires_at
        FROM sessions s
        INNER JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=?1 AND s.expires_at>?2 AND u.status='active'
        LIMIT 1
    `).bind(tokenHash, Date.now()).first();
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
        let result = "";
        for (let i = 0; i < length; i++) result += chars[Math.floor(Math.random() * chars.length)];
        return result;
    };
    return `BLSX-FREE-${part(4)}-${part(4)}`;
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
}
