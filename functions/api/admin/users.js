import { requireAdmin } from "./_auth.js";

export async function onRequestGet({ request, env }) {
  try {
    const auth = await requireAdmin(request, env);

    if (!auth.ok) {
      return json({ success: false, error: auth.error }, auth.status);
    }

    const url = new URL(request.url);
    const search = url.searchParams.get("search")?.trim() || "";

    const baseQuery = `
      SELECT
        u.id,
        u.username,
        u.email,
        u.role,
        u.status,
        u.plan,
        u.premium_expires_at,
        u.created_at,
        u.last_login_at,
        lk.id AS key_id,
        lk.key AS free_key,
        lk.status AS key_status,
        lk.activated_at AS key_activated_at,
        lk.expires_at AS key_expires_at
      FROM users u
      LEFT JOIN license_keys lk
        ON lk.id = (
          SELECT id
          FROM license_keys x
          WHERE x.user_id = u.id
          ORDER BY x.created_at DESC, x.id DESC
          LIMIT 1
        )
    `;

    let result;

    if (search) {
      result = await env.DB.prepare(`
        ${baseQuery}
        WHERE u.username LIKE ?1 OR u.email LIKE ?1
        ORDER BY u.id DESC
        LIMIT 100
      `).bind(`%${search}%`).all();
    } else {
      result = await env.DB.prepare(`
        ${baseQuery}
        ORDER BY u.id DESC
        LIMIT 100
      `).all();
    }

    const now = Date.now();

    const users = (result.results || []).map(user => {
      const premium =
        user.plan === "premium" &&
        (user.premium_expires_at === null || Number(user.premium_expires_at) > now);

      const keyExpires = user.key_expires_at == null
        ? null
        : Number(user.key_expires_at);

      const keyActive =
        keyExpires !== null && keyExpires > now && user.key_status !== "revoked";

      return {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role,
        status: user.status,
        plan: user.plan,
        premium,
        premium_expires_at: user.premium_expires_at,
        created_at: user.created_at,
        last_login_at: user.last_login_at,
        free_key: user.key_id ? {
          id: user.key_id,
          key: user.free_key,
          status: keyActive ? "active" : (user.key_status || "inactive"),
          activated_at: user.key_activated_at,
          expires_at: keyExpires,
          remaining_ms: keyActive ? Math.max(0, keyExpires - now) : 0
        } : null
      };
    });

    return json({ success: true, users });
  } catch (error) {
    console.error(error);
    return json({ success: false, error: String(error) }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}
