const SESSION_TTL = 7 * 24 * 60 * 60 * 1000;

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const login = String(url.searchParams.get("username") || "").trim().toLowerCase();
        const password = String(url.searchParams.get("password") || "");

        if (!login || !password) {
            return json({ success: false, error: "USERNAME_PASSWORD_REQUIRED" }, 400);
        }

        const user = await env.DB.prepare(`
            SELECT id, username, email, password_hash, password_salt, role, status, plan, premium_expires_at
            FROM users
            WHERE username = ?1 OR email = ?1
            LIMIT 1
        `).bind(login).first();

        if (!user || user.status !== "active") {
            return json({ success: false, error: "INVALID_CREDENTIALS" }, 401);
        }

        const hash = await hashPassword(password, user.password_salt);
        if (hash !== user.password_hash) {
            return json({ success: false, error: "INVALID_CREDENTIALS" }, 401);
        }

        const token = crypto.randomUUID() + "." + crypto.randomUUID();
        const tokenHash = await sha256(token);
        const now = Date.now();
        const expiresAt = now + SESSION_TTL;

        await env.DB.prepare(`
            INSERT INTO sessions (user_id, token_hash, expires_at, created_at)
            VALUES (?1, ?2, ?3, ?4)
        `).bind(user.id, tokenHash, expiresAt, now).run();

        await env.DB.prepare(`UPDATE users SET last_login_at = ?1 WHERE id = ?2`)
            .bind(now, user.id).run();

        const account = await getAccount(env, user.id);

        return json({
            success: true,
            token,
            expires_at: expiresAt,
            account,
            scripts: getScriptCatalog()
        });
    } catch (error) {
        console.error("GL LOGIN ERROR", error);
        return json({ success: false, error: "SERVER_ERROR" }, 500);
    }
}

async function getAccount(env, userId) {
    const user = await env.DB.prepare(`
        SELECT id, username, email, role, status, plan, premium_expires_at, created_at, last_login_at
        FROM users WHERE id = ?1 LIMIT 1
    `).bind(userId).first();

    const key = await env.DB.prepare(`
        SELECT id, key, status, activated_at, expires_at
        FROM license_keys
        WHERE user_id = ?1
        ORDER BY id DESC
        LIMIT 1
    `).bind(userId).first();

    const now = Date.now();
    const premium = user?.plan === "premium" && (user.premium_expires_at == null || Number(user.premium_expires_at) > now);
    const keyExpiry = Number(key?.expires_at || 0);
    const keyActive = Boolean(key && key.status === "active" && keyExpiry > now);

    return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        plan: user.plan || "free",
        premium,
        premium_expires_at: user.premium_expires_at,
        free_key: {
            exists: Boolean(key),
            active: keyActive,
            key: key?.key || null,
            status: key?.status || null,
            activated_at: key?.activated_at || null,
            expires_at: keyExpiry || null,
            remaining_ms: keyActive ? keyExpiry - now : 0
        }
    };
}

function getScriptCatalog() {
    return [
        {
            id: "hello-hidden",
            name: "Hello Hidden",
            description: "Protected test script",
            path: "private-scripts/test/hello-hidden.lua",
            requires_key: true
        }
    ];
}

async function hashPassword(password, salt) {
    let digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(salt + password));
    const saltBytes = new TextEncoder().encode(salt);
    for (let i = 0; i < 100000; i++) {
        const buffer = new Uint8Array(saltBytes.length + digest.byteLength);
        buffer.set(saltBytes);
        buffer.set(new Uint8Array(digest), saltBytes.length);
        digest = await crypto.subtle.digest("SHA-256", buffer);
    }
    return toHex(digest);
}

async function sha256(value) {
    return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

function toHex(data) {
    return [...new Uint8Array(data)].map(b => b.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
}
