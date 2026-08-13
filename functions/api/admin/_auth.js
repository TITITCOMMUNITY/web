export async function requireAdmin(request, env) {
  const token = getCookie(
    request.headers.get("Cookie"),
    "bilsx_session"
  );

  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "Unauthorized"
    };
  }

  const tokenHash = await sha256(token);

  const user = await env.DB
    .prepare(`
      SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.status,
        u.plan,
        u.premium_expires_at

      FROM sessions s

      INNER JOIN users u
        ON u.id = s.user_id

      WHERE
        s.token_hash = ?1
        AND s.expires_at > ?2
        AND u.status = 'active'

      LIMIT 1
    `)
    .bind(tokenHash, Date.now())
    .first();

  if (!user) {
    return {
      ok: false,
      status: 401,
      error: "Session expired or invalid"
    };
  }

  if (user.role !== "admin") {
    return {
      ok: false,
      status: 403,
      error: "Forbidden"
    };
  }

  return {
    ok: true,
    user
  };
}


function getCookie(header, name) {
  if (!header) {
    return null;
  }

  for (const cookie of header.split(";")) {
    const index = cookie.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key = cookie
      .slice(0, index)
      .trim();

    const value = cookie
      .slice(index + 1)
      .trim();

    if (key === name) {
      return decodeURIComponent(value);
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
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}
