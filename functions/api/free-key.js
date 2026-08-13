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


function generateKey() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    function part(length) {

        let result = "";

        for (let i = 0; i < length; i++) {

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

    return `BLSX-FREE-${part(4)}-${part(4)}`;
}


function generateToken() {

    return crypto.randomUUID();
}


async function getSessionUser(request, env) {

    const cookie =
        request.headers.get("Cookie") || "";

    const match =
        cookie.match(
            /session=([^;]+)/i
        );

    if (!match) {
        return null;
    }

    const sessionId =
        match[1];

    const session =
        await env.DB
            .prepare(`
                SELECT
                    s.id,
                    s.user_id,
                    s.expires_at,
                    u.id AS uid,
                    u.username,
                    u.email,
                    u.role,
                    u.status,
                    u.plan,
                    u.premium_expires_at
                FROM sessions s
                JOIN users u
                    ON u.id = s.user_id
                WHERE s.id = ?
                LIMIT 1
            `)
            .bind(sessionId)
            .first();

    if (!session) {
        return null;
    }

    if (
        Number(session.expires_at) <=
        Date.now()
    ) {
        return null;
    }

    if (
        String(session.status)
            .toLowerCase() !== "active"
    ) {
        return null;
    }

    return session;
}


/* =========================================================
   GET FREE KEY
   GET /api/free-key
========================================================= */

async function getFreeKey(request, env) {

    const user =
        await getSessionUser(
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
     * Admin tidak membutuhkan Free Key.
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
     * Premium juga tidak membutuhkan
     * Free Key.
     */

    if (
        user.premium &&
        Number(user.premium_expires_at || 0) >
        Date.now()
    ) {

        return json({
            success: true,
            required: false,
            reason: "premium"
        });
    }


    const key =
        await env.DB
            .prepare(`
                SELECT
                    id,
                    key,
                    user_id,
                    duration_days,
                    status,
                    created_at,
                    activated_at,
                    expires_at
                FROM license_keys
                WHERE user_id = ?
                LIMIT 1
            `)
            .bind(user.user_id)
            .first();


    if (!key) {

        return json({
            success: true,
            required: true,
            has_key: false,
            key: null
        });
    }


    const expired =
        key.expires_at &&
        Number(key.expires_at) <=
        Date.now();


    return json({
        success: true,
        required: true,
        has_key: true,

        key: {
            id: key.id,
            key: key.key,
            status: expired
                ? "expired"
                : key.status,
            created_at: key.created_at,
            activated_at: key.activated_at,
            expires_at: key.expires_at,
            remaining_ms: expired
                ? 0
                : Number(key.expires_at) -
                  Date.now()
        }
    });
}


/* =========================================================
   START CLAIM
   POST /api/free-key
========================================================= */

async function startClaim(request, env) {

    const user =
        await getSessionUser(
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
     * Admin tidak membutuhkan key.
     */

    if (
        String(user.role)
            .toLowerCase() === "admin"
    ) {

        return json({
            success: false,
            error:
                "Admin does not need a Free Key"
        }, 403);
    }


    /*
     * Premium tidak membutuhkan key.
     */

    if (
        user.premium &&
        Number(user.premium_expires_at || 0) >
        Date.now()
    ) {

        return json({
            success: false,
            error:
                "Premium users do not need a Free Key"
        }, 403);
    }


    /*
     * Cari key user.
     */

    let key =
        await env.DB
            .prepare(`
                SELECT *
                FROM license_keys
                WHERE user_id = ?
                LIMIT 1
            `)
            .bind(user.user_id)
            .first();


    /*
     * Kalau belum ada,
     * buat satu key.
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
                VALUES (?, ?, ?, ?, ?)
            `)
            .bind(
                newKey,
                user.user_id,
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
                    WHERE user_id = ?
                    LIMIT 1
                `)
                .bind(user.user_id)
                .first();
    }


    /*
     * Buat claim token.
     */

    const token =
        generateToken();

    const now =
        Date.now();


    await env.DB
        .prepare(`
            INSERT INTO free_key_claims
            (
                user_id,
                key_id,
                claim_token,
                status,
                created_at
            )
            VALUES (?, ?, ?, ?, ?)
        `)
        .bind(
            user.user_id,
            key.id,
            token,
            "pending",
            now
        )
        .run();


    /*
     * Untuk TESTING SAJA.
     *
     * Nanti URL ini akan diganti
     * dengan URL Linkvertise.
     */

    const verifyUrl =
        `/api/free-key?claim=${encodeURIComponent(token)}`;


    return json({

        success: true,

        claim: {
            token,
            key_id: key.id,
            status: "pending"
        },

        /*
         * TEST URL.
         *
         * Jangan digunakan untuk production.
         */

        test_verify_url:
            verifyUrl
    });
}


/* =========================================================
   TEST COMPLETE
========================================================= */

async function testComplete(
    request,
    env,
    token
) {

    const user =
        await getSessionUser(
            request,
            env
        );

    if (!user) {

        return json({
            success: false,
            error: "Unauthorized"
        }, 401);
    }


    const claim =
        await env.DB
            .prepare(`
                SELECT *
                FROM free_key_claims
                WHERE claim_token = ?
                LIMIT 1
            `)
            .bind(token)
            .first();


    if (!claim) {

        return json({
            success: false,
            error: "Invalid claim token"
        }, 400);
    }


    /*
     * Pastikan claim milik user
     */

    if (
        Number(claim.user_id) !==
        Number(user.user_id)
    ) {

        return json({
            success: false,
            error: "Claim does not belong to user"
        }, 403);
    }


    /*
     * Tidak boleh digunakan dua kali.
     */

    if (
        claim.status === "completed"
    ) {

        return json({
            success: false,
            error: "Claim already used"
        }, 400);
    }


    const now =
        Date.now();


    /*
     * Ambil key.
     */

    const key =
        await env.DB
            .prepare(`
                SELECT *
                FROM license_keys
                WHERE id = ?
                LIMIT 1
            `)
            .bind(claim.key_id)
            .first();


    if (!key) {

        return json({
            success: false,
            error: "License key not found"
        }, 404);
    }


    /*
     * +6 JAM
     *
     * Kalau key masih aktif:
     *
     * expires_at + 6 jam
     *
     * Kalau sudah expired:
     *
     * sekarang + 6 jam
     */

    const SIX_HOURS =
        6 * 60 * 60 * 1000;


    const currentExpiry =
        Number(key.expires_at || 0);


    const baseTime =
        currentExpiry > now
            ? currentExpiry
            : now;


    const newExpiry =
        baseTime +
        SIX_HOURS;


    /*
     * Update key.
     */

    await env.DB
        .prepare(`
            UPDATE license_keys
            SET
                status = 'active',
                activated_at =
                    COALESCE(
                        activated_at,
                        ?
                    ),
                expires_at = ?
            WHERE id = ?
        `)
        .bind(
            now,
            newExpiry,
            key.id
        )
        .run();


    /*
     * Tandai claim selesai.
     */

    await env.DB
        .prepare(`
            UPDATE free_key_claims
            SET
                status = 'completed',
                completed_at = ?,
                expires_at = ?
            WHERE id = ?
        `)
        .bind(
            now,
            newExpiry,
            claim.id
        )
        .run();


    return json({

        success: true,

        message:
            "Free Key extended by 6 hours",

        key: {
            id: key.id,
            key: key.key,
            status: "active",
            expires_at: newExpiry,
            added_ms: SIX_HOURS
        }
    });
}


/* =========================================================
   MAIN FETCH
========================================================= */

export default {

    async fetch(request, env) {

        try {

            const url =
                new URL(request.url);


            /*
             * GET
             *
             * /api/free-key
             */

            if (
                request.method === "GET" &&
                url.pathname ===
                "/api/free-key"
            ) {

                const claim =
                    url.searchParams.get(
                        "claim"
                    );


                /*
                 * Kalau ada claim,
                 * sementara digunakan
                 * sebagai TEST completion.
                 */

                if (claim) {

                    return await testComplete(
                        request,
                        env,
                        claim
                    );
                }


                return await getFreeKey(
                    request,
                    env
                );
            }


            /*
             * POST
             *
             * /api/free-key
             */

            if (
                request.method === "POST" &&
                url.pathname ===
                "/api/free-key"
            ) {

                return await startClaim(
                    request,
                    env
                );
            }


            return json({
                success: false,
                error: "Not Found"
            }, 404);


        } catch (error) {

            console.error(
                "Free Key API Error:",
                error
            );

            return json({

                success: false,

                error:
                    String(error)

            }, 500);
        }
    }
};
