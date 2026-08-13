/* =========================================================
   BILSX FREE KEY - LINKVERTISE COMPLETE
========================================================= */

const REWARD_MS =
    6 * 60 * 60 * 1000;

const MAX_MS =
    72 * 60 * 60 * 1000;


/* =========================================================
   GET
========================================================= */

export async function onRequestGet({
    request,
    env
}) {

    try {

        /* -------------------------------------------------
           USER
        ------------------------------------------------- */

        const user =
            await getUser(
                request,
                env
            );


        if (!user) {

            return html(
                "Unauthorized",
                "Session login tidak ditemukan. Silakan login kembali."
            );
        }


        /* -------------------------------------------------
           ADMIN
        ------------------------------------------------- */

        if (
            String(user.role)
                .toLowerCase() === "admin"
        ) {

            return html(
                "Admin",
                "Admin tidak membutuhkan Free Key."
            );
        }


        /* -------------------------------------------------
           PREMIUM
        ------------------------------------------------- */

        if (
            isPremium(user)
        ) {

            return html(
                "Premium",
                "Akun Premium tidak membutuhkan Free Key."
            );
        }


        /* -------------------------------------------------
           HASH LINKVERTISE
        ------------------------------------------------- */

        const url =
            new URL(
                request.url
            );


        const hash =
            url.searchParams.get(
                "hash"
            );


        if (!hash) {

            return html(
                "Invalid",
                "Hash Linkvertise tidak ditemukan."
            );
        }


        /* -------------------------------------------------
           VERIFY LINKVERTISE
        ------------------------------------------------- */

        const verified =
            await verifyLinkvertise(
                hash,
                env
            );


        if (!verified) {

            return html(
                "Verification Failed",
                "Linkvertise tidak dapat diverifikasi."
            );
        }


        /* -------------------------------------------------
           CURRENT TIME
        ------------------------------------------------- */

        const now =
            Date.now();


        /* -------------------------------------------------
           CARI CLAIM USER
        ------------------------------------------------- */

        const claim =
            await env.DB
                .prepare(`
                    SELECT
                        id,
                        user_id,
                        key_id,
                        claim_token,
                        status,
                        created_at,
                        completed_at,
                        expires_at

                    FROM free_key_claims

                    WHERE
                        user_id = ?1

                        AND status = 'pending'

                        AND expires_at > ?2

                    ORDER BY created_at DESC

                    LIMIT 1
                `)
                .bind(
                    user.id,
                    now
                )
                .first();


        if (!claim) {

            return html(
                "Claim Expired",
                "Claim Free Key sudah tidak aktif atau sudah digunakan. Silakan kembali ke dashboard dan tekan Get Key lagi."
            );
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
                        status,
                        activated_at,
                        expires_at

                    FROM license_keys

                    WHERE
                        id = ?1

                        AND user_id = ?2

                    LIMIT 1
                `)
                .bind(
                    claim.key_id,
                    user.id
                )
                .first();


        if (!key) {

            return html(
                "Key Error",
                "License key tidak ditemukan."
            );
        }


        /* -------------------------------------------------
           HITUNG EXPIRY
        ------------------------------------------------- */

        const currentExpiry =
            key.expires_at &&
            Number(key.expires_at) > now

                ? Number(
                    key.expires_at
                )

                : now;


        const maxExpiry =
            now + MAX_MS;


        /*
         * Sudah mencapai maksimum.
         */

        if (
            currentExpiry >=
            maxExpiry
        ) {

            /*
             * Tandai claim selesai
             * tanpa menambah waktu.
             */

            await env.DB
                .prepare(`
                    UPDATE free_key_claims

                    SET
                        status = 'completed',
                        completed_at = ?1

                    WHERE
                        id = ?2

                        AND status = 'pending'
                `)
                .bind(
                    now,
                    claim.id
                )
                .run();


            return html(
                "Maximum Reached",
                "Free Key kamu sudah mencapai maksimum 72 jam. Waktu tidak dapat ditambah lagi."
            );
        }


        /* -------------------------------------------------
           +6 JAM
        ------------------------------------------------- */

        let newExpiry =
            currentExpiry +
            REWARD_MS;


        /*
         * Jangan melewati 72 jam
         * dari waktu sekarang.
         */

        if (
            newExpiry >
            maxExpiry
        ) {

            newExpiry =
                maxExpiry;
        }


        /* -------------------------------------------------
           UPDATE CLAIM
        ------------------------------------------------- */

        const claimUpdate =
            await env.DB
                .prepare(`
                    UPDATE free_key_claims

                    SET
                        status = 'completed',
                        completed_at = ?1

                    WHERE
                        id = ?2

                        AND status = 'pending'

                        AND expires_at > ?1
                `)
                .bind(
                    now,
                    claim.id
                )
                .run();


        /*
         * Kalau tidak ada row yang
         * berubah, claim kemungkinan
         * sudah digunakan.
         */

        if (
            !claimUpdate.meta ||
            claimUpdate.meta.changes !== 1
        ) {

            return html(
                "Already Claimed",
                "Claim ini sudah digunakan atau sudah tidak berlaku."
            );
        }


        /* -------------------------------------------------
           UPDATE LICENSE KEY
        ------------------------------------------------- */

        await env.DB
            .prepare(`
                UPDATE license_keys

                SET
                    status = 'active',

                    activated_at =
                        COALESCE(
                            activated_at,
                            ?1
                        ),

                    expires_at = ?2

                WHERE
                    id = ?3

                    AND user_id = ?4
            `)
            .bind(
                now,
                newExpiry,
                key.id,
                user.id
            )
            .run();


        /* -------------------------------------------------
           SUCCESS
        ------------------------------------------------- */

        const remainingHours =
            Math.ceil(
                (
                    newExpiry -
                    now
                ) /
                (60 * 60 * 1000)
            );


        return html(
            "Success",
            `Berhasil! Free Key mendapatkan tambahan 6 jam. Sisa waktu maksimum saat ini ${remainingHours} jam.`
        );


    } catch (error) {

        console.error(
            "FREE KEY COMPLETE ERROR:",
            error
        );


        return html(
            "Server Error",
            "Terjadi kesalahan pada server. Silakan coba lagi."
        );
    }
}


/* =========================================================
   LINKVERTISE VERIFICATION
========================================================= */

async function verifyLinkvertise(hash, env) {

    if (!env.LINKVERTISE_TOKEN) {

        console.error(
            "LINKVERTISE_TOKEN belum dikonfigurasi."
        );

        return false;
    }

    const endpoint = new URL(
        "https://publisher.linkvertise.com/api/v1/anti_bypassing"
    );

    endpoint.searchParams.set(
        "token",
        env.LINKVERTISE_TOKEN
    );

    endpoint.searchParams.set(
        "hash",
        hash
    );

    const response = await fetch(
        endpoint.toString(),
        {
            method: "POST"
        }
    );

    const text =
        (await response.text()).trim();

    console.log(
        "Linkvertise verification HTTP:",
        response.status
    );

    console.log(
        "Linkvertise verification response:",
        text
    );

    if (!response.ok) {
        return false;
    }

    /*
     * Linkvertise mengembalikan
     * literal TRUE / FALSE,
     * bukan JSON.
     */

    return text === "TRUE";
} 

/* =========================================================
   PREMIUM
========================================================= */

function isPremium(
    user
) {

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
   HTML
========================================================= */

function html(
    title,
    message
) {

    return new Response(

        `<!doctype html>

<html lang="en">

<head>

<meta charset="utf-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>
${escapeHtml(title)}
</title>

<style>

* {
    box-sizing: border-box;
}

body {

    margin: 0;

    min-height: 100vh;

    display: flex;

    align-items: center;

    justify-content: center;

    background:
        #07070a;

    color:
        #ffffff;

    font-family:
        Arial,
        sans-serif;

}

.card {

    width:
        min(90%, 440px);

    padding:
        32px;

    border-radius:
        18px;

    background:
        #121216;

    border:
        1px solid
        rgba(255,255,255,.08);

    text-align:
        center;

    box-shadow:
        0 20px 70px
        rgba(0,0,0,.5);

}

h1 {

    margin:
        0 0 14px;

}

p {

    margin:
        0;

    line-height:
        1.6;

    color:
        #aaaaaf;

}

a {

    display:
        inline-block;

    margin-top:
        22px;

    padding:
        12px 22px;

    border-radius:
        10px;

    background:
        #ffffff;

    color:
        #000000;

    text-decoration:
        none;

    font-weight:
        600;

}

</style>

</head>

<body>

<div class="card">

<h1>
${escapeHtml(title)}
</h1>

<p>
${escapeHtml(message)}
</p>

<a href="/dashboard.html">
Back to Dashboard
</a>

</div>

</body>

</html>`,

        {

            status:
                200,

            headers: {

                "Content-Type":
                    "text/html; charset=UTF-8",

                "Cache-Control":
                    "no-store"

            }

        }
    );
}


/* =========================================================
   ESCAPE HTML
========================================================= */

function escapeHtml(
    value
) {

    return String(
        value ?? ""
    )
        .replace(
            /[&<>"']/g,
            character => {

                const entities = {

                    "&":
                        "&amp;",

                    "<":
                        "&lt;",

                    ">":
                        "&gt;",

                    '"':
                        "&quot;",

                    "'":
                        "&#039;"
                };

                return entities[
                    character
                ];
            }
        );
          }
