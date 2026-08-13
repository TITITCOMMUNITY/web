/* =========================================================
   BILSX APP
========================================================= */

const $ = selector =>
    document.querySelector(selector);


/* =========================================================
   API
========================================================= */

async function api(
    url,
    options = {}
) {

    const response =
        await fetch(
            url,
            {
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
            }
        );


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


    if (
        data.success === false
    ) {

        throw new Error(
            data.error ||
            "Request failed"
        );
    }


    return data;
}


/* =========================================================
   LOGIN
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
                inputs[0]
                    ?.value
                    .trim() || "";


            const password =
                inputs[1]
                    ?.value || "";


            const message =
                $("#demo-message");


            const button =
                form.querySelector(
                    'button[type="submit"]'
                );


            if (
                !login ||
                !password
            ) {

                if (message) {

                    message.style.display =
                        "block";

                    message.textContent =
                        "Username/email dan password wajib diisi";
                }

                return;
            }


            if (button) {

                button.disabled =
                    true;

                button.textContent =
                    "Logging in...";
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


                console.log(
                    "Login success:",
                    data
                );


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
                        error.message;
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
   REGISTER
========================================================= */

function setupRegister() {

    const form =
        document.querySelector(
            "form[data-register]"
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


            const username =
                inputs[0]
                    ?.value
                    .trim() || "";


            const email =
                inputs[1]
                    ?.value
                    .trim() || "";


            const password =
                inputs[2]
                    ?.value || "";


            const message =
                $("#register-message");


            const button =
                form.querySelector(
                    'button[type="submit"]'
                );


            try {

                if (button) {

                    button.disabled =
                        true;

                    button.textContent =
                        "Creating...";
                }


                const data =
                    await api(
                        "/api/register",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    username,
                                    email,
                                    password
                                })
                        }
                    );


                if (message) {

                    message.style.display =
                        "block";

                    message.textContent =
                        "Account created successfully.";
                }


                setTimeout(() => {

                    window.location.href =
                        "/login.html";

                }, 800);


            } catch (error) {

                if (message) {

                    message.style.display =
                        "block";

                    message.textContent =
                        error.message;
                }


                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        "Create Account";
                }
            }
        }
    );
}


/* =========================================================
   ME
========================================================= */

async function getCurrentUser() {

    return await api(
        "/api/me"
    );
}


/* =========================================================
   DASHBOARD AUTH
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

    } catch {

        window.location.href =
            "/login.html";

        return null;
    }
}


/* =========================================================
   LOGOUT
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


                    try {

                        await api(
                            "/api/logout",
                            {
                                method: "POST"
                            }
                        );

                    } catch {}


                    window.location.href =
                        "/login.html";
                }
            );
        });
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


    const name =
        $("#name");

    if (name) {
        name.textContent =
            user.username;
    }


    const username =
        $("#username");

    if (username) {
        username.textContent =
            user.username;
    }


    const status =
        $("#status");

    if (status) {
        status.textContent =
            user.status;
    }


    const role =
        $("#role");

    if (role) {
        role.textContent =
            String(
                user.role || "user"
            ).toUpperCase();
    }


    const plan =
        $("#plan");


    const isAdmin =
        String(
            user.role || ""
        ).toLowerCase() ===
        "admin";


    if (plan) {

        plan.textContent =
            isAdmin
                ? "ADMIN"
                : user.premium
                    ? "PREMIUM"
                    : "FREE";
    }


    const premiumInfo =
        $("#premiumInfo");


    if (premiumInfo) {

        if (isAdmin) {

            premiumInfo.textContent =
                "Administrator — Full access";

        } else if (
            user.premium
        ) {

            premiumInfo.textContent =
                user.premium_expires_at
                    ? "Premium expires: " +
                      new Date(
                          Number(
                              user.premium_expires_at
                          )
                      ).toLocaleString()
                    : "Premium active";

        } else {

            premiumInfo.textContent =
                "Free account";
        }
    }


    /*
     * Admin dan premium
     * tidak perlu Free Key.
     */

    const keyPanel =
        document.querySelector(
            ".key-panel"
        );


    if (
        isAdmin ||
        user.premium
    ) {

        if (keyPanel) {
            keyPanel.style.display =
                "none";
        }

        return;
    }


    /*
     * Free user.
     */

    await loadFreeKey();
}


/* =========================================================
   FREE KEY
========================================================= */

async function loadFreeKey() {

    try {

        const data =
            await api(
                "/api/free-key"
            );


        if (
            data.required === false
        ) {
            return;
        }


        if (
            !data.has_key
        ) {

            showNoKey();

            return;
        }


        showKey(
            data.key
        );

    } catch (error) {

        console.error(
            "Free Key:",
            error
        );
    }
}


/* =========================================================
   SHOW NO KEY
========================================================= */

function showNoKey() {

    const noKey =
        $("#noKey");

    const keyBox =
        $("#keyBox");


    if (noKey) {
        noKey.hidden = false;
    }


    if (keyBox) {
        keyBox.hidden = true;
    }
}


/* =========================================================
   SHOW KEY
========================================================= */

function showKey(key) {

    const noKey =
        $("#noKey");

    const keyBox =
        $("#keyBox");


    if (noKey) {
        noKey.hidden = true;
    }


    if (keyBox) {
        keyBox.hidden = false;
    }


    const keyElement =
        $("#licenseKey");


    if (keyElement) {
        keyElement.textContent =
            key.key || "—";
    }


    const status =
        $("#keyStatus");


    if (status) {

        if (
            key.expires_at &&
            Number(key.expires_at) <=
            Date.now()
        ) {

            status.textContent =
                "EXPIRED";

        } else {

            status.textContent =
                String(
                    key.status ||
                    "ACTIVE"
                ).toUpperCase();
        }
    }


    const expiry =
        $("#keyExpiry");


    if (expiry) {

        if (key.expires_at) {

            const time =
                Number(
                    key.expires_at
                );


            if (
                time <= Date.now()
            ) {

                expiry.textContent =
                    "Expired";

            } else {

                expiry.textContent =
                    "Expires: " +
                    new Date(
                        time
                    ).toLocaleString();
            }

        } else {

            expiry.textContent =
                "No expiration";
        }
    }


    window.BILSX_CURRENT_KEY =
        key;
}


/* =========================================================
   GET KEY
========================================================= */

function setupGetKey() {

    const getButton =
        $("#getKeyBtn");


    if (getButton) {

        getButton.addEventListener(
            "click",
            () => {

                const modal =
                    $("#keyModal");

                if (modal) {
                    modal.hidden = false;
                }
            }
        );
    }


    const addButton =
        $("#addKeyBtn");


    if (addButton) {

        addButton.addEventListener(
            "click",
            () => {

                const modal =
                    $("#keyModal");

                if (modal) {
                    modal.hidden = false;
                }
            }
        );
    }


    const closeButton =
        $("#closeKeyModal");


    if (closeButton) {

        closeButton.addEventListener(
            "click",
            () => {

                const modal =
                    $("#keyModal");

                if (modal) {
                    modal.hidden = true;
                }
            }
        );
    }


    const startButton =
        $("#startGetKeyBtn");


    if (startButton) {

        startButton.addEventListener(
            "click",
            async () => {

                const message =
                    $("#getKeyMessage");


                startButton.disabled =
                    true;


                try {

                    const data =
                        await api(
                            "/api/free-key",
                            {
                                method: "POST"
                            }
                        );


                    if (message) {

                        message.textContent =
                            "Key berhasil dibuat.";
                    }


                    if (data.key) {

                        showKey(
                            data.key
                        );
                    }


                    const modal =
                        $("#keyModal");


                    if (modal) {

                        setTimeout(() => {

                            modal.hidden =
                                true;

                        }, 700);
                    }


                } catch (error) {

                    if (message) {

                        message.textContent =
                            error.message;
                    }

                } finally {

                    startButton.disabled =
                        false;
                }
            }
        );
    }
}


/* =========================================================
   COPY KEY
========================================================= */

function setupCopyKey() {

    const button =
        $("#copyKeyBtn");


    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        async () => {

            const key =
                $("#licenseKey");


            if (!key) {
                return;
            }


            const value =
                key.textContent.trim();


            if (!value) {
                return;
            }


            try {

                await navigator.clipboard
                    .writeText(value);


                const old =
                    button.textContent;


                button.textContent =
                    "COPIED";


                setTimeout(() => {

                    button.textContent =
                        old;

                }, 1500);

            } catch {}
        }
    );
}


/* =========================================================
   PAGE INIT
========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupLogout();


        const page =
            document.body.dataset.page;


        if (
            page === "login"
        ) {

            setupLogin();
            return;
        }


        if (
            page === "register"
        ) {

            setupRegister();
            return;
        }


        if (
            page === "dashboard"
        ) {

            setupGetKey();
            setupCopyKey();

            await loadDashboard();

            return;
        }
    }
);
