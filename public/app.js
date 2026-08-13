/* =========================================================
   BILSX APP.JS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);


/* =========================================================
   API HELPER
   ========================================================= */

async function api(url, options = {}) {

    const response = await fetch(url, {
        credentials: "include",
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...(options.headers || {})
        }
    });

    let data;

    try {
        data = await response.json();
    } catch {
        data = {
            success: false,
            error: "Invalid server response"
        };
    }

    if (!response.ok || data.success === false) {

        throw new Error(
            data.error ||
            data.message ||
            `Request failed (${response.status})`
        );
    }

    return data;
}


/* =========================================================
   MESSAGE
   ========================================================= */

function showMessage(message, type = "error") {

    const el =
        $("#dashboardMsg") ||
        $("#message");

    if (!el) {
        console.log(message);
        return;
    }

    el.hidden = false;
    el.textContent = message;

    el.dataset.type = type;
}


/* =========================================================
   CURRENT USER
   ========================================================= */

async function getCurrentUser() {

    return await api("/api/me");
}


/* =========================================================
   AUTH CHECK
   ========================================================= */

async function requireAuth() {

    try {

        const data =
            await getCurrentUser();

        if (!data.success || !data.user) {

            window.location.href =
                "/login.html";

            return null;
        }

        return data.user;

    } catch (error) {

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

        await api("/api/logout", {
            method: "POST"
        });

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
   LOGOUT BUTTONS
   ========================================================= */

function setupLogout() {

    document
        .querySelectorAll("[data-logout]")
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
   FORMAT DATE
   ========================================================= */

function formatDate(timestamp) {

    if (
        timestamp === null ||
        timestamp === undefined ||
        timestamp === ""
    ) {
        return "—";
    }

    const number =
        Number(timestamp);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return new Date(number)
        .toLocaleString();
}


/* =========================================================
   FORMAT REMAINING TIME
   ========================================================= */

function formatRemaining(timestamp) {

    const expires =
        Number(timestamp);

    if (!Number.isFinite(expires)) {
        return "—";
    }

    const remaining =
        expires - Date.now();

    if (remaining <= 0) {
        return "Expired";
    }

    const totalSeconds =
        Math.floor(
            remaining / 1000
        );

    const days =
        Math.floor(
            totalSeconds / 86400
        );

    const hours =
        Math.floor(
            (totalSeconds % 86400) / 3600
        );

    const minutes =
        Math.floor(
            (totalSeconds % 3600) / 60
        );

    const seconds =
        totalSeconds % 60;


    if (days > 0) {

        return `${days}d ${hours}h ${minutes}m`;

    }

    if (hours > 0) {

        return `${hours}h ${minutes}m`;

    }

    if (minutes > 0) {

        return `${minutes}m ${seconds}s`;

    }

    return `${seconds}s`;
}


/* =========================================================
   FIND FREE KEY
   ========================================================= */

function findFreeKey(keys) {

    if (!Array.isArray(keys)) {
        return null;
    }

    /*
     * Prefer key with type = free.
     */

    const free =
        keys.find(key => {

            const type =
                String(
                    key.type || ""
                ).toLowerCase();

            return type === "free";

        });

    if (free) {
        return free;
    }


    /*
     * Compatibility with the
     * current database/API.
     *
     * If /api/keys currently does
     * not return "type", use the
     * first key belonging to user.
     */

    if (keys.length > 0) {
        return keys[0];
    }

    return null;
}


/* =========================================================
   RENDER FREE KEY
   ========================================================= */

function renderFreeKey(key) {

    const noKey =
        $("#noKey");

    const keyBox =
        $("#keyBox");


    if (!key) {

        if (noKey) {
            noKey.hidden = false;
        }

        if (keyBox) {
            keyBox.hidden = true;
        }

        return;
    }


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


    const statusElement =
        $("#keyStatus");

    if (statusElement) {

        let status =
            String(
                key.status || "unknown"
            ).toUpperCase();

        /*
         * Automatically display expired
         * if expires_at has passed.
         */

        if (
            key.expires_at &&
            Number(key.expires_at) <= Date.now()
        ) {

            status = "EXPIRED";
        }

        statusElement.textContent =
            status;
    }


    const expiryElement =
        $("#keyExpiry");

    if (expiryElement) {

        if (key.expires_at) {

            const expires =
                Number(key.expires_at);

            if (
                Number.isFinite(expires) &&
                expires <= Date.now()
            ) {

                expiryElement.textContent =
                    "Expired";

            } else {

                expiryElement.textContent =
                    "Expires: " +
                    formatDate(
                        key.expires_at
                    );
            }

        } else {

            expiryElement.textContent =
                "No expiration";
        }
    }


    /*
     * Store key information so
     * other functions can use it.
     */

    window.BILSX_CURRENT_KEY =
        key;
}


/* =========================================================
   LOAD USER KEYS
   ========================================================= */

async function loadUserKeys() {

    try {

        const data =
            await api("/api/keys");


        /*
         * Depending on the current API,
         * keys may be returned as:
         *
         * {
         *   success: true,
         *   keys: [...]
         * }
         *
         * or another compatible property.
         */

        const keys =
            Array.isArray(data.keys)
                ? data.keys
                : [];


        const freeKey =
            findFreeKey(keys);


        renderFreeKey(
            freeKey
        );


        return freeKey;

    } catch (error) {

        console.error(
            "Failed to load keys:",
            error
        );

        showMessage(
            error.message
        );

        return null;
    }
}


/* =========================================================
   DASHBOARD
   ========================================================= */

async function dashboard() {

    const user =
        await requireAuth();

    if (!user) {
        return;
    }


    window.BILSX_USER =
        user;


    /* -----------------------------------------
       ACCOUNT
    ----------------------------------------- */

    const name =
        $("#name");

    if (name) {
        name.textContent =
            user.username || "User";
    }


    const username =
        $("#username");

    if (username) {
        username.textContent =
            user.username || "—";
    }


    const status =
        $("#status");

    if (status) {
        status.textContent =
            user.status || "—";
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


    /*
     * Admin takes priority.
     */

    if (
        String(
            user.role || ""
        ).toLowerCase() === "admin"
    ) {

        if (plan) {
            plan.textContent =
                "ADMIN";
        }

    } else if (user.premium) {

        if (plan) {
            plan.textContent =
                "PREMIUM";
        }

    } else {

        if (plan) {
            plan.textContent =
                "FREE";
        }
    }


    /* -----------------------------------------
       PREMIUM
    ----------------------------------------- */

    const premiumInfo =
        $("#premiumInfo");


    if (
        String(
            user.role || ""
        ).toLowerCase() === "admin"
    ) {

        if (premiumInfo) {

            premiumInfo.textContent =
                "Administrator — Full access";
        }

    } else if (user.premium) {

        if (premiumInfo) {

            if (user.premium_expires_at) {

                premiumInfo.textContent =
                    "Premium expires: " +
                    formatDate(
                        user.premium_expires_at
                    );

            } else {

                premiumInfo.textContent =
                    "Premium active";
            }
        }

    } else {

        if (premiumInfo) {

            premiumInfo.textContent =
                "Free account";
        }
    }


    /* -----------------------------------------
       PREMIUM FEATURE DISPLAY
    ----------------------------------------- */

    const growscan =
        $("#growscanAccess");

    const fastFriend =
        $("#fastFriendAccess");


    const isAdmin =
        String(
            user.role || ""
        ).toLowerCase() === "admin";


    if (isAdmin || user.premium) {

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


    /* -----------------------------------------
       ADMIN
    ----------------------------------------- */

    if (isAdmin) {

        /*
         * Admin doesn't need a Free Key.
         */

        const keyPanel =
            document.querySelector(
                ".key-panel"
            );

        if (keyPanel) {

            keyPanel.style.display =
                "none";
        }

    } else if (user.premium) {

        /*
         * Premium doesn't need Free Key.
         */

        const keyPanel =
            document.querySelector(
                ".key-panel"
            );

        if (keyPanel) {

            keyPanel.style.display =
                "none";
        }

    } else {

        /*
         * Normal free user.
         */

        await loadUserKeys();
    }
}


/* =========================================================
   GET KEY MODAL
   ========================================================= */

function openKeyModal() {

    const modal =
        $("#keyModal");

    if (!modal) {
        return;
    }

    modal.hidden = false;


    const message =
        $("#getKeyMessage");

    if (message) {

        message.textContent =
            "";
    }
}


/* =========================================================
   CLOSE KEY MODAL
   ========================================================= */

function closeKeyModal() {

    const modal =
        $("#keyModal");

    if (!modal) {
        return;
    }

    modal.hidden = true;
}


/* =========================================================
   GET KEY BUTTON
   ========================================================= */

function setupGetKey() {

    const getKeyButton =
        $("#getKeyBtn");

    if (getKeyButton) {

        getKeyButton.addEventListener(
            "click",
            () => {

                openKeyModal();
            }
        );
    }


    const addKeyButton =
        $("#addKeyBtn");

    if (addKeyButton) {

        addKeyButton.addEventListener(
            "click",
            () => {

                openKeyModal();
            }
        );
    }


    const closeButton =
        $("#closeKeyModal");

    if (closeButton) {

        closeButton.addEventListener(
            "click",
            () => {

                closeKeyModal();
            }
        );
    }


    /*
     * Click outside modal.
     */

    const modal =
        $("#keyModal");

    if (modal) {

        modal.addEventListener(
            "click",
            event => {

                if (
                    event.target === modal
                ) {

                    closeKeyModal();
                }
            }
        );
    }


    /*
     * This button will later call:
     *
     * /api/free-key/start
     *
     * and redirect the user to
     * Linkvertise.
     */

    const startButton =
        $("#startGetKeyBtn");

    if (startButton) {

        startButton.addEventListener(
            "click",
            async () => {

                const message =
                    $("#getKeyMessage");


                if (message) {

                    message.textContent =
                        "Free Key service is being prepared...";
                }


                /*
                 * IMPORTANT:
                 *
                 * Do not generate a key here yet.
                 *
                 * Linkvertise verification
                 * will be implemented in the
                 * backend.
                 */

                console.log(
                    "Get Key requested"
                );
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

            const keyElement =
                $("#licenseKey");

            if (!keyElement) {
                return;
            }

            const key =
                keyElement.textContent.trim();


            if (!key || key === "—") {
                return;
            }


            try {

                await navigator.clipboard
                    .writeText(key);


                const oldText =
                    button.textContent;


                button.textContent =
                    "COPIED";


                setTimeout(() => {

                    button.textContent =
                        oldText;

                }, 1500);


            } catch (error) {

                console.error(
                    "Copy failed:",
                    error
                );

                button.textContent =
                    "FAILED";


                setTimeout(() => {

                    button.textContent =
                        "COPY";

                }, 1500);
            }
        }
    );
}


/* =========================================================
   LIVE KEY TIMER
   ========================================================= */

function startKeyTimer() {

    setInterval(() => {

        const key =
            window.BILSX_CURRENT_KEY;

        if (!key) {
            return;
        }


        const expiry =
            $("#keyExpiry");

        const status =
            $("#keyStatus");


        if (
            !expiry ||
            !status
        ) {
            return;
        }


        if (!key.expires_at) {
            return;
        }


        const timestamp =
            Number(
                key.expires_at
            );


        if (
            !Number.isFinite(timestamp)
        ) {
            return;
        }


        if (
            timestamp <= Date.now()
        ) {

            status.textContent =
                "EXPIRED";

            expiry.textContent =
                "Expired";

        } else {

            status.textContent =
                "ACTIVE";

            expiry.textContent =
                "Remaining: " +
                formatRemaining(
                    timestamp
                );
        }

    }, 1000);
}


/* =========================================================
   LOGIN PAGE
   ========================================================= */

async function loginPage() {

    /*
     * If already logged in,
     * redirect to dashboard.
     */

    try {

        const data =
            await api("/api/me");

        if (
            data.success &&
            data.user
        ) {

            window.location.href =
                "/dashboard.html";

            return;
        }

    } catch {
        /*
         * Not logged in.
         * Continue normally.
         */
    }
}


/* =========================================================
   REGISTER PAGE
   ========================================================= */

async function registerPage() {

    /*
     * If already logged in,
     * redirect to dashboard.
     */

    try {

        const data =
            await api("/api/me");

        if (
            data.success &&
            data.user
        ) {

            window.location.href =
                "/dashboard.html";

            return;
        }

    } catch {
        /*
         * Not logged in.
         */
    }
}


/* =========================================================
   PAGE INITIALIZATION
   ========================================================= */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        setupLogout();

        setupGetKey();

        setupCopyKey();


        const page =
            document.body.dataset.page;


        switch (page) {

            case "dashboard":

                await dashboard();

                startKeyTimer();

                break;


            case "login":

                await loginPage();

                break;


            case "register":

                await registerPage();

                break;


            default:

                /*
                 * Other public pages don't
                 * require initialization.
                 */

                break;
        }
    }
);
