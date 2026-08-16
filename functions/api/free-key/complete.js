const REWARD_MS = 6 * 60 * 60 * 1000;
const MAX_MS = 72 * 60 * 60 * 1000;

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const hash = url.searchParams.get("hash");

        if (!hash) {
            return diagnosticHtml("Missing Hash", {
                http: "—",
                hashLength: 0,
                tokenConfigured: Boolean(env.LINKVERTISE_TOKEN),
                tokenLength: env.LINKVERTISE_TOKEN ? String(env.LINKVERTISE_TOKEN).length : 0,
                response: "Hash Linkvertise tidak ditemukan di URL."
            });
        }

        if (!env.LINKVERTISE_TOKEN) {
            return diagnosticHtml("Token Missing", {
                http: "—",
                hashLength: hash.length,
                tokenConfigured: false,
                tokenLength: 0,
                response: "LINKVERTISE_TOKEN belum dikonfigurasi."
            });
        }

        const verification = await verifyLinkvertise(
            hash,
            env.LINKVERTISE_TOKEN
        );

        if (!verification.ok) {
            return diagnosticHtml("Verification Failed", {
                http: verification.http,
                hashLength: hash.length,
                tokenConfigured: true,
                tokenLength: String(env.LINKVERTISE_TOKEN).length,
                response: verification.response
            });
        }

        const now = Date.now();

        const claim = await env.DB
            .prepare(`
                SELECT id, user_id, key_id, claim_token, status, created_at, completed_at, expires_at
                FROM free_key_claims
                WHERE status = 'pending' AND expires_at > ?1
                ORDER BY created_at DESC
                LIMIT 1
            `)
            .bind(now)
            .first();

        if (!claim) {
            return html(
                "Claim Expired",
                "Claim Free Key sudah tidak aktif atau sudah digunakan. Silakan kembali ke dashboard dan tekan Get Key lagi."
            );
        }

        const key = await env.DB
            .prepare(`
                SELECT id, user_id, key, status, activated_at, expires_at
                FROM license_keys
                WHERE id = ?1 AND user_id = ?2
                LIMIT 1
            `)
            .bind(claim.key_id, claim.user_id)
            .first();

        if (!key) {
            return html("Key Error", "License key tidak ditemukan.");
        }

        const currentExpiry = key.expires_at && Number(key.expires_at) > now
            ? Number(key.expires_at)
            : now;

        const maxExpiry = now + MAX_MS;

        if (currentExpiry >= maxExpiry) {
            await env.DB
                .prepare(`
                    UPDATE free_key_claims
                    SET status = 'completed', completed_at = ?1
                    WHERE id = ?2 AND status = 'pending'
                `)
                .bind(now, claim.id)
                .run();

            return html("Maximum Reached", "Free Key kamu sudah mencapai maksimum 72 jam.");
        }

        let newExpiry = currentExpiry + REWARD_MS;
        if (newExpiry > maxExpiry) newExpiry = maxExpiry;

        const claimUpdate = await env.DB
            .prepare(`
                UPDATE free_key_claims
                SET status = 'completed', completed_at = ?1
                WHERE id = ?2 AND status = 'pending' AND expires_at > ?1
            `)
            .bind(now, claim.id)
            .run();

        if (!claimUpdate.meta || claimUpdate.meta.changes !== 1) {
            return html("Already Claimed", "Claim ini sudah digunakan atau sudah tidak berlaku.");
        }

        const keyUpdate = await env.DB
            .prepare(`
                UPDATE license_keys
                SET status = 'active',
                    activated_at = COALESCE(activated_at, ?1),
                    expires_at = ?2
                WHERE id = ?3 AND user_id = ?4
            `)
            .bind(now, newExpiry, key.id, claim.user_id)
            .run();

        if (!keyUpdate.meta || keyUpdate.meta.changes !== 1) {
            console.error("LICENSE KEY UPDATE FAILED", keyUpdate);
            return html("Server Error", "Claim berhasil diverifikasi tetapi key gagal diperbarui. Hubungi administrator.");
        }

        const remainingHours = Math.ceil((newExpiry - now) / (60 * 60 * 1000));

        return html(
            "Success",
            `Berhasil! Free Key mendapatkan tambahan 6 jam. Waktu aktif saat ini sekitar ${remainingHours} jam.`
        );
    } catch (error) {
        console.error("FREE KEY COMPLETE ERROR:", error);
        return html("Server Error", "Terjadi kesalahan pada server.");
    }
}

async function verifyLinkvertise(hash, token) {
    try {
        const endpoint = new URL("https://publisher.linkvertise.com/api/v1/anti_bypassing");
        endpoint.searchParams.set("token", token);
        endpoint.searchParams.set("hash", hash);

        const response = await fetch(endpoint.toString(), { method: "POST" });
        const text = (await response.text()).trim();

        console.log("Linkvertise HTTP:", response.status);
        console.log("Linkvertise response:", text);

        return {
            ok: response.ok && text.toUpperCase() === "TRUE",
            http: response.status,
            response: text || "<empty response>"
        };
    } catch (error) {
        console.error("LINKVERTISE VERIFY ERROR:", error);
        return {
            ok: false,
            http: "FETCH_ERROR",
            response: error instanceof Error ? error.message : String(error)
        };
    }
}

function diagnosticHtml(title, info) {
    return new Response(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#07070a;color:#fff;font-family:Arial,sans-serif}.card{width:min(100%,520px);padding:30px;border-radius:18px;background:#121216;border:1px solid rgba(255,255,255,.08);box-shadow:0 20px 70px rgba(0,0,0,.5)}h1{margin-top:0}table{width:100%;border-collapse:collapse}td{padding:10px 4px;border-bottom:1px solid #29292f}td:first-child{color:#aaa;width:45%}.response{margin-top:18px;padding:14px;border-radius:10px;background:#08080b;word-break:break-word;white-space:pre-wrap}a{display:inline-block;margin-top:20px;padding:12px 20px;border-radius:10px;background:#fff;color:#000;text-decoration:none;font-weight:600}
</style>
</head><body><div class="card"><h1>${escapeHtml(title)}</h1><table>
<tr><td>HTTP</td><td>${escapeHtml(info.http)}</td></tr>
<tr><td>Hash length</td><td>${escapeHtml(info.hashLength)}</td></tr>
<tr><td>Token configured</td><td>${info.tokenConfigured ? "YES" : "NO"}</td></tr>
<tr><td>Token length</td><td>${escapeHtml(info.tokenLength)}</td></tr>
</table><div class="response">${escapeHtml(info.response)}</div><a href="/dashboard.html">Kembali ke Dashboard</a></div></body></html>`, {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store"
        }
    });
}

function html(title, message) {
    return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#07070a;color:#fff;font-family:Arial,sans-serif}.card{width:min(100%,440px);padding:32px;border-radius:18px;background:#121216;border:1px solid rgba(255,255,255,.08);text-align:center;box-shadow:0 20px 70px rgba(0,0,0,.5)}h1{margin:0 0 14px}p{margin:0;line-height:1.6;color:#aaa}a{display:inline-block;margin-top:22px;padding:12px 22px;border-radius:10px;background:#fff;color:#000;text-decoration:none;font-weight:600}</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/dashboard.html">Kembali ke Dashboard</a></div></body></html>`, {
        status: 200,
        headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store"
        }
    });
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    }[character]));
}
