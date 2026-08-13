export async function onRequestPost({ request, env }) {
  try {
    const token = getCookie(request.headers.get("Cookie"), "bilsx_session");

    if (token) {
      const tokenHash = await sha256(token);

      await env.DB
        .prepare(`
          DELETE FROM sessions
          WHERE token_hash = ?1
        `)
        .bind(tokenHash)
        .run();
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: "Logged out"
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store",
          "Set-Cookie":
            "bilsx_session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT"
        }
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: String(error)
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json; charset=utf-8",
          "Cache-Control": "no-store"
        }
      }
    );
  }
}

function getCookie(header, name) {
  if (!header) return null;

  for (const cookie of header.split(";")) {
    const index = cookie.indexOf("=");

    if (index === -1) continue;

    const key = cookie.slice(0, index).trim();
    const value = cookie.slice(index + 1).trim();

    if (key === name) {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    }
  }

  return null;
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value)
  );

  return [...new Uint8Array(digest)]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
