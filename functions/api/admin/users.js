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

    const url =
      new URL(request.url);

    const search =
      url.searchParams
        .get("search");

    let result;

    if (search) {

      const keyword =
        `%${search.trim()}%`;

      result =
        await env.DB
          .prepare(`
            SELECT
              id,
              username,
              email,
              role,
              status,
              plan,
              premium_expires_at,
              created_at,
              last_login_at

            FROM users

            WHERE
              username LIKE ?1
              OR email LIKE ?1

            ORDER BY id DESC

            LIMIT 100
          `)
          .bind(keyword)
          .all();

    } else {

      result =
        await env.DB
          .prepare(`
            SELECT
              id,
              username,
              email,
              role,
              status,
              plan,
              premium_expires_at,
              created_at,
              last_login_at

            FROM users

            ORDER BY id DESC

            LIMIT 100
          `)
          .all();
    }

    const now = Date.now();

    const users =
      (result.results || []).map(user => {

        const premium =
          user.plan === "premium" &&
          (
            user.premium_expires_at === null ||
            Number(user.premium_expires_at) > now
          );

        return {
          id: user.id,
          username: user.username,
          email: user.email,
          role: user.role,
          status: user.status,

          plan: user.plan,

          premium,

          premium_expires_at:
            user.premium_expires_at,

          created_at:
            user.created_at,

          last_login_at:
            user.last_login_at
        };
      });

    return json({
      success: true,
      users
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
