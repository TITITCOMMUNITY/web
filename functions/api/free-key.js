export async function onRequestGet({
    request,
    env
}) {

    try {

        const user =
            await getUser(
                request,
                env
            );

        if (!user) {
            return json({
                success: false,
                error: "Unauthorized"
            }, 401);
        }


        /*
         * ADMIN
         */

        if (
            String(user.role)
                .toLowerCase() === "admin"
        ) {

            return json({
                success: true,
                required: false,
                reason: "admin"
            });
        }


        /*
         * PREMIUM
         */

        const premium =
            user.plan === "premium" &&
            (
                user.premium_expires_at === null ||
                Number(user.premium_expires_at) >
                Date.now()
            );


        if (premium) {

            return json({
                success: true,
                required: false,
                reason: "premium"
            });
        }


        /*
         * CARI KEY
         */

        const key =
            await env.DB
                .prepare(`
                    SELECT
                        id,
                        key,
                        duration_days,
                        status,
                        created_at,
                        activated_at,
                        expires_at

                    FROM license_keys

                    WHERE user_id = ?1

                    ORDER BY created_at DESC

                    LIMIT 1
                `)
                .bind(user.id)
                .first();


        if (!key) {

            return json({
                success: true,
                required: true,
                has_key: false,
                key: null
            });
        }


        const now =
            Date.now();

        let status =
            key.status;


        if (
            key.expires_at &&
            Number(key.expires_at) <= now
        ) {
            status = "expired";
        }


        return json({

            success: true,

            required: true,

            has_key: true,

            key: {
                id: key.id,
                key: key.key,
                duration_days:
                    key.duration_days,
                status,
                created_at:
                    key.created_at,
                activated_at:
                    key.activated_at,
                expires_at:
                    key.expires_at,

                remaining_ms:
                    key.expires_at
                        ? Math.max(
                            0,
                            Number(key.expires_at) -
                            now
                        )
                        : null
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


/* =========================================================
   POST
========================================================= */

export async function onRequestPost({
    request,
    env
}) {

    try {

        const user =
            await getUser(
                request,
                env
            );

        if (!user) {

            return json({
                success: false,
                error: "Unauthorized"
            }, 401);
        }


        /*
         * ADMIN
         */

        if (
            String(user.role)
                .toLowerCase() === "admin"
        ) {

            return json({
                success: false,
                error:
                    "Admin does not need Free Key"
            }, 403);
        }


        /*
         * PREMIUM
         */

        const premium =
            user.plan === "premium" &&
            (
                user.premium_expires_at === null ||
                Number(user.premium_expires_at) >
                Date.now()
            );


        if (premium) {

            return json({
                success: false,
                error:
                    "Premium users do not need Free Key"
            }, 403);
        }


        /*
         * CEK KEY USER
         */

        let key =
            await env.DB
                .prepare(`
                    SELECT *
                    FROM license_keys
                    WHERE user_id = ?1
                    LIMIT 1
                `)
                .bind(user.id)
                .first();


        /*
         * BELUM ADA KEY
         */

        if (!key) {

            const now =
                Date.now();

            const newKey =
                generateKey();


            await env.DB
                .prepare(`
                    INSERT INTO license_keys
                    (
                        key,
                        user_id,
                        duration_days,
                        status,
                        created_at
                    )

                    VALUES
                    (
                        ?1,
                        ?2,
                        0,
                        'unused',
                        ?3
                    )
                `)
                .bind(
                    newKey,
                    user.id,
                    now
                )
                .run();


            key =
                await env.DB
                    .prepare(`
                        SELECT *
                        FROM license_keys
                        WHERE user_id = ?1
                        LIMIT 1
                    `)
                    .bind(user.id)
                    .first();
        }


        /*
         * Untuk sekarang POST hanya
         * mengembalikan key.
         *
         * Linkvertise akan dipasang
         * setelah sistem dasar normal.
         */

        return json({

            success: true,

            key: {
                id: key.id,
                key: key.key,
                status: key.status,
                expires_at:
                    key.expires_at
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


/* =========================================================
   USER SESSION
========================================================= */

async function getUser(
    request,
    env
) {

    const cookie =
        request.headers.get(
            "Cookie"
        ) || "";


    let token = null;


    for (
        const item of cookie.split(";")
    ) {

        const index =
            item.indexOf("=");

        if (index === -1) {
            continue;
        }


        const name =
            item
                .slice(0, index)
                .trim();


        if (
            name === "bilsx_session"
        ) {

            token =
                item
                    .slice(index + 1)
                    .trim();

            break;
        }
    }


    if (!token) {
        return null;
    }


    try {
        token =
            decodeURIComponent(token);
    } catch {}


    const tokenHash =
        await sha256(token);


    return await env.DB
        .prepare(`
            SELECT
                u.id,
                u.username,
                u.email,
                u.role,
                u.status,
                u.plan,
                u.premium_expires_at

            FROM sessions s

            INNER JOIN users u
                ON u.id = s.user_id

            WHERE
                s.token_hash = ?1
                AND s.expires_at > ?2
                AND u.status = 'active'

            LIMIT 1
        `)
        .bind(
            tokenHash,
            Date.now()
        )
        .first();
}


/* =========================================================
   SHA256
========================================================= */

async function sha256(value) {

    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(value)
        );

    return [
        ...new Uint8Array(digest)
    ]
        .map(x =>
            x.toString(16).padStart(2, "0")
        )
        .join("");
}


/* =========================================================
   KEY
========================================================= */

function generateKey() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    function part(length) {

        let result = "";

        for (
            let i = 0;
            i < length;
            i++
        ) {

            result +=
                chars[
                    Math.floor(
                        Math.random() *
                        chars.length
                    )
                ];
        }

        return result;
    }


    return (
        "BLSX-FREE-" +
        part(4) +
        "-" +
        part(4)
    );
}


/* =========================================================
   JSON
========================================================= */

function json(
    data,
    status = 200
) {

    return new Response(
        JSON.stringify(data),
        {
            status,
            headers: {
                "Content-Type":
                    "application/json"
            }
        }
    );
}
