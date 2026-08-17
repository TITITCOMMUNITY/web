import { requireAdmin } from "./_auth.js";

const MAX_MS = 72 * 60 * 60 * 1000;

export async function onRequestPost({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);

    if (!auth.ok) {
      return json({ success: false, error: auth.error }, auth.status);
    }

    const body = await request.json();
    const userId = Number(body.user_id);
    const hoursDelta = Number(body.hours_delta);

    if (!Number.isInteger(userId)) {
      return json({ success: false, error: "Invalid user_id" }, 400);
    }

    if (!Number.isFinite(hoursDelta) || hoursDelta === 0 || Math.abs(hoursDelta) > 72) {
      return json({ success: false, error: "hours_delta must be between -72 and 72 and cannot be 0" }, 400);
    }

    if (userId === auth.user.id) {
      return json({ success: false, error: "You cannot modify your own free key here" }, 400);
    }

    const target = await env.DB.prepare(`
      SELECT id, username, role, status, plan
      FROM users
      WHERE id = ?1
      LIMIT 1
    `).bind(userId).first();

    if (!target) {
      return json({ success: false, error: "User not found" }, 404);
    }

    if (target.username === "bilsx" && auth.user.username !== "bilsx") {
      return json({ success: false, error: "Cannot modify super admin" }, 403);
    }

    if (target.role === "admin") {
      return json({ success: false, error: "Admin accounts do not use Free Key" }, 400);
    }

    const existing = await env.DB.prepare(`
      SELECT id, key, duration_days, status, created_at, activated_at, expires_at
      FROM license_keys
      WHERE user_id = ?1
      ORDER BY created_at DESC, id DESC
      LIMIT 1
    `).bind(userId).first();

    const now = Date.now();
    const deltaMs = Math.round(hoursDelta * 60 * 60 * 1000);

    let key = existing;
    let expiresAt;
    let activatedAt;

    if (!key) {
      if (deltaMs < 0) {
        return json({ success: false, error: "User has no Free Key" }, 400);
      }

      const randomKey = `FREE-${crypto.randomUUID().replaceAll("-", "").slice(0, 24).toUpperCase()}`;
      expiresAt = Math.min(now + deltaMs, now + MAX_MS);
      activatedAt = now;

      await env.DB.prepare(`
        INSERT INTO license_keys
          (key, user_id, duration_days, status, created_at, activated_at, expires_at)
        VALUES
          (?1, ?2, ?3, 'active', ?4, ?5, ?6)
      `).bind(
        randomKey,
        userId,
        Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000)),
        now,
        activatedAt,
        expiresAt
      ).run();

      key = await env.DB.prepare(`
        SELECT id, key, duration_days, status, created_at, activated_at, expires_at
        FROM license_keys
        WHERE user_id = ?1
        ORDER BY created_at DESC, id DESC
        LIMIT 1
      `).bind(userId).first();
    } else {
      const currentExpires = key.expires_at == null ? 0 : Number(key.expires_at);

      if (deltaMs > 0) {
        const base = Math.max(now, currentExpires);
        expiresAt = Math.min(base + deltaMs, now + MAX_MS);
      } else {
        expiresAt = Math.max(0, currentExpires + deltaMs);
      }

      activatedAt = key.activated_at || (expiresAt > now ? now : null);

      const status = expiresAt > now ? "active" : "expired";

      await env.DB.prepare(`
        UPDATE license_keys
        SET
          status = ?1,
          activated_at = ?2,
          expires_at = ?3,
          duration_days = ?4
        WHERE id = ?5
      `).bind(
        status,
        activatedAt,
        expiresAt,
        Math.ceil(Math.max(0, expiresAt - now) / (24 * 60 * 60 * 1000)),
        key.id
      ).run();

      key = await env.DB.prepare(`
        SELECT id, key, duration_days, status, created_at, activated_at, expires_at
        FROM license_keys
        WHERE id = ?1
        LIMIT 1
      `).bind(key.id).first();
    }

    return json({
      success: true,
      message: hoursDelta > 0 ? "Free Key time added" : "Free Key time removed",
      user: {
        id: target.id,
        username: target.username
      },
      free_key: {
        id: key.id,
        key: key.key,
        status: key.status,
        activated_at: key.activated_at,
        expires_at: key.expires_at,
        remaining_ms: Math.max(0, Number(key.expires_at || 0) - now),
        max_ms: MAX_MS
      }
    });
  } catch (error) {
    console.error("ADMIN FREE KEY ERROR:", error);
    return json({ success: false, error: String(error) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
