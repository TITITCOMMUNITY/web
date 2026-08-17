const CLAIM_COOKIE = "bilsx_free_key_claim";
const CLAIM_MS = 10 * 60 * 1000;

export async function onRequestGet({ request, env }) {
  try {
    const url = new URL(request.url);
    const claimToken = String(url.searchParams.get("claim") || "").trim();

    if (!claimToken || !/^[0-9a-f]{64}$/i.test(claimToken)) {
      return page("Invalid Claim", "Claim Free Key tidak valid atau sudah tidak tersedia.");
    }

    const now = Date.now();
    const claim = await env.DB.prepare(`
      SELECT id, user_id, key_id, claim_token, status, expires_at
      FROM free_key_claims
      WHERE claim_token = ?1 AND status = 'pending' AND expires_at > ?2
      LIMIT 1
    `).bind(claimToken, now).first();

    if (!claim) {
      return page("Claim Expired", "Claim Free Key sudah kedaluwarsa. Silakan tekan Get Key lagi.");
    }

    const link = String(env.LINKVERTISE_URL || "").trim();
    if (!link) {
      return page("Server Error", "LINKVERTISE_URL belum dikonfigurasi.");
    }

    const response = Response.redirect(link, 302);
    response.headers.append(
      "Set-Cookie",
      `${CLAIM_COOKIE}=${encodeURIComponent(claimToken)}; Max-Age=${Math.ceil(CLAIM_MS / 1000)}; Path=/api/free-key; Secure; HttpOnly; SameSite=Lax`
    );
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    console.error("FREE KEY START ERROR:", error);
    return page("Server Error", "Terjadi kesalahan pada server.");
  }
}

function page(title, message) {
  return new Response(`<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:20px;background:#07070a;color:#fff;font-family:Arial,sans-serif}.card{width:min(100%,440px);padding:32px;border-radius:18px;background:#121216;border:1px solid rgba(255,255,255,.08);text-align:center;box-shadow:0 20px 70px rgba(0,0,0,.5)}h1{margin:0 0 14px}p{margin:0;line-height:1.6;color:#aaa}a{display:inline-block;margin-top:22px;padding:12px 22px;border-radius:10px;background:#fff;color:#000;text-decoration:none;font-weight:600}</style></head><body><div class="card"><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a href="/dashboard.html">Kembali ke Dashboard</a></div></body></html>`, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=UTF-8", "Cache-Control": "no-store" }
  });
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[c]));
}
