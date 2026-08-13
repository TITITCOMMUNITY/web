export async function onRequestGet({ request, env }) {

    try {

        const user =
            await getUser(request, env);

        if (!user) {

            return json({
                success: false,
                error: "Unauthorized"
            }, 401);
        }


        /*
         * ADMIN
         *
         * Admin tidak membutuhkan Free Key.
         */

        if (
            String(user.role).toLowerCase() ===
            "admin"
        ) {

            return json({
                success: true,
                required: false,
                reason: "admin"
            });
        }


        /*
         * PREMIUM
         *
         * Premium juga tidak membutuhkan
         * Free Key selama masih aktif.
         */

        if (
            user.plan === "premium" &&
            (
                user.premium_expires_at === null ||
                Number(user.premium_expires_at) >
                Date.now()
            )
        ) {

            return json({
                success: true,
                required: false,
                reason: "premium"
            });
        }


        /*
         * CARI KEY USER
         */

        const result =
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


        /*
         * USER BELUM MEMILIKI KEY
         */

        if (!result) {

            return json({
                success: true,
                required: true,
                has_key: false,
                key: null
            });
        }


        /*
         * CEK EXPIRY
         */

        const now =
            Date.now();

        let status =
            result.status;

        if (
            result.expires_at &&
            Number(result.expires_at) <= now
        ) {

            status = "expired";
        }


        return json({

            success: true,

            required: true,

            has_key: true,

            key: {
                id: result.id,
                key: result.key,
                duration_days:
                    result.duration_days,
                status: status,
                created_at:
                    result.created_at,
                activated_at:
                    result.activated_at,
                expires_at:
                    result.expires_at,
                remaining_ms:
                    result.expires_at
                        ? Math.max(
                            0,
                            Number(
                                result.expires_at
                            ) - now
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
   POST /api/free-key
   ========================================================= */

export async function onRequestPost({
    request,
    env
}) {

    try {

        const user =
            await getUser(request, env);

        if (!user) {

            return json({
                success: false,
                error: "Unauthorized"
            }, 401);
        }


        /*
         * ADMIN TIDAK PERLU FREE KEY
         */

        if (
            String(user.role).toLowerCase() ===
            "admin"
        ) {

            return json({
                success: false,
                error:
                    "Admin does not need Free Key"
            }, 403);
        }


        /*
         * PREMIUM TIDAK PERLU FREE KEY
         */

        if (
            user.plan === "premium" &&
            (
                user.premium_expires_at === null ||
                Number(user.premium_expires_at) >
                Date.now()
            )
        ) {

            return json({
                success: false,
                error:
                    "Premium users do not need Free Key"
            }, 403);
        }


        /*
         * CEK APAKAH USER SUDAH MEMILIKI KEY
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
         * BELUM PUNYA KEY
         *
         * Buat satu key.
         */

        if (!key) {

            const newKey =
                generateKey();

            const now =
                Date.now();


            await env.DB
                .prepare(`
                    INSERT INTO license_keys (
                        key,
                        user_id,
                        duration_days,
                        status,
                        created_at
                    )
                    VALUES (
                        ?1,
                        ?2,
                        ?3,
                        ?4,
                        ?5
                    )
                `)
                .bind(
                    newKey,
                    user.id,
                    0,
                    "unused",
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
         * BUAT CLAIM TOKEN
         *
         * Untuk sementara ini hanya
         * testing mekanisme Free Key.
         */

        const claimToken =
            crypto.randomUUID();


        const now =
            Date.now();


        /*
         * Pastikan tabel sudah dibuat.
         */

        await env.DB
            .prepare(`
                INSERT INTO free_key_claims (
                    user_id,
                    key_id,
                    claim_token,
                    status,
                    created_at
                )
                VALUES (
                    ?1,
                    ?2,
                    ?3,
                    ?4,
                    ?5
                )
            `)
            .bind(
                user.id,
                key.id,
                claimToken,
                "pending",
                now
            )
            .run();


        /*
         * URL TEST
         *
         * NANTI AKAN DIGANTI DENGAN
         * LINKVERTISE.
         */

        const origin =
            new URL(request.url).origin;

        const testUrl =
            origin +
            "/api/free-key/verify?token=" +
            encodeURIComponent(
                claimToken
            );


        return json({

            success: true,

            claim: {
                token: claimToken,
                status: "pending"
            },

            key: {
                id: key.id,
                key: key.key
            },

            test_url: testUrl

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
   GET USER
   ========================================================= */

async function getUser(
    request,
    env
) {

    const cookie =
        request.headers.get(
            "Cookie"
        ) || "";


    const item =
        cookie
            .split(";")
            .map(
                x => x.trim()
            )
            .find(
                x =>
                    x.startsWith(
                        "bilsx_session="
                    )
            );


    if (!item) {
        return null;
    }


    const token =
        item.substring(
            "bilsx_session=".length
        );


    if (!token) {
        return null;
    }


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
            new TextEncoder()
                .encode(value)
        );


    return [
        ...new Uint8Array(digest)
    ]
        .map(
            x =>
                x.toString(16)
                    .padStart(2, "0")
        )
        .join("");
}


/* =========================================================
   KEY GENERATOR
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
