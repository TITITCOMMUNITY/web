const REWARD_MS = 6 * 60 * 60 * 1000;
const MAX_MS = 72 * 60 * 60 * 1000;
const CLAIM_COOKIE = "bilsx_free_key_claim";

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const hash = url.searchParams.get("hash");

        if (!hash) {
            return html("Verification Failed", "Hash Linkvertise tidak ditemukan di URL.");
        }

        if (!env.LINKVERTISE_TOKEN) {
            return html("Server Error", "LINKVERTISE_TOKEN belum dikonfigurasi.");
        }

        const verification = await verifyLinkvertise(hash, env.LINKVERTISE_TOKEN);
        if (!verification.ok) {
            console.error("LINKVERTISE VERIFICATION FAILED", verification);
            return html("Verification Failed", "Linkvertise tidak dapat diverifikasi.");
        }

        const claimToken = getCookie(request.headers.get("Cookie") || "", CLAIM_COOKIE);
        if (!claimToken || !/^[0-9a-f]{64}$/i.test(claimToken)) {
            return html("Claim Missing", "Sesi Free Key tidak ditemukan. Silakan mulai kembali dari tombol Get Key.");
        }

        const now = Date.now();
        const claim = await env.DB.prepare(`
            SELECT id, user_id, key_id, status, created_at, expires_at
            FROM free_key_claims
            WHERE claim_token = ?1
              AND status = 'pending'
              AND expires_at > ?2
            LIMIT 1
        `).bind(claimToken, now).first();

        if (!claim) {
            return html("Claim Expired", "Claim Free Key sudah tidak aktif. Silakan tekan Get Key lagi.");
        }

        const key = await env.DB.prepare(`
            SELECT id, user_id, key, status, activated_at, expires_at
            FROM license_keys
            WHERE id = ?1 AND user_id = ?2
            LIMIT 1
        `).bind(claim.key_id, claim.user_id).first();

        if (!key) {
            return html("Key Error", "License key tidak ditemukan untuk claim ini.");
        }

        const currentExpiry = Number(key.expires_at || 0) > now ? Number(key.expires_at) : now;
        const maxExpiry = now + MAX_MS;

        const claimUpdate = await env.DB.prepare(`
            UPDATE free_key_claims
            SET status = 'completed', completed_at = ?1
            WHERE id = ?2 AND claim_token = ?3 AND status = 'pending' AND expires_at > ?1
        `).bind(now, claim.id, claimToken).run();

        if (!claimUpdate.meta || claimUpdate.meta.changes !== 1) {
            return html("Already Claimed", "Claim ini sudah digunakan atau sudah tidak berlaku.");
        }

        if (currentExpiry >= maxExpiry) {
            return html("Maximum Reached", "Free Key kamu sudah mencapai maksimum 72 jam.");
        }

        let newExpiry = currentExpiry + REWARD_MS;
        if (newExpiry > maxExpiry) newExpiry = maxExpiry;

        const keyUpdate = await env.DB.prepare(`
            UPDATE license_keys
            SET status = 'active',
                activated_at = COALESCE(activated_at, ?1),
                expires_at = ?2
            WHERE id = ?3 AND user_id = ?4
        `).bind(now, newExpiry, key.id, claim.user_id).run();

        if (!keyUpdate.meta || keyUpdate.meta.changes !== 1) {
            console.error("LICENSE KEY UPDATE FAILED", keyUpdate);
            return html("Server Error", "Claim terverifikasi tetapi key gagal diperbarui. Hubungi administrator.");
        }

        const remainingHours = Math.ceil((newExpiry - now) / (60 * 60 * 1000));
        const response = html("Success", `Berhasil! Free Key mendapatkan tambahan 6 jam. Waktu aktif saat ini sekitar ${remainingHours} jam.`);
        response.headers.append("Set-Cookie", `${CLAIM_COOKIE}=; Max-Age=0; Path=/api/free-key; Secure; HttpOnly; SameSite=Lax`);
        return response;
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

        let parsed = null;
        try {
            parsed = JSON.parse(text);
        } catch (_) {}

        const normalized = text.toUpperCase();
        const ok = response.ok && (
            normalized === "TRUE" ||
            parsed?.status === true ||
            parsed?.success === true
        );

        return { ok, http: response.status, response: text };
    } catch (error) {
        console.error("LINKVERTISE VERIFY ERROR:", error);
        return { ok: false, http: "FETCH_ERROR", response: error instanceof Error ? error.message : String(error) };
    }
}

function getCookie(header, name) {
    for (const part of header.split(";")) {
        const index = part.indexOf("=");
        if (index === -1) continue;
        if (part.slice(0, index).trim() === name) {
            try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
        }
    }
    return null;
}

function html(title, message) {
    return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#07070a;color:#fff;font-family:Arial,sans-serif}.card{width:min(100%,440px);padding:32px;border-radius:18px;background:#121216;border:1px solid rgba(255,255,255,.08);text-align:center;box-shadow:0 20px 70px rgba(0,0,0,.5)}h1{margin:0 0 14px}p{margin:0;line-height:1.6;color:#aaa}a{display:inline-block;margin-top:22px;padding:12px 22px;border-radius:10px;background:#fff;color:#000;text-decoration:none;font-weight:600}</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/dashboard.html">Kembali ke Dashboard</a></div></body></html>`, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" }
    });
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}
