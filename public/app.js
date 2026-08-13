/* BILSX APP - AUTH HOTFIX */
const $ = (s, r = document) => r.querySelector(s);

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: "include",
    ...options,
    headers: {
      ...(options.body ? {"Content-Type": "application/json"} : {}),
      ...(options.headers || {})
    }
  });

  let data = {};
  try { data = await response.json(); } catch {}

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `Request failed (${response.status})`);
  }
  return data;
}

async function getSession() {
  try {
    return await api("/api/me", { method: "GET" });
  } catch {
    return null;
  }
}

/* If the user is already logged in, login/register must not be shown. */
async function redirectIfLoggedIn() {
  const data = await getSession();

  if (data?.success && data.user) {
    location.replace(
      String(data.user.role).toLowerCase() === "admin"
        ? "/admin.html"
        : "/dashboard.html"
    );
    return true;
  }

  return false;
}

function showMessage(text, ok = false) {
  const el = $("#msg") || $("#loginMessage") || $("#demo-message") || $("#registerMessage") || $("#register-message");
  if (!el) return;

  el.textContent = text || "";
  el.style.display = text ? "block" : "none";
  el.dataset.ok = ok ? "1" : "0";
}

function setupLogin() {
  const form = $("#loginForm");
  if (!form) {
    console.error("BILSX: #loginForm not found");
    return;
  }

  /* Prevent duplicate listeners if the script is loaded twice. */
  if (form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const login = form.querySelector('[name="login"]')?.value.trim() || "";
    const password = form.querySelector('[name="password"]')?.value || "";
    const button = form.querySelector('button[type="submit"], button');

    if (!login || !password) {
      showMessage("Username/email dan password wajib diisi.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.dataset.oldText = button.textContent;
      button.textContent = "Logging in...";
    }

    try {
      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ login, password })
      });

      if (!data.user) {
        throw new Error("Login berhasil tetapi data user tidak diterima.");
      }

      /*
       * Cookie bilsx_session is created by the server.
       * Nothing sensitive is stored in localStorage.
       */
      location.replace(
        String(data.user.role).toLowerCase() === "admin"
          ? "/admin.html"
          : "/dashboard.html"
      );
    } catch (error) {
      console.error("BILSX login:", error);
      showMessage(error.message || "Login gagal.");

      if (button) {
        button.disabled = false;
        button.textContent = button.dataset.oldText || "Login";
      }
    }
  });
}

function setupRegister() {
  const form = $("#registerForm");
  if (!form || form.dataset.bound === "1") return;
  form.dataset.bound = "1";

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = form.querySelector('[name="username"]')?.value.trim() || "";
    const email = form.querySelector('[name="email"]')?.value.trim() || "";
    const password = form.querySelector('[name="password"]')?.value || "";
    const confirm = form.querySelector('[name="confirm_password"]')?.value;
    const button = form.querySelector('button[type="submit"], button');

    if (!username || !email || !password) {
      showMessage("Semua field wajib diisi.");
      return;
    }

    if (confirm !== undefined && confirm !== password) {
      showMessage("Konfirmasi password tidak sama.");
      return;
    }

    if (button) {
      button.disabled = true;
      button.textContent = "Creating...";
    }

    try {
      await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ username, email, password })
      });

      showMessage("Account berhasil dibuat. Mengarahkan ke login...", true);
      setTimeout(() => location.replace("/login.html"), 700);
    } catch (error) {
      showMessage(error.message || "Register gagal.");
      if (button) {
        button.disabled = false;
        button.textContent = "Create Account";
      }
    }
  });
}

async function requireUser() {
  const data = await getSession();

  if (!data?.success || !data.user) {
    location.replace("/login.html");
    return null;
  }

  return data.user;
}

async function setupDashboard() {
  const user = await requireUser();
  if (!user) return;

  document.querySelectorAll("[data-user]").forEach(el => {
    el.textContent = user[el.dataset.user] ?? "—";
  });

  const username = $("#username");
  if (username) username.textContent = user.username;

  const status = $("#status");
  if (status) status.textContent = user.status;

  const role = $("#role");
  if (role) role.textContent = String(user.role || "user").toUpperCase();

  const plan = $("#plan");
  if (plan) {
    plan.textContent =
      String(user.role).toLowerCase() === "admin"
        ? "ADMIN"
        : user.premium
          ? "PREMIUM"
          : "FREE";
  }
}

function setupLogout() {
  document.querySelectorAll("[data-logout], #logoutBtn").forEach(button => {
    if (button.dataset.bound === "1") return;
    button.dataset.bound = "1";

    button.addEventListener("click", async (event) => {
      event.preventDefault();

      try {
        await api("/api/logout", { method: "POST" });
      } catch {}

      location.replace("/login.html");
    });
  });
}

document.addEventListener("DOMContentLoaded", async () => {
  setupLogout();

  const page = document.body.dataset.page || "";

  /*
   * IMPORTANT:
   * We identify pages by their actual element IDs too.
   * This keeps the site working even if data-page was forgotten.
   */
  if (page === "login" || $("#loginForm")) {
    if (!(await redirectIfLoggedIn())) {
      setupLogin();
    }
    return;
  }

  if (page === "register" || $("#registerForm")) {
    if (!(await redirectIfLoggedIn())) {
      setupRegister();
    }
    return;
  }

  if (page === "dashboard" || $(".dash") || $("[data-page='dashboard']")) {
    await setupDashboard();
  }
});
