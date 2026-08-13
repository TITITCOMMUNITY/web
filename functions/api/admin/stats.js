import { requireAdmin } from "./_auth.js";

export async function onRequestGet({ request, env }) {

  try {

    const auth =
      await requireAdmin(request, env);

    if (!auth.ok) {
      return json({
        success: false,
        error: auth.error
      }, auth.status);
    }

    const now = Date.now();

    const totalUsers =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM users
        `)
        .first();

    const activeUsers =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM users
          WHERE status = 'active'
        `)
        .first();

    const premiumUsers =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM users
          WHERE
            plan = 'premium'
            AND (
              premium_expires_at IS NULL
              OR premium_expires_at > ?1
            )
        `)
        .bind(now)
        .first();

    const expiredPremium =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM users
          WHERE
            plan = 'premium'
            AND premium_expires_at IS NOT NULL
            AND premium_expires_at <= ?1
        `)
        .bind(now)
        .first();

    const totalKeys =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM license_keys
        `)
        .first();

    const activeKeys =
      await env.DB
        .prepare(`
          SELECT COUNT(*) AS total
          FROM license_keys
          WHERE status = 'active'
        `)
        .first();

    return json({
      success: true,

      stats: {
        users: Number(totalUsers?.total || 0),
        active_users: Number(activeUsers?.total || 0),

        premium_users:
          Number(premiumUsers?.total || 0),

        expired_premium:
          Number(expiredPremium?.total || 0),

        license_keys:
          Number(totalKeys?.total || 0),

        active_keys:
          Number(activeKeys?.total || 0)
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
