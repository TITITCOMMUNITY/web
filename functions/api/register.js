export async function onRequestPost({
    request,
    env
}) {

    try {

        const body =
            await request.json();


        const username =
            String(
                body.username || ""
            )
                .trim()
                .toLowerCase();


        const email =
            String(
                body.email || ""
            )
                .trim()
                .toLowerCase();


        const password =
            String(
                body.password || ""
            );


        if (
            !username ||
            !email ||
            !password
        ) {

            return json({
                success: false,
                error:
                    "Username, email, dan password wajib diisi"
            }, 400);
        }


        if (
            username.length < 3
        ) {

            return json({
                success: false,
                error:
                    "Username minimal 3 karakter"
            }, 400);
        }


        if (
            password.length < 6
        ) {

            return json({
                success: false,
                error:
                    "Password minimal 6 karakter"
            }, 400);
        }


        /*
         * CEK USERNAME / EMAIL
         */

        const exists =
            await env.DB
                .prepare(`
                    SELECT
                        id,
                        username,
                        email
                    FROM users
                    WHERE
                        username = ?1
                        OR email = ?2
                    LIMIT 1
                `)
                .bind(
                    username,
                    email
                )
                .first();


        if (exists) {

            if (
                exists.username ===
                username
            ) {

                return json({
                    success: false,
                    error:
                        "Username sudah digunakan"
                }, 409);
            }


            return json({
                success: false,
                error:
                    "Email sudah digunakan"
            }, 409);
        }


        /*
         * SALT
         */

        const salt =
            crypto.randomUUID();


        const passwordHash =
            await hashPassword(
                password,
                salt
            );


        const now =
            Date.now();


        /*
         * USER BARU SELALU FREE
         */

        const result =
            await env.DB
                .prepare(`
                    INSERT INTO users
                    (
                        username,
                        email,
                        password_hash,
                        password_salt,
                        role,
                        status,
                        plan,
                        premium_expires_at,
                        created_at,
                        last_login_at
                    )

                    VALUES
                    (
                        ?1,
                        ?2,
                        ?3,
                        ?4,
                        'user',
                        'active',
                        'free',
                        NULL,
                        ?5,
                        NULL
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

            user: {
                id:
                    result.meta
                        ?.last_row_id,

                username,

                email,

                role: "user",

                status: "active",

                plan: "free"
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
   PASSWORD HASH
========================================================= */

async function hashPassword(
    password,
    salt
) {

    let digest =
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
                salt + password
            )
        );


    const saltBytes =
        new TextEncoder()
            .encode(salt);


    for (
        let i = 0;
        i < 100000;
        i++
    ) {

        const buffer =
            new Uint8Array(
                saltBytes.length +
                digest.byteLength
            );


        buffer.set(
            saltBytes
        );


        buffer.set(
            new Uint8Array(digest),
            saltBytes.length
        );


        digest =
            await crypto.subtle.digest(
                "SHA-256",
                buffer
            );
    }


    return [
        ...new Uint8Array(digest)
    ]
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(2, "0")
        )
        .join("");
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
