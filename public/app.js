/* BILSX APP.JS - dashboard/login stable client */

const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];

async function api(url, options = {}) {
    const opts = { credentials: "include", ...options };
    const headers = new Headers(opts.headers || {});

    if (opts.body && typeof opts.body !== "string" && !(opts.body instanceof FormData)) {
        opts.body = JSON.stringify(opts.body);
        headers.set("Content-Type", "application/json");
    }

    opts.headers = headers;

    const res = await fetch(url, opts);
    const text = await res.text();
    let data;

    try {
        data = text ? JSON.parse(text) : {};
    } catch {
        throw new Error(`Server mengembalikan response tidak valid (${res.status})`);
    }

    if (!res.ok || data.success === false) {
        throw new Error(data.error || data.message || `Request gagal (${res.status})`);
    }

    return data;
}

function setMessage(el, text, type = "") {
    if (!el) return;
    el.textContent = text || "";
    el.className = type ? `message ${type}` : "message";
    el.hidden = !text;
}

function formatRemaining(ms) {
    ms = Number(ms);
    if (!Number.isFinite(ms) || ms <= 0) return "Expired";

    const total = Math.floor(ms / 1000);
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;

    if (d) return `${d}d ${h}h ${m}m`;
    if (h) return `${h}h ${m}m`;
    if (m) return `${m}m ${s}s`;
    return `${s}s`;
}

function formatDate(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || !n) return "—";
    return new Date(n).toLocaleString("id-ID");
}

async function currentUser() {
    return api("/api/me", { cache: "no-store" });
}

async function logout() {
    const button = $("#logoutBtn");
    if (button) button.disabled = true;

    try {
        await api("/api/logout", { method: "POST" });
    } catch (error) {
        console.error("Logout:", error);
    } finally {
        window.location.replace("/login.html");
    }
}

function setupLogout() {
    const button = $("#logoutBtn");
    if (!button || button.dataset.bound === "1") return;

    button.dataset.bound = "1";
    button.addEventListener("click", (event) => {
        event.preventDefault();
        logout();
    });
}

async function requireAuth() {
    try {
        const data = await currentUser();
        if (!data.user) throw new Error("Unauthorized");
        return data.user;
    } catch (error) {
        console.warn("Session invalid:", error.message);
        window.location.replace("/login.html");
        return null;
    }
}

function redirectByRole(user) {
    const role = String(user?.role || "user").toLowerCase();
    if (role === "admin") {
        window.location.replace("/admin.html");
    } else {
        window.location.replace("/dashboard.html");
    }
}

async function loginPage() {
    let already = false;

    try {
        const data = await currentUser();
        if (data.user) {
            already = true;
            redirectByRole(data.user);
            return;
        }
    } catch (_) {}

    if (already) return;

    const form = $("#loginForm");
    const msg = $("#msg");
    if (!form || form.dataset.bound === "1") return;

    form.dataset.bound = "1";

    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const login = $("#login", form)?.value.trim() || "";
        const password = $("#password", form)?.value || "";
        const submit = $("button[type=submit]", form);

        if (!login || !password) {
            setMessage(msg, "Username/email dan password wajib diisi", "error");
            return;
        }

        if (submit) submit.disabled = true;
        setMessage(msg, "Login...", "");

        try {
            const data = await api("/api/login", {
                method: "POST",
                body: { login, password },
                cache: "no-store"
            });

            if (!data.user) throw new Error("Login berhasil tetapi data user tidak diterima.");
            redirectByRole(data.user);
        } catch (error) {
            console.error("Login:", error);
            setMessage(msg, error.message, "error");
            if (submit) submit.disabled = false;
        }
    });
}

function renderUser(user) {
    const username = user.username || "User";
    const role = String(user.role || "user").toLowerCase();
    const premium = Boolean(user.premium);

    const name = $("#name");
    if (name) name.textContent = username;

    $$('[data-user="username"]').forEach(el => el.textContent = username);
    $$('[data-user-status]').forEach(el => el.textContent = user.status || "active");
    $$('[data-user-role]').forEach(el => el.textContent = role);

    const avatar = $("#avatarLetter");
    if (avatar) avatar.textContent = username.charAt(0).toUpperCase();

    const plan = $("#plan");
    if (plan) plan.textContent = role === "admin" ? "ADMIN" : premium ? "PREMIUM" : "FREE";

    const premiumInfo = $("#premiumInfo");
    if (premiumInfo) {
        if (role === "admin") premiumInfo.textContent = "Administrator — Full access";
        else if (premium) premiumInfo.textContent = user.premium_expires_at ? `Premium sampai ${formatDate(user.premium_expires_at)}` : "Premium aktif";
        else premiumInfo.textContent = "Free account";
    }

    ["#growscanAccess", "#fastFriendAccess"].forEach(selector => {
        const el = $(selector);
        if (el) el.textContent = role === "admin" || premium ? "ACTIVE" : "PREMIUM";
    });
}

function renderKeys(keys) {
    const list = $("#licenseKeyList");
    if (!list) return;

    if (!Array.isArray(keys) || keys.length === 0) {
        list.innerHTML = '<div class="empty-state">Belum ada license key.</div>';
        window.BILSX_KEY = null;
        return;
    }

    const key = keys[0];
    window.BILSX_KEY = key;

    list.innerHTML = keys.map(k => {
        const expires = Number(k.expires_at || 0);
        const expired = expires > 0 && expires <= Date.now();
        const status = expired ? "expired" : String(k.status || "unused").toLowerCase();
        const active = expires > Date.now();
        const remaining = active ? formatRemaining(expires - Date.now()) : "Expired";

        return `
            <div class="key-row">
                <div>
                    <strong>${escapeHtml(k.key || "—")}</strong>
                    <div class="key-meta">
                        <span>${escapeHtml(status.toUpperCase())}</span>
                        <span>${expires ? escapeHtml(remaining) : "Belum aktif"}</span>
                    </div>
                </div>
                <div class="key-actions">
                    <button type="button" class="copy-key" data-copy="${escapeHtml(k.key || "")}">COPY</button>
                    <button type="button" class="add-key" data-add-key="${Number(k.id || 0)}">+ADD</button>
                </div>
            </div>`;
    }).join("");

    $$("[data-copy]", list).forEach(button => {
        button.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(button.dataset.copy || "");
                const old = button.textContent;
                button.textContent = "COPIED";
                setTimeout(() => button.textContent = old, 1200);
            } catch {
                alert("Tidak dapat menyalin key.");
            }
        });
    });

    $$("[data-add-key]", list).forEach(button => {
        button.addEventListener("click", () => requestFreeKey());
    });
}

async function loadKeys() {
    const list = $("#licenseKeyList");
    if (list) list.innerHTML = '<div class="empty-state">Loading...</div>';

    try {
        const data = await api("/api/keys", { cache: "no-store" });
        renderKeys(data.keys || []);
        return data.keys || [];
    } catch (error) {
        console.error("Keys:", error);
        if (list) list.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
        return [];
    }
}

function updateFreeKeyUI(key) {
    const action = $("#freeKeyAction");
    const link = $("#freeKeyLink");
    const message = $("#freeKeyMessage");
    const expiry = $("#freeKeyExpiry");
    const bar = $("#freeKeyProgress");
    const progressText = $("#freeKeyProgressText");

    if (!key) {
        if (action) {
            action.disabled = false;
            action.textContent = "GET KEY";
        }
        if (link) link.hidden = true;
        if (expiry) expiry.textContent = "Belum memiliki waktu aktif.";
        if (bar) bar.style.width = "0%";
        if (progressText) progressText.textContent = "0 / 72 jam";
        return;
    }

    const expires = Number(key.expires_at || 0);
    const remaining = Math.max(0, expires - Date.now());
    const hours = remaining / 3600000;
    const percent = Math.min(100, (hours / 72) * 100);
    const active = remaining > 0 && String(key.status).toLowerCase() === "active";

    if (bar) bar.style.width = `${percent}%`;
    if (progressText) progressText.textContent = `${Math.floor(hours)} / 72 jam`;
    if (expiry) expiry.textContent = active ? `Aktif sampai ${formatDate(expires)} • ${formatRemaining(remaining)}` : "Key belum aktif / sudah expired.";
    if (action) {
        action.disabled = false;
        action.textContent = active ? "+ ADD 6 JAM" : "GET KEY / AKTIFKAN";
    }
}

async function loadFreeKey() {
    try {
        const data = await api("/api/free-key", { method: "GET", cache: "no-store" });
        updateFreeKeyUI(data.key || null);
        return data;
    } catch (error) {
        console.error("Free key GET:", error);
        setMessage($("#freeKeyMessage"), error.message, "error");
        return null;
    }
}

function showLink(url) {
    const link = $("#freeKeyLink");
    if (!link) return;

    link.href = url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.hidden = false;
    link.textContent = "CONTINUE TO LINKVERTISE";
}

async function requestFreeKey() {
    const action = $("#freeKeyAction");
    const message = $("#freeKeyMessage");

    if (action) {
        action.disabled = true;
        action.textContent = "MEMBUAT LINK...";
    }
    setMessage(message, "Mempersiapkan Linkvertise...", "");

    try {
        const data = await api("/api/free-key", {
            method: "POST",
            cache: "no-store"
        });

        if (data.capped) {
            setMessage(message, "Free Key sudah mencapai batas maksimum 72 jam.", "success");
            updateFreeKeyUI(data.key || window.BILSX_KEY);
            return;
        }

        const url = data.linkvertise_url || data.link || data.url || data.redirect_url;
        if (!url) throw new Error("Server tidak mengembalikan link Linkvertise.");

        showLink(url);
        setMessage(message, "Link berhasil dibuat. Selesaikan Linkvertise, lalu sistem akan memproses tambahan 6 jam.", "success");
    } catch (error) {
        console.error("Free key POST:", error);
        setMessage(message, error.message, "error");
    } finally {
        if (action) {
            action.disabled = false;
            if (window.BILSX_KEY) updateFreeKeyUI(window.BILSX_KEY);
            else action.textContent = "GET KEY";
        }
    }
}

function setupFreeKey() {
    const action = $("#freeKeyAction");
    if (action && action.dataset.bound !== "1") {
        action.dataset.bound = "1";
        action.addEventListener("click", requestFreeKey);
    }
}

function startDashboardTimer() {
    setInterval(() => {
        if (window.BILSX_KEY) updateFreeKeyUI(window.BILSX_KEY);
    }, 1000);
}

async function dashboardPage() {
    const user = await requireAuth();
    if (!user) return;

    window.BILSX_USER = user;
    renderUser(user);
    setupLogout();
    setupFreeKey();

    const admin = String(user.role || "").toLowerCase() === "admin";
    const premium = Boolean(user.premium);
    const panel = $("#freeKeyPanel");

    if (admin || premium) {
        if (panel) panel.hidden = true;
        return;
    }

    if (panel) panel.hidden = false;
    await loadKeys();
    await loadFreeKey();
    startDashboardTimer();
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>\"']/g, c => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        "\"": "&quot;",
        "'": "&#039;"
    }[c]));
}

async function init() {
    const page = document.body?.dataset?.page || "";

    if (page === "login") {
        await loginPage();
        return;
    }

    if (page === "dashboard") {
        await dashboardPage();
        return;
    }

    if (page === "admin") {
        setupLogout();
        return;
    }
}

document.addEventListener("DOMContentLoaded", () => {
    init().catch(error => console.error("APP INIT:", error));
});
