/* =========================================================
   BILSX - PUBLIC APP.JS
   ========================================================= */

/* ---------------------------------------------------------
   BASIC HELPERS
   --------------------------------------------------------- */

const $ = (selector, root = document) => {
    return root.querySelector(selector);
};

const $$ = (selector, root = document) => {
    return [...root.querySelectorAll(selector)];
};


/* ---------------------------------------------------------
   API HELPER
   --------------------------------------------------------- */

async function api(url, options = {}) {

    const response = await fetch(url, {
        credentials: "include",
        cache: "no-store",

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

    let data = {};

    try {
        data = await response.json();
    } catch {
        throw new Error(
            `Server returned HTTP ${response.status}`
        );
    }

    if (
        !response.ok ||
        data.success === false
    ) {
        throw new Error(
            data.error ||
            data.message ||
            `HTTP ${response.status}`
        );
    }

    return data;
}


/* ---------------------------------------------------------
   MESSAGE
   --------------------------------------------------------- */

function showMessage(
    selector,
    text,
    type = "error"
) {

    const element = $(selector);

    if (!element) return;

    element.textContent = text;
    element.style.display = "block";

    element.classList.remove(
        "success",
        "error"
    );

    element.classList.add(type);
}


function hideMessage(selector) {

    const element = $(selector);

    if (!element) return;

    element.style.display = "none";
    element.textContent = "";
}


/* ---------------------------------------------------------
   SESSION
   --------------------------------------------------------- */

async function getCurrentUser() {

    try {

        const data =
            await api(
                "/api/me"
            );

        if (
            data &&
            data.success &&
            data.user
        ) {
            return data.user;
        }

        return null;

    } catch (error) {

        console.log(
            "No active session:",
            error.message
        );

        return null;
    }
}


/* ---------------------------------------------------------
   REDIRECT BASED ON ROLE
   --------------------------------------------------------- */

function redirectUser(user) {

    if (!user) {

        window.location.replace(
            "/login.html"
        );

        return;
    }

    const role =
        String(
            user.role || ""
        ).toLowerCase();

    if (role === "admin") {

        window.location.replace(
            "/admin.html"
        );

    } else {

        window.location.replace(
            "/dashboard.html"
        );
    }
}


/* ---------------------------------------------------------
   CHECK SESSION ON LOGIN PAGE
   --------------------------------------------------------- */

async function checkLoginSession() {

    const user =
        await getCurrentUser();

    if (!user) {
        return false;
    }

    redirectUser(user);

    return true;
}


/* ---------------------------------------------------------
   LOGIN
   --------------------------------------------------------- */

function setupLogin() {

    const form =
        $("#loginForm");

    if (!form) {

        console.error(
            "BILSX: #loginForm tidak ditemukan"
        );

        return;
    }


    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const loginInput =
                form.querySelector(
                    '[name="login"]'
                );

            const passwordInput =
                form.querySelector(
                    '[name="password"]'
                );

            const button =
                form.querySelector(
                    'button[type="submit"]'
                );


            const login =
                loginInput
                    ?.value
                    ?.trim() || "";

            const password =
                passwordInput
                    ?.value || "";


            hideMessage(
                "#loginMessage"
            );


            if (
                !login ||
                !password
            ) {

                showMessage(
                    "#loginMessage",
                    "Username/email dan password wajib diisi."
                );

                return;
            }


            if (button) {

                button.disabled =
                    true;

                button.dataset.oldText =
                    button.textContent;

                button.textContent =
                    "Logging in...";
            }


            try {

                console.log(
                    "BILSX: sending login request..."
                );


                const data =
                    await api(
                        "/api/login",
                        {
                            method: "POST",

                            body:
                                JSON.stringify({
                                    login:
                                        login,

                                    password:
                                        password
                                })
                        }
                    );


                console.log(
                    "BILSX: login success",
                    data
                );


                /*
                 * Login berhasil.
                 *
                 * Jangan menyimpan token
                 * session di localStorage.
                 *
                 * Cookie bilsx_session
                 * dikelola oleh server.
                 */


                const user =
                    data.user;


                if (!user) {

                    throw new Error(
                        "Login berhasil tetapi data user tidak ditemukan."
                    );
                }


                redirectUser(
                    user
                );


            } catch (error) {

                console.error(
                    "BILSX LOGIN ERROR:",
                    error
                );


                showMessage(
                    "#loginMessage",
                    error.message ||
                    "Login gagal."
                );


                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        button.dataset.oldText ||
                        "Login";
                }
            }

        }
    );
}


/* ---------------------------------------------------------
   REGISTER
   --------------------------------------------------------- */

function setupRegister() {

    const form =
        $("#registerForm");

    if (!form) {
        return;
    }


    form.addEventListener(
        "submit",
        async event => {

            event.preventDefault();


            const usernameInput =
                form.querySelector(
                    '[name="username"]'
                );

            const emailInput =
                form.querySelector(
                    '[name="email"]'
                );

            const passwordInput =
                form.querySelector(
                    '[name="password"]'
                );

            const confirmInput =
                form.querySelector(
                    '[name="confirm_password"]'
                );


            const button =
                form.querySelector(
                    'button[type="submit"]'
                );


            const username =
                usernameInput
                    ?.value
                    ?.trim() || "";

            const email =
                emailInput
                    ?.value
                    ?.trim() || "";

            const password =
                passwordInput
                    ?.value || "";

            const confirmPassword =
                confirmInput
                    ?.value || "";


            hideMessage(
                "#registerMessage"
            );


            if (
                !username ||
                !email ||
                !password
            ) {

                showMessage(
                    "#registerMessage",
                    "Semua field wajib diisi."
                );

                return;
            }


            if (
                confirmInput &&
                password !==
                confirmPassword
            ) {

                showMessage(
                    "#registerMessage",
                    "Konfirmasi password tidak sama."
                );

                return;
            }


            if (button) {

                button.disabled =
                    true;

                button.dataset.oldText =
                    button.textContent;

                button.textContent =
                    "Creating...";
            }


            try {

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


                console.log(
                    "BILSX REGISTER SUCCESS:",
                    data
                );


                showMessage(
                    "#registerMessage",
                    data.message ||
                    "Account berhasil dibuat.",
                    "success"
                );


                form.reset();


                /*
                 * Register tidak otomatis
                 * membuat session.
                 *
                 * User diarahkan ke login.
                 */

                setTimeout(
                    () => {

                        window.location.replace(
                            "/login.html"
                        );

                    },
                    800
                );


            } catch (error) {

                console.error(
                    "BILSX REGISTER ERROR:",
                    error
                );


                showMessage(
                    "#registerMessage",
                    error.message ||
                    "Register gagal."
                );


                if (button) {

                    button.disabled =
                        false;

                    button.textContent =
                        button.dataset.oldText ||
                        "Create Account";
                }
            }

        }
    );
}


/* ---------------------------------------------------------
   REQUIRE LOGIN
   --------------------------------------------------------- */

async function requireLogin() {

    const user =
        await getCurrentUser();

    if (!user) {

        window.location.replace(
            "/login.html"
        );

        return null;
    }

    return user;
}


/* ---------------------------------------------------------
   DASHBOARD USER
   --------------------------------------------------------- */

async function loadDashboard() {

    const user =
        await requireLogin();

    if (!user) {
        return;
    }


    /*
     * Admin tidak boleh berada
     * di dashboard user.
     */

    if (
        String(
            user.role || ""
        ).toLowerCase() ===
        "admin"
    ) {

        window.location.replace(
            "/admin.html"
        );

        return;
    }


    /*
     * Username
     */

    $$("[data-user]")
        .forEach(element => {

            const field =
                element.dataset.user;

            if (
                Object.prototype
                    .hasOwnProperty
                    .call(user, field)
            ) {

                element.textContent =
                    user[field] ??
                    "—";
            }

        });


    /*
     * Username fallback
     */

    const name =
        $("#name");

    if (name) {

        name.textContent =
            user.username ||
            "User";
    }


    /*
     * Role
     */

    const role =
        $("[data-user-role]");

    if (role) {

        role.textContent =
            user.role ||
            "user";
    }


    /*
     * Status
     */

    const status =
        $("[data-user-status]");

    if (status) {

        status.textContent =
            user.status ||
            "active";
    }


    /*
     * Plan
     */

    const plan =
        $("#plan");

    if (plan) {

        if (user.premium) {

            plan.textContent =
                "Premium";

        } else {

            plan.textContent =
                user.plan ||
                "Free";
        }
    }


    /*
     * Load keys
     */

    await loadKeys();
}


/* ---------------------------------------------------------
   LOAD USER KEYS
   --------------------------------------------------------- */

async function loadKeys() {

    try {

        const data =
            await api(
                "/api/keys"
            );


        const keys =
            data.keys ||
            [];


        /*
         * Summary
         */

        const total =
            $("#total");

        const active =
            $("#active");

        const expired =
            $("#expired");


        if (total) {

            total.textContent =
                data.summary?.total ??
                keys.length;
        }


        if (active) {

            active.textContent =
                data.summary?.active ??
                keys.filter(
                    key =>
                        key.status ===
                        "active"
                ).length;
        }


        if (expired) {

            expired.textContent =
                data.summary?.expired ??
                keys.filter(
                    key =>
                        key.status ===
                        "expired"
                ).length;
        }


        /*
         * Render key table
         */

        renderKeys(
            keys
        );


    } catch (error) {

        console.error(
            "LOAD KEYS ERROR:",
            error
        );


        const table =
            $("#keys");

        if (table) {

            table.innerHTML = `
                <tr>
                    <td colspan="4">
                        ${escapeHtml(
                            error.message
                        )}
                    </td>
                </tr>
            `;
        }
    }
}


/* ---------------------------------------------------------
   RENDER KEYS
   --------------------------------------------------------- */

function renderKeys(
    keys
) {

    const table =
        $("#keys");

    if (!table) {
        return;
    }


    if (!keys.length) {

        table.innerHTML = `
            <tr>
                <td colspan="4">
                    No keys yet.
                </td>
            </tr>
        `;

        return;
    }


    table.innerHTML =
        keys
            .map(
                key => {

                    let expiry =
                        "Lifetime";


                    if (
                        key.expires_at
                    ) {

                        const timestamp =
                            Number(
                                key.expires_at
                            );


                        if (
                            Number.isFinite(
                                timestamp
                            )
                        ) {

                            expiry =
                                new Date(
                                    timestamp
                                )
                                .toLocaleString();
                        }
                    }


                    return `
                        <tr>

                            <td>
                                ${escapeHtml(
                                    key.key
                                )}
                            </td>

                            <td>
                                ${escapeHtml(
                                    key.status
                                )}
                            </td>

                            <td>
                                ${expiry}
                            </td>

                            <td>

                                <button
                                    type="button"
                                    class="copy-key"
                                    data-key="${escapeHtml(
                                        key.key
                                    )}"
                                >
                                    Copy
                                </button>

                            </td>

                        </tr>
                    `;
                }
            )
            .join("");
}


/* ---------------------------------------------------------
   GET FREE KEY
   --------------------------------------------------------- */

function setupGetKey() {

    const button =
        $("#startGetKeyBtn");

    if (!button) {
        return;
    }


    button.addEventListener(
        "click",
        async () => {

            if (
                button.disabled
            ) {
                return;
            }


            button.disabled =
                true;

            button.dataset.oldText =
                button.textContent;

            button.textContent =
                "Loading...";


            hideMessage(
                "#getKeyMessage"
            );


            try {

                /*
                 * Endpoint ini harus
                 * mengikuti free-key.js
                 * yang ada di backend.
                 */

                const data =
                    await api(
                        "/api/free-key",
                        {
                            method: "POST"
                        }
                    );


                console.log(
                    "FREE KEY RESPONSE:",
                    data
                );


                if (
                    data.key
                ) {

                    displayGeneratedKey(
                        data.key
                    );

                } else {

                    showMessage(
                        "#getKeyMessage",
                        data.message ||
                        "Key berhasil diproses.",
                        "success"
                    );
                }


                /*
                 * Refresh dashboard
                 */

                await loadKeys();


            } catch (error) {

                console.error(
                    "GET KEY ERROR:",
                    error
                );


                showMessage(
                    "#getKeyMessage",
                    error.message ||
                    "Gagal mendapatkan key."
                );


            } finally {

                button.disabled =
                    false;

                button.textContent =
                    button.dataset.oldText ||
                    "Get Key";
            }

        }
    );
}


/* ---------------------------------------------------------
   DISPLAY GENERATED KEY
   --------------------------------------------------------- */

function displayGeneratedKey(
    key
) {

    const value =
        typeof key === "string"
            ? key
            : key.key;


    if (!value) {
        return;
    }


    const keyElement =
        $("#licenseKey");


    if (keyElement) {

        keyElement.textContent =
            value;
    }


    const statusElement =
        $("#keyStatus");


    if (
        statusElement &&
        typeof key !== "string"
    ) {

        statusElement.textContent =
            key.status ||
            "active";
    }


    const expiryElement =
        $("#keyExpiry");


    if (
        expiryElement &&
        typeof key !== "string"
    ) {

        if (
            key.expires_at
        ) {

            expiryElement.textContent =
                new Date(
                    Number(
                        key.expires_at
                    )
                )
                .toLocaleString();

        } else {

            expiryElement.textContent =
                "Lifetime";
        }
    }


    const keyBox =
        $("#keyBox");


    if (keyBox) {

        keyBox.hidden =
            false;
    }


    const noKey =
        $("#noKey");


    if (noKey) {

        noKey.hidden =
            true;
    }
}


/* ---------------------------------------------------------
   COPY KEY
   --------------------------------------------------------- */

function setupCopyKey() {

    document.addEventListener(
        "click",
        async event => {

            const button =
                event.target.closest(
                    ".copy-key"
                );

            if (!button) {
                return;
            }


            const key =
                button.dataset.key;


            if (!key) {
                return;
            }


            try {

                await navigator
                    .clipboard
                    .writeText(
                        key
                    );


                const oldText =
                    button.textContent;


                button.textContent =
                    "Copied!";


                setTimeout(
                    () => {

                        button.textContent =
                            oldText;

                    },
                    1200
                );


            } catch (error) {

                console.error(
                    "COPY KEY ERROR:",
                    error
                );


                /*
                 * Fallback untuk browser
                 * yang tidak mengizinkan
                 * navigator.clipboard.
                 */

                try {

                    const textarea =
                        document.createElement(
                            "textarea"
                        );

                    textarea.value =
                        key;

                    textarea.style.position =
                        "fixed";

                    textarea.style.opacity =
                        "0";

                    document.body.appendChild(
                        textarea
                    );

                    textarea.select();

                    document.execCommand(
                        "copy"
                    );

                    textarea.remove();

                    button.textContent =
                        "Copied!";

                    setTimeout(
                        () => {

                            button.textContent =
                                "Copy";

                        },
                        1200
                    );

                } catch {
                    alert(
                        "Tidak dapat menyalin key."
                    );
                }
            }

        }
    );
}


/* ---------------------------------------------------------
   LOGOUT
   --------------------------------------------------------- */

function setupLogout() {

    const buttons =
        $$(
            "[data-logout], #logoutBtn"
        );


    if (!buttons.length) {
        return;
    }


    buttons.forEach(
        button => {

            button.addEventListener(
                "click",
                async event => {

                    event.preventDefault();
                    event.stopPropagation();


                    if (
                        button.dataset
                            .loggingOut ===
                        "1"
                    ) {
                        return;
                    }


                    button.dataset
                        .loggingOut =
                        "1";


                    button.disabled =
                        true;


                    const oldText =
                        button.textContent;


                    button.textContent =
                        "Logging out...";


                    try {

                        await api(
                            "/api/logout",
                            {
                                method: "POST"
                            }
                        );


                    } catch (error) {

                        console.error(
                            "LOGOUT ERROR:",
                            error
                        );


                    } finally {

                        /*
                         * Redirect walaupun
                         * server mengembalikan
                         * error.
                         */

                        window.location.replace(
                            "/login.html?logged_out=1"
                        );
                    }

                }
            );

        }
    );
}


/* ---------------------------------------------------------
   HTML ESCAPE
   --------------------------------------------------------- */

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
                "&": "&amp;",
                "<": "&lt;",
                ">": "&gt;",
                '"': "&quot;",
                "'": "&#039;"
            };

            return entities[
                character
            ];
        }
    );
}


/* ---------------------------------------------------------
   INITIALIZATION
   --------------------------------------------------------- */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        const page =
            document.body.dataset.page;


        console.log(
            "BILSX page:",
            page
        );


        /*
         * Logout tersedia di semua
         * halaman yang memuat app.js.
         */

        setupLogout();


        /* =================================================
           LOGIN PAGE
           ================================================= */

        if (
            page === "login"
        ) {

            /*
             * Kalau session masih valid,
             * jangan tampilkan login.
             */

            const alreadyLoggedIn =
                await checkLoginSession();


            if (
                alreadyLoggedIn
            ) {
                return;
            }


            /*
             * Tidak ada session.
             * Tampilkan / aktifkan login.
             */

            setupLogin();

            return;
        }


        /* =================================================
           REGISTER PAGE
           ================================================= */

        if (
            page === "register"
        ) {

            /*
             * Kalau sudah login,
             * tidak perlu register lagi.
             */

            const user =
                await getCurrentUser();


            if (user) {

                redirectUser(
                    user
                );

                return;
            }


            setupRegister();

            return;
        }


        /* =================================================
           USER DASHBOARD
           ================================================= */

        if (
            page === "dashboard"
        ) {

            await loadDashboard();

            setupGetKey();

            setupCopyKey();

            return;
        }


        /*
         * ADMIN PAGE TIDAK DIHANDLE DI SINI.
         *
         * admin.html menggunakan admin.js.
         */

    }
);
