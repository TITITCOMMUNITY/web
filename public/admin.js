const $ = (selector, root = document) => root.querySelector(selector);

async function api(url, options = {}) {
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
}

/*
 * Admin logout
 *
 * This handler is intentionally inside admin.js.
 * admin.html does NOT load app.js, so the previous logout handler
 * in app.js could never handle #logoutBtn on the admin page.
 */
async function logoutAdmin() {
  const button = $("#logoutBtn");

  if (button?.dataset.loggingOut === "1") return;

  if (button) {
    button.dataset.loggingOut = "1";
    button.disabled = true;
    button.dataset.originalText = button.textContent;
    button.textContent = "Logging out...";
  }

  try {
    await api("/api/logout", {
      method: "POST"
    });
  } catch (error) {
    console.error("Admin logout:", error);
  } finally {
    /*
     * Redirect even if the request reports an error.
     * The API itself removes the D1 session and expires the cookie.
     */
    window.location.replace("/login.html?logged_out=1");
  }
}

function setupLogout() {
  const button = $("#logoutBtn");

  if (!button) {
    console.error("BILSX: #logoutBtn was not found.");
    return;
  }

  button.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    logoutAdmin();
  });
}

async function init() {
  setupLogout();

  try {
    const me = await api("/api/me");

    if (!me.user) {
      window.location.replace("/login.html");
      return;
    }

    if (String(me.user.role).toLowerCase() !== "admin") {
      window.location.replace("/dashboard.html");
      return;
    }

    const overview = await api("/api/admin/overview");
    const stats = overview.stats || overview;

    const statMap = {
      users: "#totalUsers",
      active_users: "#activeUsers",
      premium_users: "#premiumUsers",
      license_keys: "#licenseKeys",
      active_keys: "#activeKeys"
    };

    for (const [key, selector] of Object.entries(statMap)) {
      const element = $(selector);
      if (element) element.textContent = stats[key] ?? 0;
    }

    const usersResponse = await api("/api/admin/users");
    const users = usersResponse.users || [];
    const body = $("#usersBody");

    if (body) {
      if (!users.length) {
        body.innerHTML =
          '<tr><td colspan="6">No users found.</td></tr>';
      } else {
        body.innerHTML = users.map((user) => `
          <tr>
            <td>${escapeHtml(user.id)}</td>
            <td>${escapeHtml(user.username)}</td>
            <td>${escapeHtml(user.email)}</td>
            <td>${escapeHtml(user.role)}</td>
            <td>${escapeHtml(user.plan || "free")}</td>
            <td>${escapeHtml(user.status)}</td>
          </tr>
        `).join("");
      }
    }
  } catch (error) {
    console.error("Admin initialization:", error);

    /*
     * Do not confuse API errors with an actual logout.
     * If /api/me rejects the session, return to login.
     */
    window.location.replace("/login.html");
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;"
  }[character]));
}

document.addEventListener("DOMContentLoaded", init);
