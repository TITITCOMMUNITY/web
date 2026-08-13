export async function onRequestPost({ request, env }) {
  try {
    const { login, password } = await request.json();

    const identifier = (login || "").trim();

    if (!identifier || !password) {
      return j({
        success: false,
        error: "Username/email and password are required"
      }, 400);
    }

    const u = await env.DB
      .prepare(`
        SELECT
          id,
          username,
          email,
          password_hash,
          password_salt,
          role,
          status
        FROM users
        WHERE username = ?1 COLLATE NOCASE
           OR email = ?1 COLLATE NOCASE
        LIMIT 1
      `)
      .bind(identifier)
      .first();

    if (!u || u.status !== "active") {
      return j({
        success: false,
        error: "Invalid credentials"
      }, 401);
    }

    const hash = await ph(password, u.password_salt);

    if (hash !== u.password_hash) {
      return j({
        success: false,
        error: "Invalid credentials"
      }, 401);
    }

    const token =
      crypto.randomUUID() +
      "." +
      crypto.randomUUID();

    const tokenHash = await sha(token);
    const now = Date.now();
    const expires = now + 604800000;

    await env.DB
      .prepare(`
        INSERT INTO sessions
        (user_id, token_hash, expires_at, created_at)
        VALUES (?1, ?2, ?3, ?4)
      `)
      .bind(
        u.id,
        tokenHash,
        expires,
        now
      )
      .run();

    await env.DB
      .prepare(`
        UPDATE users
        SET last_login_at = ?1
        WHERE id = ?2
      `)
      .bind(now, u.id)
      .run();

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: u.id,
          username: u.username,
          email: u.email,
          role: u.role
        }
      }),
      {
        headers: {
          "Content-Type": "application/json",
          "Set-Cookie":
            `bilsx_session=${token}; ` +
            `Path=/; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Lax; ` +
            `Max-Age=604800`
        }
      }
    );

  } catch (e) {
    return j({
      success: false,
      error: String(e)
    }, 500);
  }
}


async function ph(password, salt) {

  let d = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      salt + password
    )
  );

  const sb = new TextEncoder().encode(salt);

  for (let i = 0; i < 100000; i++) {

    const b = new Uint8Array(
      sb.length + d.byteLength
    );

    b.set(sb);
    b.set(
      new Uint8Array(d),
      sb.length
    );

    d = await crypto.subtle.digest(
      "SHA-256",
      b
    );
  }

  return hex(d);
}


async function sha(value) {

  return hex(
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    )
  );
}


function hex(data) {

  return [...new Uint8Array(data)]
    .map(x =>
      x.toString(16).padStart(2, "0")
    )
    .join("");
}


function j(data, status = 200) {

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
