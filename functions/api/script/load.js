const GITHUB_OWNER = "TITITCOMMUNITY";
const GITHUB_REPO = "web";
const GITHUB_BRANCH = "main";

const SCRIPTS = {
    "hello-hidden": {
        name: "Hello Hidden",
        path: "private-scripts/test/hello-hidden.lua",
        requiresKey: true
    }
};

export async function onRequestGet({ request, env }) {
    try {
        const token = getAccessToken(request);
        const scriptId = new URL(request.url).searchParams.get("script");

        if (!token) return json({ success: false, error: "UNAUTHORIZED" }, 401);
        if (!scriptId || !SCRIPTS[scriptId]) return json({ success: false, error: "SCRIPT_NOT_FOUND" }, 404);

        const session = await env.DB.prepare(`
            SELECT user_id, expires_at
            FROM sessions
            WHERE token_hash = ?1 AND expires_at > ?2
            LIMIT 1
        `).bind(await sha256(token), Date.now()).first();

        if (!session) return json({ success: false, error: "SESSION_EXPIRED" }, 401);

        const user = await env.DB.prepare(`
            SELECT id, username, role, status, plan, premium_expires_at
            FROM users WHERE id = ?1 LIMIT 1
        `).bind(session.user_id).first();

        if (!user || user.status !== "active") return json({ success: false, error: "ACCOUNT_INACTIVE" }, 403);

        const script = SCRIPTS[scriptId];
        let keyActive = false;

        if (script.requiresKey && user.role !== "admin") {
            const key = await env.DB.prepare(`
                SELECT status, expires_at
                FROM license_keys
                WHERE user_id = ?1
                ORDER BY id DESC
                LIMIT 1
            `).bind(user.id).first();

            keyActive = Boolean(key && key.status === "active" && Number(key.expires_at || 0) > Date.now());

            const premium = user.plan === "premium" && (user.premium_expires_at == null || Number(user.premium_expires_at) > Date.now());

            if (!keyActive && !premium) {
                return json({
                    success: false,
                    error: "FREE_KEY_INACTIVE",
                    message: "Free Key tidak aktif. Silahkan login melalui browser untuk mendapatkan atau memperpanjang Free Key."
                }, 403);
            }
        }

        const githubUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${script.path}`;
        const upstream = await fetch(githubUrl, { headers: { "Accept": "text/plain" } });

        if (!upstream.ok) {
            console.error("GITHUB SCRIPT FETCH FAILED", upstream.status, githubUrl);
            return json({ success: false, error: "SCRIPT_SOURCE_UNAVAILABLE" }, 502);
        }

        const source = await upstream.text();
        return new Response(source, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Bilsx-Script": scriptId
            }
        });
    } catch (error) {
        console.error("SCRIPT LOAD ERROR", error);
        return json({ success: false, error: "SERVER_ERROR" }, 500);
    }
}

function getAccessToken(request) {
    const auth = request.headers.get("Authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    return new URL(request.url).searchParams.get("token") || "";
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
