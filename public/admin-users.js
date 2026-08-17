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
  if (!response.ok || data.success === false) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#039;" }[c]));
}

function formatTime(ms) {
  ms = Number(ms || 0);
  if (ms <= 0) return "Inactive";
  const totalMinutes = Math.floor(ms / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;
  if (days) return `${days}d ${hours}h ${minutes}m`;
  if (hours) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(Number(value));
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleString();
}

function flash(message, type = "ok") {
  const box = $("#adminMessage");
  if (!box) return;
  box.textContent = message;
  box.className = `admin-message ${type}`;
  clearTimeout(flash.timer);
  flash.timer = setTimeout(() => { box.textContent = ""; box.className = "admin-message"; }, 4500);
}

async function loadUsers() {
  const search = $("#userSearch")?.value.trim() || "";
  const tbody = $("#adminUsersBody");
  if (!tbody) return;
  tbody.innerHTML = `<tr><td colspan="7" class="muted">Loading users...</td></tr>`;

  try {
    const data = await api(`/api/admin/users${search ? `?search=${encodeURIComponent(search)}` : ""}`);
    const users = data.users || [];
    if (!users.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="muted">No users found.</td></tr>`;
      return;
    }

    tbody.innerHTML = users.map(user => {
      const key = user.free_key;
      const keyStatus = key?.status === "active" ? "Active" : "Inactive";
      const keyTime = key?.status === "active" ? formatTime(key.remaining_ms) : "—";
      const premiumTime = user.premium ? formatDate(user.premium_expires_at) : "—";
      const canEdit = user.role !== "admin";
      const disabled = canEdit ? "" : "disabled";

      return `
        <tr data-user-id="${escapeHtml(user.id)}">
          <td><strong>#${escapeHtml(user.id)}</strong></td>
          <td><strong>${escapeHtml(user.username)}</strong><small class="muted">${escapeHtml(user.email)}</small></td>
          <td><span class="badge ${user.premium ? "premium" : "free"}">${user.premium ? "PREMIUM" : "FREE"}</span><small class="muted">${premiumTime}</small></td>
          <td><span class="badge ${key?.status === "active" ? "active" : "inactive"}">${keyStatus}</span><small class="muted">${keyTime}</small></td>
          <td>${escapeHtml(user.status)}</td>
          <td>
            <div class="action-row">
              <button class="mini-btn" ${disabled} data-action="add-key" data-hours="1" data-id="${user.id}">+1h</button>
              <button class="mini-btn" ${disabled} data-action="add-key" data-hours="6" data-id="${user.id}">+6h</button>
              <button class="mini-btn danger" ${disabled} data-action="add-key" data-hours="-1" data-id="${user.id}">−1h</button>
              <button class="mini-btn danger" ${disabled} data-action="add-key" data-hours="-6" data-id="${user.id}">−6h</button>
            </div>
          </td>
          <td>
            <div class="action-row">
              <select class="duration-select" ${disabled} data-user-id="${user.id}">
                <option value="7">Premium 7d</option>
                <option value="30">Premium 30d</option>
                <option value="365">Premium 365d</option>
              </select>
              <button class="mini-btn premium-btn" ${disabled} data-action="premium" data-id="${user.id}">Make Premium</button>
              ${user.premium ? `<button class="mini-btn danger" ${disabled} data-action="free" data-id="${user.id}">Remove Premium</button>` : ""}
            </div>
          </td>
        </tr>`;
    }).join("");
  } catch (error) {
    tbody.innerHTML = `<tr><td colspan="7" class="error-cell">${escapeHtml(error.message)}</td></tr>`;
    if (/Unauthorized|Session expired|Forbidden/i.test(error.message)) window.location.replace("/login.html");
  }
}

async function adjustKey(userId, hours) {
  try {
    await api("/api/admin/free-key", { method:"POST", body:JSON.stringify({ user_id:Number(userId), hours_delta:Number(hours) }) });
    flash(`${hours > 0 ? "Added" : "Removed"} ${Math.abs(hours)} hour(s) from Free Key.`);
    await loadUsers();
  } catch (error) { flash(error.message, "error"); }
}

async function setPremium(userId, days) {
  try {
    await api("/api/admin/user-update", { method:"POST", body:JSON.stringify({ user_id:Number(userId), plan:"premium", duration_days:Number(days) }) });
    flash(`Premium activated for ${days} day(s).`);
    await loadUsers();
  } catch (error) { flash(error.message, "error"); }
}

async function removePremium(userId) {
  try {
    await api("/api/admin/user-update", { method:"POST", body:JSON.stringify({ user_id:Number(userId), plan:"free" }) });
    flash("Premium removed. User returned to Free plan.");
    await loadUsers();
  } catch (error) { flash(error.message, "error"); }
}

async function logout() {
  try { await api("/api/logout", { method:"POST" }); }
  finally { window.location.replace("/login.html?logged_out=1"); }
}

function setupEvents() {
  $("#searchBtn")?.addEventListener("click", loadUsers);
  $("#userSearch")?.addEventListener("keydown", event => { if (event.key === "Enter") loadUsers(); });
  $("#logoutBtn")?.addEventListener("click", logout);

  $("#adminUsersBody")?.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button || button.disabled) return;
    const id = button.dataset.id;
    const action = button.dataset.action;
    if (action === "add-key") adjustKey(id, Number(button.dataset.hours));
    if (action === "premium") {
      const row = button.closest("tr");
      const select = row?.querySelector(".duration-select");
      setPremium(id, Number(select?.value || 7));
    }
    if (action === "free") removePremium(id);
  });
}

async function init() {
  try {
    const me = await api("/api/me");
    if (!me.user || String(me.user.role).toLowerCase() !== "admin") {
      window.location.replace(me.user ? "/dashboard.html" : "/login.html");
      return;
    }
    setupEvents();
    await loadUsers();
  } catch (error) {
    console.error(error);
    window.location.replace("/login.html");
  }
}

document.addEventListener("DOMContentLoaded", init);
