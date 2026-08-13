/* =========================================================
   BILSX FREE KEY
   =========================================================

   GET
   - mengecek apakah user membutuhkan Free Key

   POST
   - membuat claim Linkvertise
   - tidak langsung memberikan waktu

   Reward diberikan oleh:
   /api/free-key/complete

   Rules:
   - Admin   = tidak membutuhkan Free Key
   - Premium = tidak membutuhkan Free Key
   - Free    = Linkvertise
   - 1 completion = +6 jam
   - maksimum = 72 jam
========================================================= */


/* =========================================================
   CONSTANT
========================================================= */

const REWARD_MS =
    6 * 60 * 60 * 1000;

const MAX_MS =
    72 * 60 * 60 * 1000;

/*
 * Claim Linkvertise hanya boleh
 * menunggu beberapa menit.
 *
 * Ini bukan durasi key.
 */

const CLAIM_MS =
    10 * 60 * 1000;


/* =========================================================
   GET
========================================================= */

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


        /* -------------------------------------------------
           ADMIN
        ------------------------------------------------- */

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


        /* -------------------------------------------------
           PREMIUM
        ------------------------------------------------- */

        const premium =
            isPremium(user);


        if (premium) {

            return json({

                success: true,

                required: false,

                reason: "premium"

            });
        }


        /* -------------------------------------------------
           CARI KEY
        ------------------------------------------------- */

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


        /* -------------------------------------------------
           BELUM ADA KEY
        ------------------------------------------------- */

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

            status =
                "expired";
        }


        const remaining =
            key.expires_at
                ? Math.max(
                    0,
                    Number(
                        key.expires_at
                    ) - now
                )
                : null;


        return json({

            success: true,

            required: true,

            has_key: true,

            key: {

                id:
                    key.id,

                key:
                    key.key,

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
                    remaining

            }

        });


    } catch (error) {

        console.error(
            "FREE KEY GET ERROR:",
            error
        );


        return json({

            success: false,

            error:
                String(error)

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

                error:
                    "Unauthorized"

            }, 401);
        }


        /* -------------------------------------------------
           ADMIN
        ------------------------------------------------- */

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


        /* -------------------------------------------------
           PREMIUM
        ------------------------------------------------- */

        if (
            isPremium(user)
        ) {

            return json({

                success: false,

                error:
                    "Premium users do not need Free Key"

            }, 403);
        }


        const now =
            Date.now();


        /* -------------------------------------------------
           CARI KEY
        ------------------------------------------------- */

        let key =
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


        /* -------------------------------------------------
           BUAT KEY JIKA BELUM ADA
        ------------------------------------------------- */

        if (!key) {

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
        }


        /* -------------------------------------------------
           CEK MAKSIMUM 72 JAM
        ------------------------------------------------- */

        const currentExpiry =
            key.expires_at &&
            Number(key.expires_at) > now

                ? Number(key.expires_at)

                : now;


        const maxExpiry =
            now + MAX_MS;


        /*
         * Jika expiry sudah >= 72 jam
         * dari sekarang, tidak perlu
         * membuat Linkvertise lagi.
         */

        if (
            currentExpiry >=
            maxExpiry
        ) {

            return json({

                success: true,

                capped: true,

                requires_linkvertise:
                    false,

                message:
                    "Free Key sudah mencapai maksimum 72 jam.",

                key: {

                    id:
                        key.id,

                    key:
                        key.key,

                    status:
                        "active",

                    expires_at:
                        key.expires_at

                }

            });
        }


        /* -------------------------------------------------
           CEK CLAIM PENDING
        ------------------------------------------------- */

        const existingClaim =
            await env.DB
                .prepare(`
                    SELECT
                        id,
                        claim_token,
                        created_at,
                        expires_at

                    FROM free_key_claims

                    WHERE
                        user_id = ?1

                        AND key_id = ?2

                        AND status = 'pending'

                        AND expires_at > ?3

                    ORDER BY created_at DESC

                    LIMIT 1
                `)
                .bind(
                    user.id,
                    key.id,
                    now
                )
                .first();


        /*
         * Kalau user masih mempunyai
         * claim yang aktif, gunakan
         * claim tersebut.
         *
         * Jangan membuat claim baru
         * setiap kali tombol ditekan.
         */

        if (
            existingClaim
        ) {

            return json({

                success: true,

                requires_linkvertise:
                    true,

                claim_pending:
                    true,

                link:
                    buildLinkvertiseUrl(
                        env.LINKVERTISE_URL
                    ),

                claim_expires_at:
                    existingClaim.expires_at,

                reward_hours:
                    6,

                max_hours:
                    72

            });
        }


        /* -------------------------------------------------
           CLAIM TOKEN
        ------------------------------------------------- */

        const claimToken =
            generateToken();


        const claimExpires =
            now + CLAIM_MS;


        /* -------------------------------------------------
           BUAT CLAIM
        ------------------------------------------------- */

        await env.DB
            .prepare(`
                INSERT INTO free_key_claims
                (
                    user_id,
                    key_id,
                    claim_token,
                    status,
                    created_at,
                    expires_at
                )

                VALUES
                (
                    ?1,
                    ?2,
                    ?3,
                    'pending',
                    ?4,
                    ?5
                )
            `)
            .bind(
                user.id,
                key.id,
                claimToken,
                now,
                claimExpires
            )
            .run();


        /* -------------------------------------------------
           LINKVERTISE
        ------------------------------------------------- */

        const link =
            buildLinkvertiseUrl(
                env.LINKVERTISE_URL
            );


        if (!link) {

            /*
             * Jika URL belum diset,
             * hapus claim supaya tidak
             * meninggalkan claim pending.
             */

            await env.DB
                .prepare(`
                    DELETE FROM free_key_claims

                    WHERE
                        user_id = ?1

                        AND key_id = ?2

                        AND claim_token = ?3
                `)
                .bind(
                    user.id,
                    key.id,
                    claimToken
                )
                .run();


            return json({

                success: false,

                error:
                    "LINKVERTISE_URL is not configured"

            }, 500);
        }


        return json({

            success: true,

            requires_linkvertise:
                true,

            claim_pending:
                true,

            link,

            reward_hours:
                6,

            max_hours:
                72,

            claim_expires_at:
                claimExpires

        });


    } catch (error) {

        console.error(
            "FREE KEY POST ERROR:",
            error
        );


        return json({

            success: false,

            error:
                String(error)

        }, 500);
    }
}


/* =========================================================
   PREMIUM CHECK
========================================================= */

function isPremium(user) {

    return (

        String(user.plan)
            .toLowerCase() ===
        "premium"

        &&

        (
            user.premium_expires_at === null

            ||

            Number(
                user.premium_expires_at
            ) > Date.now()
        )
    );
}


/* =========================================================
   BUILD LINKVERTISE URL
========================================================= */

function buildLinkvertiseUrl(
    value
) {

    if (!value) {
        return null;
    }


    return String(
        value
    ).trim();
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


    let token =
        null;


    for (
        const item
        of cookie.split(";")
    ) {

        const index =
            item.indexOf("=");


        if (
            index === -1
        ) {
            continue;
        }


        const name =
            item
                .slice(
                    0,
                    index
                )
                .trim();


        if (
            name ===
            "bilsx_session"
        ) {

            token =
                item
                    .slice(
                        index + 1
                    )
                    .trim();

            break;
        }
    }


    if (!token) {
        return null;
    }


    try {

        token =
            decodeURIComponent(
                token
            );

    } catch {}


    const tokenHash =
        await sha256(
            token
        );


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

async function sha256(
    value
) {

    const digest =
        await crypto.subtle.digest(
            "SHA-256",
            new TextEncoder().encode(
                value
            )
        );


    return [
        ...new Uint8Array(
            digest
        )
    ]
        .map(
            x =>
                x
                    .toString(16)
                    .padStart(
                        2,
                        "0"
                    )
        )
        .join("");
}


/* =========================================================
   RANDOM TOKEN
========================================================= */

function generateToken() {

    const bytes =
        new Uint8Array(32);


    crypto.getRandomValues(
        bytes
    );


    return [
        ...bytes
    ]
        .map(
            byte =>
                byte
                    .toString(16)
                    .padStart(
                        2,
                        "0"
                    )
        )
        .join("");
}


/* =========================================================
   LICENSE KEY
========================================================= */

function generateKey() {

    const chars =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";


    function part(
        length
    ) {

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

        JSON.stringify(
            data
        ),

        {

            status,

            headers: {

                "Content-Type":
                    "application/json",

                "Cache-Control":
                    "no-store"

            }

        }
    );
    }
