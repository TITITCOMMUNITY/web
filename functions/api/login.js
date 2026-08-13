export async function onRequestPost({ request, env }) {

  try {

    const body = await request.json();

    const login = String(body.login || "")
      .trim()
      .toLowerCase();

    const password = String(
      body.password || ""
    );

    if (!login || !password) {

      return json({
        success: false,
        error: "Username/email dan password wajib diisi"
      }, 400);

    }

    // =====================================
    // FIND USER
    // =====================================

    const user = await env.DB
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
        WHERE username = ?1
           OR email = ?1
        LIMIT 1
      `)
      .bind(login)
      .first();

    if (!user || user.status !== "active") {

      return json({
        success: false,
        error: "Invalid credentials"
      }, 401);
    }

    // =====================================
    // VERIFY PASSWORD
    // =====================================

    const hash = await hashPassword(
      password,
      user.password_salt
    );

    if (hash !== user.password_hash) {

      return json({
        success: false,
        error: "Invalid credentials"
      }, 401);
    }

    // =====================================
    // CREATE SESSION
    // =====================================

    const sessionToken =
      crypto.randomUUID() +
      "." +
      crypto.randomUUID();

    const tokenHash =
      await sha256(sessionToken);

    const now = Date.now();

    // 7 DAYS
    const expiresAt =
      now + (7 * 24 * 60 * 60 * 1000);

    await env.DB
      .prepare(`
        INSERT INTO sessions (
          user_id,
          token_hash,
          expires_at,
          created_at
        )
        VALUES (?1, ?2, ?3, ?4)
      `)
      .bind(
        user.id,
        tokenHash,
        expiresAt,
        now
      )
      .run();

    // =====================================
    // UPDATE LAST LOGIN
    // =====================================

    await env.DB
      .prepare(`
        UPDATE users
        SET last_login_at = ?1
        WHERE id = ?2
      `)
      .bind(
        now,
        user.id
      )
      .run();

    // =====================================
    // RESPONSE
    // =====================================

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role
        }
      }),
      {
        headers: {
          "Content-Type": "application/json",

          "Set-Cookie":
            `bilsx_session=${sessionToken}; ` +
            `Path=/; ` +
            `HttpOnly; ` +
            `Secure; ` +
            `SameSite=Lax; ` +
            `Max-Age=604800`
        }
      }
    );

  } catch (error) {

    console.error(error);

    return json({
      success: false,
      error: String(error)
    }, 500);
  }
}


// =====================================
// PASSWORD HASH
// =====================================

async function hashPassword(password, salt) {

  let digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(
      salt + password
    )
  );

  const saltBytes =
    new TextEncoder().encode(salt);

  for (let i = 0; i < 100000; i++) {

    const buffer = new Uint8Array(
      saltBytes.length + digest.byteLength
    );

    buffer.set(saltBytes);

    buffer.set(
      new Uint8Array(digest),
      saltBytes.length
    );

    digest = await crypto.subtle.digest(
      "SHA-256",
      buffer
    );
  }

  return toHex(digest);
}


// =====================================
// SHA256 SESSION
// =====================================

async function sha256(value) {

  const digest =
    await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(value)
    );

  return toHex(digest);
}


function toHex(data) {

  return [...new Uint8Array(data)]
    .map(byte =>
      byte.toString(16).padStart(2, "0")
    )
    .join("");
}


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
