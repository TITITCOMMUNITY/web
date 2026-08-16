export async function onRequestGet({ request, env }) {
    try {
        const token = getAccessToken(request);
        if (!token) return json({ success: false, error: "UNAUTHORIZED" }, 401);

        const session = await env.DB.prepare(`
            SELECT s.id, s.user_id, s.expires_at
            FROM sessions s
            WHERE s.token_hash = ?1 AND s.expires_at > ?2
            LIMIT 1
        `).bind(await sha256(token), Date.now()).first();

        if (!session) return json({ success: false, error: "SESSION_EXPIRED" }, 401);

        const account = await getAccount(env, session.user_id);
        if (!account || account.status !== "active") return json({ success: false, error: "ACCOUNT_INACTIVE" }, 403);

        return json({ success: true, account, scripts: getScriptCatalog(), session: { expires_at: session.expires_at } });
    } catch (error) {
        console.error("GL ME ERROR", error);
        return json({ success: false, error: "SERVER_ERROR" }, 500);
    }
}

function getAccessToken(request) {
    const auth = request.headers.get("Authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    const url = new URL(request.url);
    return url.searchParams.get("token") || "";
}

async function getAccount(env, userId) {
    const user = await env.DB.prepare(`
        SELECT id, username, email, role, status, plan, premium_expires_at, created_at, last_login_at
        FROM users WHERE id = ?1 LIMIT 1
    `).bind(userId).first();
    if (!user) return null;

    const key = await env.DB.prepare(`
        SELECT id, key, status, activated_at, expires_at
        FROM license_keys WHERE user_id = ?1 ORDER BY id DESC LIMIT 1
    `).bind(userId).first();

    const now = Date.now();
    const premium = user.plan === "premium" && (user.premium_expires_at == null || Number(user.premium_expires_at) > now);
    const expiry = Number(key?.expires_at || 0);
    const active = Boolean(key && key.status === "active" && expiry > now);

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
            active,
            key: key?.key || null,
            status: key?.status || null,
            activated_at: key?.activated_at || null,
            expires_at: expiry || null,
            remaining_ms: active ? expiry - now : 0
        }
    };
}

function getScriptCatalog() {
    return [{ id: "hello-hidden", name: "Hello Hidden", description: "Protected test script", requires_key: true }];
}

async function sha256(value) {
    return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}
function toHex(data) {
    return [...new Uint8Array(data)].map(b => b.toString(16).padStart(2, "0")).join("");
}
function json(data, status = 200) {
    return new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });
}
