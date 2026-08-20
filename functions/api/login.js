const PBKDF2_ITERATIONS = 100000;
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
    try {
        const body = await request.json();
        const login = String(body.login || "").trim().toLowerCase();
        const password = String(body.password || "");

        if (!login || !password) {
            return json({ success: false, error: "Username/email dan password wajib diisi" }, 400);
        }

        const user = await env.DB.prepare(`
            SELECT id,username,email,password_hash,password_salt,role,status
            FROM users
            WHERE username=?1 OR email=?1
            LIMIT 1
        `).bind(login).first();

        if (!user || String(user.status).toLowerCase() !== "active") {
            return json({ success: false, error: "Invalid credentials" }, 401);
        }

        let valid = false;
        let needsUpgrade = false;

        if (String(user.password_hash || "").startsWith("pbkdf2$")) {
            valid = await verifyPbkdf2(password, user.password_hash);
        } else {
            // Backward compatibility for accounts created by the old SHA-256 loop.
            valid = (await legacyHashPassword(password, user.password_salt)) === user.password_hash;
            needsUpgrade = valid;
        }

        if (!valid) {
            return json({ success: false, error: "Invalid credentials" }, 401);
        }

        const sessionToken = crypto.randomUUID() + "." + crypto.randomUUID();
        const tokenHash = await sha256(sessionToken);
        const now = Date.now();
        const expiresAt = now + SESSION_MS;

        // Upgrade legacy hashes only after the password has been proven correct.
        if (needsUpgrade) {
            const salt = randomHex(16);
            const upgradedHash = await hashPbkdf2(password, salt);
            await env.DB.prepare(`
                UPDATE users SET password_hash=?1,password_salt=?2 WHERE id=?3
            `).bind(upgradedHash, salt, user.id).run();
        }

        await env.DB.batch([
            env.DB.prepare(`
                INSERT INTO sessions (user_id,token_hash,expires_at,created_at)
                VALUES (?1,?2,?3,?4)
            `).bind(user.id, tokenHash, expiresAt, now),
            env.DB.prepare(`
                UPDATE users SET last_login_at=?1 WHERE id=?2
            `).bind(now, user.id),
            // Opportunistic cleanup; expired sessions do not need to remain forever.
            env.DB.prepare(`
                DELETE FROM sessions WHERE expires_at <= ?1
            `).bind(now)
        ]);

        return new Response(JSON.stringify({
            success: true,
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                role: user.role
            }
        }), {
            headers: {
                "Content-Type": "application/json; charset=utf-8",
                "Cache-Control": "no-store",
                "Set-Cookie": `bilsx_session=${encodeURIComponent(sessionToken)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MS / 1000}`
            }
        });
    } catch (error) {
        console.error("LOGIN ERROR:", error);
        return json({ success: false, error: "Internal server error" }, 500);
    }
}

async function hashPbkdf2(password, salt) {
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

async function verifyPbkdf2(password, stored) {
    const parts = String(stored).split("$");
    if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
    const iterations = Number(parts[1]);
    const salt = parts[2];
    const expected = parts[3];
    if (!Number.isInteger(iterations) || iterations < 10000 || iterations > 1000000 || !salt || !/^[0-9a-f]{64}$/i.test(expected)) {
        return false;
    }
    const actual = await hashPbkdf2WithIterations(password, salt, iterations);
    return constantTimeEqual(actual, expected);
}

async function hashPbkdf2WithIterations(password, salt, iterations) {
    const key = await crypto.subtle.importKey(
        "raw",
        new TextEncoder().encode(password),
        "PBKDF2",
        false,
        ["deriveBits"]
    );
    const bits = await crypto.subtle.deriveBits(
        { name: "PBKDF2", salt: new TextEncoder().encode(salt), iterations, hash: "SHA-256" },
        key,
        256
    );
    return toHex(bits);
}

async function legacyHashPassword(password, salt) {
    let digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(salt) + password));
    const saltBytes = new TextEncoder().encode(String(salt));
    for (let i = 0; i < 100000; i++) {
        const buffer = new Uint8Array(saltBytes.length + digest.byteLength);
        buffer.set(saltBytes);
        buffer.set(new Uint8Array(digest), saltBytes.length);
        digest = await crypto.subtle.digest("SHA-256", buffer);
    }
    return toHex(digest);
}

function constantTimeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

async function sha256(value) {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return toHex(digest);
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
