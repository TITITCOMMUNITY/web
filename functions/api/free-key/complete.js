const REWARD_HOURS = 6;
const REWARD_MS = REWARD_HOURS * 60 * 60 * 1000;
const MAX_REWARDED_HOURS = 72;
const CLAIM_COOKIE = "bilsx_free_key_claim";

export async function onRequestGet({ request, env }) {
    try {
        const url = new URL(request.url);
        const hash = String(url.searchParams.get("hash") || "").trim();

        if (!/^[0-9a-f]{64}$/i.test(hash)) {
            return html("Verification Failed", "Hash Linkvertise tidak ditemukan atau tidak valid.");
        }

        if (!env.LINKVERTISE_TOKEN) {
            return html("Server Error", "LINKVERTISE_TOKEN belum dikonfigurasi.");
        }

        // Linkvertise anti-bypass hashes are short-lived, so verify immediately.
        const verification = await verifyLinkvertise(hash, env.LINKVERTISE_TOKEN);
        if (!verification.ok) {
            console.error("LINKVERTISE VERIFICATION FAILED", verification);
            return html("Verification Failed", "Linkvertise tidak dapat diverifikasi. Silakan tekan Get Key dan coba lagi.");
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

        // One atomic D1 batch prevents a verified claim from being consumed when the
        // license update fails. D1 batches execute sequentially and roll back on failure.
        const result = await env.DB.batch([
            env.DB.prepare(`
                UPDATE free_key_claims
                SET status='completed', completed_at=?1
                WHERE id=?2 AND claim_token=?3 AND status='pending' AND expires_at>?1
            `).bind(now, claim.id, claimToken),
            env.DB.prepare(`
                UPDATE license_keys
                SET status='active',
                    activated_at=COALESCE(activated_at, ?1),
                    rewarded_hours=MIN(COALESCE(rewarded_hours,0) + ?2, ?3),
                    expires_at=CASE
                        WHEN COALESCE(expires_at,0) > ?1
                            THEN MIN(expires_at + ?4, ?5)
                        ELSE ?1 + ?4
                    END
                WHERE id=?6
                  AND user_id=?7
                  AND COALESCE(rewarded_hours,0) < ?3
            `).bind(
                now,
                REWARD_HOURS,
                MAX_REWARDED_HOURS,
                REWARD_MS,
                now + (MAX_REWARDED_HOURS * 60 * 60 * 1000),
                claim.key_id,
                claim.user_id
            )
        ]);

        const claimChanges = Number(result?.[0]?.meta?.changes || 0);
        const keyChanges = Number(result?.[1]?.meta?.changes || 0);

        if (claimChanges !== 1 || keyChanges !== 1) {
            return html("Already Claimed", "Claim ini sudah digunakan, key tidak memenuhi syarat, atau batas 72 jam sudah tercapai.");
        }

        const key = await env.DB.prepare(`
            SELECT key, expires_at, rewarded_hours
            FROM license_keys
            WHERE id=?1 AND user_id=?2
            LIMIT 1
        `).bind(claim.key_id, claim.user_id).first();

        const rewardedHours = Math.max(0, Number(key?.rewarded_hours || 0));
        const remainingHours = Math.max(0, MAX_REWARDED_HOURS - rewardedHours);
        const response = html(
            "Success",
            rewardedHours >= MAX_REWARDED_HOURS
                ? "Berhasil! Free Key sudah mencapai batas maksimum 72 jam total."
                : `Berhasil! Free Key mendapatkan tambahan ${REWARD_HOURS} jam. Total reward: ${rewardedHours}/72 jam.`
        );
        response.headers.append(
            "Set-Cookie",
            `${CLAIM_COOKIE}=; Max-Age=0; Path=/api/free-key; Secure; HttpOnly; SameSite=Lax`
        );
        return response;
    } catch (error) {
        console.error("FREE KEY COMPLETE ERROR:", error);
        return html("Server Error", "Terjadi kesalahan pada server. Silakan coba lagi.");
    }
}

async function verifyLinkvertise(hash, token) {
    try {
        const endpoint = new URL("https://publisher.linkvertise.com/api/v1/anti_bypassing");
        endpoint.searchParams.set("token", token);
        endpoint.searchParams.set("hash", hash);

        const response = await fetch(endpoint.toString(), {
            method: "POST",
            headers: { "Accept": "application/json, text/plain, */*" }
        });
        const text = (await response.text()).trim();

        let parsed = null;
        try { parsed = JSON.parse(text); } catch {}

        const normalized = text.toUpperCase();
        const statusValue = parsed?.status;
        const ok = response.ok && (
            normalized === "TRUE" ||
            statusValue === true ||
            String(statusValue).toLowerCase() === "true" ||
            parsed?.success === true ||
            String(parsed?.success).toLowerCase() === "true"
        );

        return { ok, http: response.status, response: text.slice(0, 500) };
    } catch (error) {
        console.error("LINKVERTISE VERIFY ERROR:", error);
        return {
            ok: false,
            http: "FETCH_ERROR",
            response: error instanceof Error ? error.message : String(error)
        };
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
        headers: {
            "Content-Type": "text/html; charset=UTF-8",
            "Cache-Control": "no-store"
        }
    });
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}
