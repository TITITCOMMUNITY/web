export async function onRequestPost({ request, env }) {
  try {
    const body = await request.json();

    const username = String(body.username || "")
      .trim()
      .toLowerCase();

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    const password = String(body.password || "");

    // =========================
    // VALIDATION
    // =========================

    if (!/^[a-z0-9_]{3,32}$/.test(username)) {
      return json({
        success: false,
        error: "Username hanya boleh menggunakan a-z, 0-9 dan _"
      }, 400);
    }

    if (!/^\S+@\S+\.\S+$/.test(email)) {
      return json({
        success: false,
        error: "Invalid email"
      }, 400);
    }

    if (password.length < 8 || password.length > 128) {
      return json({
        success: false,
        error: "Password harus 8-128 karakter"
      }, 400);
    }

    // =========================
    // CHECK DUPLICATE
    // =========================

    const existing = await env.DB
      .prepare(`
        SELECT id
        FROM users
        WHERE username = ?1
           OR email = ?2
        LIMIT 1
      `)
      .bind(username, email)
      .first();

    if (existing) {
      return json({
        success: false,
        error: "Username atau email sudah digunakan"
      }, 409);
    }

    // =========================
    // PASSWORD HASH
    // =========================

    const salt = crypto
      .randomUUID()
      .replaceAll("-", "");

    const passwordHash = await hashPassword(
      password,
      salt
    );

    // =========================
    // CREATE USER
    // =========================

    const now = Date.now();

    const result = await env.DB
      .prepare(`
        INSERT INTO users (
          username,
          email,
          password_hash,
          password_salt,
          role,
          status,
          created_at
        )
        VALUES (
          ?1,
          ?2,
          ?3,
          ?4,
          'user',
          'active',
          ?5
        )
      `)
      .bind(
        username,
        email,
        passwordHash,
        salt,
        now
      )
      .run();

    return json({
      success: true,
      message: "Account created",
      user: {
        id: result.meta?.last_row_id ?? null,
        username,
        email
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
// HELPERS
// =====================================

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
