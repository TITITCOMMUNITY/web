const REWARD_HOURS = 6;
const REWARD_MS = REWARD_HOURS * 60 * 60 * 1000;
const MAX_REWARDED_HOURS = 72;
const MAX_EXPIRY_MS = MAX_REWARDED_HOURS * 60 * 60 * 1000;
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
            SELECT id, user_id, key_id, status, expires_at
            FROM free_key_claims
            WHERE claim_token=?1 AND status='pending' AND expires_at>?2
            LIMIT 1
        `).bind(claimToken, now).first();

        if (!claim) {
            return html("Claim Expired", "Claim Free Key sudah tidak aktif. Silakan tekan Get Key lagi.");
        }

        // Reward the key first, while marking this exact claim as the idempotency key.
        // The WHERE clause makes a repeated callback for the same claim a no-op.
        const keyUpdate = await env.DB.prepare(`
            UPDATE license_keys
            SET status='active',
                activated_at=COALESCE(activated_at, ?1),
                rewarded_hours=MIN(COALESCE(rewarded_hours,0) + ?2, ?3),
                last_claim_id=?4,
                expires_at=CASE
                    WHEN COALESCE(expires_at,0) > ?1
                        THEN MIN(expires_at + ?5, ?1 + ?6)
                    ELSE ?1 + ?5
                END
            WHERE id=?7
              AND user_id=?8
              AND COALESCE(rewarded_hours,0) < ?3
              AND (last_claim_id IS NULL OR last_claim_id != ?4)
        `).bind(
            now,
            REWARD_HOURS,
            MAX_REWARDED_HOURS,
            claim.id,
            REWARD_MS,
            MAX_EXPIRY_MS,
            claim.key_id,
            claim.user_id
        ).run();

        if (Number(keyUpdate.meta?.changes || 0) !== 1) {
            return html("Already Claimed", "Claim ini sudah diproses atau Free Key sudah mencapai batas 72 jam total.");
        }

        const claimUpdate = await env.DB.prepare(`
            UPDATE free_key_claims
            SET status='completed', completed_at=?1
            WHERE id=?2 AND claim_token=?3 AND status='pending' AND expires_at>?1
        `).bind(now, claim.id, claimToken).run();

        if (Number(claimUpdate.meta?.changes || 0) !== 1) {
            // Defensive compensation if the claim was changed unexpectedly after the
            // key update. Only reverse the exact reward belonging to this claim.
            await env.DB.prepare(`
                UPDATE license_keys
                SET rewarded_hours=MAX(0,COALESCE(rewarded_hours,0)-?1),
                    expires_at=CASE
                        WHEN expires_at >= ?2 THEN expires_at-?3
                        ELSE expires_at
                    END,
                    last_claim_id=NULL,
                    status=CASE WHEN MAX(0,COALESCE(rewarded_hours,0)-?1)=0 THEN 'unused' ELSE status END
                WHERE id=?4 AND user_id=?5 AND last_claim_id=?6
            `).bind(
                REWARD_HOURS,
                now + REWARD_MS,
                REWARD_MS,
                claim.key_id,
                claim.user_id,
                claim.id
            ).run();
            return html("Server Error", "Claim terverifikasi tetapi transaksi tidak selesai. Silakan coba lagi.");
        }

        const key = await env.DB.prepare(`
            SELECT key, expires_at, rewarded_hours
            FROM license_keys
            WHERE id=?1 AND user_id=?2
            LIMIT 1
        `).bind(claim.key_id, claim.user_id).first();

        const rewardedHours = Math.max(0, Number(key?.rewarded_hours || 0));
        const response = html(
            "Success",
            rewardedHours >= MAX_REWARDED_HOURS
                ? "Berhasil! Free Key sudah mencapai batas maksimum 72 jam total."
                : `Berhasil! Free Key mendapatkan tambahan ${REWARD_HOURS} jam. Total reward: ${rewardedHours}/72 jam.`
        );
        response.headers.append("Set-Cookie", `${CLAIM_COOKIE}=; Max-Age=0; Path=/api/free-key; Secure; HttpOnly; SameSite=Lax`);
        return response;
    } catch (error) {
        console.error("FREE KEY COMPLETE ERROR", error);
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
        const ok = response.ok && (
            normalized === "TRUE" ||
            parsed?.status === true ||
            String(parsed?.status).toLowerCase() === "true" ||
            parsed?.success === true ||
            String(parsed?.success).toLowerCase() === "true"
        );

        return { ok, http: response.status, response: text.slice(0, 500) };
    } catch (error) {
        console.error("LINKVERTISE VERIFY ERROR", error);
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
