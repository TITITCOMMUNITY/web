export async function onRequestGet({ request, env }) {
  try {
    const token = getCookie(
      request.headers.get("Cookie"),
      "bilsx_session"
    );

    if (!token) {
      return json({
        success: false,
        error: "Unauthorized"
      }, 401);
    }

    const tokenHash = await sha256(token);

    const result = await env.DB
      .prepare(`
        SELECT
          s.id AS session_id,
          s.expires_at,

          u.id,
          u.username,
          u.email,
          u.role,
          u.status,
          u.plan,
          u.premium_expires_at,
          u.created_at,
          u.last_login_at

        FROM sessions s

        INNER JOIN users u
          ON u.id = s.user_id

        WHERE
          s.token_hash = ?1
          AND s.expires_at > ?2
          AND u.status = 'active'

        LIMIT 1
      `)
      .bind(
        tokenHash,
        Date.now()
      )
      .first();

    if (!result) {
      return json({
        success: false,
        error: "Session expired or invalid"
      }, 401);
    }

    const premium =
      result.plan === "premium" &&
      (
        result.premium_expires_at === null ||
        Number(result.premium_expires_at) > Date.now()
      );

    return json({
      success: true,

      user: {
        id: result.id,
        username: result.username,
        email: result.email,
        role: result.role,
        status: result.status,

        plan: result.plan,
        premium: premium,
        premium_expires_at:
          result.premium_expires_at,

        created_at:
          result.created_at,

        last_login_at:
          result.last_login_at
      },

      session: {
        id: result.session_id,
        expires_at: result.expires_at
      }
    });

  } catch (error) {

    console.error(error);

    return json({
      success: false,
      error: String(error)
    }, 500);
  }
}


// =====================================
// COOKIE
// =====================================

function getCookie(header, name) {

  if (!header) {
    return null;
  }

  const cookies = header.split(";");

  for (const cookie of cookies) {

    const index = cookie.indexOf("=");

    if (index === -1) {
      continue;
    }

    const key =
      cookie.slice(0, index).trim();

    const value =
      cookie.slice(index + 1).trim();

    if (key === name) {
      return decodeURIComponent(value);
    }
  }

  return null;
}


// =====================================
// SHA256
// =====================================

async function sha256(value) {

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    );

  return toHex(digest);
}


// =====================================
// HEX
// =====================================

function toHex(data) {

  return [...new Uint8Array(data)]
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}


// =====================================
// JSON RESPONSE
// =====================================

function json(data, status = 200) {

  return new Response(
    JSON.stringify(data),
    {
      status,
      headers: {
        "Content-Type": "application/json"
      }
    }
  );
}
