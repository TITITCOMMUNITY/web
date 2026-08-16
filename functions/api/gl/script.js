const SCRIPT_CATALOG = {
    "hello-hidden": {
        name: "Hello Hidden",
        description: "Protected test script",
        path: "private-scripts/test/hello-hidden.lua",
        requires_key: true
    }
};

const GITHUB_RAW_BASE = "https://raw.githubusercontent.com/TITITCOMMUNITY/web/main/";

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const scriptId = String(url.searchParams.get("id") || "").trim();
        const token = getAccessToken(request);

        if (!scriptId) return json({ success: false, error: "SCRIPT_ID_REQUIRED" }, 400);
        if (!token) return json({ success: false, error: "UNAUTHORIZED" }, 401);

        const script = SCRIPT_CATALOG[scriptId];
        if (!script) return json({ success: false, error: "SCRIPT_NOT_FOUND" }, 404);

        const session = await env.DB.prepare(`
            SELECT s.user_id, s.expires_at
            FROM sessions s
            WHERE s.token_hash = ?1 AND s.expires_at > ?2
            LIMIT 1
        `).bind(await sha256(token), Date.now()).first();

        if (!session) return json({ success: false, error: "SESSION_EXPIRED" }, 401);

        const user = await env.DB.prepare(`
            SELECT id, username, role, status, plan, premium_expires_at
            FROM users WHERE id = ?1 LIMIT 1
        `).bind(session.user_id).first();

        if (!user || user.status !== "active") {
            return json({ success: false, error: "ACCOUNT_INACTIVE" }, 403);
        }

        const now = Date.now();
        const isAdmin = user.role === "admin";
        const isPremium = user.plan === "premium" &&
            (user.premium_expires_at == null || Number(user.premium_expires_at) > now);

        let keyActive = false;
        if (!isAdmin && !isPremium && script.requires_key) {
            const key = await env.DB.prepare(`
                SELECT status, expires_at
                FROM license_keys
                WHERE user_id = ?1
                ORDER BY id DESC
                LIMIT 1
            `).bind(user.id).first();

            keyActive = Boolean(
                key &&
                key.status === "active" &&
                Number(key.expires_at || 0) > now
            );
        }

        if (script.requires_key && !isAdmin && !isPremium && !keyActive) {
            return json({ success: false, error: "KEY_REQUIRED" }, 403);
        }

        const response = await fetch(GITHUB_RAW_BASE + script.path, {
            headers: { "User-Agent": "Bilsx-GL-Loader" }
        });

        if (!response.ok) {
            return json({ success: false, error: "SCRIPT_SOURCE_UNAVAILABLE" }, 502);
        }

        const source = await response.text();

        return new Response(source, {
            status: 200,
            headers: {
                "Content-Type": "text/plain; charset=utf-8",
                "Cache-Control": "no-store",
                "X-Bilsx-Script": scriptId
            }
        });
    } catch (error) {
        console.error("GL SCRIPT ERROR", error);
        return json({ success: false, error: "SERVER_ERROR" }, 500);
    }
}

function getAccessToken(request) {
    const auth = request.headers.get("Authorization") || "";
    if (auth.toLowerCase().startsWith("bearer ")) return auth.slice(7).trim();
    const url = new URL(request.url);
    return url.searchParams.get("token") || "";
}

async function sha256(value) {
    return toHex(await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(value)
    ));
}

function toHex(data) {
    return [...new Uint8Array(data)]
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store"
        }
    });
}
