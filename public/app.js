/* BILSX app.js - authentication/session frontend */
const api = async (url, options = {}) => {
  const response = await fetch(url, {
    credentials: "include",
    cache: "no-store",
    ...options,
    headers: {
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {})
    }
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || data.success === false) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
};

const q = (selector) => document.querySelector(selector);

async function logout() {
  /*
    IMPORTANT:
    Do not navigate away until the logout request finishes.
    This prevents an <a href="#"> or page navigation from interrupting
    the request to /api/logout.
  */
  try {
    await api("/api/logout", {
      method: "POST",
      cache: "no-store"
    });
  } catch (error) {
    console.error("Logout API error:", error);
  } finally {
    /*
      /api/logout deletes the server-side session and expires the
      HttpOnly cookie. Redirect even if the API reports an error,
      so the user cannot remain on the protected page.
    */
    window.location.replace("/login.html?logged_out=1");
  }
}

function setupLogout() {
  document.querySelectorAll("[data-logout], #logoutBtn").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (button.dataset.loggingOut === "1") return;
      button.dataset.loggingOut = "1";
      button.disabled = true;

      logout();
    });
  });
}

async function requireAuth(role = null) {
  try {
    const data = await api("/api/me", { cache: "no-store" });

    if (!data.user) {
      window.location.replace("/login.html");
      return null;
    }

    if (role && String(data.user.role).toLowerCase() !== role) {
      window.location.replace("/dashboard.html");
      return null;
    }

    return data.user;
  } catch {
    window.location.replace("/login.html");
    return null;
  }
}

function showMessage(text) {
  const element = q("#msg") || q("#loginMessage") || q("#registerMessage");
  if (!element) return;
  element.style.display = "block";
  element.textContent = text;
}

async function checkExistingSession() {
  try {
    const data = await api("/api/me", { cache: "no-store" });

    if (data.user) {
      window.location.replace(
        String(data.user.role).toLowerCase() === "admin"
          ? "/admin.html"
          : "/dashboard.html"
      );
      return true;
    }
  } catch {}

  return false;
}

async function setupLogin() {
  const form = q("#loginForm");
  if (!form) return;

  if (await checkExistingSession()) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const payload = Object.fromEntries(new FormData(form));

      const data = await api("/api/login", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      window.location.replace(
        String(data.user?.role).toLowerCase() === "admin"
          ? "/admin.html"
          : "/dashboard.html"
      );
    } catch (error) {
      showMessage(error.message);
      if (button) button.disabled = false;
    }
  });
}

async function setupRegister() {
  const form = q("#registerForm");
  if (!form) return;

  if (await checkExistingSession()) return;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const button = form.querySelector('button[type="submit"]');
    if (button) button.disabled = true;

    try {
      const payload = Object.fromEntries(new FormData(form));
      const data = await api("/api/register", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      showMessage(data.message || "Registration successful.");
      form.reset();

      setTimeout(() => {
        window.location.replace("/login.html");
      }, 700);
    } catch (error) {
      showMessage(error.message);
      if (button) button.disabled = false;
    }
  });
}

async function dashboard() {
  const user = await requireAuth();
  if (!user) return;

  const name = q("#name");
  if (name) name.textContent = user.username;

  try {
    const data = await api("/api/keys", { cache: "no-store" });

    if (q("#active")) q("#active").textContent = data.summary?.active ?? 0;
    if (q("#expired")) q("#expired").textContent = data.summary?.expired ?? 0;
    if (q("#total")) q("#total").textContent = data.summary?.total ?? 0;

    renderKeys((data.keys || []).slice(0, 8));
  } catch (error) {
    const table = q("#keys");
    if (table) {
      table.innerHTML =
        `<tr><td colspan="3">${escapeHtml(error.message)}</td></tr>`;
    }
  }
}

function renderKeys(keys) {
  const table = q("#keys");
  if (!table) return;

  if (!keys.length) {
    table.innerHTML =
      '<tr><td colspan="3">No keys yet.</td></tr>';
    return;
  }

  table.innerHTML = keys.map((key) => `
    <tr>
      <td>${escapeHtml(key.key)}</td>
      <td>${escapeHtml(key.status)}</td>
      <td>${key.expires_at
        ? new Date(Number(key.expires_at)).toLocaleString()
        : "Lifetime"}
      </td>
    </tr>
  `).join("");
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[char]));
}

document.addEventListener("DOMContentLoaded", async () => {
  setupLogout();

  const page = document.body.dataset.page;

  if (page === "login") {
    await setupLogin();
  } else if (page === "register") {
    await setupRegister();
  } else if (page === "dashboard") {
    await dashboard();
  } else if (page === "admin") {
    await requireAuth("admin");
  }
});
