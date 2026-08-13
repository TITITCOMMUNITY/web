/* =========================================================
   BILSX APP.JS
   ========================================================= */

const $ = (selector) => document.querySelector(selector);

/* =========================================================
   API
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
        $("#message") ||
        $("#getKeyMessage");

    if (!el) {
        console.log(message);
        return;
    }

    el.hidden = false;
    el.textContent = message;
    el.dataset.type = type;
}

/* =========================================================
   AUTH
   ========================================================= */

async function getCurrentUser() {
    return await api("/api/me");
}

async function requireAuth() {
    try {
        const data = await getCurrentUser();

        if (!data.success || !data.user) {
            window.location.href = "/login.html";
            return null;
        }

        return data.user;

    } catch (error) {
        console.error("Auth error:", error);
        window.location.href = "/login.html";
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
        console.error("Logout error:", error);
    } finally {
        window.location.href = "/login.html";
    }
}

function setupLogout() {
    document
        .querySelectorAll("[data-logout]")
        .forEach(button => {

            button.addEventListener("click", async event => {
                event.preventDefault();
                await logout();
            });

        });
}

/* =========================================================
   DATE
   ========================================================= */

function formatDate(timestamp) {
    if (
        timestamp === null ||
        timestamp === undefined ||
        timestamp === ""
    ) {
        return "—";
    }

    const number = Number(timestamp);

    if (!Number.isFinite(number)) {
        return "—";
    }

    return new Date(number).toLocaleString();
}

/* =========================================================
   REMAINING TIME
   ========================================================= */

function formatRemaining(timestamp) {
    const expires = Number(timestamp);

    if (!Number.isFinite(expires)) {
        return "—";
    }

    const remaining = expires - Date.now();

    if (remaining <= 0) {
        return "Expired";
    }

    const totalSeconds =
        Math.floor(remaining / 1000);

    const days =
        Math.floor(totalSeconds / 86400);

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
   KEY
   ========================================================= */

function findFreeKey(keys) {
    if (!Array.isArray(keys)) {
        return null;
    }

    return (
        keys.find(key =>
            String(key.type || "")
                .toLowerCase() === "free"
        ) ||
        keys[0] ||
        null
    );
}

function renderFreeKey(key) {
    const noKey = $("#noKey");
    const keyBox = $("#keyBox");

    if (!key) {

        if (noKey) {
            noKey.hidden = false;
        }

        if (keyBox) {
            keyBox.hidden = true;
        }

        window.BILSX_CURRENT_KEY = null;

        return;
    }

    if (noKey) {
        noKey.hidden = true;
    }

    if (keyBox) {
        keyBox.hidden = false;
    }

    const keyElement = $("#licenseKey");

    if (keyElement) {
        keyElement.textContent =
            key.key || "—";
    }

    const statusElement = $("#keyStatus");

    if (statusElement) {

        let status =
            String(
                key.status || "unknown"
            ).toUpperCase();

        if (
            key.expires_at &&
            Number(key.expires_at) <= Date.now()
        ) {
            status = "EXPIRED";
        }

        statusElement.textContent = status;
    }

    const expiryElement = $("#keyExpiry");

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
                    "Remaining: " +
                    formatRemaining(expires);
            }

        } else {

            expiryElement.textContent =
                "No expiration";
        }
    }

    window.BILSX_CURRENT_KEY = key;
}

/* =========================================================
   LOAD KEYS
   ========================================================= */

async function loadUserKeys() {

    try {

        const data =
            await api("/api/keys");

        const keys =
            Array.isArray(data.keys)
                ? data.keys
                : [];

        const freeKey =
            findFreeKey(keys);

        renderFreeKey(freeKey);

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
        message.textContent = "";
    }
}

function closeKeyModal() {

    const modal =
        $("#keyModal");

    if (!modal) {
        return;
    }

    modal.hidden = true;
}

/* =========================================================
   LINKVERTISE
   ========================================================= */

function showLinkvertise(url) {

    const message =
        $("#getKeyMessage");

    if (!message) {
        return;
    }

    message.innerHTML = "";

    const title =
        document.createElement("div");

    title.textContent =
        "Your Free Key is ready";

    title.style.marginBottom =
        "12px";

    const button =
        document.createElement("a");

    button.href = url;
    button.target = "_blank";
    button.rel = "noopener noreferrer";

    button.textContent =
        "CONTINUE TO LINKVERTISE";

    button.style.display =
        "inline-block";

    button.style.padding =
        "12px 18px";

    button.style.borderRadius =
        "10px";

    button.style.textDecoration =
        "none";

    button.style.fontWeight =
        "600";

    message.appendChild(title);
    message.appendChild(button);
}

/* =========================================================
   START FREE KEY
   ========================================================= */

async function startFreeKey() {

    const button =
        $("#startGetKeyBtn");

    const message =
        $("#getKeyMessage");

    if (button) {
        button.disabled = true;
    }

    if (message) {
        message.textContent =
            "Creating your Free Key...";
    }

    try {

        const data =
            await api(
                "/api/free-key",
                {
                    method: "POST"
                }
            );

        /*
         * Real Linkvertise URL.
         *
         * Backend may return one of these
         * names depending on implementation.
         */

        const link =
            data.linkvertise_url ||
            data.redirect_url ||
            data.url ||
            data.link ||
            null;

        if (link) {

            showLinkvertise(link);

            return;
        }

        /*
         * If backend has already completed
         * the claim and returned a key.
         */

        if (data.key) {

            if (message) {
                message.textContent =
                    "Free Key berhasil dibuat.";
            }

            await loadUserKeys();

            setTimeout(() => {
                closeKeyModal();
            }, 1000);

            return;
        }

        /*
         * Backend created a claim but did
         * not return a Linkvertise URL.
         */

        throw new Error(
            "Linkvertise URL tidak diberikan oleh server."
        );

    } catch (error) {

        console.error(
            "Get Key error:",
            error
        );

        if (message) {
            message.textContent =
                error.message;
        }

    } finally {

        if (button) {
            button.disabled = false;
        }
    }
}

/* =========================================================
   GET KEY EVENTS
   ========================================================= */

function setupGetKey() {

    const getKeyButton =
        $("#getKeyBtn");

    if (getKeyButton) {

        getKeyButton.addEventListener(
            "click",
            openKeyModal
        );
    }

    const addKeyButton =
        $("#addKeyBtn");

    if (addKeyButton) {

        addKeyButton.addEventListener(
            "click",
            openKeyModal
        );
    }

    const closeButton =
        $("#closeKeyModal");

    if (closeButton) {

        closeButton.addEventListener(
            "click",
            closeKeyModal
        );
    }

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

    const startButton =
        $("#startGetKeyBtn");

    if (startButton) {

        startButton.addEventListener(
            "click",
            startFreeKey
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

            if (
                !key ||
                key === "—"
            ) {
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

    const isAdmin =
        String(
            user.role || ""
        ).toLowerCase() === "admin";

    const isPremium =
        Boolean(user.premium);

    if (plan) {

        if (isAdmin) {
            plan.textContent =
                "ADMIN";
        } else if (isPremium) {
            plan.textContent =
                "PREMIUM";
        } else {
            plan.textContent =
                "FREE";
        }
    }

    /* =====================================================
       PREMIUM INFO
       ===================================================== */

    const premiumInfo =
        $("#premiumInfo");

    if (premiumInfo) {

        if (isAdmin) {

            premiumInfo.textContent =
                "Administrator — Full access";

        } else if (isPremium) {

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

        } else {

            premiumInfo.textContent =
                "Free account";
        }
    }

    /* =====================================================
       PREMIUM FEATURES
       ===================================================== */

    const growscan =
        $("#growscanAccess");

    const fastFriend =
        $("#fastFriendAccess");

    if (isAdmin || isPremium) {

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

    /* =====================================================
       FREE KEY
       ===================================================== */

    const keyPanel =
        document.querySelector(
            ".key-panel"
        );

    if (isAdmin || isPremium) {

        if (keyPanel) {
            keyPanel.style.display =
                "none";
        }

    } else {

        if (keyPanel) {
            keyPanel.style.display =
                "";
        }

        await loadUserKeys();
    }
}

/* =========================================================
   KEY TIMER
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

        if (!expiry || !status) {
            return;
        }

        if (!key.expires_at) {
            return;
        }

        const timestamp =
            Number(key.expires_at);

        if (!Number.isFinite(timestamp)) {
            return;
        }

        if (timestamp <= Date.now()) {

            status.textContent =
                "EXPIRED";

            expiry.textContent =
                "Expired";

        } else {

            status.textContent =
                "ACTIVE";

            expiry.textContent =
                "Remaining: " +
                formatRemaining(timestamp);
        }

    }, 1000);
}

/* =========================================================
   LOGIN PAGE
   ========================================================= */

async function loginPage() {

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
         * Continue showing login page.
         */
    }
}

/* =========================================================
   REGISTER PAGE
   ========================================================= */

async function registerPage() {

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
   INIT
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

                break;
        }
    }
);