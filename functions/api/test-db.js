export async function onRequestGet({ env }) {
    try {
        await env.DB.prepare("SELECT 1 AS ok").first();
        return json({ success: true, database: "connected" });
    } catch (error) {
        console.error("DB HEALTHCHECK ERROR", error);
        return json({ success: false, error: "Database unavailable" }, 503);
    }
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}
