const appRoot = document.getElementById("appRoot");
const logoutBtn = document.getElementById("logoutBtn");
const API_BASE = "/api";
let notificationPollTimer = null;
let adminOverviewPollTimer = null;
let adminSectionPollTimer = null;
let counselorAnalyticsPollTimer = null;
let counselorCalendarPollTimer = null;
let counselorChartDaily = null;
let counselorChartMonthly = null;
let adminChartDaily = null;
let adminChartMonthly = null;
let counselorDashPollTimer = null;
let adminDashPollTimer = null;
let counselorDashChartDaily = null;
let adminDashChartMini = null;

console.log("SCRIPT IS WORKING");

console.log(typeof Chart);
function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Cap scrollable data sections (~20 rows) and mark containers that overflow. */
function refreshScrollableDataSections(scope) {
  const root = scope || document;
  requestAnimationFrame(() => {
    root.querySelectorAll(".table-wrap, .data-scroll-panel").forEach((el) => {
      const overflows = el.scrollHeight > el.clientHeight + 2;
      el.classList.toggle("has-more-below", overflows);
      el.setAttribute("aria-busy", "false");
    });
  });
}

function setCreateAccountFeedback(message, type = "") {
  const el = document.getElementById("createAccountMsg");
  if (!el) return;
  el.textContent = message || "";
  el.hidden = !message;
  el.className = "create-account-feedback";
  if (type === "success") el.classList.add("create-account-feedback--success");
  if (type === "error") el.classList.add("create-account-feedback--error");
}

let gcoConfirmModalEl = null;
let gcoConfirmResolve = null;

function ensureConfirmDialog() {
  if (gcoConfirmModalEl) return gcoConfirmModalEl;
  const modal = document.createElement("div");
  modal.id = "gcoConfirmModal";
  modal.className = "modal hidden";
  modal.setAttribute("role", "alertdialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "gcoConfirmTitle");
  modal.setAttribute("aria-describedby", "gcoConfirmMessage");
  modal.innerHTML = `
    <div class="modal-content confirm-dialog" role="document">
      <div class="confirm-dialog__header">
        <div class="confirm-dialog__icon" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" focusable="false">
            <path fill="currentColor" d="M12 2L1 21h22L12 2zm0 4.5L19.5 19h-15L12 6.5zM11 10v5h2v-5h-2zm0 7v2h2v-2h-2z"/>
          </svg>
        </div>
        <h3 id="gcoConfirmTitle"></h3>
        <p id="gcoConfirmMessage" class="confirm-dialog__message"></p>
      </div>
      <p id="gcoConfirmDetail" class="confirm-dialog__detail hidden"></p>
      <div class="confirm-dialog__actions">
        <button type="button" class="confirm-dialog__btn confirm-dialog__btn--cancel" id="gcoConfirmCancel">Cancel</button>
        <button type="button" class="confirm-dialog__btn confirm-dialog__btn--danger" id="gcoConfirmOk">Confirm</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const close = (result) => {
    modal.classList.add("hidden");
    modal.style.display = "none";
    document.body.classList.remove("modal-open");
    const resolve = gcoConfirmResolve;
    gcoConfirmResolve = null;
    resolve?.(result);
  };
  document.getElementById("gcoConfirmCancel").onclick = () => close(false);
  document.getElementById("gcoConfirmOk").onclick = () => close(true);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close(false);
  });
  document.addEventListener("keydown", (e) => {
    if (!gcoConfirmResolve || modal.classList.contains("hidden")) return;
    if (e.key === "Escape") close(false);
  });
  gcoConfirmModalEl = modal;
  return modal;
}

/** Styled warning dialog; returns true if the user confirms. */
function showConfirmDialog({
  title = "Are you sure?",
  message = "This action cannot be undone.",
  detail = "",
  confirmLabel = "Confirm",
  cancelLabel = "Cancel"
} = {}) {
  const modal = ensureConfirmDialog();
  document.getElementById("gcoConfirmTitle").textContent = title;
  document.getElementById("gcoConfirmMessage").textContent = message;
  const detailEl = document.getElementById("gcoConfirmDetail");
  if (detail) {
    detailEl.textContent = detail;
    detailEl.classList.remove("hidden");
  } else {
    detailEl.textContent = "";
    detailEl.classList.add("hidden");
  }
  document.getElementById("gcoConfirmCancel").textContent = cancelLabel;
  const okBtn = document.getElementById("gcoConfirmOk");
  okBtn.textContent = confirmLabel;
  return new Promise((resolve) => {
    gcoConfirmResolve = resolve;
    modal.classList.remove("hidden");
    modal.style.display = "flex";
    document.body.classList.add("modal-open");
    okBtn.focus();
  });
}

function renderAdminUsersTableRows(users) {
  return (users || [])
    .map(
      (u) =>
        `<tr><td>${u.id}</td><td>${escapeHtml(u.full_name)}</td><td>${escapeHtml(u.email)}</td><td>${escapeHtml(u.role)}</td><td>${u.is_active ? "Active" : "Inactive"}</td><td><button type="button" class="btn danger admin-delete-user" data-id="${u.id}" data-email="${escapeHtml(u.email)}" data-name="${escapeHtml(u.full_name)}">Delete</button></td></tr>`
    )
    .join("");
}

const ADMIN_USERS_PER_PAGE = 10;

function sortUsersById(users) {
  return [...(users || [])].sort((a, b) => Number(a.id) - Number(b.id));
}

function getAdminUsersPageData(users, page = 1, perPage = ADMIN_USERS_PER_PAGE) {
  const sorted = sortUsersById(users);
  const totalPages = Math.max(1, Math.ceil(sorted.length / perPage));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * perPage;
  return {
    page: safePage,
    totalPages,
    total: sorted.length,
    rows: sorted.slice(start, start + perPage),
    rangeStart: sorted.length ? start + 1 : 0,
    rangeEnd: Math.min(start + perPage, sorted.length)
  };
}

function renderAdminUsersPagination(pageData) {
  const info = `<p class="muted tiny admin-users-page-info">Showing ${pageData.rangeStart}–${pageData.rangeEnd} of ${pageData.total} users</p>`;
  if (pageData.totalPages <= 1) return info;
  return `
    <div class="admin-users-pagination">
      ${info}
      <div class="auth-actions admin-users-page-actions">
        <button type="button" class="btn ghost" id="adminUsersPrev" ${pageData.page <= 1 ? "disabled" : ""}>Previous</button>
        <span class="muted tiny">Page ${pageData.page} of ${pageData.totalPages}</span>
        <button type="button" class="btn ghost" id="adminUsersNext" ${pageData.page >= pageData.totalPages ? "disabled" : ""}>Next</button>
      </div>
    </div>`;
}

function wireAdminUsersPagination(root, menu, users) {
  const prev = document.getElementById("adminUsersPrev");
  const next = document.getElementById("adminUsersNext");
  const paintPage = async (page) => {
    state.adminUsersPage = page;
    const pageData = getAdminUsersPageData(users, page);
    const tbody = document.querySelector("#adminUsersTable tbody");
    const pager = document.getElementById("adminUsersPager");
    if (tbody) tbody.innerHTML = renderAdminUsersTableRows(pageData.rows);
    if (pager) pager.innerHTML = renderAdminUsersPagination(pageData);
    wireAdminDeleteUserButtons(root, menu);
    wireAdminUsersPagination(root, menu, users);
    refreshScrollableDataSections(root);
  };
  if (prev) prev.onclick = () => paintPage(state.adminUsersPage - 1);
  if (next) next.onclick = () => paintPage(state.adminUsersPage + 1);
}

async function refreshCounselorRequestsBadge() {
  if (state.user?.role !== "counselor") return;
  try {
    await loadAppointments();
    const count = (state.appointments || []).filter((a) => a.status === "pending").length;
    const badge = document.getElementById("counselorRequestsBadge");
    if (!badge) return;
    if (count > 0) {
      badge.textContent = count > 99 ? "99+" : String(count);
      badge.classList.remove("hidden");
      badge.setAttribute("aria-label", `${count} open request${count === 1 ? "" : "s"}`);
    } else {
      badge.textContent = "";
      badge.classList.add("hidden");
      badge.removeAttribute("aria-label");
    }
  } catch (_e) {
    /* ignore */
  }
}

function wireAdminDeleteUserButtons(root, menu) {
  root.querySelectorAll(".admin-delete-user").forEach((btn) => {
    btn.onclick = async () => {
      const name = btn.dataset.name || "this user";
      const email = btn.dataset.email || "";
      const ok = await showConfirmDialog({
        title: "Delete user account?",
        message: `You are about to permanently delete ${name}.`,
        detail: email
          ? `${email}\n\nAll linked appointments and notifications will be removed. This cannot be undone.`
          : "All linked appointments and notifications will be removed. This cannot be undone.",
        confirmLabel: "Yes, delete user",
        cancelLabel: "Keep user"
      });
      if (!ok) return;
      const msg = document.getElementById("adminUserMsg");
      try {
        await api(`/admin/users/${btn.dataset.id}`, { method: "DELETE" });
        if (msg) {
          msg.textContent = "User deleted successfully.";
          msg.className = "feedback status-success";
        }
        await renderAdminView(root, menu);
      } catch (err) {
        if (msg) {
          msg.textContent = err.message;
          msg.className = "feedback feedback-error";
        }
      }
    };
  });
}

/** Normalize API date values (YYYY-MM-DD or ISO strings) for display */
function formatDisplayDate(val) {
  if (val == null || val === "") return "—";
  const s = String(val).trim();
  const ymd = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (ymd) return ymd[1];
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  return s;
}

function formatDisplayTime(val) {
  if (val == null || val === "") return "—";
  const s = String(val).trim();
  if (/^\d{2}:\d{2}/.test(s)) return s.slice(0, 5);
  return s;
}

function renderOutcomePill(outcome) {
  if (!outcome) return "";
  const o = String(outcome).toLowerCase();
  const label = o === "no_show" ? "No-show" : o.charAt(0).toUpperCase() + o.slice(1);
  return `<span class="outcome-pill ${escapeHtml(o)}">${escapeHtml(label)}</span>`;
}

/** Student history: show counselor outcome (done/referred/no-show) when session is closed. */
function renderStudentHistoryStatus(a) {
  if (a.outcome) return renderOutcomePill(a.outcome);
  const s = String(a.status || "").toLowerCase();
  const label =
    s === "reschedule_requested" ? "Reschedule requested" : s ? s.charAt(0).toUpperCase() + s.slice(1) : "—";
  return `<span class="dash-status-badge status-${escapeHtml(s)}">${escapeHtml(label)}</span>`;
}

async function downloadWithAuth(path, filename) {
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const res = await fetch(`${API_BASE}${path}`, { headers, credentials: "include" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.message || "Download failed");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function destroyCounselorAnalyticsCharts() {
  if (counselorChartDaily) {
    counselorChartDaily.destroy();
    counselorChartDaily = null;
  }
  if (counselorChartMonthly) {
    counselorChartMonthly.destroy();
    counselorChartMonthly = null;
  }
}

function destroyAdminAnalyticsCharts() {
  if (adminChartDaily) {
    adminChartDaily.destroy();
    adminChartDaily = null;
  }
  if (adminChartMonthly) {
    adminChartMonthly.destroy();
    adminChartMonthly = null;
  }
}

function destroyCounselorDashCharts() {
  if (counselorDashChartDaily) {
    counselorDashChartDaily.destroy();
    counselorDashChartDaily = null;
  }
}

function destroyAdminDashCharts() {
  if (adminDashChartMini) {
    adminDashChartMini.destroy();
    adminDashChartMini = null;
  }
}

function stopCounselorDashPolling() {
  if (counselorDashPollTimer) {
    clearInterval(counselorDashPollTimer);
    counselorDashPollTimer = null;
  }
}

function stopAdminDashPolling() {
  if (adminDashPollTimer) {
    clearInterval(adminDashPollTimer);
    adminDashPollTimer = null;
  }
}

function stopCounselorCalendarPolling() {
  if (counselorCalendarPollTimer) {
    clearInterval(counselorCalendarPollTimer);
    counselorCalendarPollTimer = null;
  }
}

function bindOrUpdateLineChart(existingRef, canvasId, labels, values, datasetLabel, borderColor) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return null;
  if (existingRef) {
    existingRef.data.labels = labels;
    existingRef.data.datasets[0].data = values;
    existingRef.data.datasets[0].label = datasetLabel;
    existingRef.update();
    return existingRef;
  }
  const ctx = canvas.getContext("2d");
  return new Chart(ctx, {
    type: "line",
    data: {
      labels,
      datasets: [
        {
          label: datasetLabel,
          data: values,
          borderColor: borderColor,
          backgroundColor: borderColor === "#1a367c" ? "rgba(26,54,124,0.12)" : "rgba(184,137,27,0.15)",
          tension: 0.25,
          fill: true
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: { y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 8 } } }
    }
  });
}

const state = {
  currentRole: null,
  activeMenu: null,
  darkMode: false,
  token: localStorage.getItem("gco_token") || null,
  user: JSON.parse(localStorage.getItem("gco_user") || "null"),
  appointments: [],
  notifications: [],
  importProfiles: [],
  users: [],
  adminOverview: null,
  counselorAnalytics: null,
  counselors: [],
  counselorUnavail: [],
  profilePicture: "",
  lastSeenNotificationCount: Number(localStorage.getItem("gco_last_seen_notif_count") || 0),
  adminUsersPage: 1,
  adminApptSearch: "",
  adminApptStatusFilter: "all",
  adminApptCounselorFilter: "all",
  adminCalendarPage: "view",
  adminCalendarCounselorId: null,
  counselorCalendarPage: "view",
  counselorCalendarProxyId: null,
  counselorCalendarRenderOpts: null
};

const DASHBOARD_MENUS = {
  student: ["Dashboard", "GCO Services", "Book Appointment", "Appointment History", "Notifications", "Settings"],
  counselor: ["Dashboard", "GCO Services", "Requests", "Availability", "Analytics", "Notifications", "Settings"],
  admin: [
    "Dashboard",
    "GCO Services",
    "Analytics",
    "Reports",
    "System Logs",
    "Users",
    "Calendars",
    "Appointments",
    "Notifications",
    "Settings"
  ]
};

const MENU_SLUGS_BY_ROLE = {
  student: {
    Dashboard: "home",
    "GCO Services": "services",
    "Book Appointment": "book",
    "Appointment History": "history",
    Notifications: "notifications",
    Settings: "settings"
  },
  counselor: {
    Dashboard: "home",
    "GCO Services": "services",
    Requests: "requests",
    Availability: "availability",
    Analytics: "analytics",
    Notifications: "notifications",
    Settings: "settings"
  },
  admin: {
    Dashboard: "home",
    "GCO Services": "services",
    Analytics: "analytics",
    Reports: "reports",
    "System Logs": "logs",
    Users: "users",
    Calendars: "calendars",
    Appointments: "appointments",
    Notifications: "notifications",
    Settings: "settings"
  }
};

function menuToSlug(role, menu) {
  return MENU_SLUGS_BY_ROLE[role]?.[menu] || "home";
}

function slugToMenu(role, slug) {
  const map = MENU_SLUGS_BY_ROLE[role];
  if (!map) return null;
  const hit = Object.entries(map).find(([, s]) => s === slug);
  return hit ? hit[0] : null;
}

function getDashboardPath(role, menu) {
  return `/dashboard/${role}/${menuToSlug(role, menu)}`;
}

function parseDashboardPath(pathname) {
  const p = (pathname || "").replace(/\/$/, "") || "/";
  const m = p.match(/^\/dashboard\/(student|counselor|admin)\/([a-z0-9-]+)$/);
  if (!m) return null;
  return { role: m[1], slug: m[2] };
}

function setDashboardDocumentTitle(menuLabel) {
  document.title = `${menuLabel} · XU GCO`;
}

function syncDashboardUrl(role, menu, mode) {
  const url = getDashboardPath(role, menu);
  if (mode === "replace") history.replaceState({ role, menu }, "", url);
  else if (mode === "push") history.pushState({ role, menu }, "", url);
  setDashboardDocumentTitle(menu);
}

/** Update main panel only when the dashboard shell is already mounted (keeps sidebar DOM stable). */
function applyDashboardSection(role, menu) {
  const viewRoot = document.getElementById("viewRoot");
  const menuNav = document.getElementById("menuNav");
  if (!viewRoot || !menuNav) return false;
  menuNav.querySelectorAll(".menu-btn").forEach((btn) => {
    const label = btn.dataset.menuLabel ?? btn.textContent;
    btn.classList.toggle("active", label === menu);
  });
  renderViewByRole(role, menu).catch((err) => {
    viewRoot.innerHTML = `<p class="feedback feedback-error">${err.message}</p>`;
  });
  return true;
}

function navigateDashboard(role, menu, urlMode = "push") {
  state.activeMenu = menu;
  syncDashboardUrl(role, menu, urlMode);
  if (applyDashboardSection(role, menu)) return;
  renderDashboard(role);
}

function bindSidebarToggleMobile() {
  const sidebar = document.getElementById("sidebarNav");
  const toggle = document.getElementById("sidebarToggle");
  const overlay = document.getElementById("sidebarOverlay");
  if (!sidebar || !toggle || !overlay) return;
  const close = () => {
    sidebar.classList.remove("sidebar-open");
    overlay.classList.remove("sidebar-overlay-visible");
    overlay.setAttribute("aria-hidden", "true");
    toggle.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    sidebar.classList.add("sidebar-open");
    overlay.classList.add("sidebar-overlay-visible");
    overlay.setAttribute("aria-hidden", "false");
    toggle.setAttribute("aria-expanded", "true");
  };
  toggle.onclick = () => {
    if (sidebar.classList.contains("sidebar-open")) close();
    else open();
  };
  overlay.onclick = close;
  sidebar.querySelectorAll(".menu-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.matchMedia("(max-width: 900px)").matches) close();
    });
  });
}

function resolveInitialDashboardMenu(userRole, pathname) {
  const menus = DASHBOARD_MENUS[userRole];
  let menu = menus[0];
  const parsed = parseDashboardPath(pathname);
  if (parsed) {
    const m = slugToMenu(userRole, parsed.slug);
    if (m && menus.includes(m)) menu = m;
  }
  return menu;
}

let authProvidersCache = null;
async function getAuthProviders() {
  if (authProvidersCache) return authProvidersCache;
  try {
    const r = await fetch(`${API_BASE}/auth/providers`, { credentials: "include" });
    authProvidersCache = r.ok ? await r.json() : { password: true, google: false };
  } catch {
    authProvidersCache = { password: true, google: false };
  }
  return authProvidersCache;
}

function clearAuthProvidersCache() {
  authProvidersCache = null;
}

async function api(path, options = {}) {
  const headers = { "Content-Type": "application/json", ...(options.headers || {}) };
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...options, headers, credentials: "include" });
  } catch (_networkError) {
    throw new Error("Cannot reach API. Open the app via http://localhost:3000 (not file://).");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Request failed");
  return data;
}

async function apiUpload(path, formData) {
  const headers = state.token ? { Authorization: `Bearer ${state.token}` } : {};
  const response = await fetch(`${API_BASE}${path}`, { method: "POST", headers, body: formData, credentials: "include" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.message || "Upload failed");
  return data;
}

function setupLogoDisplay() {
  const logoImg = document.getElementById("schoolLogo");
  const logoFallback = document.getElementById("logoFallback");
  if (!logoImg || !logoFallback) return;

  const showImage = () => {
    logoImg.style.display = "block";
    logoFallback.style.display = "none";
  };
  const showFallback = () => {
    logoImg.style.display = "none";
    logoFallback.style.display = "grid";
  };

  // Image may already be cached and loaded before listeners attach.
  if (logoImg.complete) {
    if (logoImg.naturalWidth > 0) showImage();
    else showFallback();
  }

  logoImg.addEventListener("load", showImage);
  logoImg.addEventListener("error", showFallback);
}

function setDarkMode(enabled) {
  state.darkMode = enabled;
  if (enabled) {
    document.body.classList.add("dark-mode");
    localStorage.setItem("gco_dark_mode", "1");
  } else {
    document.body.classList.remove("dark-mode");
    localStorage.removeItem("gco_dark_mode");
  }
}

if (localStorage.getItem("gco_dark_mode") === "1") {
  state.darkMode = true;
  document.addEventListener("DOMContentLoaded", () => document.body.classList.add("dark-mode"));
  if (document.body) document.body.classList.add("dark-mode");
}

function getRequiredDomainByRole(role) {
  if (role === "student") return "my.xu.edu.ph";
  if (role === "counselor" || role === "admin") return "xu.edu.ph";
  return "";
}

function isValidUniversityEmailForRole(email, role) {
  const requiredDomain = getRequiredDomainByRole(role);
  return email.trim().toLowerCase().endsWith(`@${requiredDomain}`);
}

function validateStrongPassword(password) {
  const value = String(password || "");
  if (value.length < 10) return { ok: false, message: "Password must be at least 10 characters." };
  if (!/[a-z]/.test(value)) return { ok: false, message: "Password must include a lowercase letter." };
  if (!/[A-Z]/.test(value)) return { ok: false, message: "Password must include an uppercase letter." };
  if (!/\d/.test(value)) return { ok: false, message: "Password must include a number." };
  if (!/[^A-Za-z0-9]/.test(value)) return { ok: false, message: "Password must include a special character." };
  return { ok: true, message: "Strong password." };
}

const PASSWORD_EYE_ICON_SHOW = `<svg class="password-eye-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zm0 12.5c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>`;
const PASSWORD_EYE_ICON_HIDE = `<svg class="password-eye-icon" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false"><path fill="currentColor" d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16c.59-.22 1.22-.36 1.86-.36zM2 4.27l2.28 2.28.46.46A11.87 11.87 0 0 0 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42 2.06 2.06 1.27-1.27L3.27 3 2 4.27zM7.53 9.8l1.55 1.55a3.01 3.01 0 0 0 4.31 4.31l1.55 1.55a5 5 0 0 1-6.72-6.72L7.53 9.8zm4.31-.78 3.15 3.15.02-.16a3 3 0 0 0-3.17-2.99z"/></svg>`;

function setPasswordToggleState(toggle, input, label, visible) {
  toggle.innerHTML = visible ? PASSWORD_EYE_ICON_HIDE : PASSWORD_EYE_ICON_SHOW;
  toggle.setAttribute("aria-pressed", visible ? "true" : "false");
  toggle.setAttribute("aria-label", `${visible ? "Hide" : "Show"} ${label}`);
  toggle.title = visible ? "Hide password" : "Show password";
}

function attachPasswordToggle(input, label = "password") {
  if (!input || input.dataset.enhanced === "1") return;
  const wrap = document.createElement("div");
  wrap.className = "password-input-wrap";
  input.parentNode.insertBefore(wrap, input);
  wrap.appendChild(input);
  const toggle = document.createElement("button");
  toggle.type = "button";
  toggle.className = "password-eye-btn";
  setPasswordToggleState(toggle, input, label, false);
  toggle.onclick = () => {
    const toText = input.type === "password";
    input.type = toText ? "text" : "password";
    setPasswordToggleState(toggle, input, label, toText);
  };
  wrap.appendChild(toggle);
  input.dataset.enhanced = "1";
}

function attachPasswordStrength(input, indicatorEl) {
  if (!input || !indicatorEl) return;
  const update = () => {
    if (!input.value) {
      indicatorEl.textContent = "Use 10+ chars, upper/lowercase, number, and special character.";
      indicatorEl.className = "muted tiny";
      return;
    }
    const check = validateStrongPassword(input.value);
    indicatorEl.textContent = check.message;
    indicatorEl.className = check.ok ? "feedback status-success tiny" : "feedback feedback-error tiny";
  };
  input.addEventListener("input", update);
  update();
}

const YEAR_LEVEL_OPTIONS = ["1st Year", "2nd Year", "3rd Year", "4th Year"];
const COLLEGE_OPTIONS = [
  "College of Arts and Sciences",
  "College of Computer Studies",
  "School of Education",
  "School of Law",
  "College of Engineering",
  "School of Business and Management",
  "School of Medicine",
  "College of Nursing",
  "College of Agriculture"
];

function setAuthLayoutMode(on) {
  appRoot.classList.toggle("auth-centered", Boolean(on));
  appRoot.classList.remove("auth-fullbleed");
}

function renderRoleSelect() {
  document.title = "XU GCO";
  setAuthLayoutMode(true);
  const tpl = document.getElementById("roleSelectTpl")?.content.cloneNode(true);
  if (!tpl) return;
  appRoot.innerHTML = "";
  appRoot.appendChild(tpl);
  logoutBtn.classList.add("hidden");

  const msgEl = document.getElementById("roleSelectMessage");
  const params = new URLSearchParams(window.location.search);
  if (params.get("err") === "role" && msgEl) {
    msgEl.classList.remove("hidden");
    msgEl.textContent = "Choose Student, Counselor, or Admin first.";
    msgEl.className = "feedback feedback-error";
  }

  document.querySelectorAll(".role-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      state.currentRole = btn.dataset.role;
      if (state.currentRole === "student") {
        renderStudentLogin();
        return;
      }
      renderLogin(state.currentRole);
    });
  });
}

function renderStudentLogin() {
  setAuthLayoutMode(true);
  const tpl = document.getElementById("studentLoginTpl")?.content.cloneNode(true);
  if (!tpl) return;
  appRoot.innerHTML = "";
  appRoot.appendChild(tpl);
  logoutBtn.classList.add("hidden");

  const msgEl = document.getElementById("studentGoogleMessage");
  const googleBtn = document.getElementById("studentGoogleBtn");
  const backBtn = document.getElementById("studentBackBtn");

  googleBtn?.addEventListener("click", () => {
    state.currentRole = "student";
    startStudentGoogleSignIn(msgEl);
  });
  backBtn?.addEventListener("click", () => {
    renderRoleSelect();
  });
}

function startStudentGoogleSignIn(msgEl) {
  getAuthProviders()
    .then((p) => {
      if (!p.google) {
        if (msgEl) {
          msgEl.classList.remove("hidden");
          msgEl.textContent =
            "Google sign-in is not configured yet. Set ENABLE_GOOGLE_OAUTH=true and valid GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET in .env, then restart.";
          msgEl.className = "feedback feedback-error";
        }
        return;
      }
      window.location.href = "/auth/google/start?role=student";
    })
    .catch(() => {
      if (msgEl) {
        msgEl.classList.remove("hidden");
        msgEl.textContent = "Cannot reach server.";
        msgEl.className = "feedback feedback-error";
      }
    });
}

function renderLogin(role) {
  setAuthLayoutMode(true);
  const tpl = document.getElementById("loginTpl")?.content.cloneNode(true);
  if (!tpl) return;
  appRoot.innerHTML = "";
  appRoot.appendChild(tpl);
  logoutBtn.classList.add("hidden");

  const label = document.getElementById("loginRoleLabel");
  if (label) label.textContent = role.charAt(0).toUpperCase() + role.slice(1);

  const form = document.getElementById("loginForm");
  const signupForm = document.getElementById("signupForm");
  const message = document.getElementById("loginMessage");
  const signupMessage = document.getElementById("signupMessage");
  const emailInput = document.getElementById("email");
  const passwordInput = document.getElementById("password");
  const signupNameInput = document.getElementById("signupFullName");
  const signupEmailInput = document.getElementById("signupEmail");
  const signupPasswordInput = document.getElementById("signupPassword");
  const signupPasswordField = signupPasswordInput?.closest(".field");
  const showSignupBtn = document.getElementById("showSignupBtn");
  const showLoginBtn = document.getElementById("showLoginBtn");
  const loginPane = document.getElementById("loginPane");
  const signupPane = document.getElementById("signupPane");
  const roleEmailHint = document.getElementById("roleEmailHint");
  if (roleEmailHint) roleEmailHint.textContent = "@xu.edu.ph";
  attachPasswordToggle(passwordInput, "login password");
  attachPasswordToggle(signupPasswordInput, "signup password");
  if (signupPasswordField) {
    const signupStrength = document.createElement("p");
    signupStrength.id = "signupPasswordStrength";
    signupStrength.className = "muted tiny";
    signupPasswordField.appendChild(signupStrength);
    attachPasswordStrength(signupPasswordInput, signupStrength);
  }



  const openPane = (name) => {
    const loginOpen = name === "login";
    loginPane.classList.toggle("hidden", !loginOpen);
    signupPane.classList.toggle("hidden", loginOpen);
  };
  showSignupBtn?.addEventListener("click", () => openPane("signup"));
  showLoginBtn?.addEventListener("click", () => openPane("login"));

  if (role === "counselor" || role === "admin") {
    if (showSignupBtn) {
      showSignupBtn.remove();
    }
    if (signupPane) {
      signupPane.classList.add("hidden");
      signupPane.remove();
    }
    if (loginPane) loginPane.classList.remove("hidden");
  }

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const email = emailInput.value.trim().toLowerCase();
    const password = passwordInput.value;

    if (!isValidUniversityEmailForRole(email, role)) {
      message.textContent = `Use @${getRequiredDomainByRole(role)} for this portal.`;
      message.className = "feedback feedback-error";
      return;
    }

    api("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password, role })
    })
      .then((result) => {
        state.token = result.token;
        state.user = result.user;
        localStorage.setItem("gco_token", result.token);
        localStorage.setItem("gco_user", JSON.stringify(result.user));
        message.textContent = "Success. Loading dashboard…";
        message.className = "feedback status-success";
        const ur = result.user.role;
        state.activeMenu = DASHBOARD_MENUS[ur][0];
        history.replaceState(null, "", getDashboardPath(ur, state.activeMenu));
        setDashboardDocumentTitle(state.activeMenu);
        setTimeout(() => renderDashboard(ur), 200);
      })
      .catch((err) => {
        message.textContent = err.message;
        message.className = "feedback feedback-error";
      });
  });

  signupForm?.addEventListener("submit", (e) => {
    e.preventDefault();
    const fullName = signupNameInput.value.trim();
    const email = signupEmailInput.value.trim().toLowerCase();
    const password = signupPasswordInput.value;
    if (!fullName || !email || !password) return;
    if (!isValidUniversityEmailForRole(email, role)) {
      signupMessage.textContent = "Use @xu.edu.ph email.";
      signupMessage.className = "feedback feedback-error";
      return;
    }
    const strong = validateStrongPassword(password);
    if (!strong.ok) {
      signupMessage.textContent = strong.message;
      signupMessage.className = "feedback feedback-error";
      return;
    }
    api("/auth/signup", {
      method: "POST",
      body: JSON.stringify({ fullName, email, password, role })
    })
      .then((out) => {
        signupMessage.textContent = out.message || "Sign-up successful. Check your email.";
        signupMessage.className = "feedback status-success";
      })
      .catch((err) => {
        signupMessage.textContent = err.message;
        signupMessage.className = "feedback feedback-error";
      });
  });

  document.getElementById("backBtn").addEventListener("click", renderRoleSelect);
}

function renderDashboard(role) {
  setAuthLayoutMode(false);
  const tpl = document.getElementById("dashboardTpl").content.cloneNode(true);
  appRoot.innerHTML = "";
  appRoot.appendChild(tpl);
  logoutBtn.classList.remove("hidden");
  setupNotificationBell(role);
  logoutBtn.onclick = () => {
    if (notificationPollTimer) {
      clearInterval(notificationPollTimer);
      notificationPollTimer = null;
    }
    if (adminOverviewPollTimer) {
      clearInterval(adminOverviewPollTimer);
      adminOverviewPollTimer = null;
    }
    if (adminSectionPollTimer) {
      clearInterval(adminSectionPollTimer);
      adminSectionPollTimer = null;
    }
    if (counselorAnalyticsPollTimer) {
      clearInterval(counselorAnalyticsPollTimer);
      counselorAnalyticsPollTimer = null;
    }
    stopCounselorDashPolling();
    stopAdminDashPolling();
    stopCounselorCalendarPolling();
    destroyCounselorAnalyticsCharts();
    destroyCounselorDashCharts();
    destroyAdminAnalyticsCharts();
    destroyAdminDashCharts();
    state.currentRole = null;
    state.activeMenu = null;
    state.token = null;
    state.user = null;
    localStorage.removeItem("gco_token");
    localStorage.removeItem("gco_user");
    clearAuthProvidersCache();
    const bell = document.getElementById("notifBellBtn");
    if (bell) bell.classList.add("hidden");
    window.location.href = "/auth/logout";
  };

  const menusByRole = DASHBOARD_MENUS;
  const roleDescriptions = {
    student: "Appointments and updates.",
    counselor: "Requests and schedules.",
    admin: "Oversee records, users, and schedules."
  };

  document.getElementById("roleDashboardLabel").textContent = state.user?.name || "User";
  const sidebarMeta = document.getElementById("sidebarUserMeta");
  if (sidebarMeta) {
    sidebarMeta.textContent = `${state.user?.email || ""} · ${role}`;
  }
  const sidebarDesc = document.getElementById("sidebarRoleDesc");
  if (sidebarDesc) sidebarDesc.textContent = roleDescriptions[role] || "";
  refreshSidebarIdentity();
  const menuNav = document.getElementById("menuNav");
  if (!state.activeMenu || !menusByRole[role].includes(state.activeMenu)) {
    state.activeMenu = menusByRole[role][0];
  }

  menusByRole[role].forEach((menu) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.menuLabel = menu;
    btn.className = `menu-btn ${menu === state.activeMenu ? "active" : ""}`;
    if (role === "counselor" && menu === "Requests") {
      btn.innerHTML = `<span class="menu-btn-label">${menu}</span><span class="menu-badge hidden" id="counselorRequestsBadge"></span>`;
    } else {
      btn.textContent = menu;
    }
    btn.onclick = () => {
      navigateDashboard(role, menu, "push");
    };
    menuNav.appendChild(btn);
  });

  bindSidebarToggleMobile();

  renderViewByRole(role, state.activeMenu).catch((err) => {
    const root = document.getElementById("viewRoot");
    root.innerHTML = `<p class="feedback feedback-error">${err.message}</p>`;
  });
  if (notificationPollTimer) clearInterval(notificationPollTimer);
  notificationPollTimer = setInterval(() => {
    if (!state.user) return;
    loadNotifications().catch(() => {});
    if (state.user.role === "counselor") refreshCounselorRequestsBadge().catch(() => {});
  }, 20000);
  if (role === "counselor") refreshCounselorRequestsBadge().catch(() => {});
}

async function refreshSidebarIdentity() {
  const avatarImg = document.getElementById("sidebarProfileImg");
  const avatarFallback = document.getElementById("sidebarAvatarFallback");
  const label = document.getElementById("roleDashboardLabel");
  if (!avatarImg || !avatarFallback || !label || !state.user) return;
  try {
    const me = await api("/auth/me");
    state.user = { ...(state.user || {}), name: me.name, email: me.email, role: me.role };
    localStorage.setItem("gco_user", JSON.stringify(state.user));
    label.textContent = me.name || "User";
    const initials = String(me.name || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "U";
    avatarFallback.textContent = initials;
    if (me.profilePicture) {
      avatarImg.src = me.profilePicture.startsWith("http") ? me.profilePicture : `/${me.profilePicture}`;
      avatarImg.classList.remove("hidden");
      avatarFallback.classList.add("hidden");
    } else {
      avatarImg.classList.add("hidden");
      avatarFallback.classList.remove("hidden");
    }
  } catch (_err) {
    const initials = String(state.user?.name || "U")
      .split(" ")
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() || "")
      .join("") || "U";
    avatarFallback.textContent = initials;
    avatarImg.classList.add("hidden");
    avatarFallback.classList.remove("hidden");
  }
}

async function renderViewByRole(role, menu) {
  const root = document.getElementById("viewRoot");
  if (!root) return;
  root.classList.remove("view-anim-in");
  // force reflow so the animation restarts on every tab change
  void root.offsetWidth;
  root.classList.add("view-anim-in");
  if (role === "student") await renderStudentView(root, menu);
  else if (role === "counselor") await renderCounselorView(root, menu);
  else if (role === "admin") await renderAdminView(root, menu);
  refreshScrollableDataSections(root);
}

async function loadAppointments() {
  state.appointments = await api("/appointments/my");
}

async function loadNotifications() {
  state.notifications = await api("/notifications/my");
  if (state.notifications.length > state.lastSeenNotificationCount) {
    const newest = state.notifications[0];
    if (newest) showToast(`${newest.title}: ${newest.message}`);
  }
  state.lastSeenNotificationCount = state.notifications.length;
  localStorage.setItem("gco_last_seen_notif_count", String(state.lastSeenNotificationCount));
  refreshNotificationBell();
}

function refreshNotificationBell() {
  const bell = document.getElementById("notifBellBtn");
  const badge = document.getElementById("notifBellBadge");
  if (!bell || !badge) return;
  const unread = (state.notifications || []).filter((n) => !n.is_read).length;
  if (unread > 0) {
    badge.textContent = unread > 99 ? "99+" : String(unread);
    badge.classList.remove("hidden");
    bell.classList.add("has-unread");
    bell.setAttribute("aria-label", `${unread} unread notifications`);
  } else {
    badge.classList.add("hidden");
    bell.classList.remove("has-unread");
    bell.setAttribute("aria-label", "Notifications");
  }
}

function setupNotificationBell(role) {
  const bell = document.getElementById("notifBellBtn");
  if (!bell) return;
  bell.classList.remove("hidden");
  bell.onclick = () => {
    if (!state.user) return;
    const menus = DASHBOARD_MENUS[role] || [];
    if (!menus.includes("Notifications")) return;
    navigateDashboard(role, "Notifications", "push");
  };
  loadNotifications().catch(() => {});
}

async function loadCounselors() {
  state.counselors = await api("/utility/counselors");
}

function showToast(message) {
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add("visible"), 10);
  setTimeout(() => {
    el.classList.remove("visible");
    setTimeout(() => el.remove(), 250);
  }, 2800);
}

function isLimitedSlotCoverage(slots, dayWindow) {
  if (!dayWindow || !slots?.length) return false;
  const segments = getBookableSegments(dayWindow.start, dayWindow.end, dayWindow.breaks);
  const totalBookable = segments.reduce((acc, seg) => acc + (seg.end - seg.start), 0);
  if (totalBookable <= 0) return false;
  const slotMins = slots.reduce(
    (acc, s) => acc + Math.max(0, timeToMinutes(s.endTime) - timeToMinutes(s.startTime)),
    0
  );
  return slotMins > 0 && slotMins < totalBookable * 0.85;
}

function buildYearCalendar(year, appointments, unavailable, options = {}) {
  const { disableWeekendBooking, scheduleByDate, activeDate = "", dayWindow = null } = options;
  const counselorMode = Boolean(scheduleByDate);
  const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const week = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];
  const todayIso = new Date().toISOString().slice(0, 10);

  const fullDayBlocks = unavailable.filter((u) => isFullDayUnavailBlock(u));
  const unavailableMap = new Map(fullDayBlocks.map((u) => [String(u.unavailable_date).slice(0, 10), u]));
  const partialDates = new Set(
    unavailable
      .filter((u) => (u.start_time || u.end_time) && !isFullDayUnavailBlock(u))
      .map((u) => String(u.unavailable_date).slice(0, 10))
  );
  const appointmentDates = new Set(appointments.map((a) => String(a.appointment_date).slice(0, 10)));

  const unavailableByDate = new Map();
  const appointmentByDate = new Map();
  if (counselorMode) {
    for (const u of unavailable || []) {
      const key = normalizeCounselorDateKey(u.unavailable_date);
      if (!key) continue;
      if (!unavailableByDate.has(key)) unavailableByDate.set(key, []);
      unavailableByDate.get(key).push(u);
    }
    for (const a of appointments || []) {
      const key = normalizeCounselorDateKey(a.appointment_date);
      if (!key) continue;
      if (!appointmentByDate.has(key)) appointmentByDate.set(key, []);
      appointmentByDate.get(key).push(a);
    }
  }

  const counselorMeta = { scheduleByDate, unavailableByDate, appointmentByDate, dayWindow };

  return monthNames
    .map((monthName, monthIndex) => {
      const firstDay = new Date(year, monthIndex, 1).getDay();
      const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < firstDay; i += 1) cells.push('<div class="month-day empty"></div>');
      for (let day = 1; day <= daysInMonth; day += 1) {
        const iso = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const dow = new Date(year, monthIndex, day).getDay();
        const isWeekend = dow === 0 || dow === 6;
        let classes = ["month-day", "calendar-day-btn"];
        let title = "";

        if (counselorMode) {
          const { status, title: statusTitle, partialBlocked } = getCounselorDayStatus(iso, counselorMeta);
          classes.push(`day-${status}`);
          title = statusTitle;
          if (partialBlocked) classes.push("day-partial-blocked");
          if (iso === todayIso) classes.push("today");
          if (activeDate && iso === activeDate) classes.push("day-active");
        } else {
          classes = ["month-day", "calendar-day-btn"];
          if (disableWeekendBooking && isWeekend) classes.push("weekend-no-book");
          else if (unavailableMap.has(iso)) classes.push("unavailable");
          else if (partialDates.has(iso)) classes.push("partial-unavailable");
          else if (iso === todayIso) classes.push("today");
          else if (appointmentDates.has(iso)) classes.push("booked");
          if (disableWeekendBooking && isWeekend) title = "No bookings on weekends";
          else if (unavailableMap.has(iso)) title = unavailableMap.get(iso).message || "Unavailable all day";
          else if (partialDates.has(iso)) title = "Part-day only — some hours unavailable; other times may be open";
          else if (appointmentDates.has(iso)) title = "With appointments";
          else title = "Available";
        }

        cells.push(`<button type="button" class="${classes.join(" ")}" data-date="${iso}" title="${escapeHtml(title)}">${day}</button>`);
      }
      return `
        <div class="month-card">
          <h3>${monthName}</h3>
          <div class="month-weekdays">${week.map((w) => `<span>${w}</span>`).join("")}</div>
          <div class="month-grid">${cells.join("")}</div>
        </div>
      `;
    })
    .join("");
}

const SESSION_DURATION_OPTIONS = [30, 40, 45, 60, 90];

function timeToMinutes(hhmm) {
  const [h, m] = String(hhmm).slice(0, 5).split(":").map(Number);
  return h * 60 + m;
}

function minutesToTime(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function deriveLunchBreaksFromWindows(windows) {
  if (!windows || windows.length < 2) return [{ start: "12:00", end: "13:00" }];
  const sorted = [...windows].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  const breaks = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    const gapStart = sorted[i].end;
    const gapEnd = sorted[i + 1].start;
    if (timeToMinutes(gapEnd) > timeToMinutes(gapStart)) {
      breaks.push({ start: gapStart, end: gapEnd });
    }
  }
  return breaks.length ? breaks : [{ start: "12:00", end: "13:00" }];
}

function getBookableSegments(rangeStart, rangeEnd, breaks) {
  let segments = [{ start: timeToMinutes(rangeStart), end: timeToMinutes(rangeEnd) }];
  for (const br of breaks || []) {
    const b0 = timeToMinutes(br.start);
    const b1 = timeToMinutes(br.end);
    const next = [];
    for (const seg of segments) {
      if (b1 <= seg.start || b0 >= seg.end) {
        next.push(seg);
        continue;
      }
      if (b0 > seg.start) next.push({ start: seg.start, end: Math.min(b0, seg.end) });
      if (b1 < seg.end) next.push({ start: Math.max(b1, seg.start), end: seg.end });
    }
    segments = next.filter((s) => s.end > s.start);
  }
  return segments.map((s) => ({ start: minutesToTime(s.start), end: minutesToTime(s.end) }));
}

function generateConsecutiveSlotsPreview(dayStart, dayEnd, sessionMinutes, applyLunchBreak, lunchBreaks, slotIntervalMinutes = 0) {
  if (!dayStart || !dayEnd || !sessionMinutes) return [];
  if (timeToMinutes(dayEnd) <= timeToMinutes(dayStart)) return [];
  const breaks = applyLunchBreak ? lunchBreaks : [];
  const gap = Math.max(0, Number(slotIntervalMinutes) || 0);
  const step = sessionMinutes + gap;
  const segments = getBookableSegments(dayStart, dayEnd, breaks);
  const slots = [];
  for (const seg of segments) {
    let t = timeToMinutes(seg.start);
    const segEnd = timeToMinutes(seg.end);
    while (t + sessionMinutes <= segEnd) {
      slots.push({ start: minutesToTime(t), end: minutesToTime(t + sessionMinutes) });
      t += step;
    }
  }
  return slots;
}

function formatUnavailTime(t) {
  if (t == null || t === "") return "";
  return String(t).slice(0, 5);
}

const GCO_WHOLE_DAY_UNAVAIL_START = "07:00";
const GCO_WHOLE_DAY_UNAVAIL_END = "17:00";

/** Whole day = no times, or block covers 7:00 AM – 5:00 PM (GCO office day). */
function isFullDayUnavailBlock(block) {
  if (!block) return false;
  const start = formatUnavailTime(block.start_time);
  const end = formatUnavailTime(block.end_time);
  if (!start && !end) return true;
  if (!start || !end) return false;
  return (
    timeToMinutes(start) <= timeToMinutes(GCO_WHOLE_DAY_UNAVAIL_START) &&
    timeToMinutes(end) >= timeToMinutes(GCO_WHOLE_DAY_UNAVAIL_END)
  );
}

function getPartialUnavailBlocks(blocks) {
  return (blocks || [])
    .filter((b) => (b.start_time || b.end_time) && !isFullDayUnavailBlock(b))
    .map((b) => ({
      start: formatUnavailTime(b.start_time) || "00:00",
      end: formatUnavailTime(b.end_time) || "23:59",
      message: b.message || ""
    }));
}

function timeRangesOverlapClient(startA, endA, startB, endB) {
  return timeToMinutes(startA) < timeToMinutes(endB) && timeToMinutes(startB) < timeToMinutes(endA);
}

function slotOverlapsUnavail(slotStart, slotEnd, blocks) {
  if ((blocks || []).some(isFullDayUnavailBlock)) return true;
  return getPartialUnavailBlocks(blocks).some((b) => timeRangesOverlapClient(slotStart, slotEnd, b.start, b.end));
}

function formatPartialUnavailLabel(blocks) {
  return getPartialUnavailBlocks(blocks)
    .map((b) => {
      const range = `${b.start}–${b.end}`;
      return b.message ? `${range} (${b.message})` : range;
    })
    .join("; ");
}

function getCounselorDayStatus(iso, { scheduleByDate, unavailableByDate, appointmentByDate, dayWindow }) {
  const blocks = unavailableByDate.get(iso) || [];
  const fullBlock = blocks.some((b) => isFullDayUnavailBlock(b));
  if (fullBlock)
    return {
      status: "unavailable",
      partialBlocked: false,
      title: "Unavailable — blocked 7:00 AM – 5:00 PM (whole day)"
    };

  const partialBlocks = getPartialUnavailBlocks(blocks);
  const partialLabel = partialBlocks.length ? formatPartialUnavailLabel(blocks) : "";

  const entry = scheduleByDate.get(iso);
  const slots = entry?.slots || [];
  const limitedDay = isLimitedSlotCoverage(slots, dayWindow);
  const partDayOnly = partialBlocks.length > 0 || limitedDay;

  if (!slots.length) {
    if (partialBlocks.length) {
      return {
        status: "partial-blocked",
        partialBlocked: true,
        title: `Part-day only — unavailable times: ${partialLabel}`
      };
    }
    return { status: "unset", partialBlocked: false, title: "No availability set for this date" };
  }

  const appts = (appointmentByDate.get(iso) || []).filter((a) =>
    ["accepted", "pending", "reschedule_requested"].includes(a.status)
  );
  const bookedStarts = new Set(appts.map((a) => String(a.appointment_time).slice(0, 5)));
  const blockedSlots = slots.filter((s) => slotOverlapsUnavail(s.startTime, s.endTime, blocks));
  const allBooked = slots.every((s) => bookedStarts.has(s.startTime));
  if (allBooked && slots.length > 0) {
    const extra = partDayOnly
      ? limitedDay
        ? " · Part-day availability only"
        : ` · Part-day: ${partialLabel}`
      : "";
    return {
      status: "fully-booked",
      partialBlocked: partDayOnly,
      title: `Fully booked — all slots taken${extra}`
    };
  }

  const open = slots.length - slots.filter((s) => bookedStarts.has(s.startTime)).length;
  const blockedNote = partDayOnly
    ? limitedDay
      ? " · Part-day availability only (not full day)"
      : blockedSlots.length > 0
        ? ` · ${blockedSlots.length} slot(s) blocked (${partialLabel})`
        : ` · Part-day: ${partialLabel}`
    : "";
  return {
    status: "has-slots",
    partialBlocked: partDayOnly,
    title: `${slots.length} slot(s), ${open} open for booking${blockedNote}`
  };
}

function getActiveAvailDate() {
  const input = document.getElementById("availDate")?.value?.trim();
  return input || state.counselorAvailDate || "";
}

function getSelectedAvailDates() {
  const picked = Array.isArray(state.counselorAvailDates) ? [...state.counselorAvailDates] : [];
  if (picked.length) return picked.sort();
  const single = getActiveAvailDate();
  return single ? [single] : [];
}

function toggleCounselorAvailDate(date) {
  if (!date) return;
  if (!Array.isArray(state.counselorAvailDates)) state.counselorAvailDates = [];
  const idx = state.counselorAvailDates.indexOf(date);
  if (idx >= 0) state.counselorAvailDates.splice(idx, 1);
  else state.counselorAvailDates.push(date);
  state.counselorAvailDates.sort();
}

function renderSelectedDateChips() {
  const el = document.getElementById("selectedDatesChips");
  if (!el) return;
  const dates = state.counselorAvailDates || [];
  if (!dates.length) {
    el.innerHTML = '<span class="muted tiny">No batch dates yet — click a day, then use “Add active date to batch”.</span>';
    return;
  }
  el.innerHTML = dates
    .map(
      (d) =>
        `<span class="date-chip">${escapeHtml(d)}<button type="button" class="date-chip-remove" data-date="${d}" aria-label="Remove ${escapeHtml(d)}">×</button></span>`
    )
    .join("");
  el.querySelectorAll(".date-chip-remove").forEach((btn) => {
    btn.onclick = () => {
      toggleCounselorAvailDate(btn.dataset.date);
      syncCounselorCalendarSelection(state.counselorCalendarCtx);
      renderSelectedDateChips();
    };
  });
}

function syncCounselorCalendarSelection(ctx) {
  const active = getActiveAvailDate();
  document.querySelectorAll(".counselor-availability-calendar .calendar-day-btn").forEach((btn) => {
    const iso = btn.dataset.date;
    btn.classList.remove("day-selected");
    btn.classList.toggle("day-active", Boolean(active && iso === active));
  });
  if (ctx) updateCalendarDayColors(ctx);
}

function bindCounselorCalendarDayClicks(ctx) {
  document.querySelectorAll(".counselor-availability-calendar .calendar-day-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const date = btn.dataset.date;
      if (!date) return;
      selectCounselorCalendarDay(date, ctx);
      syncCounselorCalendarSelection(ctx);
    });
  });
}

let counselorDayModalEl = null;

function ensureCounselorDayModal() {
  if (counselorDayModalEl) return counselorDayModalEl;
  const modal = document.createElement("div");
  modal.id = "counselorDayModal";
  modal.className = "modal hidden";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", "counselorDayModalTitle");
  modal.innerHTML = `
    <div class="modal-content counselor-day-modal">
      <div class="counselor-day-modal__head">
        <h3 id="counselorDayModalTitle">Day details</h3>
        <button type="button" class="counselor-day-modal__close" id="counselorDayModalClose" aria-label="Close day details">×</button>
      </div>
      <div id="counselorDayModalBody" class="counselor-day-modal__body"></div>
    </div>`;
  document.body.appendChild(modal);
  const close = () => closeCounselorDayModal();
  document.getElementById("counselorDayModalClose").onclick = close;
  modal.addEventListener("click", (e) => {
    if (e.target === modal) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && counselorDayModalEl && !counselorDayModalEl.classList.contains("hidden")) close();
  });
  counselorDayModalEl = modal;
  return modal;
}

function openCounselorDayModal() {
  const modal = ensureCounselorDayModal();
  modal.classList.remove("hidden");
  modal.style.display = "flex";
  document.body.classList.add("modal-open");
}

function closeCounselorDayModal() {
  if (!counselorDayModalEl) return;
  counselorDayModalEl.classList.add("hidden");
  counselorDayModalEl.style.display = "none";
  document.body.classList.remove("modal-open");
}

function normalizeCounselorDateKey(val) {
  if (!val) return "";
  const s = String(val);
  const m = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return s.slice(0, 10);
}

function buildCounselorCalendarCtx(dateSchedule, calendar) {
  const scheduleByDate = new Map();
  for (const d of dateSchedule || []) {
    const key = normalizeCounselorDateKey(d.availableDate || d.available_date);
    if (!key) continue;
    scheduleByDate.set(key, {
      ...d,
      availableDate: key,
      slots: (d.slots || []).map((s) => ({
        ...s,
        startTime: String(s.startTime || s.start_time || "").slice(0, 5),
        endTime: String(s.endTime || s.end_time || "").slice(0, 5)
      }))
    });
  }
  const unavailableByDate = new Map();
  const appointmentByDate = new Map();
  for (const u of calendar?.unavailable || []) {
    const key = normalizeCounselorDateKey(u.unavailable_date);
    if (!key) continue;
    if (!unavailableByDate.has(key)) unavailableByDate.set(key, []);
    unavailableByDate.get(key).push(u);
  }
  for (const a of calendar?.appointments || []) {
    const key = String(a.appointment_date).slice(0, 10);
    if (!appointmentByDate.has(key)) appointmentByDate.set(key, []);
    appointmentByDate.get(key).push(a);
  }
  return { scheduleByDate, unavailableByDate, appointmentByDate };
}

function renderCounselorSlotChip(slot, blocks) {
  const range = formatSlotRange(slot.startTime, slot.endTime);
  const blocked = slotOverlapsUnavail(slot.startTime, slot.endTime, blocks);
  if (!blocked) return `<span class="slot-chip">${escapeHtml(range)}</span>`;
  return `<span class="slot-chip slot-chip--blocked" title="Blocked via Add Unavailable">${escapeHtml(range)}<span class="slot-blocked-tag">Unavailable</span></span>`;
}

function renderCounselorSlotListItem(slot, blocks) {
  const range = formatSlotRange(slot.startTime, slot.endTime);
  const blocked = slotOverlapsUnavail(slot.startTime, slot.endTime, blocks);
  if (!blocked) return `<li>${escapeHtml(range)}</li>`;
  return `<li class="saved-slot-list__blocked">${escapeHtml(range)} <span class="slot-blocked-tag">Unavailable</span></li>`;
}

function renderCounselorDayPanel(date, ctx, openModal = true) {
  ensureCounselorDayModal();
  const panel = document.getElementById("counselorDayModalBody");
  const modalTitle = document.getElementById("counselorDayModalTitle");
  const savedTitle = document.getElementById("savedSlotsTitle");
  const savedContent = document.getElementById("savedSlotsContent");
  if (!panel) return;
  if (modalTitle) modalTitle.textContent = `${date} · ${weekdayLabelForDate(date)}`;

  const { scheduleByDate, unavailableByDate, appointmentByDate } = ctx;
  const blocks = unavailableByDate.get(date) || [];
  const fullBlock = blocks.some((b) => isFullDayUnavailBlock(b));
  const partialBlocks = getPartialUnavailBlocks(blocks);
  const entry = scheduleByDate.get(date);
  const slots = entry?.slots || [];
  const appts = (appointmentByDate.get(date) || []).filter((a) =>
    ["accepted", "pending", "reschedule_requested"].includes(a.status)
  );

  if (savedTitle) savedTitle.textContent = `Saved slots — ${date}`;
  if (savedContent) {
    savedContent.innerHTML = slots.length
      ? `<ul class="saved-slot-list data-scroll-panel">${slots.map((s) => renderCounselorSlotListItem(s, blocks)).join("")}</ul>`
      : `<p class="muted tiny">No slots saved for this date.</p>`;
  }

  const unavailSection = partialBlocks.length
    ? `<div class="day-view-unavail">
        <h5 class="avail-subtitle">Blocked times <span class="muted tiny">(Add Unavailable)</span></h5>
        <div class="day-view-unavail-chips">${partialBlocks
          .map((b) => {
            const label = formatSlotRange(b.start, b.end);
            const note = b.message ? ` — ${escapeHtml(b.message)}` : "";
            return `<span class="unavail-chip" title="Set via Add Unavailable">${escapeHtml(label)}${note}</span>`;
          })
          .join("")}</div>
      </div>`
    : "";

  panel.innerHTML = `
    <div class="day-view-header">
      <strong>${escapeHtml(date)}</strong>
      <span class="muted tiny">${escapeHtml(weekdayLabelForDate(date))}</span>
    </div>
    ${
      fullBlock
        ? `<p class="feedback feedback-error">Unavailable — ${escapeHtml(blocks.find((b) => isFullDayUnavailBlock(b))?.message || "blocked 7:00 AM – 5:00 PM")}</p>`
        : slots.length
          ? `<div class="day-view-slots">${slots.map((s) => renderCounselorSlotChip(s, blocks)).join("")}</div>`
          : partialBlocks.length
            ? `<p class="muted">No bookable slots generated; unavailable times are set below.</p>`
            : `<p class="muted">No availability set for this date. Use the form above to generate slots.</p>`
    }
    ${unavailSection}
    ${
      appts.length
        ? `<div class="day-view-appointments"><h5 class="avail-subtitle">Appointments</h5><ul class="saved-slot-list data-scroll-panel">${appts
            .map(
              (a) =>
                `<li>${String(a.appointment_time).slice(0, 5)} — ${escapeHtml(a.service_type || "Session")} <em>(${escapeHtml(a.status)})</em></li>`
            )
            .join("")}</ul></div>`
        : ""
    }
  `;
  if (openModal) openCounselorDayModal();
}

function setActiveCalendarDay(date) {
  document.querySelectorAll(".counselor-availability-calendar .calendar-day-btn").forEach((btn) => {
    btn.classList.toggle("day-active", btn.dataset.date === date);
  });
}

function updateCalendarDayColors(ctx) {
  const meta = ctx;
  document.querySelectorAll(".counselor-availability-calendar .calendar-day-btn").forEach((btn) => {
    const iso = btn.dataset.date;
    if (!iso) return;
    const { status, partialBlocked } = getCounselorDayStatus(iso, meta);
    btn.classList.remove(
      "day-has-slots",
      "day-unset",
      "day-fully-booked",
      "day-unavailable",
      "day-partial-blocked"
    );
    btn.classList.add(`day-${status}`);
    btn.classList.toggle("day-partial-blocked", partialBlocked);
  });
}

function selectCounselorCalendarDay(date, ctx, { openModal = true } = {}) {
  if (!date) return;
  state.counselorAvailDate = date;
  const dateInput = document.getElementById("availDate");
  if (dateInput) dateInput.value = date;
  setActiveCalendarDay(date);
  renderCounselorDayPanel(date, ctx, openModal);
  const entry = ctx.scheduleByDate.get(date);
  if (entry?.sessionDurationMinutes) {
    const sel = document.getElementById("availSessionDuration");
    const mins = entry.sessionDurationMinutes;
    if (sel && SESSION_DURATION_OPTIONS.includes(mins)) sel.value = String(mins);
    else if (sel) {
      sel.value = "custom";
      const custom = document.getElementById("availCustomSessionMinutes");
      if (custom) custom.value = mins;
      document.getElementById("availCustomSessionWrap")?.classList.remove("hidden");
    }
  }
  if (typeof window.__counselorUpdatePreview === "function") window.__counselorUpdatePreview();
}

async function apiGenerateAvailabilitySlots(payload) {
  return api("/counselor/available-dates/generate-slots", {
    method: "POST",
    body: JSON.stringify(withCounselorProxy(payload))
  });
}

async function apiClearAvailabilityDate(date) {
  const id = state.counselorCalendarProxyId;
  const qs = id ? `?counselorId=${encodeURIComponent(id)}` : "";
  return api(`/counselor/available-dates/by-date/${encodeURIComponent(date)}${qs}`, {
    method: "DELETE"
  });
}

function withCounselorProxy(payload = {}) {
  const id = state.counselorCalendarProxyId;
  if (!id) return payload;
  return { ...payload, counselorId: id };
}

function counselorAvailabilityUrl() {
  const id = state.counselorCalendarProxyId;
  return id ? `/counselor/availability/${id}` : "/counselor/availability";
}

function counselorScheduleUrl() {
  const id = state.counselorCalendarProxyId;
  return id ? `/counselor/availability-schedule/${id}` : "/counselor/availability-schedule";
}

function counselorBookingProfileUrl() {
  const id = state.counselorCalendarProxyId;
  return id ? `/counselor/booking-profile/${id}` : "/counselor/booking-profile";
}

function counselorCalendarUrl(year) {
  const id = state.counselorCalendarProxyId;
  return id ? `/counselor/calendar?year=${year}&counselorId=${id}` : `/counselor/calendar?year=${year}`;
}

function validateAvailabilityForm({ dates, dayStart, dayEnd, sessionMinutes, slotInterval }) {
  if (!dates.length) return "Select at least one date on the calendar (gold outline) or use the date field.";
  const today = new Date().toISOString().slice(0, 10);
  for (const d of dates) {
    if (d < today) return `Cannot set availability for past date: ${d}.`;
  }
  if (!dayStart || !dayEnd) return "Day start and end times are required.";
  if (dayStart >= dayEnd) return "Day end must be after day start.";
  if (!sessionMinutes || sessionMinutes < 15 || sessionMinutes > 180) {
    return "Session length must be between 15 and 180 minutes.";
  }
  if (slotInterval < 0 || slotInterval > 120) return "Interval between slots must be between 0 and 120 minutes.";
  return null;
}

function formatSlotRange(start, end) {
  return `${start}–${end}`;
}

function weekdayLabelForDate(isoDate) {
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const dow = new Date(`${isoDate}T12:00:00`).getDay();
  return names[dow] || "";
}

async function renderCounselorCalendar(root, renderOpts = {}) {
  stopCounselorCalendarPolling();
  const opts = renderOpts.actingCounselorId != null ? renderOpts : state.counselorCalendarRenderOpts || {};
  state.counselorCalendarProxyId = opts.actingCounselorId || null;
  state.counselorCalendarRenderOpts = opts;
  const rerenderCalendar = () => renderCounselorCalendar(root, state.counselorCalendarRenderOpts || {});
  const year = state.calendarYear || new Date().getFullYear();
  const [calendar, availability, dateSchedule, bookingProfile] = await Promise.all([
    api(counselorCalendarUrl(year)),
    api(counselorAvailabilityUrl()),
    api(counselorScheduleUrl()),
    api(counselorBookingProfileUrl())
  ]);
  const scheduleByDate = new Map((dateSchedule || []).map((d) => [d.availableDate, d]));
  const lunchBreaks = deriveLunchBreaksFromWindows(bookingProfile?.windows);
  const lunchLabel = lunchBreaks.map((b) => `${b.start}–${b.end}`).join(", ");
  const defaultDayStart = bookingProfile?.windows?.[0]?.start || "08:00";
  const defaultDayEnd = bookingProfile?.windows?.[bookingProfile.windows.length - 1]?.end || "16:00";
  const todayIso = new Date().toISOString().slice(0, 10);

  const primaryDate = state.counselorAvailDate || todayIso;
  state.counselorAvailDate = primaryDate;
  if (!Array.isArray(state.counselorAvailDates)) state.counselorAvailDates = [];
  const dayWindow = { start: defaultDayStart, end: defaultDayEnd, breaks: lunchBreaks };
  const calendarCtx = buildCounselorCalendarCtx(dateSchedule, calendar);
  state.counselorCalendarCtx = { ...calendarCtx, dayWindow };
  const selectedEntry = scheduleByDate.get(primaryDate);
  const selectedSession = selectedEntry?.sessionDurationMinutes || bookingProfile?.sessionMinutes || 60;
  state.counselorUnavail = availability;
  const refreshedAt = new Date();

  root.innerHTML = `
    <div class="panel-header">
      <div>
        <h2 class="section-title">${opts.actingCounselorId ? "Counselor Availability" : "Calendar and Availability"}${opts.titleSuffix ? escapeHtml(opts.titleSuffix) : ""}</h2>
        <p class="muted">${opts.actingCounselorId ? "Admin: manage this counselor's open slots and unavailability." : "Select dates on the calendar, set hours, then generate bookable slots for students."}</p>
        <p class="muted tiny">Last updated: ${refreshedAt.toLocaleTimeString()}</p>
      </div>
      ${opts.showBack ? `<button type="button" class="btn ghost" id="counselorCalendarBackBtn">← Back to calendar</button>` : ""}
    </div>
    <div class="card stack-md section-block">
      <h3>Set Availability</h3>
      <p class="muted tiny">Click a calendar day to view details. Add dates to the batch list to generate slots for multiple days.</p>
      <div id="selectedDatesChips" class="selected-dates-chips"></div>
      <div class="avail-batch-actions">
        <button type="button" class="btn ghost" id="addAvailDateToBatchBtn">Add active date to batch</button>
      </div>
      <div class="avail-layout">
        <form id="dateAvailabilityForm" class="avail-form stack-md">
          <label class="field">
            <span>Active date (view slots)</span>
            <input type="date" id="availDate" value="${primaryDate}" min="${todayIso}" required />
          </label>
          <div class="avail-fields-grid">
            <label class="field">
              <span>Session length</span>
              <select id="availSessionDuration">
                ${SESSION_DURATION_OPTIONS.map(
                  (m) => `<option value="${m}"${m === selectedSession ? " selected" : ""}>${m} min</option>`
                ).join("")}
                <option value="custom"${!SESSION_DURATION_OPTIONS.includes(selectedSession) ? " selected" : ""}>Custom</option>
              </select>
            </label>
            <label class="field${SESSION_DURATION_OPTIONS.includes(selectedSession) ? " hidden" : ""}" id="availCustomSessionWrap">
              <span>Custom (min)</span>
              <input type="number" id="availCustomSessionMinutes" min="15" max="180" step="5" value="${selectedSession}" />
            </label>
            <label class="field">
              <span>Interval between slots</span>
              <select id="availSlotInterval">
                <option value="0" selected>None (back-to-back)</option>
                <option value="5">5 min</option>
                <option value="10">10 min</option>
                <option value="15">15 min</option>
                <option value="20">20 min</option>
                <option value="30">30 min</option>
              </select>
            </label>
          </div>
          <div class="availability-time-row">
            <label class="field"><span>Day starts</span><input type="time" id="availDayStart" value="${defaultDayStart}" required /></label>
            <label class="field"><span>Day ends</span><input type="time" id="availDayEnd" value="${defaultDayEnd}" required /></label>
          </div>
          <label class="checkbox-card">
            <input type="checkbox" id="availApplyLunch" checked />
            <span class="checkbox-card__text">Skip lunch break <strong>(${escapeHtml(lunchLabel)})</strong></span>
          </label>
        </form>
        <div class="avail-preview stack-md">
          <div class="avail-preview-block">
            <h4 class="avail-subtitle">Preview</h4>
            <p class="muted tiny" id="availPreviewMeta">Adjust settings to preview slots</p>
            <div id="availSlotPreview" class="slot-preview-list slot-preview-list--scroll"></div>
          </div>
          <div class="avail-preview-block">
            <h4 class="avail-subtitle" id="savedSlotsTitle">Saved slots — ${escapeHtml(primaryDate)}</h4>
            <div id="savedSlotsContent"></div>
          </div>
        </div>
      </div>
      <div class="avail-actions avail-actions--footer">
        <button class="btn primary" type="button" id="generateSlotsBtn">Generate slots</button>
        <button class="btn ghost" type="button" id="clearAvailDateBtn">Clear selected dates</button>
      </div>
      <p id="availGenerateMsg" class="feedback" role="status"></p>
    </div>
    <div class="card stack-md section-block">
      <h3>Add Unavailable Date / Time</h3>
      <p class="muted tiny">Leave both times blank to block the entire day. Otherwise students cannot book during that window.</p>
      <form id="availabilityForm" class="stack-md">
        <label class="field"><span>Date</span><input type="date" id="unavailableDate" required /></label>
        <div class="availability-time-row">
          <label class="field"><span>Start time (optional)</span><input type="time" id="unavailableStart" /></label>
          <label class="field"><span>End time (optional)</span><input type="time" id="unavailableEnd" /></label>
        </div>
        <label class="field"><span>Reason (optional)</span><input type="text" id="unavailableReason" placeholder="e.g., Faculty meeting or leave" /></label>
        <button class="btn primary" type="submit">Save Unavailability</button>
      </form>
      <p id="availabilityMsg" class="feedback"></p>
    </div>
    <div class="table-wrap section-block">
      ${availability.length ? `
      <table>
        <thead><tr><th>Date</th><th>Time</th><th>Reason</th><th>Action</th></tr></thead>
        <tbody>
          ${availability.slice(0, 30).map((u) => {
            const dateStr = String(u.unavailable_date).slice(0, 10);
            const start = u.start_time ? String(u.start_time).slice(0, 5) : "";
            const end = u.end_time ? String(u.end_time).slice(0, 5) : "";
            const timeLabel = start || end ? `${start || "—"} – ${end || "—"}` : "<em>All day</em>";
            return `<tr><td>${dateStr}</td><td>${timeLabel}</td><td>${escapeHtml(u.message || "-")}</td><td><button class="btn ghost remove-unavailable" data-id="${u.id}">Remove</button></td></tr>`;
          }).join("")}
        </tbody>
      </table>` : `<p class="muted">No unavailable dates yet.</p>`}
    </div>
    <div class="card stack-md section-block availability-calendar-card">
      <div class="year-header">
        <div class="year-nav">
          <button class="btn ghost" id="prevYearBtn" type="button" aria-label="Previous year">‹</button>
          <strong>${year}</strong>
          <button class="btn ghost" id="nextYearBtn" type="button" aria-label="Next year">›</button>
        </div>
        <div class="calendar-legend calendar-legend--counselor">
          <span><i class="dot has-slots"></i>Open slots</span>
          <span><i class="dot unset"></i>Not set</span>
          <span><i class="dot fully-booked"></i>Fully booked</span>
          <span><i class="dot blocked"></i>Unavailable (all day)</span>
          <span><i class="dot partial-blocked"></i>Part-day only (pink)</span>
          <span><i class="dot today"></i>Today</span>
          <span><i class="dot selected"></i>Clicked day</span>
        </div>
      </div>
      <p class="muted tiny">Click a day to view its details (gold outline). Only one day is highlighted at a time.</p>
      <div class="year-calendar-grid counselor-availability-calendar">${buildYearCalendar(
        year,
        calendar.appointments || [],
        calendar.unavailable || [],
        {
          scheduleByDate,
          activeDate: primaryDate,
          dayWindow: { start: defaultDayStart, end: defaultDayEnd, breaks: lunchBreaks }
        }
      )}</div>
    </div>
  `;

  const readSessionMinutes = () => {
    const sel = document.getElementById("availSessionDuration");
    if (!sel) return 60;
    if (sel.value === "custom") return Number(document.getElementById("availCustomSessionMinutes")?.value) || 0;
    return Number(sel.value);
  };

  const readSlotInterval = () => Number(document.getElementById("availSlotInterval")?.value) || 0;

  const updatePreview = () => {
    const dayStart = document.getElementById("availDayStart")?.value;
    const dayEnd = document.getElementById("availDayEnd")?.value;
    const sessionMinutes = readSessionMinutes();
    const slotInterval = readSlotInterval();
    const applyLunch = document.getElementById("availApplyLunch")?.checked ?? true;
    const preview = document.getElementById("availSlotPreview");
    const meta = document.getElementById("availPreviewMeta");
    const msg = document.getElementById("availGenerateMsg");
    if (!preview) return;

    const dates = getSelectedAvailDates();
    const validationError = validateAvailabilityForm({
      dates,
      dayStart,
      dayEnd,
      sessionMinutes,
      slotInterval
    });

    if (validationError && (dayStart || dayEnd)) {
      preview.innerHTML = `<span class="muted">${escapeHtml(validationError)}</span>`;
      if (meta) meta.textContent = "Fix errors to preview slots";
      return;
    }

    const slots = generateConsecutiveSlotsPreview(
      dayStart,
      dayEnd,
      sessionMinutes,
      applyLunch,
      lunchBreaks,
      slotInterval
    );
    const dateLabel = dates.length > 1 ? `${dates.length} dates` : dates[0] || "selected date";
    if (meta) meta.textContent = `${slots.length} slot(s) per date for ${dateLabel}`;
    preview.innerHTML = slots.length
      ? slots.map((s) => `<span class="slot-chip">${formatSlotRange(s.start, s.end)}</span>`).join("")
      : "<span class='muted'>No slots fit in this range.</span>";
  };

  window.__counselorUpdatePreview = updatePreview;
  renderSelectedDateChips();
  selectCounselorCalendarDay(primaryDate, calendarCtx, { openModal: false });
  syncCounselorCalendarSelection(calendarCtx);
  updatePreview();

  const sessionSel = document.getElementById("availSessionDuration");
  const customWrap = document.getElementById("availCustomSessionWrap");
  if (sessionSel && customWrap) {
    const toggleCustom = () => customWrap.classList.toggle("hidden", sessionSel.value !== "custom");
    sessionSel.onchange = () => {
      toggleCustom();
      updatePreview();
    };
    toggleCustom();
  }

  ["availDayStart", "availDayEnd", "availCustomSessionMinutes", "availApplyLunch", "availSlotInterval"].forEach((id) => {
    document.getElementById(id)?.addEventListener("input", updatePreview);
    document.getElementById(id)?.addEventListener("change", updatePreview);
  });

  document.getElementById("availDate")?.addEventListener("change", (e) => {
    const d = e.target.value;
    if (!d) return;
    selectCounselorCalendarDay(d, state.counselorCalendarCtx || calendarCtx);
    syncCounselorCalendarSelection(state.counselorCalendarCtx || calendarCtx);
  });

  document.getElementById("addAvailDateToBatchBtn")?.addEventListener("click", () => {
    const d = getActiveAvailDate();
    const msg = document.getElementById("availGenerateMsg");
    if (!d) {
      if (msg) {
        msg.textContent = "Pick a date on the calendar first.";
        msg.className = "feedback feedback-error";
      }
      return;
    }
    if (!Array.isArray(state.counselorAvailDates)) state.counselorAvailDates = [];
    if (state.counselorAvailDates.includes(d)) {
      if (msg) {
        msg.textContent = `${d} is already in the batch list.`;
        msg.className = "feedback feedback-error";
      }
      return;
    }
    state.counselorAvailDates.push(d);
    state.counselorAvailDates.sort();
    renderSelectedDateChips();
    updatePreview();
    if (msg) {
      msg.textContent = `Added ${d} to batch (${state.counselorAvailDates.length} date(s)).`;
      msg.className = "feedback status-success";
    }
  });

  bindCounselorCalendarDayClicks(state.counselorCalendarCtx || calendarCtx);

  document.getElementById("counselorCalendarBackBtn")?.addEventListener("click", () => {
    state.counselorCalendarProxyId = null;
    state.counselorCalendarRenderOpts = null;
    if (typeof opts.onBack === "function") opts.onBack();
  });

  async function refreshAfterScheduleChange() {
    const y = state.calendarYear || new Date().getFullYear();
    const [cal, sched] = await Promise.all([api(counselorCalendarUrl(y)), api(counselorScheduleUrl())]);
    const dw =
      state.counselorCalendarCtx?.dayWindow || {
        start: defaultDayStart,
        end: defaultDayEnd,
        breaks: lunchBreaks
      };
    state.counselorCalendarCtx = { ...buildCounselorCalendarCtx(sched, cal), dayWindow: dw };
    const grid = document.querySelector(".counselor-availability-calendar");
    if (grid) {
      grid.innerHTML = buildYearCalendar(y, cal.appointments || [], cal.unavailable || [], {
        scheduleByDate: state.counselorCalendarCtx.scheduleByDate,
        activeDate: getActiveAvailDate(),
        dayWindow: dw
      });
      bindCounselorCalendarDayClicks(state.counselorCalendarCtx);
    }
    syncCounselorCalendarSelection(state.counselorCalendarCtx);
    renderSelectedDateChips();
    const modalWasOpen =
      counselorDayModalEl && !counselorDayModalEl.classList.contains("hidden");
    selectCounselorCalendarDay(getActiveAvailDate(), state.counselorCalendarCtx, {
      openModal: modalWasOpen
    });
  }

  document.getElementById("clearAvailDateBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("availGenerateMsg");
    const dates = getSelectedAvailDates();
    if (!dates.length) {
      msg.textContent = "Select at least one date on the calendar to clear.";
      msg.className = "feedback feedback-error";
      return;
    }
    const label = dates.length === 1 ? dates[0] : `${dates.length} dates`;
    if (!window.confirm(`Clear all availability slots for ${label}?`)) return;
    const btn = document.getElementById("clearAvailDateBtn");
    if (btn) btn.disabled = true;
    try {
      for (const date of dates) {
        await apiClearAvailabilityDate(date);
      }
      state.counselorAvailDates = [];
      msg.textContent = `Cleared availability for ${label}.`;
      msg.className = "feedback status-success";
      await refreshAfterScheduleChange();
    } catch (err) {
      msg.textContent = err.message || "Could not clear availability.";
      msg.className = "feedback feedback-error";
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById("generateSlotsBtn")?.addEventListener("click", async (e) => {
    e.preventDefault();
    const msg = document.getElementById("availGenerateMsg");
    const dayStart = document.getElementById("availDayStart")?.value;
    const dayEnd = document.getElementById("availDayEnd")?.value;
    const sessionMinutes = readSessionMinutes();
    const slotInterval = readSlotInterval();
    const applyLunchBreak = document.getElementById("availApplyLunch")?.checked ?? true;
    const dates = getSelectedAvailDates();
    const date = dates[0] || "";

    const validationError = validateAvailabilityForm({
      dates,
      dayStart,
      dayEnd,
      sessionMinutes,
      slotInterval
    });
    if (validationError) {
      msg.textContent = validationError;
      msg.className = "feedback feedback-error";
      updatePreview();
      return;
    }

    const previewSlots = generateConsecutiveSlotsPreview(
      dayStart,
      dayEnd,
      sessionMinutes,
      applyLunchBreak,
      lunchBreaks,
      slotInterval
    );
    if (!previewSlots.length) {
      msg.textContent = "No slots fit in this range. Adjust times, session length, or interval.";
      msg.className = "feedback feedback-error";
      return;
    }

    const btn = document.getElementById("generateSlotsBtn");
    if (btn) btn.disabled = true;
    try {
      const payload = {
        available_date: dates[0],
        available_dates: dates,
        session_duration_minutes: sessionMinutes,
        day_start: dayStart,
        day_end: dayEnd,
        apply_lunch_break: applyLunchBreak,
        slot_interval_minutes: slotInterval
      };
      const result = await apiGenerateAvailabilitySlots(payload);
      const count = result.slotsCreated ?? previewSlots.length * dates.length;
      const nDates = result.datesProcessed ?? dates.length;
      msg.textContent = `Generated ${count} slot(s) across ${nDates} date(s).`;
      msg.className = "feedback status-success";
      await refreshAfterScheduleChange();
    } catch (err) {
      msg.textContent = err.message || "Could not generate slots.";
      msg.className = "feedback feedback-error";
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  document.getElementById("dateAvailabilityForm")?.addEventListener("submit", (e) => e.preventDefault());

  document.getElementById("availabilityForm")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const date = document.getElementById("unavailableDate").value;
    const reason = document.getElementById("unavailableReason").value.trim();
    const startTime = document.getElementById("unavailableStart").value || null;
    const endTime = document.getElementById("unavailableEnd").value || null;
    const msg = document.getElementById("availabilityMsg");
    if ((startTime && !endTime) || (!startTime && endTime)) {
      msg.textContent = "Provide both start and end time, or leave both empty for an all-day block.";
      msg.className = "feedback feedback-error";
      return;
    }
    try {
      await api("/counselor/availability", {
        method: "POST",
        body: JSON.stringify(
          withCounselorProxy({
            unavailable_date: date,
            start_time: startTime,
            end_time: endTime,
            message: reason || null
          })
        )
      });
      msg.textContent = "Unavailability saved.";
      msg.className = "feedback status-success";
      await rerenderCalendar();
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "feedback feedback-error";
    }
  });

  document.querySelectorAll(".remove-unavailable").forEach((btn) => {
    btn.onclick = async () => {
      await api(`/counselor/availability/${btn.dataset.id}`, { method: "DELETE" });
      await rerenderCalendar();
    };
  });

  document.getElementById("prevYearBtn").onclick = async () => {
    state.calendarYear = year - 1;
    await rerenderCalendar();
  };
  document.getElementById("nextYearBtn").onclick = async () => {
    state.calendarYear = year + 1;
    await rerenderCalendar();
  };
}

function renderRecentActivity(items) {
  const rows = (items || []).slice(0, 8);
  if (!rows.length) return "<p class='muted'>No recent activity.</p>";
  return `<div class="stack-sm">${rows
    .map((n) => {
      const unreadCls = n.is_read ? "" : " unread";
      const badge = n.is_read ? "" : '<span class="pill-unread">New</span>';
      return `<div class="info-card${unreadCls ? " unread" : ""}"><strong>${escapeHtml(n.title || "Activity")}</strong><p class="muted">${escapeHtml(n.message || "")}</p>${badge}</div>`;
    })
    .join("")}</div>`;
}

function formatRelativeTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString();
}

function todayIsoLocal() {
  return new Date().toISOString().slice(0, 10);
}

function parseApptDate(str) {
  const ymd = formatDisplayDate(str);
  if (!ymd || ymd === "—") return null;
  const d = new Date(`${ymd}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function startOfWeekMonday(d = new Date()) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfWeekSunday(d = new Date()) {
  const start = startOfWeekMonday(d);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function isDateInRange(dateStr, start, end) {
  const d = parseApptDate(dateStr);
  if (!d) return false;
  const t = d.getTime();
  return t >= start.getTime() && t <= end.getTime();
}

function isCurrentMonth(dateStr) {
  const d = parseApptDate(dateStr);
  if (!d) return false;
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
}

function isCounselingVisit(a) {
  return a.status === "accepted" || Boolean(a.outcome);
}

function countStudentVisits(appointments, period) {
  const rows = appointments || [];
  if (period === "week") {
    const start = startOfWeekMonday();
    const end = endOfWeekSunday();
    return rows.filter((a) => isCounselingVisit(a) && isDateInRange(a.appointment_date, start, end)).length;
  }
  return rows.filter((a) => isCounselingVisit(a) && isCurrentMonth(a.appointment_date)).length;
}

function renderDashStatusBadge(status) {
  const s = String(status || "").toLowerCase();
  const label = s === "reschedule_requested" ? "Reschedule" : s.charAt(0).toUpperCase() + s.slice(1);
  return `<span class="dash-status-badge status-${s}">${escapeHtml(label)}</span>`;
}

function renderDashRecentActivity(items) {
  const rows = (items || []).slice(0, 6);
  if (!rows.length) return '<p class="muted tiny">No recent activity yet.</p>';
  return `<ul class="dash-activity-list">${rows
    .map((n) => {
      const unread = n.is_read ? "" : " unread";
      const badge = n.is_read ? "" : '<span class="pill-unread">New</span>';
      return `<li class="dash-activity-item${unread}">
        <div class="dash-activity-head">
          <strong>${escapeHtml(n.title || "Update")}</strong>
          <span class="muted tiny">${formatRelativeTime(n.created_at)}</span>
        </div>
        <p class="muted tiny">${escapeHtml(n.message || "")}</p>
        ${badge}
      </li>`;
    })
    .join("")}</ul>`;
}

function renderDashStatusBars(counts, total) {
  const items = [
    { key: "pending", label: "Pending", color: "var(--warning)" },
    { key: "accepted", label: "Accepted", color: "var(--xu-blue-2)" },
    { key: "reschedule_requested", label: "Reschedule", color: "var(--gold-500)" },
    { key: "declined", label: "Declined", color: "var(--danger)" },
    { key: "cancelled", label: "Cancelled", color: "var(--slate-300)" }
  ];
  const denom = total || 1;
  return `<div class="dash-status-bars">${items
    .map((it) => {
      const n = counts[it.key] || 0;
      const pct = Math.round((n / denom) * 100);
      return `<div class="dash-status-row">
        <div class="dash-status-row-label"><span>${it.label}</span><strong>${n}</strong></div>
        <div class="dash-status-track"><span class="dash-status-fill" style="width:${pct}%;background:${it.color}"></span></div>
      </div>`;
    })
    .join("")}</div>`;
}

function renderDashStatCard(label, value, sub, variant = "blue") {
  return `<article class="dash-stat-card dash-stat-card--${variant}">
    <p class="dash-stat-label">${escapeHtml(label)}</p>
    <p class="dash-stat-value">${escapeHtml(String(value))}</p>
    ${sub ? `<p class="dash-stat-sub muted tiny">${escapeHtml(sub)}</p>` : ""}
  </article>`;
}

function renderDashQuickLinks(role, links) {
  return `<div class="dash-quick-grid">${links
    .map(
      (l) =>
        `<button type="button" class="dash-quick-card" data-dash-nav="${escapeHtml(l.menu)}">
          <strong>${escapeHtml(l.title)}</strong>
          <span class="muted tiny">${escapeHtml(l.desc)}</span>
        </button>`
    )
    .join("")}</div>`;
}

function attachDashQuickLinks(role, root) {
  root.querySelectorAll("[data-dash-nav]").forEach((btn) => {
    btn.onclick = () => navigateDashboard(role, btn.dataset.dashNav, "push");
  });
}

function renderDashApptRows(rows, emptyText, showStudent = true) {
  if (!rows.length) return `<p class="muted tiny">${escapeHtml(emptyText)}</p>`;
  return `<ul class="dash-appt-list">${rows
    .map((a) => {
      const who = showStudent ? escapeHtml(a.student_name || "Student") : escapeHtml(a.counselor_name || "Counselor");
      return `<li class="dash-appt-item">
        <div class="dash-appt-main">
          <strong>${who}</strong>
          <span class="muted tiny">${escapeHtml(a.service_type || "Session")}</span>
        </div>
        <div class="dash-appt-meta">
          <span class="muted tiny">${formatDisplayDate(a.appointment_date)} · ${formatDisplayTime(a.appointment_time)}</span>
          ${renderDashStatusBadge(a.status)}
        </div>
      </li>`;
    })
    .join("")}</ul>`;
}

async function renderStudentDashboard(root) {
  stopCounselorDashPolling();
  stopAdminDashPolling();
  destroyCounselorDashCharts();
  destroyAdminDashCharts();
  await Promise.all([loadAppointments(), loadNotifications()]);
  const appts = state.appointments || [];
  const today = todayIsoLocal();
  const weeklyVisits = countStudentVisits(appts, "week");
  const monthlyVisits = countStudentVisits(appts, "month");
  const pending = appts.filter((a) => ["pending", "reschedule_requested"].includes(a.status)).length;
  const upcoming = appts
    .filter((a) => !a.outcome && ["pending", "accepted", "reschedule_requested"].includes(a.status) && formatDisplayDate(a.appointment_date) >= today)
    .sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)) || String(a.appointment_time).localeCompare(String(b.appointment_time)));
  const next = upcoming[0];
  const recentAppts = [...appts]
    .sort((a, b) => String(b.appointment_date).localeCompare(String(a.appointment_date)) || String(b.appointment_time).localeCompare(String(a.appointment_time)))
    .slice(0, 5);

  root.innerHTML = `
    <div class="dash-home">
      <div class="panel-header dash-panel-header">
        <div>
          <h2 class="section-title">Dashboard</h2>
          <p class="muted tiny">Welcome back, ${escapeHtml(state.user?.name || "Student")}.</p>
        </div>
        <p class="muted tiny dash-as-of">${new Date().toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}</p>
      </div>
      <div class="dash-stat-grid dash-stat-grid--4">
        ${renderDashStatCard("Visits this week", weeklyVisits, "Approved or completed sessions", "gold")}
        ${renderDashStatCard("Visits this month", monthlyVisits, "Based on appointment date", "blue")}
        ${renderDashStatCard("Upcoming", upcoming.length, "Scheduled sessions", "blue")}
        ${renderDashStatCard("Pending", pending, "Awaiting counselor action", "gold")}
      </div>
      <div class="dash-layout-grid">
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Next appointment</h3>
            ${next ? "" : '<button type="button" class="btn ghost btn-sm" data-dash-nav="Book Appointment">Book now</button>'}
          </div>
          ${
            next
              ? `<div class="dash-highlight-card">
                  <p class="dash-highlight-title">${escapeHtml(next.counselor_name || "Counselor")}</p>
                  <p class="muted">${escapeHtml(next.service_type || "Counseling")}</p>
                  <p class="dash-highlight-meta"><strong>${formatDisplayDate(next.appointment_date)}</strong> · ${formatDisplayTime(next.appointment_time)}</p>
                  <p class="dash-highlight-code muted tiny">Code: ${escapeHtml(next.booking_code || "—")}</p>
                  ${renderDashStatusBadge(next.status)}
                </div>`
              : '<p class="muted tiny">No upcoming appointments. Book a session when you are ready.</p>'
          }
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Recent appointments</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Appointment History">View all</button>
          </div>
          ${renderDashApptRows(recentAppts, "No appointments yet.", false)}
        </section>
        <section class="dash-panel dash-panel--wide">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Recent activity</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Notifications">Notifications</button>
          </div>
          ${renderDashRecentActivity(state.notifications)}
        </section>
      </div>
      ${renderDashQuickLinks("student", [
        { menu: "Book Appointment", title: "Book appointment", desc: "Schedule with a counselor" },
        { menu: "GCO Services", title: "GCO services", desc: "Programs and support offered" },
        { menu: "Appointment History", title: "History", desc: "View or cancel bookings" }
      ])}
    </div>`;
  attachDashQuickLinks("student", root);
}

async function renderCounselorDashboard(root) {
  stopCounselorDashPolling();
  destroyCounselorDashCharts();
  await Promise.all([loadAppointments(), loadNotifications()]);
  let analytics = { weekly: 0, monthly: 0, chart30Days: [], outcomeBreakdown: { totals: {} } };
  try {
    analytics = await api("/counselor/analytics");
  } catch (_e) {
    /* placeholders */
  }

  const paint = () => {
    const appts = state.appointments || [];
    const today = todayIsoLocal();
    const todayAppts = appts.filter(
      (a) => formatDisplayDate(a.appointment_date) === today && ["pending", "accepted", "reschedule_requested"].includes(a.status)
    );
    const pending = appts.filter((a) => ["pending", "reschedule_requested"].includes(a.status));
    const upcoming = appts
      .filter((a) => !a.outcome && a.status === "accepted" && formatDisplayDate(a.appointment_date) >= today)
      .sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)) || String(a.appointment_time).localeCompare(String(b.appointment_time)))
      .slice(0, 5);
    const statusCounts = { pending: 0, accepted: 0, declined: 0, cancelled: 0, reschedule_requested: 0 };
    appts.forEach((a) => {
      if (statusCounts[a.status] !== undefined) statusCounts[a.status] += 1;
    });
    const ob = analytics.outcomeBreakdown?.totals || {};

    const set = (id, v) => {
      const el = document.getElementById(id);
      if (el) el.textContent = v;
    };
    set("counselorDashToday", todayAppts.length);
    set("counselorDashPending", pending.length);
    set("counselorDashWeek", analytics.weekly ?? 0);
    set("counselorDashMonth", analytics.monthly ?? 0);
    set("counselorDashDone", ob.done ?? 0);
    set("counselorDashReferred", ob.referred ?? 0);
    set("counselorDashNoShow", ob.noShow ?? 0);

    const todayList = document.getElementById("counselorDashTodayList");
    if (todayList) {
      todayList.innerHTML = renderDashApptRows(todayAppts.sort((a, b) => String(a.appointment_time).localeCompare(String(b.appointment_time))), "No sessions scheduled for today.");
    }
    const pendingList = document.getElementById("counselorDashPendingList");
    if (pendingList) {
      pendingList.innerHTML = renderDashApptRows(pending.slice(0, 5), "No open requests right now.");
    }
    const upcomingList = document.getElementById("counselorDashUpcomingList");
    if (upcomingList) {
      upcomingList.innerHTML = renderDashApptRows(upcoming, "No upcoming accepted sessions.");
    }
    const statusBars = document.getElementById("counselorDashStatusBars");
    if (statusBars) {
      statusBars.innerHTML = renderDashStatusBars(statusCounts, appts.length || 1);
    }
    const activity = document.getElementById("counselorDashActivity");
    if (activity) activity.innerHTML = renderDashRecentActivity(state.notifications);

    counselorDashChartDaily = bindOrUpdateLineChart(
      counselorDashChartDaily,
      "counselorDashChartDaily",
      (analytics.chart30Days || []).map((d) => d.label),
      (analytics.chart30Days || []).map((d) => d.sessions),
      "Approved sessions",
      "#283971"
    );
    const updated = document.getElementById("counselorDashUpdated");
    if (updated) updated.textContent = `Updated ${new Date().toLocaleTimeString()}`;
  };

  root.innerHTML = `
    <div class="dash-home">
      <div class="panel-header dash-panel-header">
        <div>
          <h2 class="section-title">Dashboard</h2>
          <p class="muted tiny">Welcome, ${escapeHtml(state.user?.name || "Counselor")}.</p>
        </div>
        <p class="muted tiny" id="counselorDashUpdated"></p>
      </div>
      <div class="dash-stat-grid dash-stat-grid--4">
        <article class="dash-stat-card dash-stat-card--blue">
          <p class="dash-stat-label">Today</p>
          <p class="dash-stat-value" id="counselorDashToday">0</p>
          <p class="dash-stat-sub muted tiny">Sessions on calendar</p>
        </article>
        <article class="dash-stat-card dash-stat-card--gold">
          <p class="dash-stat-label">Open requests</p>
          <p class="dash-stat-value" id="counselorDashPending">0</p>
          <p class="dash-stat-sub muted tiny">Pending or reschedule</p>
        </article>
        <article class="dash-stat-card dash-stat-card--blue">
          <p class="dash-stat-label">This week</p>
          <p class="dash-stat-value" id="counselorDashWeek">0</p>
          <p class="dash-stat-sub muted tiny">Approved sessions</p>
        </article>
        <article class="dash-stat-card dash-stat-card--gold">
          <p class="dash-stat-label">This month</p>
          <p class="dash-stat-value" id="counselorDashMonth">0</p>
          <p class="dash-stat-sub muted tiny">Approved sessions</p>
        </article>
      </div>
      <div class="dash-outcome-strip">
        <div class="dash-outcome-pill done">Done <strong id="counselorDashDone">0</strong></div>
        <div class="dash-outcome-pill referred">Referred <strong id="counselorDashReferred">0</strong></div>
        <div class="dash-outcome-pill no-show">No-show <strong id="counselorDashNoShow">0</strong></div>
      </div>
      <div class="dash-layout-grid">
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Today's schedule</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Requests">Manage</button>
          </div>
          <div id="counselorDashTodayList"></div>
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Open requests</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Requests">View all</button>
          </div>
          <div id="counselorDashPendingList"></div>
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Upcoming sessions</h3>
          </div>
          <div id="counselorDashUpcomingList"></div>
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Booking status</h3>
          </div>
          <div id="counselorDashStatusBars"></div>
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Sessions (30 days)</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Analytics">Analytics</button>
          </div>
          <div class="chart-canvas-wrap chart-canvas-wrap--compact"><canvas id="counselorDashChartDaily" aria-label="Daily sessions chart"></canvas></div>
        </section>
        <section class="dash-panel dash-panel--wide">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Recent activity</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Notifications">Notifications</button>
          </div>
          <div id="counselorDashActivity"></div>
        </section>
      </div>
      ${renderDashQuickLinks("counselor", [
        { menu: "Requests", title: "Requests", desc: "Accept, decline, mark outcomes" },
        { menu: "Availability", title: "Availability", desc: "Set open dates and slots" },
        { menu: "Analytics", title: "Analytics", desc: "Trends and outcomes" }
      ])}
    </div>`;

  attachDashQuickLinks("counselor", root);
  await paint();
  counselorDashPollTimer = setInterval(async () => {
    try {
      await Promise.all([loadAppointments(), loadNotifications()]);
      analytics = await api("/counselor/analytics");
      paint();
    } catch (_e) {
      paint();
    }
  }, 15000);
}

async function renderAdminDashboard(root) {
  stopAdminDashPolling();
  destroyAdminDashCharts();
  if (adminOverviewPollTimer) {
    clearInterval(adminOverviewPollTimer);
    adminOverviewPollTimer = null;
  }

  let overview = { totalUsers: "—", totalAppointments: "—", pendingRequests: "—" };
  let summary = null;
  try {
    [overview, summary] = await Promise.all([
      api("/admin/overview"),
      api("/admin/reports/summary").catch(() => null)
    ]);
  } catch (_e) {
    /* keep placeholders */
  }

  await loadNotifications();
  let appts = [];
  try {
    appts = await api("/appointments/my");
  } catch (_e) {
    appts = [];
  }

  const statusCounts = { pending: 0, accepted: 0, declined: 0, cancelled: 0, reschedule_requested: 0 };
  appts.forEach((a) => {
    if (statusCounts[a.status] !== undefined) statusCounts[a.status] += 1;
  });
  const pendingRows = appts
    .filter((a) => a.status === "pending")
    .sort((a, b) => String(a.appointment_date).localeCompare(String(b.appointment_date)))
    .slice(0, 6);
  const apptStats = summary?.appointments || {};

  const paintOverview = async () => {
    try {
      overview = await api("/admin/overview");
      const u = document.getElementById("adminStatUsers");
      const b = document.getElementById("adminStatBookings");
      const p = document.getElementById("adminStatOpen");
      const a = document.getElementById("adminStatAccepted");
      if (u) u.textContent = overview.totalUsers;
      if (b) b.textContent = overview.totalAppointments;
      if (p) p.textContent = overview.pendingRequests;
      if (a && apptStats.accepted != null) a.textContent = apptStats.accepted;
    } catch (_e) {
      /* ignore */
    }
  };

  root.innerHTML = `
    <div class="dash-home">
      <div class="panel-header dash-panel-header">
        <div>
          <h2 class="section-title">Dashboard</h2>
          <p class="muted tiny">Welcome, ${escapeHtml(state.user?.name || "Admin")}.</p>
        </div>
      </div>
      <div class="admin-overview-stats dash-stat-grid--5">
        <div class="admin-stat-card dash-stat-card">
          <p class="admin-stat-label">Registered users</p>
          <p class="admin-stat-value" id="adminStatUsers">${overview.totalUsers}</p>
        </div>
        <div class="admin-stat-card dash-stat-card">
          <p class="admin-stat-label">Total bookings</p>
          <p class="admin-stat-value" id="adminStatBookings">${overview.totalAppointments}</p>
        </div>
        <div class="admin-stat-card dash-stat-card">
          <p class="admin-stat-label">Open requests</p>
          <p class="admin-stat-value" id="adminStatOpen">${overview.pendingRequests}</p>
        </div>
        <div class="admin-stat-card dash-stat-card">
          <p class="admin-stat-label">Accepted sessions</p>
          <p class="admin-stat-value" id="adminStatAccepted">${apptStats.accepted ?? "—"}</p>
        </div>
        <div class="admin-stat-card dash-stat-card">
          <p class="admin-stat-label">New (7 days)</p>
          <p class="admin-stat-value">${summary?.activity?.newAppointmentsLast7d ?? "—"}</p>
        </div>
      </div>
      <div class="dash-layout-grid">
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">System snapshot</h3>
          </div>
          <ul class="dash-snapshot-list muted tiny">
            <li><span>Cancelled</span><strong>${apptStats.cancelled ?? 0}</strong></li>
            <li><span>Declined</span><strong>${apptStats.declined ?? 0}</strong></li>
            <li><span>Reschedule requested</span><strong>${apptStats.rescheduleRequested ?? 0}</strong></li>
            <li><span>Audit entries (24h)</span><strong>${summary?.activity?.auditLogEntriesLast24h ?? 0}</strong></li>
          </ul>
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Booking status</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Appointments">Appointments</button>
          </div>
          <div id="adminDashStatusBars">${renderDashStatusBars(statusCounts, appts.length || 1)}</div>
        </section>
        <section class="dash-panel">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Pending requests</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Appointments">View all</button>
          </div>
          ${renderDashApptRows(pendingRows, "No pending requests.")}
        </section>
        <section class="dash-panel dash-panel--wide">
          <div class="dash-panel-head">
            <h3 class="subsection-title">Recent activity</h3>
            <button type="button" class="btn ghost btn-sm" data-dash-nav="Notifications">Notifications</button>
          </div>
          ${renderDashRecentActivity(state.notifications)}
        </section>
      </div>
      <h3 class="subsection-title u-mt-section">Quick access</h3>
      <div class="admin-module-grid dash-quick-module-grid">
        <button type="button" class="admin-module-card dash-quick-card" data-dash-nav="Users">
          <h3>Users</h3><p class="muted">Create and manage accounts</p>
        </button>
        <button type="button" class="admin-module-card dash-quick-card" data-dash-nav="Appointments">
          <h3>Appointments</h3><p class="muted">Review, reschedule, or delete</p>
        </button>
        <button type="button" class="admin-module-card dash-quick-card" data-dash-nav="Calendars">
          <h3>Calendars</h3><p class="muted">Counselor schedules by year</p>
        </button>
        <button type="button" class="admin-module-card dash-quick-card" data-dash-nav="Analytics">
          <h3>Analytics</h3><p class="muted">Counselor session breakdown</p>
        </button>
        <button type="button" class="admin-module-card dash-quick-card" data-dash-nav="Reports">
          <h3>Reports</h3><p class="muted">Summary exports and stats</p>
        </button>
        <button type="button" class="admin-module-card dash-quick-card" data-dash-nav="System Logs">
          <h3>System logs</h3><p class="muted">Audit trail and actions</p>
        </button>
      </div>
    </div>`;

  attachDashQuickLinks("admin", root);
  adminOverviewPollTimer = setInterval(paintOverview, 12000);
}

async function renderNotificationsView(root) {
  await loadNotifications();
  const items = state.notifications || [];
  const unreadCount = items.filter((n) => !n.is_read).length;
  const listHtml = items.length === 0
    ? "<p class='muted'>No notifications yet.</p>"
    : `<div class="data-scroll-panel stack-sm">${items
        .map((n) => {
          const unreadCls = n.is_read ? "" : " unread";
          const badge = n.is_read ? "" : '<span class="pill-unread">New</span>';
          return `<div class="notification-row${unreadCls}" data-id="${n.id}" data-read="${n.is_read ? 1 : 0}">
            <span class="notification-dot" aria-hidden="true"></span>
            <div class="notification-body">
              <strong>${escapeHtml(n.title || "Notification")}</strong>
              <p>${escapeHtml(n.message || "")}</p>
              ${badge}
            </div>
            <div class="notification-meta">${formatRelativeTime(n.created_at)}</div>
          </div>`;
        })
        .join("")}</div>`;
  root.innerHTML = `
    <div class="panel-header">
      <div>
        <h2 class="section-title">Notifications</h2>
        <p class="muted tiny">${unreadCount} unread of ${items.length} total.</p>
      </div>
      <button id="markAllReadBtn" class="btn ghost" ${unreadCount === 0 ? "disabled" : ""}>Mark all as read</button>
    </div>
    ${listHtml}
    <p id="notifMsg" class="feedback"></p>`;

  const msg = document.getElementById("notifMsg");
  document.getElementById("markAllReadBtn")?.addEventListener("click", async () => {
    try {
      await api("/notifications/read-all", { method: "PATCH" });
      await renderNotificationsView(root);
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "feedback feedback-error";
    }
  });

  document.querySelectorAll(".notification-row").forEach((row) => {
    row.addEventListener("click", async () => {
      if (row.dataset.read === "1") return;
      const id = row.dataset.id;
      try {
        await api(`/notifications/${id}/read`, { method: "PATCH" });
        row.classList.remove("unread");
        row.dataset.read = "1";
        row.querySelector(".pill-unread")?.remove();
        await loadNotifications();
      } catch (_err) {
        /* ignore */
      }
    });
  });
}

async function renderAccountSettings(root) {
  const me = await api("/auth/me");
  const oauthOnly = me.authProvider === "google" && !me.hasPassword;
  const passwordSection = oauthOnly
    ? ""
    : `<div class="card stack-md section-block">
      <h3>Change Password</h3>
      <form id="passwordForm" class="stack-md">
        <label class="field"><span>Current password</span><input id="currentPassword" type="password" required /></label>
        <label class="field"><span>New password</span><input id="newPassword" type="password" minlength="10" required /></label>
        <button class="btn primary" type="submit">Update Password</button>
      </form>
    </div>`;
  root.innerHTML = `
    <div class="panel-header"><h2 class="section-title">Settings</h2></div>
    <div class="card stack-md section-block">
      <h3>Profile</h3>
      <p class="muted tiny">Signed in as <strong>${escapeHtml(me.email || "")}</strong> (${escapeHtml(me.role || "")})</p>
      <form id="profileForm" class="stack-md">
        <label class="field"><span>Full name</span><input id="profileName" type="text" value="${me.name || ""}" /></label>
        <label class="field"><span>Profile Picture</span><input id="profilePicFile" type="file" accept="image/*" /></label>
        <button class="btn primary" type="submit">Save Name</button>
        <button class="btn ghost" id="uploadProfilePicBtn" type="button">Upload Picture</button>
      </form>
    </div>
    ${passwordSection}
    <div class="switch-row">
      <div><strong>Dark Mode</strong><p class="muted tiny">Toggle appearance</p></div>
      <label class="switch" aria-label="Toggle dark mode">
        <input id="darkModeToggle" type="checkbox" ${state.darkMode ? "checked" : ""} />
        <span class="switch-slider"></span>
      </label>
    </div>
    <div class="switch-row">
      <div><strong>Delete Account</strong><p class="muted tiny">Deactivate your account</p></div>
      <button id="deleteAccountBtn" class="btn ghost">Delete Account</button>
    </div>
    <p id="settingsMsg" class="feedback"></p>
  `;

  const msg = document.getElementById("settingsMsg");
  document.getElementById("profileForm").onsubmit = async (e) => {
    e.preventDefault();
    try {
      await api("/auth/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          fullName: document.getElementById("profileName").value.trim()
        })
      });
      if (state.user) state.user.name = document.getElementById("profileName").value.trim();
      await refreshSidebarIdentity();
      msg.textContent = "Profile updated.";
      msg.className = "feedback status-success";
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "feedback feedback-error";
    }
  };
  document.getElementById("uploadProfilePicBtn").onclick = async () => {
    const file = document.getElementById("profilePicFile").files?.[0];
    if (!file) {
      msg.textContent = "Choose an image file first.";
      msg.className = "feedback feedback-error";
      return;
    }
    const form = new FormData();
    form.append("profilePicture", file);
    try {
      await apiUpload("/auth/me/profile-picture", form);
      await refreshSidebarIdentity();
      msg.textContent = "Profile picture uploaded.";
      msg.className = "feedback status-success";
    } catch (err) {
      msg.textContent = err.message;
      msg.className = "feedback feedback-error";
    }
  };

  if (!oauthOnly) {
    attachPasswordToggle(document.getElementById("currentPassword"), "current password");
    attachPasswordToggle(document.getElementById("newPassword"), "new password");
    const newPasswordField = document.getElementById("newPassword")?.closest(".field");
    if (newPasswordField) {
      const indicator = document.createElement("p");
      indicator.className = "muted tiny";
      newPasswordField.appendChild(indicator);
      attachPasswordStrength(document.getElementById("newPassword"), indicator);
    }
    document.getElementById("passwordForm").onsubmit = async (e) => {
      e.preventDefault();
      const nextPassword = document.getElementById("newPassword").value;
      const strong = validateStrongPassword(nextPassword);
      if (!strong.ok) {
        msg.textContent = strong.message;
        msg.className = "feedback feedback-error";
        return;
      }
      try {
        await api("/auth/me/password", {
          method: "PATCH",
          body: JSON.stringify({
            currentPassword: document.getElementById("currentPassword").value,
            newPassword: document.getElementById("newPassword").value
          })
        });
        msg.textContent = "Password updated.";
        msg.className = "feedback status-success";
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
  }
  document.getElementById("darkModeToggle").onchange = (e) => setDarkMode(e.target.checked);
  document.getElementById("deleteAccountBtn").onclick = async () => {
    if (!confirm("Delete your account? You will be logged out.")) return;
    await api("/auth/me", { method: "DELETE" });
    logoutBtn.click();
  };
}

async function renderCounselorView(root, menu) {
  if (counselorAnalyticsPollTimer) {
    clearInterval(counselorAnalyticsPollTimer);
    counselorAnalyticsPollTimer = null;
  }
  destroyCounselorAnalyticsCharts();
  if (menu !== "Dashboard") {
    stopCounselorDashPolling();
    destroyCounselorDashCharts();
  }
  if (!["Calendar", "Availability"].includes(menu)) {
    stopCounselorCalendarPolling();
  }
  if (menu !== "Availability") {
    state.counselorCalendarPage = "view";
    state.counselorCalendarProxyId = null;
    state.counselorCalendarRenderOpts = null;
  }
  if (menu === "Dashboard") return renderCounselorDashboard(root);
  if (menu === "GCO Services") return renderGcoServicesPage(root);
  if (menu === "Availability") {
    if (state.counselorCalendarPage === "availability") {
      return renderCounselorCalendar(root, {
        showBack: true,
        onBack: () => {
          state.counselorCalendarPage = "view";
          state.counselorCalendarProxyId = null;
          state.counselorCalendarRenderOpts = null;
          renderCounselorView(root, "Availability");
        }
      });
    }
    return renderCalendarOverviewPage(root, {
      mode: "counselor",
      title: "My Calendar",
      subtitle: "See your booked sessions and blocked dates, then open availability settings on the next page.",
      onNext: () => {
        state.counselorCalendarPage = "availability";
        renderCounselorView(root, "Availability");
      }
    });
  }
  if (menu === "Notifications") return renderNotificationsView(root);
  if (menu === "Settings") return renderAccountSettings(root);
  if (menu === "Requests") {
    await loadAppointments();
    const sortDesc = (a, b) => {
      const d = String(b.appointment_date).localeCompare(String(a.appointment_date));
      if (d !== 0) return d;
      return String(b.appointment_time).localeCompare(String(a.appointment_time));
    };
    const openRequests = state.appointments
      .filter((a) => ["pending", "reschedule_requested"].includes(a.status))
      .sort(sortDesc);
    const isClosed = (a) => Boolean(a.outcome);
    const activeRows = state.appointments.filter((a) => !isClosed(a)).sort(sortDesc);
    const closedRows = state.appointments.filter(isClosed).sort(sortDesc);

    const formatDateTime = (a) => `${formatDisplayDate(a.appointment_date)} • ${formatDisplayTime(a.appointment_time)}`;
    const outcomePill = (o) => {
      if (!o) return "";
      const label = o === "no_show" ? "No-show" : o.charAt(0).toUpperCase() + o.slice(1);
      return `<span class="outcome-pill ${o}">${label}</span>`;
    };

    const renderActiveActions = (a) => {
      if (a.status !== "accepted") {
        return `<span class="muted">—</span>`;
      }
      return `<div class="outcome-actions">
        <select class="outcome-select" data-id="${a.id}" aria-label="Select outcome">
          <option value="">Select outcome…</option>
          <option value="done">Done</option>
          <option value="referred">Referred</option>
          <option value="no_show">No-show</option>
        </select>
        <button type="button" class="btn primary outcome-submit" data-id="${a.id}" disabled>Submit</button>
      </div>`;
    };

    const pendingTable = `<div class="table-wrap"><table><thead><tr><th>Code</th><th>Date</th><th>Time</th><th>Status</th><th>Student</th><th>Service</th><th>Action</th></tr></thead><tbody>${openRequests.map((a) => {
      const actions = a.status === "pending"
        ? `<div class="request-action-group">
            <button class="btn primary approve-btn" data-id="${a.id}">Accept</button>
            <button class="btn ghost decline-btn" data-id="${a.id}">Decline</button>
            <button class="btn ghost reschedule-btn" data-id="${a.id}" data-code="${escapeHtml(a.booking_code)}">Reschedule</button>
          </div>`
        : `<span class="muted">—</span>`;
      return `<tr><td>${escapeHtml(a.booking_code)}</td><td>${formatDisplayDate(a.appointment_date)}</td><td>${formatDisplayTime(a.appointment_time)}</td><td>${a.status}</td><td>${escapeHtml(a.student_name || "—")}</td><td>${escapeHtml(a.service_type || "—")}</td><td>${actions}</td></tr>`;
    }).join("") || `<tr><td colspan="7">No open requests</td></tr>`}</tbody></table></div>`;

    const activeTable = `<div class="table-wrap u-mt-section"><table><thead><tr><th>Date / Time</th><th>Student</th><th>Service Type</th><th>Student Cancellation</th><th>Status</th><th>Action</th></tr></thead><tbody>${activeRows.map((a) => `<tr>
      <td>${formatDateTime(a)}</td>
      <td>${escapeHtml(a.student_name || "—")}</td>
      <td>${escapeHtml(a.service_type || "—")}</td>
      <td>${a.student_cancellation_reason ? escapeHtml(a.student_cancellation_reason) : "—"}</td>
      <td>${a.status}</td>
      <td>${renderActiveActions(a)}</td>
    </tr>`).join("") || `<tr><td colspan="6">No appointments yet</td></tr>`}</tbody></table></div>`;

    const closedTable = closedRows.length === 0
      ? `<p class="muted">No closed appointments yet. Counselors mark sessions as Done, Referred, or No-show using the buttons above.</p>`
      : `<div class="table-wrap"><table><thead><tr><th>Date / Time</th><th>Student</th><th>Service Type</th><th>Outcome</th><th>Marked at</th></tr></thead><tbody>${closedRows.map((a) => `<tr>
        <td>${formatDateTime(a)}</td>
        <td>${escapeHtml(a.student_name || "—")}</td>
        <td>${escapeHtml(a.service_type || "—")}</td>
        <td>${outcomePill(a.outcome)}</td>
        <td>${a.outcome_at ? new Date(a.outcome_at).toLocaleString() : "—"}</td>
      </tr>`).join("")}</tbody></table></div>`;

    root.innerHTML = `
      <div class="panel-header"><h2 class="section-title">Requests</h2></div>
      <h3 class="subsection-title">Open requests</h3>
      ${pendingTable}
      <h3 class="subsection-title u-mt-section">All your appointments</h3>
      <p class="muted tiny">After a session, mark it as Done, Referred, or No-show. Closed items move to the section below.</p>
      ${activeTable}
      <div id="closedAppointmentsCard" class="collapsible-card">
        <button type="button" class="collapsible-header" id="closedAppointmentsToggle" aria-expanded="false">
          <span>Closed appointments (${closedRows.length})</span>
          <span class="chevron">›</span>
        </button>
        <div class="collapsible-body">${closedTable}</div>
      </div>
      <div id="counselorRescheduleModal" class="modal hidden">
        <div class="modal-content stack-md">
          <h3 id="counselorRescheduleTitle">Request reschedule</h3>
          <p class="muted tiny">The student will be notified to pick a new schedule.</p>
          <label class="field"><span>Message (optional)</span><textarea id="counselorRescheduleMessage" rows="4" placeholder="e.g. Please choose another date — I am unavailable on this day."></textarea></label>
          <div class="auth-actions">
            <button type="button" class="btn ghost" id="counselorRescheduleDismiss">Back</button>
            <button type="button" class="btn primary" id="counselorRescheduleConfirm">Confirm reschedule</button>
          </div>
        </div>
      </div>
      <p id="counselorRequestsMsg" class="feedback"></p>
    `;

    const reqMsg = document.getElementById("counselorRequestsMsg");
    document.querySelectorAll(".decline-btn").forEach((btn) => (btn.onclick = async () => {
      try {
        await api(`/appointments/${btn.dataset.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "declined" }) });
        await refreshCounselorRequestsBadge();
        await renderCounselorView(root, menu);
      } catch (err) { reqMsg.textContent = err.message; reqMsg.className = "feedback feedback-error"; }
    }));
    const rescheduleModal = document.getElementById("counselorRescheduleModal");
    const rescheduleMsg = document.getElementById("counselorRescheduleMessage");
    const rescheduleTitle = document.getElementById("counselorRescheduleTitle");
    let pendingRescheduleId = null;
    const closeRescheduleModal = () => {
      rescheduleModal.classList.add("hidden");
      rescheduleModal.style.display = "none";
      pendingRescheduleId = null;
      rescheduleMsg.value = "";
    };
    document.getElementById("counselorRescheduleDismiss").onclick = closeRescheduleModal;
    rescheduleModal.onclick = (e) => {
      if (e.target === rescheduleModal) closeRescheduleModal();
    };
    document.querySelectorAll(".reschedule-btn").forEach((btn) => {
      btn.onclick = () => {
        pendingRescheduleId = btn.dataset.id;
        rescheduleTitle.textContent = `Reschedule ${btn.dataset.code || "booking"}`;
        rescheduleMsg.value = "";
        rescheduleModal.classList.remove("hidden");
        rescheduleModal.style.display = "flex";
        rescheduleMsg.focus();
      };
    });
    document.getElementById("counselorRescheduleConfirm").onclick = async () => {
      if (!pendingRescheduleId) return;
      const message = rescheduleMsg.value.trim();
      try {
        await api(`/appointments/${pendingRescheduleId}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "reschedule_requested", message: message || undefined })
        });
        closeRescheduleModal();
        reqMsg.textContent = "Reschedule request sent.";
        reqMsg.className = "feedback status-success";
        await refreshCounselorRequestsBadge();
        await renderCounselorView(root, menu);
      } catch (err) {
        reqMsg.textContent = err.message;
        reqMsg.className = "feedback feedback-error";
      }
    };
    document.querySelectorAll(".approve-btn").forEach((btn) => (btn.onclick = async () => {
      try {
        await api(`/appointments/${btn.dataset.id}/status`, { method: "PATCH", body: JSON.stringify({ status: "accepted" }) });
        await refreshCounselorRequestsBadge();
        await renderCounselorView(root, menu);
      } catch (err) { reqMsg.textContent = err.message; reqMsg.className = "feedback feedback-error"; }
    }));
    document.querySelectorAll(".outcome-select").forEach((sel) => {
      sel.addEventListener("change", () => {
        const submitBtn = document.querySelector(`.outcome-submit[data-id="${sel.dataset.id}"]`);
        if (submitBtn) submitBtn.disabled = !sel.value;
      });
    });
    document.querySelectorAll(".outcome-submit").forEach((btn) => (btn.onclick = async () => {
      const sel = document.querySelector(`.outcome-select[data-id="${btn.dataset.id}"]`);
      const outcome = sel?.value;
      if (!outcome) {
        reqMsg.textContent = "Please choose an outcome from the dropdown first.";
        reqMsg.className = "feedback feedback-error";
        return;
      }
      const labelMap = { done: "mark as Done", referred: "mark as Referred", no_show: "mark as No-show" };
      if (!confirm(`Are you sure you want to ${labelMap[outcome] || outcome} this appointment?`)) return;
      btn.disabled = true;
      const prevText = btn.textContent;
      btn.textContent = "Saving…";
      try {
        await api(`/appointments/${btn.dataset.id}/outcome`, { method: "PATCH", body: JSON.stringify({ outcome }) });
        reqMsg.textContent = "Outcome saved.";
        reqMsg.className = "feedback status-success";
        await renderCounselorView(root, menu);
      } catch (err) {
        reqMsg.textContent = err.message;
        reqMsg.className = "feedback feedback-error";
        btn.disabled = false;
        btn.textContent = prevText;
      }
    }));

    const collapsible = document.getElementById("closedAppointmentsCard");
    const toggle = document.getElementById("closedAppointmentsToggle");
    refreshScrollableDataSections(root);

    toggle?.addEventListener("click", () => {
      const open = collapsible.classList.toggle("open");
      toggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
    return;
  }
  if (menu === "Analytics") {
    let firstPaint = true;
    const paint = async () => {
      const data = await api("/counselor/analytics");
      if (firstPaint) {
        root.innerHTML = `
          <div class="panel-header"><h2 class="section-title">Analytics</h2></div>
          <p class="muted tiny">Figures are <strong>approved sessions</strong> (appointments with status <em>accepted</em>), based on appointment date.</p>
          <div class="grid-3">
            <div class="kpi"><p>This week</p><strong id="counselorKpiWeek">${data.weekly}</strong></div>
            <div class="kpi"><p>This month</p><strong id="counselorKpiMonth">${data.monthly}</strong></div>
            <div class="kpi"><p>This year</p><strong id="counselorKpiYear">${data.yearly}</strong></div>
          </div>
          <h3 class="subsection-title u-mt-section">Outcome breakdown (all-time)</h3>
          <div class="grid-4 outcome-grid">
            <div class="kpi outcome-card done"><p>Done</p><strong id="counselorOutDone">0</strong></div>
            <div class="kpi outcome-card referred"><p>Referred</p><strong id="counselorOutReferred">0</strong></div>
            <div class="kpi outcome-card no-show"><p>No-show</p><strong id="counselorOutNoShow">0</strong></div>
            <div class="kpi outcome-card cancelled"><p>Cancelled by student</p><strong id="counselorOutCancelled">0</strong></div>
          </div>
          <div class="analytics-charts-row">
            <div class="chart-card">
              <h4 class="chart-card-title">Daily trend (last 30 days)</h4>
              <div class="chart-canvas-wrap"><canvas id="counselorChartDaily" aria-label="Daily sessions chart"></canvas></div>
            </div>
            <div class="chart-card">
              <h4 class="chart-card-title">Monthly trend (last 12 months)</h4>
              <div class="chart-canvas-wrap"><canvas id="counselorChartMonthly" aria-label="Monthly sessions chart"></canvas></div>
            </div>
          </div>
          <p id="counselorAnalyticsUpdated" class="muted tiny"></p>`;
        firstPaint = false;
      } else {
        document.getElementById("counselorKpiWeek").textContent = data.weekly;
        document.getElementById("counselorKpiMonth").textContent = data.monthly;
        document.getElementById("counselorKpiYear").textContent = data.yearly;
      }
      const ob = data.outcomeBreakdown?.totals || { done: 0, referred: 0, noShow: 0, cancelledByStudent: 0 };
      const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
      setText("counselorOutDone", ob.done);
      setText("counselorOutReferred", ob.referred);
      setText("counselorOutNoShow", ob.noShow);
      setText("counselorOutCancelled", ob.cancelledByStudent);
      counselorChartDaily = bindOrUpdateLineChart(
        counselorChartDaily,
        "counselorChartDaily",
        data.chart30Days.map((d) => d.label),
        data.chart30Days.map((d) => d.sessions),
        "Approved sessions",
        "#1a367c"
      );
      counselorChartMonthly = bindOrUpdateLineChart(
        counselorChartMonthly,
        "counselorChartMonthly",
        data.chart12Months.map((d) => d.label),
        data.chart12Months.map((d) => d.sessions),
        "Approved sessions",
        "#b8891b"
      );
      const u = document.getElementById("counselorAnalyticsUpdated");
      if (u) u.textContent = `Last updated: ${new Date().toLocaleString()}`;
    };
    await paint();
    counselorAnalyticsPollTimer = setInterval(paint, 14000);
    return;
  }
  await loadNotifications();
  root.innerHTML = `<div class="panel-header"><h2 class="section-title">Welcome ${state.user?.name || "Counselor"}!</h2></div><h3>Recent Activity</h3>${renderRecentActivity(state.notifications)}`;
}

function renderGcoServicesPage(root) {
  const services = [
    {
      title: "Counseling",
      body:
        "Individual and group sessions conducted by licensed and trained counselors are offered to students who have concerns regarding their academic, career, family, or personal lives in general."
    },
    {
      title: "Testing",
      body:
        "Through standardized tests, students are assessed in terms of individual strengths and weaknesses in the areas of personality, intelligence, aptitudes, values, interests, and job preferences. Test results are interpreted for students' self-awareness, growth, and development."
    },
    {
      title: "Individual Inventory",
      body:
        "To help students keep track of their personal growth and development, GCO makes sure that educational records, test results, counselling interview notes, and other personal data files are kept confidential and are safely kept in individual envelopes and are updated regularly."
    },
    {
      title: "Academic Probation/Follow-up",
      body:
        "Students on probationary status and those with low grades are given assistance and dealt with individually to find out possible causes of their poor academic performance. The program helps students develop proper attitudes and skills in coping with academic difficulties."
    },
    {
      title: "Career and Placement Program",
      body:
        "The counselors help graduating students prepare for future job screening by giving them exit and mock employment interviews. They provide honest feedback to students regarding their strengths and weaknesses based on the interviews. Moreover, GCO conducts job search seminars, job fairs, and expositions to help graduating and graduate students in their job placements."
    },
    {
      title: "Enrichment Program",
      body:
        "In response to various student needs, GCO conducts seminars, workshops, symposia, educational sessions, and modular programs, which are aimed at making students attain personal growth and development."
    },
    {
      title: "Peer Facilitators' Training Program",
      body:
        "To reach and serve more students in the University, GCO selects and trains students who have the potential to establish peer support. The candidates are trained to acquire greater sensitivity to peers' concerns and develop the ability to facilitate individual and peer groups. The program also hopes to inculcate in the peer facilitators a sense of service, thus making them persons for others."
    },
    {
      title: "Outreach Program",
      body:
        "To give the counsellors and peer facilitators the opportunity to get involved in community service and to instill in them the concern for the dignity of the human person, GCO initiates linkages with government and non-government organizations and service programs such as orphanages, shelters for street kids, and in poor communities within the local government units."
    },
    {
      title: "Students' Internship Program",
      body:
        "Students in the graduate (MA Guidance and Counseling and MA Psychology) and undergraduate (BS/ AB Psychology) programs are provided with a venue for training in the field of guidance and counseling. The students undergo actual training with the supervision of a Registered Guidance Counselor in the program of their specialization."
    },
    {
      title: "Faculty and Parent Consultations",
      body:
        "The services of GCO are open to parents, faculty, alumni, and XU personnel who want consultation regarding school and family matters."
    },
    {
      title: "Research and Evaluation",
      body:
        "Studies and surveys on relevant issues about the students and the Xavier community are periodically conducted to address particular needs and to improve the university's programs and services."
    }
  ];
  root.innerHTML = `
    <div class="panel-header">
      <div>
        <h2 class="section-title">GCO Services</h2>
        <p class="muted">Programs offered through the Guidance and Counseling Office.</p>
      </div>
    </div>
    <article class="gco-fb-link-card">
      <div>
        <h3 class="service-card-title">GCO Facebook page</h3>
        <p class="service-card-body">Follow the Guidance and Counseling Office on Facebook for updates, announcements, and resources.</p>
      </div>
      <a href="https://tinyurl.com/GCO-FBPage" target="_blank" rel="noopener noreferrer" class="btn primary">Visit GCO Facebook page</a>
    </article>
    <div class="services-grid">
      ${services
        .map(
          (s) => `
        <article class="service-card">
          <h3 class="service-card-title">${escapeHtml(s.title)}</h3>
          <p class="service-card-body">${escapeHtml(s.body)}</p>
        </article>`
        )
        .join("")}
    </div>`;
}

async function renderStudentView(root, menu) {
  if (menu === "Dashboard") return renderStudentDashboard(root);
  if (menu === "GCO Services") return renderGcoServicesPage(root);
  if (menu === "Book Appointment") {
    await loadCounselors();
    const todayIso = new Date().toISOString().slice(0, 10);
    if (!state.counselors?.length) {
      root.innerHTML = `<div class="panel-header"><h2 class="section-title">Book Appointment</h2></div><p class="feedback feedback-error">No counselors are available yet. Please check back later.</p>`;
      return;
    }

    root.innerHTML = `
      <div class="panel-header"><h2 class="section-title">Book Appointment</h2></div>
      <form id="bookForm" class="stack-md">
        <label class="field"><span>Counselor</span><select id="bookCounselor" required>${state.counselors.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join("")}</select></label>
        <div class="booking-meta-grid">
          <label class="field"><span>Year Level</span><select id="bookYearLevel" required>${YEAR_LEVEL_OPTIONS.map((y) => `<option value="${y}">${y}</option>`).join("")}</select></label>
          <label class="field"><span>College</span><select id="bookCollege" required>${COLLEGE_OPTIONS.map((c) => `<option value="${c}">${c}</option>`).join("")}</select></label>
        </div>
        <div id="studentCounselorCalendar" class="card stack-md student-calendar-card"></div>
        <section id="bookingDetailsSection" class="booking-details-card stack-md">
          <div class="booking-details-header">
            <h3>Appointment Details</h3>
            <p class="muted tiny" id="bookingDetailsHint">Pick a weekday on the calendar (Monday–Friday). Saturdays are closed for booking.</p>
          </div>
          <label class="field"><span>Date</span><input type="date" id="bookDate" min="${todayIso}" required /></label>
            <label class="field"><span>Time</span><select id="bookTime" required><option value="">Choose counselor and date first</option></select></label>
            <label class="field"><span>Service Type</span><select id="bookService" required><option value="">Loading…</option></select></label>
          <label class="field"><span>Additional Information</span><textarea id="bookReason" placeholder="Tell us briefly what you need help with."></textarea></label>
          <button type="submit" class="btn primary">Book Appointment</button>
        </section>
      </form><p id="bookMsg" class="feedback"></p>`;

    const counselorSelect = document.getElementById("bookCounselor");
    const dateInput = document.getElementById("bookDate");
    const calendarWrap = document.getElementById("studentCounselorCalendar");
    const currentYear = new Date().getFullYear();
    let studentCalendarYear = currentYear;
    let fullDayBlocks = new Set();
    let partialBlocks = [];

    const isoIsWeekend = (iso) => {
      const d = new Date(`${iso}T12:00:00`);
      const x = d.getDay();
      return x === 0 || x === 6;
    };

    const fillServiceSelect = (serviceList) => {
      const sel = document.getElementById("bookService");
      if (!sel) return;
      const prev = sel.value;
      const list = Array.isArray(serviceList) ? serviceList : [];
      sel.innerHTML = list.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("");
      if (list.includes(prev)) sel.value = prev;
    };

    const fillTimeSelect = (slots) => {
      const sel = document.getElementById("bookTime");
      if (!sel) return;
      if (!slots.length) {
        sel.innerHTML = `<option value="">No open slots for this day</option>`;
        sel.removeAttribute("required");
        return;
      }
      sel.setAttribute("required", "required");
      sel.innerHTML = slots
        .map(
          (s) =>
            `<option value="${escapeHtml(s.value)}" data-duration="${Number(s.durationMinutes) || 60}">${escapeHtml(s.label)}</option>`
        )
        .join("");
    };

    const refreshTimeOptionsForDate = (date) => {
      const timeSelect = document.getElementById("bookTime");
      if (!timeSelect) return;
      const blocksToday = partialBlocks.filter((b) => b.date === date);
      Array.from(timeSelect.options).forEach((opt) => {
        if (!opt.value) return;
        if (!opt.dataset.baseLabel) opt.dataset.baseLabel = opt.textContent.replace(/\s*— Unavailable\s*$/, "").trim();
        const slotStart = opt.value;
        const dur = Number(opt.dataset.duration || 60);
        const [h, m] = slotStart.split(":").map(Number);
        const startMin = h * 60 + m;
        const endMin = startMin + dur;
        const eh = String(Math.floor(endMin / 60)).padStart(2, "0");
        const em = String(endMin % 60).padStart(2, "0");
        const slotEnd = `${eh}:${em}`;
        const conflict = blocksToday.some((b) => {
          const bs = (b.start || "00:00").slice(0, 5);
          const be = (b.end || "23:59").slice(0, 5);
          return slotStart < be && slotEnd > bs;
        });
        opt.disabled = conflict;
        opt.textContent = conflict ? `${opt.dataset.baseLabel} — Unavailable` : opt.dataset.baseLabel;
      });
      const firstOk = Array.from(timeSelect.options).find((o) => o.value && !o.disabled);
      if (firstOk) timeSelect.value = firstOk.value;
    };

    const applyBookingOptions = async () => {
      const cid = counselorSelect.value;
      const date = dateInput.value;
      const hint = document.getElementById("bookingDetailsHint");
      if (!cid) return;
      try {
        let url = `/utility/booking-options?counselorId=${encodeURIComponent(cid)}`;
        if (date) url += `&date=${encodeURIComponent(date)}`;
        const data = await api(url);
        fillServiceSelect(data.services || []);
        if (date) {
          fillTimeSelect(data.slots || []);
          if (data.dayNote && hint) hint.textContent = data.dayNote;
          else if (hint) {
            const partialToday = partialBlocks.filter((b) => b.date === date);
            if (!(data.slots || []).length) {
              hint.textContent = isoIsWeekend(date)
                ? "Weekends are closed for booking. Please choose a weekday."
                : "No time slots remain for this counselor on this date.";
            } else if (partialToday.length) {
              const ranges = partialToday.map((b) => `${b.start}–${b.end}`).join(", ");
              hint.textContent = `Selected ${date}. Counselor is blocked ${ranges}; times below avoid those windows when possible.`;
            } else {
              hint.textContent = `Selected ${date}. Choose a time and add notes if you wish.`;
            }
          }
          refreshTimeOptionsForDate(date);
        } else {
          const sel = document.getElementById("bookTime");
          if (sel) {
            sel.innerHTML = `<option value="">Choose a date on the calendar</option>`;
            sel.removeAttribute("required");
          }
          if (hint) hint.textContent = "Pick a weekday on the calendar (Monday–Friday). Saturdays are closed for booking.";
        }
      } catch (err) {
        const msg = document.getElementById("bookMsg");
        if (msg) {
          msg.textContent = err.message || "Could not load booking options.";
          msg.className = "feedback feedback-error";
        }
      }
    };

    const loadUnavailable = async () => {
      if (!counselorSelect.value) return;
      const calendarData = await api(`/counselor/calendar?year=${studentCalendarYear}&counselorId=${counselorSelect.value}`);
      const allRows = calendarData.unavailable || [];
      fullDayBlocks = new Set(
        allRows.filter((r) => isFullDayUnavailBlock(r)).map((r) => String(r.unavailable_date).slice(0, 10))
      );
      partialBlocks = allRows
        .filter((r) => (r.start_time || r.end_time) && !isFullDayUnavailBlock(r))
        .map((r) => ({
          date: String(r.unavailable_date).slice(0, 10),
          start: r.start_time ? String(r.start_time).slice(0, 5) : "00:00",
          end: r.end_time ? String(r.end_time).slice(0, 5) : "23:59"
        }));
      if (dateInput.value) refreshTimeOptionsForDate(dateInput.value);
      calendarWrap.innerHTML = `
        <div class="year-header">
          <div>
            <h3>Counselor Calendar</h3>
            <p class="muted tiny">Unavailable dates are blocked. Weekends cannot be booked. Click a weekday to fill the date.</p>
          </div>
          <div class="year-nav">
            <button type="button" class="btn ghost" id="studentCalPrevYear">‹</button>
            <strong>${studentCalendarYear}</strong>
            <button type="button" class="btn ghost" id="studentCalNextYear">›</button>
          </div>
        </div>
        <div class="calendar-legend">
          <span><i class="dot available"></i>Available</span>
          <span><i class="dot booked"></i>With appointments</span>
          <span><i class="dot unavailable"></i>Unavailable (all day)</span>
          <span><i class="dot partial-unavailable"></i>Part-day only</span>
          <span><i class="dot today"></i>Today</span>
        </div>
        <div class="year-calendar-grid">${buildYearCalendar(studentCalendarYear, calendarData.appointments || [], calendarData.unavailable || [], { disableWeekendBooking: true })}</div>
      `;
      const today = new Date().toISOString().slice(0, 10);
      calendarWrap.querySelectorAll(".calendar-day-btn").forEach((btn) => {
        const selected = btn.dataset.date;
        const isFullDayBlocked = fullDayBlocks.has(selected);
        const isPast = selected < today;
        const isWeekend = isoIsWeekend(selected);
        if (isFullDayBlocked || isPast || isWeekend) {
          btn.disabled = true;
          btn.classList.add("disabled");
          btn.title = isWeekend ? "No bookings on weekends" : isFullDayBlocked ? "Counselor unavailable all day" : "Past date";
        } else {
          const partialToday = partialBlocks.filter((b) => b.date === selected);
          if (partialToday.length) {
            const ranges = partialToday.map((b) => `${b.start} – ${b.end}`).join(", ");
            btn.title = `Partially blocked: ${ranges}. Other times may still be available.`;
          }
          btn.onclick = () => {
            dateInput.value = selected;
            dateInput.dispatchEvent(new Event("change", { bubbles: true }));
            const detailsSection = document.getElementById("bookingDetailsSection");
            const hint = document.getElementById("bookingDetailsHint");
            if (hint) {
              if (partialToday.length) {
                const ranges = partialToday.map((b) => `${b.start}–${b.end}`).join(", ");
                hint.textContent = `Selected ${selected}. Counselor is unavailable ${ranges}; other slots may still be open.`;
              }
            }
            if (detailsSection) {
              detailsSection.classList.add("highlight");
              detailsSection.scrollIntoView({ behavior: "smooth", block: "start" });
              setTimeout(() => detailsSection.classList.remove("highlight"), 1600);
              const timeSelect = document.getElementById("bookTime");
              if (timeSelect) setTimeout(() => timeSelect.focus(), 450);
            }
          };
        }
      });
      document.getElementById("studentCalPrevYear").onclick = async () => {
        studentCalendarYear -= 1;
        await loadUnavailable();
        await applyBookingOptions();
      };
      document.getElementById("studentCalNextYear").onclick = async () => {
        studentCalendarYear += 1;
        await loadUnavailable();
        await applyBookingOptions();
      };
    };

    counselorSelect.onchange = async () => {
      await loadUnavailable();
      await applyBookingOptions();
    };

    await loadUnavailable();
    await applyBookingOptions();

    dateInput.onchange = async () => {
      const v = dateInput.value;
      if (isoIsWeekend(v)) {
        dateInput.setCustomValidity("Bookings are only available Monday through Friday (weekends are closed).");
      } else if (fullDayBlocks.has(v)) {
        dateInput.setCustomValidity("Selected date is fully unavailable for this counselor.");
      } else {
        dateInput.setCustomValidity("");
      }
      await applyBookingOptions();
    };

    document.getElementById("bookForm").onsubmit = async (e) => {
      e.preventDefault();
      const timeEl = document.getElementById("bookTime");
      const serviceEl = document.getElementById("bookService");
      if (!timeEl.value || timeEl.selectedOptions[0]?.disabled) {
        const msg = document.getElementById("bookMsg");
        msg.textContent = "Please choose an available time slot.";
        msg.className = "feedback feedback-error";
        return;
      }
      const payload = {
        counselorId: Number(counselorSelect.value),
        yearLevel: document.getElementById("bookYearLevel").value,
        college: document.getElementById("bookCollege").value,
        date: dateInput.value,
        time: timeEl.value,
        serviceType: serviceEl.value,
        reason: document.getElementById("bookReason").value.trim()
      };
      const msg = document.getElementById("bookMsg");
      try {
        await api("/appointments", { method: "POST", body: JSON.stringify(payload) });
        msg.textContent = "Appointment booked successfully.";
        msg.className = "feedback status-success";
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
    return;
  }
  if (menu === "Appointment History") {
    await loadAppointments();
    const canCancel = (a) =>
      !a.outcome && ["pending", "accepted", "reschedule_requested"].includes(String(a.status).toLowerCase());
    const rowsHtml =
      state.appointments.length === 0
        ? `<tr><td colspan="8">No appointments yet.</td></tr>`
        : state.appointments
            .map((a) => {
              const timeDisp = formatDisplayTime(a.appointment_time);
              const cancelBtn = canCancel(a)
                ? `<button type="button" class="btn ghost student-cancel-appt" data-id="${a.id}" data-code="${escapeHtml(a.booking_code)}">Cancel</button>`
                : `<span class="muted">—</span>`;
              const cancelNote =
                String(a.status).toLowerCase() === "cancelled" && a.student_cancellation_reason
                  ? escapeHtml(a.student_cancellation_reason)
                  : "—";
              return `<tr><td>${escapeHtml(a.booking_code)}</td><td>${formatDisplayDate(a.appointment_date)}</td><td>${timeDisp}</td><td>${renderStudentHistoryStatus(a)}</td><td>${escapeHtml(a.service_type || "—")}</td><td>${escapeHtml(a.counselor_name || "—")}</td><td class="cancel-reason-cell">${cancelNote}</td><td>${cancelBtn}</td></tr>`;
            })
            .join("");
    root.innerHTML = `
      <div class="panel-header"><h2 class="section-title">Appointment History</h2></div>
      <div class="table-wrap"><table><thead><tr><th>Code</th><th>Date</th><th>Time</th><th>Status</th><th>Service</th><th>Counselor</th><th>Your cancellation reason</th><th>Action</th></tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <div id="studentCancelModal" class="modal hidden">
        <div class="modal-content stack-md">
          <h3 id="studentCancelTitle">Cancel appointment</h3>
          <p class="muted tiny">Counselors and admin will see this reason.</p>
          <label class="field"><span>Why are you cancelling?</span><textarea id="studentCancelReason" rows="4" required placeholder="e.g. Schedule conflict, no longer needed…" minlength="5"></textarea></label>
          <div class="auth-actions">
            <button type="button" class="btn ghost" id="studentCancelDismiss">Back</button>
            <button type="button" class="btn primary" id="studentCancelConfirm">Confirm cancellation</button>
          </div>
        </div>
      </div>
      <p id="studentHistoryMsg" class="feedback"></p>`;
    const modal = document.getElementById("studentCancelModal");
    const reasonInput = document.getElementById("studentCancelReason");
    const titleEl = document.getElementById("studentCancelTitle");
    let pendingCancelId = null;
    const closeModal = () => {
      modal.classList.add("hidden");
      modal.style.display = "none";
      pendingCancelId = null;
      reasonInput.value = "";
    };
    const openModal = (id, code) => {
      pendingCancelId = id;
      titleEl.textContent = `Cancel ${code}`;
      reasonInput.value = "";
      modal.classList.remove("hidden");
      modal.style.display = "flex";
      reasonInput.focus();
    };
    document.getElementById("studentCancelDismiss").onclick = closeModal;
    modal.onclick = (e) => {
      if (e.target === modal) closeModal();
    };
    document.getElementById("studentCancelConfirm").onclick = async () => {
      const msg = document.getElementById("studentHistoryMsg");
      const reason = reasonInput.value.trim();
      if (reason.length < 5) {
        msg.textContent = "Please enter at least 5 characters.";
        msg.className = "feedback feedback-error";
        return;
      }
      if (!pendingCancelId) return;
      try {
        await api(`/appointments/${pendingCancelId}`, {
          method: "DELETE",
          body: JSON.stringify({ cancellationReason: reason })
        });
        closeModal();
        msg.textContent = "Appointment cancelled.";
        msg.className = "feedback status-success";
        await renderStudentView(root, menu);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
    document.querySelectorAll(".student-cancel-appt").forEach((btn) => {
      btn.onclick = () => openModal(btn.dataset.id, btn.dataset.code || "booking");
    });
    return;
  }
  if (menu === "Notifications") {
    return renderNotificationsView(root);
  }
  if (menu === "Settings") return renderAccountSettings(root);
  await loadNotifications();
  root.innerHTML = `<div class="panel-header"><h2 class="section-title">Welcome ${state.user?.name || "Student"}!</h2></div><h3>Recent Activity</h3>${renderRecentActivity(state.notifications)}`;
}

async function renderAdminSystemLogsPage(root) {
  const paint = async () => {
    const data = await api("/admin/logs?limit=120");
    const rows = data.items.length === 0
      ? `<tr><td colspan="4">No recent activity.</td></tr>`
      : data.items.map((r) => {
          const time = new Date(r.createdAt).toLocaleString('en-PH');
          const actor = `${r.actorName || 'System'} (${r.actorRole})`;
          let readableAction = r.action;
          const meta = r.meta || {};
          
          // Parse common actions to readable format
          if (r.action === 'login') readableAction = `${actor} logged in`;
          else if (r.action === 'admin_created_user') readableAction = `Created user: ${meta.email || 'unknown'} (${meta.role || '?'})`;
          else if (r.action === 'appointment_status_changed') readableAction = `Appointment ${meta.bookingCode || meta.appointmentId}: ${meta.newStatus || 'updated'}`;
          else if (r.action === 'student_cancelled_appointment') readableAction = `Student cancelled: ${meta.bookingCode}`;
          else if (r.action === 'admin_deleted_appointment') readableAction = `Admin deleted appointment: ${meta.bookingCode}`;
          else if (r.action.includes('import')) readableAction = `CSV import: ${meta.imported || 0} records`;
          else if (r.action === 'admin_notification_sent') readableAction = `Sent notification: ${meta.title}`;
          
          const details = Object.entries(meta)
            .map(([k, v]) => `${k}: ${String(v).slice(0, 50)}${String(v).length > 50 ? '...' : ''}`)
            .join(', ') || '—';
            
          return `<tr><td>${time}</td><td>${escapeHtml(actor)}</td><td>${escapeHtml(readableAction)}</td><td class="log-meta-cell">${escapeHtml(details)}</td></tr>`;
        }).join("");
  root.innerHTML = `
      <div class="panel-header"><h2 class="section-title">System Logs</h2></div>
      <p class="muted tiny">Recent actions, appointment updates, cancellations, and user activity. Auto-refreshes every 10s.</p>
      <div class="table-wrap"><table><thead><tr><th>Time</th><th>User</th><th>Activity</th><th>Details</th></tr></thead><tbody>${rows}</tbody></table></div>
      <p class="muted tiny">Last refresh: ${new Date().toLocaleString()}</p>`;
    refreshScrollableDataSections(root);
  };
  await paint();
  adminSectionPollTimer = setInterval(paint, 10000);
}

async function renderAdminReportsPage(root) {
  let shellReady = false;
  const paint = async () => {
    const s = await api("/admin/reports/summary");
    if (!shellReady) {
      root.innerHTML = `
        <div class="panel-header"><h2 class="section-title">Reports</h2></div>
        <p class="muted tiny">Live database summary. Export files for documentation or accreditation.</p>
        <div class="grid-3">
          <div class="kpi"><p>Active users</p><strong id="repUsers">0</strong></div>
          <div class="kpi"><p>Total bookings</p><strong id="repAppt">0</strong></div>
          <div class="kpi"><p>Open requests</p><strong id="repPending">0</strong></div>
        </div>
        <div class="grid-3">
          <div class="kpi"><p>Accepted sessions</p><strong id="repAcc">0</strong></div>
          <div class="kpi"><p>Cancelled</p><strong id="repCan">0</strong></div>
          <div class="kpi"><p>Audit rows (24h)</p><strong id="repLog">0</strong></div>
        </div>
        <div class="admin-report-actions">
          <details class="report-export-dropdown" id="reportExportDropdown">
            <summary class="btn primary report-export-trigger">Download report</summary>
            <div class="report-export-menu" role="menu">
              <button type="button" class="report-export-item" id="dlApptCsv" role="menuitem">Download appointments (CSV)</button>
              <button type="button" class="report-export-item" id="dlAuditCsv" role="menuitem">Download system activity (CSV)</button>
            </div>
          </details>
        </div>
        <h3 class="subsection-title">Counselor workload</h3>
        <div id="repCounselorTable" class="table-wrap"></div>
        <p id="repUpdated" class="muted tiny"></p>
        <p id="repMsg" class="feedback"></p>`;
      document.getElementById("dlApptCsv").onclick = async () => {
        document.getElementById("reportExportDropdown")?.removeAttribute("open");
        const msg = document.getElementById("repMsg");
        try {
          await downloadWithAuth("/admin/reports/appointments-csv", `gco-appointments-${Date.now()}.csv`);
          msg.textContent = "Appointments CSV download started.";
          msg.className = "feedback status-success";
        } catch (e) {
          msg.textContent = e.message;
          msg.className = "feedback feedback-error";
        }
      };
      document.getElementById("dlAuditCsv").onclick = async () => {
        document.getElementById("reportExportDropdown")?.removeAttribute("open");
        const msg = document.getElementById("repMsg");
        try {
          await downloadWithAuth("/admin/reports/audit-csv", `gco-system-activity-${Date.now()}.csv`);
          msg.textContent = "Activity log CSV download started.";
          msg.className = "feedback status-success";
        } catch (e) {
          msg.textContent = e.message;
          msg.className = "feedback feedback-error";
        }
      };
      shellReady = true;
    }
    document.getElementById("repUsers").textContent = s.users.total;
    document.getElementById("repAppt").textContent = s.appointments.total;
    document.getElementById("repPending").textContent = s.appointments.pending;
    document.getElementById("repAcc").textContent = s.appointments.accepted;
    document.getElementById("repCan").textContent = s.appointments.cancelled;
    document.getElementById("repLog").textContent = s.activity.auditLogEntriesLast24h;
    const tb = document.getElementById("repCounselorTable");
    tb.innerHTML =
      s.counselorBreakdown.length === 0
        ? `<p class="muted">No counselors.</p>`
        : `<table><thead><tr><th>Counselor</th><th>Approved sessions</th><th>All bookings</th></tr></thead><tbody>${s.counselorBreakdown
            .map(
              (c) =>
                `<tr><td>${escapeHtml(c.counselorName)}</td><td>${c.acceptedSessions}</td><td>${c.totalBookings}</td></tr>`
            )
            .join("")}</tbody></table>`;
    document.getElementById("repUpdated").textContent = `Summary generated: ${new Date(s.generatedAt).toLocaleString()}`;
  };
  await paint();
  adminSectionPollTimer = setInterval(paint, 16000);
}

async function renderAdminAnalyticsPage(root) {
  const [users, distinct] = await Promise.all([api("/admin/users"), api("/admin/analytics/distinct").catch(() => ({ services: [], yearLevels: [], colleges: [] }))]);
  const counselors = users.filter((u) => u.role === "counselor" && u.is_active);
  const selectedCounselorIds = new Set();
  let selectedService = "";
  let selectedYearLevel = "";
  let selectedCollege = "";

  const SERVICE_OPTIONS = [
    "Counseling",
    "Testing",
    "Academic/Probation Follow up",
    "Individual Inventory",
    "Career and Placement Program",
    "Enrichment Program",
    "Peer Facilitator's Training Program",
    "Outreach Program",
    "Student's Internship Program",
    "Research and Evaluation",
    "Faculty/Parent Consultation"
  ];
  const allServices = Array.from(new Set([...SERVICE_OPTIONS, ...(distinct.services || [])]));
  const allYearLevels = Array.from(new Set(["1st Year", "2nd Year", "3rd Year", "4th Year", ...(distinct.yearLevels || [])]));
  const COLLEGE_OPTIONS_LOCAL = [
    "College of Arts and Sciences",
    "College of Computer Studies",
    "School of Education",
    "School of Law",
    "College of Engineering",
    "School of Business and Management",
    "School of Medicine",
    "College of Nursing",
    "College of Agriculture"
  ];
  const allColleges = Array.from(new Set([...COLLEGE_OPTIONS_LOCAL, ...(distinct.colleges || [])]));

  let chartDayStart = "";
  let chartMonthStart = "";

  const fetchAndRender = async () => {
    const params = new URLSearchParams();
    if (selectedCounselorIds.size) params.set("counselorIds", Array.from(selectedCounselorIds).join(","));
    if (selectedService) params.set("serviceType", selectedService);
    if (selectedYearLevel) params.set("yearLevel", selectedYearLevel);
    if (selectedCollege) params.set("college", selectedCollege);
    if (chartDayStart) params.set("daysFromDate", chartDayStart);
    if (chartMonthStart) params.set("monthsFromMonth", chartMonthStart);
    const data = await api(`/admin/analytics/breakdown?${params.toString()}`);
    paint(data);
  };

  const paint = (data) => {
    const t = data.totals;
    const setText = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
    setText("admBreakTotal", t.total);
    setText("admBreakAccepted", t.accepted);
    setText("admBreakDone", t.done);
    setText("admBreakReferred", t.referred);
    setText("admBreakNoShow", t.noShow);
    setText("admBreakCancelled", t.cancelledByStudent);
    setText("admBreakDeclined", t.declined);
    setText("admBreakPending", t.pending);
    adminChartDaily = bindOrUpdateLineChart(
      adminChartDaily,
      "adminChartDaily",
      data.chart30Days.map((d) => d.label),
      data.chart30Days.map((d) => d.sessions),
      "Appointments",
      "#1a367c"
    );
    adminChartMonthly = bindOrUpdateLineChart(
      adminChartMonthly,
      "adminChartMonthly",
      data.chart12Months.map((d) => d.label),
      data.chart12Months.map((d) => d.sessions),
      "Appointments",
      "#b8891b"
    );
    const updated = document.getElementById("adminAnUpdated");
    if (updated) updated.textContent = `Last updated: ${new Date().toLocaleString()}`;
    const dayLabel = document.getElementById("chartDayRangeLabel");
    if (dayLabel && data.chart30Days?.length) {
      const first = data.chart30Days[0];
      const last = data.chart30Days[data.chart30Days.length - 1];
      dayLabel.textContent = `Window: ${first.date} → ${last.date}`;
    }
    const monthLabel = document.getElementById("chartMonthRangeLabel");
    if (monthLabel && data.chart12Months?.length) {
      const first = data.chart12Months[0];
      const last = data.chart12Months[data.chart12Months.length - 1];
      monthLabel.textContent = `Window: ${first.label} → ${last.label}`;
    }
  };

  root.innerHTML = `
    <div class="panel-header"><h2 class="section-title">Counselor Analytics</h2></div>
    <div class="card stack-md section-block">
      <h3 class="subsection-title filter-heading-reset">Filters</h3>
      <div class="filter-grid">
        <label class="field">
          <span>Counselors</span>
          <div class="counselor-picker">
            <button type="button" class="chip chip-active" id="counselorAllBtn" data-id="all">All counselors</button>
            <select id="counselorDropdown" class="counselor-select">
              <option value="">— Select a specific counselor —</option>
              ${counselors.map((c) => `<option value="${c.id}">${escapeHtml(c.full_name)}</option>`).join("")}
            </select>
          </div>
        </label>
        <label class="field">
          <span>Service Type</span>
          <select id="filterService"><option value="">All services</option>${allServices.map((s) => `<option value="${escapeHtml(s)}">${escapeHtml(s)}</option>`).join("")}</select>
        </label>
        <label class="field">
          <span>Year Level</span>
          <select id="filterYearLevel"><option value="">All year levels</option>${allYearLevels.map((y) => `<option value="${escapeHtml(y)}">${escapeHtml(y)}</option>`).join("")}</select>
        </label>
        <label class="field">
          <span>College</span>
          <select id="filterCollege"><option value="">All colleges</option>${allColleges.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("")}</select>
        </label>
      </div>
      <p class="muted tiny">Click "All counselors" to clear filters, or pick one counselor from the dropdown.</p>
    </div>
    <div class="grid-4 outcome-grid">
      <div class="kpi"><p>Total appointments</p><strong id="admBreakTotal">0</strong></div>
      <div class="kpi"><p>Accepted</p><strong id="admBreakAccepted">0</strong></div>
      <div class="kpi"><p>Pending</p><strong id="admBreakPending">0</strong></div>
      <div class="kpi"><p>Declined</p><strong id="admBreakDeclined">0</strong></div>
    </div>
    <div class="grid-4 outcome-grid u-mt-sm">
      <div class="kpi outcome-card done"><p>Done</p><strong id="admBreakDone">0</strong></div>
      <div class="kpi outcome-card referred"><p>Referred</p><strong id="admBreakReferred">0</strong></div>
      <div class="kpi outcome-card no-show"><p>No-show</p><strong id="admBreakNoShow">0</strong></div>
      <div class="kpi outcome-card cancelled"><p>Cancelled by student</p><strong id="admBreakCancelled">0</strong></div>
    </div>
    <div class="analytics-charts-row">
      <div class="chart-card">
        <div class="chart-card-head">
          <h4 class="chart-card-title">Daily trend (30 days)</h4>
          <label class="chart-range-input">
            <span>Start date</span>
            <input type="date" id="chartDayStartInput" />
          </label>
        </div>
        <div class="chart-canvas-wrap"><canvas id="adminChartDaily"></canvas></div>
        <p class="muted tiny" id="chartDayRangeLabel"></p>
      </div>
      <div class="chart-card">
        <div class="chart-card-head">
          <h4 class="chart-card-title">Monthly trend (12 months)</h4>
          <label class="chart-range-input">
            <span>Start month</span>
            <input type="month" id="chartMonthStartInput" />
          </label>
        </div>
        <div class="chart-canvas-wrap"><canvas id="adminChartMonthly"></canvas></div>
        <p class="muted tiny" id="chartMonthRangeLabel"></p>
      </div>
    </div>
    <p id="adminAnUpdated" class="muted tiny"></p>`;

  const allBtn = document.getElementById("counselorAllBtn");
  const counselorDropdown = document.getElementById("counselorDropdown");
  const refreshCounselorActiveState = () => {
    const noneSelected = selectedCounselorIds.size === 0;
    allBtn.classList.toggle("chip-active", noneSelected);
    counselorDropdown.value = noneSelected ? "" : String(Array.from(selectedCounselorIds)[0] || "");
  };
  allBtn.addEventListener("click", () => {
    selectedCounselorIds.clear();
    refreshCounselorActiveState();
    fetchAndRender().catch(() => {});
  });
  counselorDropdown.addEventListener("change", (e) => {
    const v = Number(e.target.value);
    selectedCounselorIds.clear();
    if (Number.isInteger(v) && v > 0) selectedCounselorIds.add(v);
    refreshCounselorActiveState();
    fetchAndRender().catch(() => {});
  });

  document.getElementById("filterService").addEventListener("change", (e) => {
    selectedService = e.target.value;
    fetchAndRender().catch(() => {});
  });
  document.getElementById("filterYearLevel").addEventListener("change", (e) => {
    selectedYearLevel = e.target.value;
    fetchAndRender().catch(() => {});
  });
  document.getElementById("filterCollege").addEventListener("change", (e) => {
    selectedCollege = e.target.value;
    fetchAndRender().catch(() => {});
  });
  document.getElementById("chartDayStartInput").addEventListener("change", (e) => {
    chartDayStart = e.target.value;
    fetchAndRender().catch(() => {});
  });
  document.getElementById("chartMonthStartInput").addEventListener("change", (e) => {
    chartMonthStart = e.target.value;
    fetchAndRender().catch(() => {});
  });

  await fetchAndRender();
  adminSectionPollTimer = setInterval(() => fetchAndRender().catch(() => {}), 18000);
  return;
}

async function renderAdminAnalyticsPage_legacy(root) {
  const users = await api("/admin/users");
  const counselors = users.filter((u) => u.role === "counselor" && u.is_active);
  let selectedId = counselors.length ? counselors[0].id : null;

  const paint = async () => {
    if (!selectedId) {
      root.innerHTML = `<div class="panel-header"><h2 class="section-title">Analytics</h2></div><p class="muted">Add at least one counselor to view session analytics.</p>`;
      destroyAdminAnalyticsCharts();
      adminChartDaily = null;
      adminChartMonthly = null;
      return;
    }
    const data = await api(`/admin/analytics/counselor/${selectedId}`);
    if (!root.querySelector("#adminAnalyticsSelect")) {
      root.innerHTML = `
        <div class="panel-header"><h2 class="section-title">Counselor Analytics</h2></div>
        <div class="card stack-md section-block">
          <label class="field"><span>Counselor</span><select id="adminAnalyticsSelect"></select></label>
          <p class="muted tiny">KPIs and charts count <strong>approved sessions</strong> (status: accepted) by appointment date. Updates every few seconds while you stay on this page.</p>
        </div>
        <div class="grid-3">
          <div class="kpi"><p>This week</p><strong id="admKpiW">0</strong></div>
          <div class="kpi"><p>This month</p><strong id="admKpiM">0</strong></div>
          <div class="kpi"><p>This year</p><strong id="admKpiY">0</strong></div>
        </div>
        <p class="subsection-title" id="admCounTitle"></p>
        <div class="analytics-charts-row">
          <div class="chart-card"><h4 class="chart-card-title">Daily trend (30 days)</h4><div class="chart-canvas-wrap"><canvas id="adminChartDaily"></canvas></div></div>
          <div class="chart-card"><h4 class="chart-card-title">Monthly trend (12 months)</h4><div class="chart-canvas-wrap"><canvas id="adminChartMonthly"></canvas></div></div>
        </div>
        <p id="adminAnUpdated" class="muted tiny"></p>`;
      const sel = document.getElementById("adminAnalyticsSelect");
      counselors.forEach((c) => {
        const o = document.createElement("option");
        o.value = c.id;
        o.textContent = c.full_name;
        sel.appendChild(o);
      });
      sel.value = String(selectedId);
      sel.addEventListener("change", () => {
        selectedId = Number(sel.value);
        destroyAdminAnalyticsCharts();
        adminChartDaily = null;
        adminChartMonthly = null;
        paint();
      });
    }
    const selEl = document.getElementById("adminAnalyticsSelect");
    if (selEl) selEl.value = String(selectedId);
    document.getElementById("admKpiW").textContent = data.weekly;
    document.getElementById("admKpiM").textContent = data.monthly;
    document.getElementById("admKpiY").textContent = data.yearly;
    document.getElementById("admCounTitle").textContent = `${data.counselorName || ""} — session overview`;
    adminChartDaily = bindOrUpdateLineChart(
      adminChartDaily,
      "adminChartDaily",
      data.chart30Days.map((d) => d.label),
      data.chart30Days.map((d) => d.sessions),
      "Approved sessions",
      "#1a367c"
    );
    adminChartMonthly = bindOrUpdateLineChart(
      adminChartMonthly,
      "adminChartMonthly",
      data.chart12Months.map((d) => d.label),
      data.chart12Months.map((d) => d.sessions),
      "Approved sessions",
      "#b8891b"
    );
    document.getElementById("adminAnUpdated").textContent = `Last updated: ${new Date().toLocaleString()}`;
  };

  await paint();
  if (counselors.length) adminSectionPollTimer = setInterval(paint, 14000);
}

function counselorIdByName(name, counselors) {
  const n = String(name || "").trim().toLowerCase();
  const hit = (counselors || []).find((c) => String(c.name || "").trim().toLowerCase() === n);
  return hit ? hit.id : null;
}

function filterAdminAppointments(rows, counselors) {
  const q = (state.adminApptSearch || "").trim().toLowerCase();
  const statusF = state.adminApptStatusFilter || "all";
  const counselorF = state.adminApptCounselorFilter || "all";
  return (rows || []).filter((a) => {
    if (statusF !== "all" && String(a.status) !== statusF) return false;
    if (counselorF !== "all") {
      const cid = counselorIdByName(a.counselor_name, counselors);
      if (String(cid) !== String(counselorF)) return false;
    }
    if (!q) return true;
    const hay = [
      a.booking_code,
      a.student_name,
      a.counselor_name,
      a.service_type,
      a.status,
      formatDisplayDate(a.appointment_date),
      formatDisplayTime(a.appointment_time)
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

function countAppointmentsByStatus(rows) {
  const counts = {
    pending: 0,
    accepted: 0,
    reschedule_requested: 0,
    declined: 0,
    cancelled: 0
  };
  (rows || []).forEach((a) => {
    const s = String(a.status || "");
    if (Object.prototype.hasOwnProperty.call(counts, s)) counts[s] += 1;
  });
  return counts;
}

async function renderCalendarOverviewPage(root, opts = {}) {
  const mode = opts.mode || "admin";
  const year = state.calendarYear || new Date().getFullYear();
  if (mode === "admin") await loadCounselors();
  let counselorId =
    mode === "admin"
      ? state.adminCalendarCounselorId || state.counselors[0]?.id || null
      : state.user?.id || null;

  const counselorOptions =
    mode === "admin"
      ? state.counselors
          .map(
            (c) =>
              `<option value="${c.id}"${Number(c.id) === Number(counselorId) ? " selected" : ""}>${escapeHtml(c.name)}</option>`
          )
          .join("")
      : "";

  root.innerHTML = `
    <div class="panel-header">
      <div>
        <h2 class="section-title">${escapeHtml(opts.title || (mode === "admin" ? "Counselor Calendar" : "My Calendar"))}</h2>
        <p class="muted">${escapeHtml(opts.subtitle || "Review booked sessions and blocked dates for the year.")}</p>
      </div>
      <button type="button" class="btn primary" id="calendarOverviewNextBtn">Set availability / unavailability →</button>
    </div>
    ${
      mode === "admin"
        ? `<div class="card stack-md section-block admin-calendar-toolbar">
        <label class="field"><span>Select Counselor</span><select id="adminCounselorSelect">${counselorOptions}</select></label>
      </div>`
        : ""
    }
    <div class="year-nav admin-calendar-year-nav">
      <button type="button" class="btn ghost" id="overviewPrevYearBtn" aria-label="Previous year">←</button>
      <strong id="overviewYearLabel">${year}</strong>
      <button type="button" class="btn ghost" id="overviewNextYearBtn" aria-label="Next year">→</button>
    </div>
    <div id="calendarOverviewArea" class="admin-calendar-area"><p class="muted">Loading calendar…</p></div>
  `;

  async function paintCalendar() {
    const cid =
      mode === "admin"
        ? Number(document.getElementById("adminCounselorSelect")?.value || counselorId)
        : counselorId;
    if (!cid) {
      document.getElementById("calendarOverviewArea").innerHTML =
        '<p class="muted">No counselor selected.</p>';
      return;
    }
    if (mode === "admin") state.adminCalendarCounselorId = cid;
    const y = state.calendarYear || new Date().getFullYear();
    document.getElementById("overviewYearLabel").textContent = String(y);
    const url =
      mode === "admin"
        ? `/counselor/calendar?year=${y}&counselorId=${cid}`
        : `/counselor/calendar?year=${y}`;
    const data = await api(url);
    const apptCount = (data.appointments || []).length;
    const unavailCount = (data.unavailable || []).length;
    const area = document.getElementById("calendarOverviewArea");
    area.innerHTML = `
      <div class="admin-calendar-summary">
        <span class="pill">${apptCount} active session${apptCount === 1 ? "" : "s"}</span>
        <span class="pill">${unavailCount} unavailability block${unavailCount === 1 ? "" : "s"}</span>
      </div>
      <div class="year-calendar-grid">${buildYearCalendar(y, data.appointments || [], data.unavailable || [])}</div>
    `;
  }

  document.getElementById("adminCounselorSelect")?.addEventListener("change", () => {
    paintCalendar().catch((err) => {
      document.getElementById("calendarOverviewArea").innerHTML = `<p class="feedback feedback-error">${escapeHtml(err.message)}</p>`;
    });
  });
  document.getElementById("overviewPrevYearBtn").onclick = async () => {
    state.calendarYear = (state.calendarYear || new Date().getFullYear()) - 1;
    await paintCalendar();
  };
  document.getElementById("overviewNextYearBtn").onclick = async () => {
    state.calendarYear = (state.calendarYear || new Date().getFullYear()) + 1;
    await paintCalendar();
  };
  document.getElementById("calendarOverviewNextBtn").onclick = () => {
    if (typeof opts.onNext === "function") opts.onNext();
  };

  await paintCalendar();
}

async function renderAdminAppointmentsPage(root) {
  const rows = await api("/appointments/my");
  await loadCounselors();
  const counselors = state.counselors || [];
  const counts = countAppointmentsByStatus(rows);
  const counselorOpts = `<option value="all"${state.adminApptCounselorFilter === "all" ? " selected" : ""}>All counselors</option>${counselors
    .map(
      (c) =>
        `<option value="${c.id}"${String(state.adminApptCounselorFilter) === String(c.id) ? " selected" : ""}>${escapeHtml(c.name)}</option>`
    )
    .join("")}`;
  const statusOpts = [
    ["all", "All statuses"],
    ["pending", "Pending"],
    ["accepted", "Accepted"],
    ["reschedule_requested", "Reschedule requested"],
    ["declined", "Declined"],
    ["cancelled", "Cancelled"]
  ]
    .map(
      ([val, label]) =>
        `<option value="${val}"${state.adminApptStatusFilter === val ? " selected" : ""}>${label}</option>`
    )
    .join("");

  root.innerHTML = `
    <div class="panel-header">
      <div>
        <h2 class="section-title">Appointments</h2>
        <p class="muted">Monitor all bookings — search, filter by status or counselor, and open a counselor's schedule.</p>
      </div>
    </div>
    <div class="admin-appt-stats">
      ${renderDashStatCard("Total", rows.length, "All records", "blue")}
      ${renderDashStatCard("Pending", counts.pending, "Awaiting counselor", "gold")}
      ${renderDashStatCard("Accepted", counts.accepted, "Confirmed sessions", "blue")}
      ${renderDashStatCard("Reschedule", counts.reschedule_requested, "Needs action", "gold")}
    </div>
    <div class="admin-monitor-toolbar card stack-md section-block">
      <label class="field admin-monitor-search">
        <span>Search</span>
        <input type="search" id="adminApptSearch" placeholder="Code, student, counselor, service…" value="${escapeHtml(state.adminApptSearch)}" />
      </label>
      <div class="admin-monitor-filters">
        <label class="field"><span>Status</span><select id="adminApptStatusFilter">${statusOpts}</select></label>
        <label class="field"><span>Counselor</span><select id="adminApptCounselorFilter">${counselorOpts}</select></label>
      </div>
      <p class="muted tiny" id="adminApptResultCount"></p>
    </div>
    <div class="table-wrap admin-appt-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Code</th><th>Student</th><th>Counselor</th><th>Service</th><th>Date</th><th>Time</th><th>Status</th><th>Student cancellation</th><th>Action</th>
          </tr>
        </thead>
        <tbody id="adminApptTbody"></tbody>
      </table>
    </div>
    <p id="adminApptMsg" class="feedback"></p>
  `;

  function paintRows() {
    const filtered = filterAdminAppointments(rows, counselors);
    const tbody = document.getElementById("adminApptTbody");
    const countEl = document.getElementById("adminApptResultCount");
    if (countEl) {
      countEl.textContent = `Showing ${filtered.length} of ${rows.length} appointment${rows.length === 1 ? "" : "s"}`;
    }
    if (!tbody) return;
    tbody.innerHTML = filtered.length
      ? filtered.map((a) => renderAdminApptRow(a, counselors)).join("")
      : `<tr><td colspan="9" class="muted">No appointments match your filters.</td></tr>`;
    wireAdminApptActions(root, "Appointments");
  }

  document.getElementById("adminApptSearch")?.addEventListener("input", (e) => {
    state.adminApptSearch = e.target.value;
    paintRows();
  });
  document.getElementById("adminApptStatusFilter")?.addEventListener("change", (e) => {
    state.adminApptStatusFilter = e.target.value;
    paintRows();
  });
  document.getElementById("adminApptCounselorFilter")?.addEventListener("change", (e) => {
    state.adminApptCounselorFilter = e.target.value;
    paintRows();
  });

  paintRows();
}

function renderAdminApptRow(a, counselors) {
  const cid = counselorIdByName(a.counselor_name, counselors);
  const scheduleBtn = cid
    ? `<button type="button" class="btn ghost admin-monitor-schedule" data-counselor-id="${cid}">View schedule</button>`
    : "";
  return `<tr>
    <td>${escapeHtml(a.booking_code)}</td>
    <td>${escapeHtml(a.student_name || "—")}</td>
    <td>${escapeHtml(a.counselor_name || "—")}</td>
    <td>${escapeHtml(a.service_type || "—")}</td>
    <td>${formatDisplayDate(a.appointment_date)}</td>
    <td>${formatDisplayTime(a.appointment_time)}</td>
    <td>${renderDashStatusBadge(a.status)}</td>
    <td>${a.student_cancellation_reason ? escapeHtml(a.student_cancellation_reason) : "—"}</td>
    <td><div class="admin-appt-actions">${scheduleBtn}<button type="button" class="btn ghost admin-resched" data-id="${a.id}">Request Reschedule</button><button type="button" class="btn danger admin-delete-appt" data-id="${a.id}" data-code="${escapeHtml(a.booking_code)}" data-student="${escapeHtml(a.student_name || "—")}">Delete</button></div></td>
  </tr>`;
}

function wireAdminApptActions(root, menu) {
  root.querySelectorAll(".admin-monitor-schedule").forEach((btn) => {
    btn.onclick = () => {
      state.adminCalendarCounselorId = Number(btn.dataset.counselorId);
      state.adminCalendarPage = "view";
      navigateDashboard("admin", "Calendars");
    };
  });
  root.querySelectorAll(".admin-resched").forEach((btn) => {
    btn.onclick = async () => {
      if (!confirm("Are you sure you want to reschedule this?")) return;
      const msg = document.getElementById("adminApptMsg");
      try {
        await api(`/appointments/${btn.dataset.id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status: "reschedule_requested" })
        });
        msg.textContent = "Reschedule request sent.";
        msg.className = "feedback status-success";
        await renderAdminView(root, menu);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
  });
  root.querySelectorAll(".admin-delete-appt").forEach((btn) => {
    btn.onclick = async () => {
      const code = btn.dataset.code || "this appointment";
      const student = btn.dataset.student || "";
      const ok = await showConfirmDialog({
        title: "Delete appointment?",
        message: `You are about to permanently delete booking ${code}.`,
        detail: student
          ? `Student: ${student}\n\nThis will remove the appointment from the system. This cannot be undone.`
          : "This will remove the appointment from the system. This cannot be undone.",
        confirmLabel: "Yes, delete appointment",
        cancelLabel: "Keep appointment"
      });
      if (!ok) return;
      const msg = document.getElementById("adminApptMsg");
      try {
        await api(`/admin/appointments/${btn.dataset.id}`, { method: "DELETE" });
        msg.textContent = "Appointment deleted.";
        msg.className = "feedback status-success";
        await renderAdminView(root, menu);
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
  });
}

async function renderAdminView(root, menu) {
  // Clear all polls before new view
  if (adminOverviewPollTimer) {
    clearInterval(adminOverviewPollTimer);
    adminOverviewPollTimer = null;
  }
  if (adminSectionPollTimer) {
    clearInterval(adminSectionPollTimer);
    adminSectionPollTimer = null;
  }
  destroyAdminAnalyticsCharts();
  if (menu !== "Dashboard") {
    stopAdminDashPolling();
    destroyAdminDashCharts();
  }
  if (menu !== "Calendars") {
    state.adminCalendarPage = "view";
  }
  if (menu === "Dashboard") return renderAdminDashboard(root);
  if (menu === "GCO Services") return renderGcoServicesPage(root);
  if (menu === "Notifications") return renderNotificationsView(root);
  if (menu === "Settings") {
    root.innerHTML = `
      <div class="panel-header"><h2 class="section-title">Settings</h2></div>
      <div class="card stack-md section-block">
        <h3>CSV Upload (Google Sheets Integration)</h3>
        <form id="adminCsvImportForm" class="stack-md">
          <input type="file" id="adminCsvFile" accept=".csv" required />
          <button class="btn primary" type="submit">Upload CSV</button>
        </form>
        <p id="adminCsvMsg" class="feedback"></p>
      </div>
      <div class="card stack-md section-block">
        <h3>Google Sheets API Sync</h3>
        <form id="adminSheetSyncForm" class="stack-md">
          <label class="field"><span>Spreadsheet ID</span><input id="sheetId" type="text" placeholder="e.g., 1AbC..." required /></label>
          <label class="field"><span>Range</span><input id="sheetRange" type="text" placeholder="e.g., Appointments!A1:K" required /></label>
          <button class="btn primary" type="submit">Sync from Google Sheets</button>
        </form>
        <p id="adminSheetMsg" class="feedback"></p>
      </div>
      <div class="card stack-md"><h3>Account Settings</h3><button id="openAdminAccountSettings" class="btn ghost">Open Account Settings</button></div>
    `;
    document.getElementById("openAdminAccountSettings").onclick = () => renderAccountSettings(root);
    document.getElementById("adminCsvImportForm").onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("adminCsvMsg");
      const f = document.getElementById("adminCsvFile").files?.[0];
      if (!f) return;
      const form = new FormData();
      form.append("file", f);
      try {
        const out = await apiUpload("/import/appointments-csv", form);
        msg.textContent = `Imported ${out.imported}, skipped ${out.skipped}.`;
        msg.className = "feedback status-success";
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
    document.getElementById("adminSheetSyncForm").onsubmit = async (e) => {
      e.preventDefault();
      const msg = document.getElementById("adminSheetMsg");
      try {
        const out = await api("/sheets/sync", {
          method: "POST",
          body: JSON.stringify({
            spreadsheetId: document.getElementById("sheetId").value.trim(),
            range: document.getElementById("sheetRange").value.trim()
          })
        });
        msg.textContent = `Sync complete. Imported ${out.imported}, skipped ${out.skipped}.`;
        msg.className = "feedback status-success";
      } catch (err) {
        msg.textContent = err.message;
        msg.className = "feedback feedback-error";
      }
    };
    return;
  }
  if (menu === "Users") {
    const users = await api("/admin/users");
    const pageData = getAdminUsersPageData(users, state.adminUsersPage);
    state.adminUsersPage = pageData.page;
    root.innerHTML = `
      <div class="panel-header"><h2 class="section-title">User Management</h2></div>
      <div class="card stack-md section-block create-account-card">
        <h3>Create Account</h3>
        <form id="createUserForm" class="grid-4">
          <input id="newUserName" type="text" placeholder="Full name" required />
          <input id="newUserEmail" type="email" placeholder="Email" required />
          <select id="newUserRole"><option value="student">Student</option><option value="counselor">Counselor</option><option value="admin">Admin</option></select>
          <input id="newUserPassword" type="password" placeholder="Password (min 10, strong)" minlength="10" required />
          <button class="btn primary" type="submit">Create</button>
        </form>
        <p id="createAccountMsg" class="create-account-feedback" hidden aria-live="polite"></p>
      </div>
      <div class="table-wrap" id="adminUsersTable"><table><thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Action</th></tr></thead><tbody>${renderAdminUsersTableRows(pageData.rows)}</tbody></table></div>
      <div id="adminUsersPager">${renderAdminUsersPagination(pageData)}</div>
      <p id="adminUserMsg" class="feedback"></p>`;
    attachPasswordToggle(document.getElementById("newUserPassword"), "new user password");
    const adminPassField = document.getElementById("newUserPassword")?.parentElement;
    if (adminPassField) {
      const adminStrength = document.createElement("p");
      adminStrength.className = "muted tiny";
      adminPassField.appendChild(adminStrength);
      attachPasswordStrength(document.getElementById("newUserPassword"), adminStrength);
    }
    document.getElementById("createUserForm").onsubmit = async (e) => {
      e.preventDefault();
      const password = document.getElementById("newUserPassword").value;
      const strong = validateStrongPassword(password);
      if (!strong.ok) {
        setCreateAccountFeedback(strong.message, "error");
        return;
      }
      try {
        await api("/admin/users", {
          method: "POST",
          body: JSON.stringify({
            fullName: document.getElementById("newUserName").value.trim(),
            email: document.getElementById("newUserEmail").value.trim().toLowerCase(),
            role: document.getElementById("newUserRole").value,
            password
          })
        });
        document.getElementById("createUserForm").reset();
        setCreateAccountFeedback("Account successfully created.", "success");
        const updatedUsers = await api("/admin/users");
        const latestPage = getAdminUsersPageData(updatedUsers, state.adminUsersPage);
        state.adminUsersPage = latestPage.page;
        const tbody = document.querySelector("#adminUsersTable tbody");
        const pager = document.getElementById("adminUsersPager");
        if (tbody) tbody.innerHTML = renderAdminUsersTableRows(latestPage.rows);
        if (pager) pager.innerHTML = renderAdminUsersPagination(latestPage);
        wireAdminDeleteUserButtons(root, menu);
        wireAdminUsersPagination(root, menu, updatedUsers);
        refreshScrollableDataSections(root);
      } catch (err) {
        setCreateAccountFeedback(err.message, "error");
      }
    };
    wireAdminDeleteUserButtons(root, menu);
    wireAdminUsersPagination(root, menu, users);
    return;
  }
  if (menu === "Appointments") {
    await renderAdminAppointmentsPage(root);
    return;
  }
  if (menu === "Calendars") {
    if (state.adminCalendarPage === "availability") {
      await loadCounselors();
      const cid = state.adminCalendarCounselorId || state.counselors[0]?.id;
      const cName = state.counselors.find((c) => Number(c.id) === Number(cid))?.name || "";
      return renderCounselorCalendar(root, {
        actingCounselorId: cid,
        titleSuffix: cName ? ` — ${cName}` : "",
        showBack: true,
        onBack: () => {
          state.adminCalendarPage = "view";
          state.counselorCalendarProxyId = null;
          state.counselorCalendarRenderOpts = null;
          renderAdminView(root, "Calendars");
        }
      });
    }
    return renderCalendarOverviewPage(root, {
      mode: "admin",
      onNext: async () => {
        const sel = document.getElementById("adminCounselorSelect");
        state.adminCalendarCounselorId = sel ? Number(sel.value) : state.adminCalendarCounselorId;
        state.adminCalendarPage = "availability";
        await renderAdminView(root, "Calendars");
      }
    });
  }
  if (menu === "Analytics") {
    await renderAdminAnalyticsPage(root);
    return;
  }
  if (menu === "Reports") {
    await renderAdminReportsPage(root);
    return;
  }
  if (menu === "System Logs") {
    await renderAdminSystemLogsPage(root);
    return;
  }
  await loadNotifications();
  root.innerHTML = `<div class="panel-header"><h2 class="section-title">Welcome ${escapeHtml(state.user?.name || "Admin")}!</h2></div><h3>Recent Activity</h3>${renderRecentActivity(state.notifications)}`;
}

function consumeOAuthTokenFromHash() {
  const raw = window.location.hash || "";
  if (!raw.includes("gco_token=")) return;
  try {
    const params = new URLSearchParams(raw.replace(/^#/, ""));
    const t = params.get("gco_token");
    if (t) {
      localStorage.setItem("gco_token", t);
      state.token = t;
    }
  } catch (_e) {
    /* ignore */
  }
  history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
}

async function initApp() {
  setupLogoDisplay();
  consumeOAuthTokenFromHash();
  const path = (window.location.pathname || "/").replace(/\/$/, "") || "/";
  const headers = {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;

  const tryMe = async () => {
    const res = await fetch(`${API_BASE}/auth/me`, { credentials: "include", headers });
    if (!res.ok) return null;
    return res.json();
  };

  try {
    let me = await tryMe();
    if (!me && path.startsWith("/dashboard")) {
      for (let i = 0; i < 4 && !me; i += 1) {
        await new Promise((r) => setTimeout(r, 120 * (i + 1)));
        me = await tryMe();
      }
    }
    if (me) {
      state.user = { id: me.id, name: me.name, email: me.email, role: me.role };
      state.currentRole = me.role;
      state.activeMenu = resolveInitialDashboardMenu(me.role, path);
      history.replaceState(null, "", getDashboardPath(me.role, state.activeMenu));
      setDashboardDocumentTitle(state.activeMenu);
      renderDashboard(me.role);
      return;
    }
  } catch (_err) {
    /* network */
  }
  if (path.startsWith("/dashboard")) {
    window.location.replace("/");
    return;
  }
  renderRoleSelect();
}

window.addEventListener("popstate", () => {
  if (!state.user?.role) return;
  const p = (window.location.pathname || "/").replace(/\/$/, "") || "/";
  const parsed = parseDashboardPath(p);
  if (!parsed || parsed.role !== state.user.role) return;
  const m = slugToMenu(state.user.role, parsed.slug);
  if (m && DASHBOARD_MENUS[state.user.role].includes(m)) {
    state.activeMenu = m;
    setDashboardDocumentTitle(m);
    if (!applyDashboardSection(state.user.role, m)) {
      renderDashboard(state.user.role);
    }
  }
});

initApp();
