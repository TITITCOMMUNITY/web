const PBKDF2_ITERATIONS = 100000;

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const username = String(body.username || "").trim().toLowerCase();
        const email = String(body.email || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!username || !email || !password) {
            return json({ success: false, error: "Username, email, dan password wajib diisi" }, 400);
        }
        if (!/^[a-z0-9_]{3,32}$/.test(username)) {
            return json({ success: false, error: "Username hanya boleh berisi huruf kecil, angka, dan underscore (3-32 karakter)" }, 400);
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
            return json({ success: false, error: "Format email tidak valid" }, 400);
        }
        if (password.length < 6 || password.length > 128) {
            return json({ success: false, error: "Password harus 6-128 karakter" }, 400);
        }

        const exists = await env.DB.prepare(`
            SELECT id, username, email
            FROM users
            WHERE username = ?1 OR email = ?2
            LIMIT 1
        `).bind(username, email).first();

        if (exists) {
            return json({
                success: false,
                error: exists.username === username ? "Username sudah digunakan" : "Email sudah digunakan"
            }, 409);
        }

        const salt = randomHex(16);
        const passwordHash = await hashPassword(password, salt);
        const now = Date.now();

        const result = await env.DB.prepare(`
            INSERT INTO users
                (username,email,password_hash,password_salt,role,status,plan,premium_expires_at,created_at,last_login_at)
            VALUES (?1,?2,?3,?4,'user','active','free',NULL,?5,NULL)
        `).bind(username, email, passwordHash, salt, now).run();

        return json({
            success: true,
            user: {
                id: result.meta?.last_row_id,
                username,
                email,
                role: "user",
                status: "active",
                plan: "free"
            }
        });
    } catch (error) {
        console.error("REGISTER ERROR:", error);
        const message = String(error?.message || error);
        if (/unique|constraint/i.test(message)) {
            return json({ success: false, error: "Username atau email sudah digunakan" }, 409);
        }
        return json({ success: false, error: "Internal server error" }, 500);
    }
}

async function hashPassword(password, salt) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations: PBKDF2_ITERATIONS, hash: "SHA-256" },
        key,
        256
    );
    return `pbkdf2$${PBKDF2_ITERATIONS}$${salt}$${toHex(bits)}`;
}

function randomHex(bytesLength) {
    const bytes = new Uint8Array(bytesLength);
    crypto.getRandomValues(bytes);
    return toHex(bytes);
}

function toHex(data) {
    return [...new Uint8Array(data)].map(byte => byte.toString(16).padStart(2, "0")).join("");
}

function json(data, status = 200) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store"
        }
    });
}
