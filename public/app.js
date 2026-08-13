/* =========================================================
   BILSX APP
   ========================================================= */

const $ = (selector) =>
    document.querySelector(selector);

/* =========================================================
   LOGIN FORM
   ========================================================= */

function setupLogin() {

    const form =
        document.querySelector(
            "form[data-demo-login]"
        );

    if (!form) {
        return;
    }


    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const inputs =
                form.querySelectorAll(
                    "input"
                );


            const login =
                inputs[0]?.value.trim();


            const password =
                inputs[1]?.value || "";


            const message =
                document.querySelector(
                    "#demo-message"
                );


            const button =
                form.querySelector(
                    'button[type="submit"]'
                );


            if (!login || !password) {
                return;
            }


            if (button) {
                button.disabled = true;
                button.textContent =
                    "Logging in...";
            }


            if (message) {
                message.style.display =
                    "none";
                message.textContent =
                    "";
            }


            try {

                const data =
                    await api(
                        "/api/login",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    login,
                                    password
                                })
                        }
                    );


                if (
                    !data.success
                ) {
                    throw new Error(
                        data.error ||
                        "Login failed"
                    );
                }


                /*
                 * Login berhasil.
                 *
                 * login.js sudah membuat
                 * cookie bilsx_session.
                 */

                window.location.href =
                    "/dashboard.html";


            } catch (error) {

                console.error(
                    "Login error:",
                    error
                );


                if (message) {

                    message.style.display =
                        "block";

                    message.textContent =
                        error.message ||
                        "Invalid credentials";
                }


                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Login";
                }
            }

        }
    );
}
/* =========================================================
   API
   ========================================================= */

async function api(url, options = {}) {

    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            ...(options.body
                ? {
                    "Content-Type":
                        "application/json"
                }
                : {}),
            ...(options.headers || {})
        }
    });


    let data;

    try {

        data =
            await response.json();

    } catch {

        throw new Error(
            `Invalid server response (${response.status})`
        );
    }


    if (!response.ok) {

        throw new Error(
            data.error ||
            `Request failed (${response.status})`
        );
    }


    if (data.success === false) {

        throw new Error(
            data.error ||
            "Request failed"
        );
    }


    return data;
}


/* =========================================================
   CURRENT USER
   ========================================================= */

async function getCurrentUser() {

    return await api(
        "/api/me"
    );
}


/* =========================================================
   AUTH
   ========================================================= */

async function requireAuth() {

    try {

        const data =
            await getCurrentUser();


        if (
            !data.success ||
            !data.user
        ) {

            window.location.href =
                "/login.html";

            return null;
        }


        return data.user;

    } catch (error) {

        console.error(
            "Authentication error:",
            error
        );

        window.location.href =
            "/login.html";

        return null;
    }
}


/* =========================================================
   LOGOUT
   ========================================================= */

async function logout() {

    try {

        await api(
            "/api/logout",
            {
                method: "POST"
            }
        );

    } catch (error) {

        console.error(
            "Logout error:",
            error
        );

    } finally {

        window.location.href =
            "/login.html";
    }
}


/* =========================================================
   LOGOUT BUTTON
   ========================================================= */

function setupLogout() {

    document
        .querySelectorAll(
            "[data-logout]"
        )
        .forEach(button => {

            button.addEventListener(
                "click",
                async event => {

                    event.preventDefault();

                    await logout();
                }
            );

        });
}


/* =========================================================
   DATE
   ========================================================= */

function formatDate(value) {

    if (
        value === null ||
        value === undefined ||
        value === ""
    ) {

        return "—";
    }


    const timestamp =
        Number(value);


    if (
        !Number.isFinite(timestamp)
    ) {

        return "—";
    }


    return new Date(timestamp)
        .toLocaleString();
}


/* =========================================================
   DASHBOARD
   ========================================================= */

async function loadDashboard() {

    const user =
        await requireAuth();


    if (!user) {
        return;
    }


    window.BILSX_USER =
        user;


    /*
     * Username
     */

    const name =
        $("#name");

    if (name) {

        name.textContent =
            user.username ||
            "User";
    }


    const username =
        $("#username");

    if (username) {

        username.textContent =
            user.username ||
            "—";
    }


    /*
     * Status
     */

    const status =
        $("#status");

    if (status) {

        status.textContent =
            user.status ||
            "—";
    }


    /*
     * Role
     */

    const role =
        $("#role");

    if (role) {

        role.textContent =
            String(
                user.role ||
                "user"
            ).toUpperCase();
    }


    /*
     * Plan
     */

    const plan =
        $("#plan");


    const isAdmin =
        String(
            user.role ||
            ""
        ).toLowerCase() ===
        "admin";


    if (plan) {

        if (isAdmin) {

            plan.textContent =
                "ADMIN";

        } else if (
            user.premium
        ) {

            plan.textContent =
                "PREMIUM";

        } else {

            plan.textContent =
                "FREE";
        }
    }


    /*
     * Premium info
     */

    const premiumInfo =
        $("#premiumInfo");


    if (premiumInfo) {

        if (isAdmin) {

            premiumInfo.textContent =
                "Administrator — Full access";

        } else if (
            user.premium
        ) {

            if (
                user.premium_expires_at
            ) {

                premiumInfo.textContent =
                    "Premium expires: " +
                    formatDate(
                        user.premium_expires_at
                    );

            } else {

                premiumInfo.textContent =
                    "Premium active";
            }

        } else {

            premiumInfo.textContent =
                "Free account";
        }
    }


    /*
     * Feature status
     */

    const growscan =
        $("#growscanAccess");

    const fastFriend =
        $("#fastFriendAccess");


    if (
        isAdmin ||
        user.premium
    ) {

        if (growscan) {
            growscan.textContent =
                "ACTIVE";
        }

        if (fastFriend) {
            fastFriend.textContent =
                "ACTIVE";
        }

    } else {

        if (growscan) {
            growscan.textContent =
                "PREMIUM";
        }

        if (fastFriend) {
            fastFriend.textContent =
                "PREMIUM";
        }
    }
}


/* =========================================================
   INIT
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupLogout();


        const page =
            document.body.dataset.page;


        if (
            page === "dashboard"
        ) {

            await loadDashboard();
        }
    }
);
