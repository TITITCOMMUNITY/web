import { requireAdmin } from "./_auth.js";

export async function onRequestPost({ request, env }) {

  try {

    const auth =
      await requireAdmin(request, env);

    if (!auth.ok) {
      return json({
        success: false,
        error: auth.error
      }, auth.status);
    }

    const body =
      await request.json();

    const userId =
      Number(body.user_id);

    if (!Number.isInteger(userId)) {
      return json({
        success: false,
        error: "Invalid user_id"
      }, 400);
    }

    /*
     * Jangan izinkan admin mengubah dirinya
     * sendiri melalui endpoint ini.
     */
    if (userId === auth.user.id) {
      return json({
        success: false,
        error: "You cannot modify your own account here"
      }, 400);
    }

    const target =
      await env.DB
        .prepare(`
          SELECT
            id,
            username,
            role,
            status,
            plan,
            premium_expires_at

          FROM users

          WHERE id = ?1

          LIMIT 1
        `)
        .bind(userId)
        .first();

    if (!target) {
      return json({
        success: false,
        error: "User not found"
      }, 404);
    }

    /*
     * Admin tidak boleh mengubah super admin.
     * Untuk tahap awal kita anggap username "bilsx"
     * sebagai super admin.
     */
    if (
      target.username === "bilsx" &&
      auth.user.username !== "bilsx"
    ) {
      return json({
        success: false,
        error: "Cannot modify super admin"
      }, 403);
    }

    const role =
      body.role;

    const status =
      body.status;

    const plan =
      body.plan;

    const durationDays =
      Number(body.duration_days || 0);

    const updates = [];
    const values = [];

    // =====================================
    // ROLE
    // =====================================

    if (
      role !== undefined
    ) {

      if (
        role !== "user" &&
        role !== "admin"
      ) {
        return json({
          success: false,
          error: "Invalid role"
        }, 400);
      }

      updates.push(
        `role = ?${values.length + 1}`
      );

      values.push(role);
    }

    // =====================================
    // STATUS
    // =====================================

    if (
      status !== undefined
    ) {

      if (
        status !== "active" &&
        status !== "banned"
      ) {
        return json({
          success: false,
          error: "Invalid status"
        }, 400);
      }

      updates.push(
        `status = ?${values.length + 1}`
      );

      values.push(status);
    }

    // =====================================
    // PREMIUM
    // =====================================

    if (
      plan !== undefined
    ) {

      if (
        plan !== "free" &&
        plan !== "premium"
      ) {
        return json({
          success: false,
          error: "Invalid plan"
        }, 400);
      }

      updates.push(
        `plan = ?${values.length + 1}`
      );

      values.push(plan);

      if (plan === "free") {

        updates.push(
          `premium_expires_at = NULL`
        );

      } else {

        if (
          !Number.isInteger(durationDays) ||
          durationDays <= 0 ||
          durationDays > 3650
        ) {
          return json({
            success: false,
            error:
              "Invalid premium duration"
          }, 400);
        }

        const expiresAt =
          Date.now() +
          durationDays *
          24 *
          60 *
          60 *
          1000;

        updates.push(
          `premium_expires_at = ?${values.length + 1}`
        );

        values.push(expiresAt);
      }
    }

    if (updates.length === 0) {

      return json({
        success: false,
        error: "Nothing to update"
      }, 400);
    }

    values.push(userId);

    await env.DB
      .prepare(`
        UPDATE users

        SET ${updates.join(", ")}

        WHERE id = ?${values.length}
      `)
      .bind(...values)
      .run();

    return json({
      success: true,
      message: "User updated"
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
