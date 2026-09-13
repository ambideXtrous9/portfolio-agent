/**
 * Master Application Coordinator for ambideXtrous AI Portfolio
 * Handles reactive navigation, dynamic sidebar banner image updates,
 * URL query param synchronization, authentication state (abc:123), and controller initialization.
 */

import {
  fetchAPI,
  checkBackendHealth,
  setBackendURL,
  getAuthToken,
  setAuthToken,
  clearAuthToken,
  getAuthUser,
  setAuthUser,
  apiLogin,
  apiSignup,
  apiLogout,
  apiGetMe,
  apiForgotPassword,
  apiResetPassword,
  apiGetChatHistory,
  apiClearChatHistory,
} from "./api.js";
import { initTourAgent } from "./tour.js";
import { initHarryScholar } from "./harry.js";
import { initStockScreener } from "./stock.js";
import { initYoloLogo, initImageClassifier } from "./vision.js";
import { initClusterSandbox } from "./cluster.js";
import { initVoiceAgent } from "./voice.js";

// Dynamic sidebar images matching section themes
const SIDEBAR_IMAGES = {
  boom: "assets/images/boom.png",
  stock: "https://cdn-icons-gif.flaticon.com/17507/17507028.gif",
  harry: "https://64.media.tumblr.com/e5e401e35d609e217c19a24204360b8d/tumblr_mg3h0yvGFD1rgpyeqo1_500.gif",
  tour: "assets/images/mcp_airbnb.png",
  voice: "assets/images/studio_mic.png",
  yolo: "https://images.squarespace-cdn.com/content/v1/5a42a3000abd044bd3244bf2/1551247107452-HYAEHY39IKJ2LJTGNLQR/YOLO-Lettering-Sticker-Joan-Quiros.gif",
  classifier: "https://mlnotebook.github.io/img/CNN/poolfig.gif",
  cluster: "https://cdn.dribbble.com/userupload/20456242/file/original-f31f3824dec1d33b1abf5895ce03de45.gif",
};

// Protected tabs requiring explicit user authentication
const PROTECTED_TABS = [
  "tab-stock",
  "tab-harry",
  "tab-tour",
  "tab-voice",
  "tab-yolo",
  "tab-classifier",
  "tab-cluster"
];

document.addEventListener("DOMContentLoaded", () => {
  console.log("⚡ ambideXtrous AI Portfolio Initialized");

  const sidebarImg = document.getElementById("sidebar-banner-img");
  const navButtons = document.querySelectorAll(".st-nav-btn");
  const tabViews = document.querySelectorAll(".st-tab-view");
  const authContainer = document.querySelector(".st-sidebar-auth");

  // Authentication State
  let token = getAuthToken();
  let currentUser = getAuthUser();
  let isLoggedIn = Boolean(token);
  let redirectAfterLogin = null;

  // Validate existing session token on load
  if (token) {
    apiGetMe()
      .then((user) => {
        currentUser = user;
        setAuthUser(user);
        isLoggedIn = true;
        updateAuthUI();
      })
      .catch(() => {
        clearAuthToken();
        clearAuthUser();
        token = null;
        currentUser = null;
        isLoggedIn = false;
        updateAuthUI();
        // If loaded on a protected view without valid token, return to home
        navigateToTab("tab-home", "boom");
      });
  } else {
    isLoggedIn = false;
    currentUser = null;
    updateAuthUI();
  }

  // Listen for unauthorized 401 events: prompt user to sign in
  window.addEventListener("portfolio:unauthorized", (e) => {
    clearAuthToken();
    clearAuthUser();
    token = null;
    currentUser = null;
    isLoggedIn = false;
    updateAuthUI();
    activateView("tab-home", "boom");
    openModal("auth-modal");
    setAuthModalView("login");
    const feature = e?.detail?.feature || "this AI feature";
    showToast(`Authentication required. Please sign in to access ${feature}.`, "error");
  });

  updateAuthUI();

  // Navigation click handler
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      const imgKey = btn.getAttribute("data-img") || "boom";

      if (PROTECTED_TABS.includes(targetTab) && !isLoggedIn) {
        redirectAfterLogin = targetTab;
        openModal("auth-modal");
        setAuthModalView("login");
        showToast("Please sign in or register to access this AI feature.", "info");
        return;
      }

      navigateToTab(targetTab, imgKey);
    });
  });

  function navigateToTab(targetTab, imgKey = "boom") {
    if (PROTECTED_TABS.includes(targetTab) && !isLoggedIn) {
      redirectAfterLogin = targetTab;
      openModal("auth-modal");
      setAuthModalView("login");
      showToast("Please sign in or register to access this AI feature.", "info");
      return;
    }
    activateView(targetTab, imgKey);
  }

  function activateView(tabId, imgKey) {
    // 1. Update active button
    navButtons.forEach((b) => {
      if (b.getAttribute("data-tab") === tabId) {
        b.classList.add("active");
      } else {
        b.classList.remove("active");
      }
    });

    // 2. Switch tab view
    tabViews.forEach((v) => v.classList.remove("active"));
    const activeView = document.getElementById(tabId);
    if (activeView) {
      activeView.classList.add("active");
      window.scrollTo({ top: 0, behavior: "smooth" });
      setTimeout(() => {
        window.dispatchEvent(new Event("resize"));
      }, 50);
    }

    // 3. Update dynamic circular sidebar image
    if (sidebarImg && SIDEBAR_IMAGES[imgKey]) {
      sidebarImg.src = SIDEBAR_IMAGES[imgKey];
    }

    // 4. Update URL query params
    const pageName = tabId.replace("tab-", "");
    const url = new URL(window.location);
    url.searchParams.set("page", pageName);
    window.history.replaceState({}, "", url);
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Floating Toast Notification System
  // ───────────────────────────────────────────────────────────────────────────
  function showToast(message, type = "info") {
    const container = document.getElementById("toast-container");
    if (!container) return;
    const toast = document.createElement("div");
    toast.className = `toast-item toast-${type}`;
    const icon = type === "success" ? "✅" : (type === "error" ? "❌" : "ℹ️");
    toast.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${escapeHtml(message)}</span>
      <button type="button" class="toast-close" title="Dismiss">&times;</button>
    `;
    container.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add("is-visible"));
    const dismiss = () => {
      toast.classList.remove("is-visible");
      setTimeout(() => toast.remove(), 250);
    };
    toast.querySelector(".toast-close")?.addEventListener("click", dismiss);
    setTimeout(dismiss, 4500);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Modal Backdrop Handlers
  // ───────────────────────────────────────────────────────────────────────────
  function openModal(modalId) {
    const m = document.getElementById(modalId);
    if (m) m.classList.add("is-open");
  }

  function closeAllModals() {
    document.querySelectorAll(".modal-backdrop").forEach((m) => m.classList.remove("is-open"));
  }

  document.querySelectorAll("[data-modal-close]").forEach((btn) => {
    btn.addEventListener("click", closeAllModals);
  });

  document.querySelectorAll(".modal-backdrop").forEach((backdrop) => {
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeAllModals();
    });
  });

  // ───────────────────────────────────────────────────────────────────────────
  // Authentication Modals (Sign In, Register, Forgot Password, Reset Password)
  // Inspired by /home/sushovan/sushovan/STUDY/Langchain-Langgraph-Notebooks
  // ───────────────────────────────────────────────────────────────────────────
  const tabModalLogin = document.getElementById("modal-tab-login");
  const tabModalSignup = document.getElementById("modal-tab-signup");
  const tabModalForgot = document.getElementById("modal-tab-forgot");
  const formModalLogin = document.getElementById("modal-form-login");
  const formModalSignup = document.getElementById("modal-form-signup");
  const formModalForgot = document.getElementById("modal-form-forgot");
  const formModalReset = document.getElementById("modal-form-reset");

  function setAuthModalView(view) {
    [formModalLogin, formModalSignup, formModalForgot].forEach((f) => {
      if (f) f.style.display = "none";
    });
    [tabModalLogin, tabModalSignup, tabModalForgot].forEach((t) => {
      if (t) t.classList.remove("is-active");
    });

    if (view === "login") {
      if (formModalLogin) formModalLogin.style.display = "block";
      if (tabModalLogin) tabModalLogin.classList.add("is-active");
    } else if (view === "signup") {
      if (formModalSignup) formModalSignup.style.display = "block";
      if (tabModalSignup) tabModalSignup.classList.add("is-active");
    } else if (view === "forgot") {
      if (formModalForgot) formModalForgot.style.display = "block";
      if (tabModalForgot) tabModalForgot.classList.add("is-active");
    }
  }

  if (tabModalLogin) tabModalLogin.addEventListener("click", () => setAuthModalView("login"));
  if (tabModalSignup) tabModalSignup.addEventListener("click", () => setAuthModalView("signup"));
  if (tabModalForgot) tabModalForgot.addEventListener("click", () => setAuthModalView("forgot"));

  // Modal Sign In form submit
  if (formModalLogin) {
    formModalLogin.addEventListener("submit", async (e) => {
      e.preventDefault();
      const emailOrUsername = document.getElementById("modal-login-email")?.value?.trim();
      const password = document.getElementById("modal-login-password")?.value?.trim();
      const submitBtn = document.getElementById("modal-login-submit");
      if (!emailOrUsername || !password) return;

      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await apiLogin(emailOrUsername, password);
        token = res.access_token;
        currentUser = res.user;
        isLoggedIn = true;
        updateAuthUI();
        closeAllModals();
        showToast(`Welcome back, ${currentUser.full_name || currentUser.email}!`, "success");
        if (redirectAfterLogin) {
          const dest = redirectAfterLogin;
          redirectAfterLogin = null;
          navigateToTab(dest, dest.replace("tab-", ""));
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Modal Sign Up form submit
  if (formModalSignup) {
    formModalSignup.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("modal-signup-name")?.value?.trim();
      const email = document.getElementById("modal-signup-email")?.value?.trim();
      const password = document.getElementById("modal-signup-password")?.value?.trim();
      const submitBtn = document.getElementById("modal-signup-submit");
      if (!email || !password) return;

      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await apiSignup(email, name || "Explorer", password);
        token = res.access_token;
        currentUser = res.user;
        isLoggedIn = true;
        updateAuthUI();
        closeAllModals();
        showToast("Account created and signed in! Welcome!", "success");
        if (redirectAfterLogin) {
          const dest = redirectAfterLogin;
          redirectAfterLogin = null;
          navigateToTab(dest, dest.replace("tab-", ""));
        }
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Modal Forgot Password form submit
  if (formModalForgot) {
    formModalForgot.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("modal-forgot-email")?.value?.trim();
      const submitBtn = document.getElementById("modal-forgot-submit");
      if (!email) return;

      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await apiForgotPassword(email);
        const resetToken = res.reset_token;
        closeAllModals();
        openModal("reset-modal");
        const tokenInput = document.getElementById("modal-reset-token");
        if (tokenInput && resetToken) tokenInput.value = resetToken;
        showToast(res.message || "Reset token generated. Set your new password.", "info");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Modal Reset Password form submit (Step 2)
  if (formModalReset) {
    formModalReset.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rToken = document.getElementById("modal-reset-token")?.value?.trim();
      const newPassword = document.getElementById("modal-reset-new-password")?.value?.trim();
      const submitBtn = document.getElementById("modal-reset-submit");
      if (!rToken || !newPassword) return;

      if (submitBtn) submitBtn.disabled = true;
      try {
        const res = await apiResetPassword(rToken, newPassword);
        closeAllModals();
        openModal("auth-modal");
        setAuthModalView("login");
        showToast(res.message || "Password updated successfully! Please sign in.", "success");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Recent Chats Sidebar & PostgreSQL Checkpoint Manager
  // Inspired by /home/sushovan/sushovan/STUDY/Langchain-Langgraph-Notebooks
  // ───────────────────────────────────────────────────────────────────────────
  let recentSessions = [];
  let pendingDeleteThreadId = null;
  let pendingDeleteAgent = null;

  function loadRecentSessions() {
    try {
      const stored = localStorage.getItem("portfolio_chat_sessions_v2");
      recentSessions = stored ? JSON.parse(stored) : [];
    } catch (_) {
      recentSessions = [];
    }
  }

  function saveRecentSessions() {
    try {
      localStorage.setItem("portfolio_chat_sessions_v2", JSON.stringify(recentSessions));
    } catch (_) {}
    renderSidebarHistory();
  }

  function renderSidebarHistory() {
    const list = document.getElementById("sidebar-history-list");
    if (!list) return;

    if (recentSessions.length === 0) {
      list.innerHTML = `<div style="padding: 10px 12px; font-size: 0.78rem; color: var(--st-text-muted);">No recent chats yet.</div>`;
      return;
    }

    const currentHpThread = localStorage.getItem("portfolio_hp_thread_id");
    const currentTourThread = localStorage.getItem("portfolio_tour_thread_id");

    list.innerHTML = recentSessions.map((s) => {
      const isActive = s.threadId === currentHpThread || s.threadId === currentTourThread;
      const tag = s.agentName || (s.agent === "harry" ? "Harry" : "Tour");
      return `
        <div class="history-item ${isActive ? 'is-active' : ''}" data-thread-id="${escapeHtml(s.threadId)}" data-agent="${escapeHtml(s.agent)}">
          <div class="history-item-title" title="${escapeHtml(s.title)}">
            <span class="history-item-tag">[${escapeHtml(tag)}]</span>${escapeHtml(s.title)}
          </div>
          <button type="button" class="history-item-delete" data-delete-thread="${escapeHtml(s.threadId)}" title="Delete conversation">&times;</button>
        </div>
      `;
    }).join("");

    // Bind click handlers to switch sessions
    list.querySelectorAll(".history-item").forEach((item) => {
      item.addEventListener("click", () => {
        const threadId = item.getAttribute("data-thread-id");
        const agent = item.getAttribute("data-agent");
        if (!threadId) return;

        if (agent === "harry") {
          navigateToTab("tab-harry", "harry");
          window.dispatchEvent(new CustomEvent("portfolio:reload_harry_history", { detail: { threadId } }));
        } else if (agent === "tour") {
          navigateToTab("tab-tour", "tour");
          window.dispatchEvent(new CustomEvent("portfolio:reload_tour_history", { detail: { threadId } }));
        }
        renderSidebarHistory();
      });
    });

    // Bind delete button handlers to open delete confirmation modal
    list.querySelectorAll("[data-delete-thread]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const threadId = btn.getAttribute("data-delete-thread");
        const session = recentSessions.find((s) => s.threadId === threadId);
        if (!session) return;

        pendingDeleteThreadId = threadId;
        pendingDeleteAgent = session.agent;

        const titleEl = document.getElementById("delete-chat-title");
        if (titleEl) {
          titleEl.textContent = `"${session.title}" (#${session.threadId})`;
        }
        openModal("delete-chat-modal");
      });
    });
  }

  // Delete chat confirmation modal button
  document.getElementById("delete-chat-confirm-btn")?.addEventListener("click", async () => {
    if (!pendingDeleteThreadId) return;

    const threadId = pendingDeleteThreadId;
    const agent = pendingDeleteAgent;
    pendingDeleteThreadId = null;
    pendingDeleteAgent = null;

    closeAllModals();

    try {
      await apiClearChatHistory(threadId);
      recentSessions = recentSessions.filter((s) => s.threadId !== threadId);
      saveRecentSessions();

      // If active thread was deleted, reset chat window
      if (agent === "harry") {
        window.dispatchEvent(new CustomEvent("portfolio:reset_harry_chat"));
      } else if (agent === "tour") {
        window.dispatchEvent(new CustomEvent("portfolio:reset_tour_chat"));
      }

      showToast("Conversation & PostgreSQL checkpoints deleted.", "info");
    } catch (err) {
      showToast("Error clearing chat history: " + err.message, "error");
    }
  });

  // Start New Chat from sidebar button
  document.getElementById("btn-sidebar-new-chat")?.addEventListener("click", () => {
    const activeTabEl = document.querySelector(".st-tab-view.active");
    const activeTabId = activeTabEl?.id;

    if (activeTabId === "tab-tour") {
      window.dispatchEvent(new CustomEvent("portfolio:reset_tour_chat"));
      showToast("New Tour Planner conversation started.", "info");
    } else {
      navigateToTab("tab-harry", "harry");
      window.dispatchEvent(new CustomEvent("portfolio:reset_harry_chat"));
      showToast("New Harry Potter Lore conversation started.", "info");
    }
    renderSidebarHistory();
  });

  // Listen to chat updates from harry.js and tour.js
  window.addEventListener("portfolio:chat_updated", (e) => {
    const detail = e.detail;
    if (!detail || !detail.threadId) return;

    const existingIdx = recentSessions.findIndex((s) => s.threadId === detail.threadId);
    if (existingIdx >= 0) {
      recentSessions[existingIdx].title = detail.title;
      recentSessions[existingIdx].updatedAt = new Date().toISOString();
      const updated = recentSessions.splice(existingIdx, 1)[0];
      recentSessions.unshift(updated);
    } else {
      recentSessions.unshift({
        id: "sess_" + Date.now(),
        threadId: detail.threadId,
        agent: detail.agent || "harry",
        agentName: detail.agentName || (detail.agent === "tour" ? "Tour" : "Harry"),
        title: detail.title || "New Conversation",
        createdAt: new Date().toISOString(),
      });
    }

    if (recentSessions.length > 20) {
      recentSessions = recentSessions.slice(0, 20);
    }
    saveRecentSessions();
  });

  loadRecentSessions();
  renderSidebarHistory();

  // ───────────────────────────────────────────────────────────────────────────
  // Reactive Authentication State UI Updater
  // ───────────────────────────────────────────────────────────────────────────
  function updateAuthUI() {
    const topUserArea = document.getElementById("top-user-area");
    const loggedInContainer = document.getElementById("auth-logged-in-container");
    const demoBanner = document.getElementById("auth-demo-banner");
    const loginContainer = document.getElementById("auth-login-container");
    const signupContainer = document.getElementById("auth-signup-container");
    const userNameEl = document.getElementById("logged-in-name");
    const userEmailEl = document.getElementById("logged-in-email");
    const userRoleEl = document.getElementById("logged-in-role");
    const userAvatarEl = document.getElementById("logged-in-avatar");

    if (isLoggedIn && currentUser) {
      const userLabel = currentUser.full_name || currentUser.email || "User";
      const initials = (currentUser.full_name || currentUser.username || currentUser.email || "U")
        .trim()
        .split(/\s+/)
        .map((p) => p[0])
        .slice(0, 2)
        .join("")
        .toUpperCase();
      const role = currentUser.role || "user";
      const isAdmin = role === "admin" || currentUser.is_superuser;

      // 1. Update Top Global Header
      if (topUserArea) {
        topUserArea.innerHTML = `
          <div class="st-user-pill" id="top-user-pill-btn" title="Click to view profile & account details" style="cursor: pointer;">
            <span class="st-user-avatar">${escapeHtml(initials)}</span>
            <span>${escapeHtml(userLabel)}</span>
            <span class="st-role-badge ${isAdmin ? 'st-role-admin' : 'st-role-user'}">${escapeHtml(role)}</span>
          </div>
          <button class="st-session-btn" id="top-btn-logout" title="Sign Out">Sign Out</button>
        `;
        document.getElementById("top-btn-logout")?.addEventListener("click", handleLogout);
        document.getElementById("top-user-pill-btn")?.addEventListener("click", () => {
          openModal("auth-modal");
          setAuthModalView("login");
        });
      }

      // 2. Update Left Sidebar Auth Section
      if (authContainer) {
        authContainer.innerHTML = `
          <div class="st-sidebar-user-card" id="sidebar-user-card-btn" style="cursor: pointer;">
            <div class="st-sidebar-user-header">
              <div class="st-user-avatar">${escapeHtml(initials)}</div>
              <div class="st-sidebar-user-details">
                <div class="st-sidebar-user-name" title="${escapeHtml(userLabel)}">${escapeHtml(userLabel)}</div>
                <div class="st-sidebar-user-email" title="${escapeHtml(currentUser.email)}">${escapeHtml(currentUser.email)}</div>
              </div>
              <span class="st-role-badge ${isAdmin ? 'st-role-admin' : 'st-role-user'}">${escapeHtml(role)}</span>
            </div>
            <button class="st-auth-btn" id="btn-logout" style="width: 100%; justify-content: center; font-size: 0.82rem; margin-top: 4px;">Log Out</button>
          </div>
        `;
        document.getElementById("btn-logout")?.addEventListener("click", handleLogout);
        document.getElementById("sidebar-user-card-btn")?.addEventListener("click", () => {
          openModal("auth-modal");
          setAuthModalView("login");
        });
      }

      // 3. Update Login Tab
      if (loggedInContainer) loggedInContainer.style.display = "block";
      if (demoBanner) demoBanner.style.display = "none";
      if (loginContainer) loginContainer.style.display = "none";
      if (signupContainer) signupContainer.style.display = "none";
      if (userNameEl) userNameEl.textContent = userLabel;
      if (userEmailEl) userEmailEl.textContent = currentUser.email;
      if (userAvatarEl) userAvatarEl.textContent = initials;
      if (userRoleEl) {
        userRoleEl.textContent = role.toUpperCase();
        userRoleEl.className = `st-role-badge ${isAdmin ? 'st-role-admin' : 'st-role-user'}`;
      }
      document.getElementById("btn-profile-logout")?.addEventListener("click", handleLogout);
      document.getElementById("btn-go-agents")?.addEventListener("click", () => {
        navigateToTab("tab-harry", "harry");
      });

    } else {
      // 1. Update Top Global Header
      if (topUserArea) {
        topUserArea.innerHTML = `
          <button class="st-session-btn" id="top-btn-login">Sign In</button>
          <button class="st-session-btn" id="top-btn-signup" style="background: var(--st-primary); color: white; border-color: var(--st-primary); font-weight: 600;">Register</button>
        `;
        document.getElementById("top-btn-login")?.addEventListener("click", () => {
          openModal("auth-modal");
          setAuthModalView("login");
        });
        document.getElementById("top-btn-signup")?.addEventListener("click", () => {
          openModal("auth-modal");
          setAuthModalView("signup");
        });
      }

      // 2. Update Left Sidebar Auth Section
      if (authContainer) {
        authContainer.innerHTML = `
          <button class="st-auth-btn" id="btn-login" style="flex: 1;">Login</button>
          <button class="st-auth-btn" id="btn-signup" style="flex: 1; background: var(--st-primary); color: white; border-color: var(--st-primary); font-weight: 600;">Signup</button>
        `;
        document.getElementById("btn-login")?.addEventListener("click", () => {
          openModal("auth-modal");
          setAuthModalView("login");
        });
        document.getElementById("btn-signup")?.addEventListener("click", () => {
          openModal("auth-modal");
          setAuthModalView("signup");
        });
      }

      // 3. Update Login Tab
      if (loggedInContainer) loggedInContainer.style.display = "none";
      if (demoBanner) demoBanner.style.display = "none";
      if (loginContainer) loginContainer.style.display = "block";
    }
  }

  async function handleLogout() {
    await apiLogout();
    isLoggedIn = false;
    currentUser = null;
    updateAuthUI();
    showToast("Logged out. JWT token has been revoked.", "info");
    navigateToTab("tab-home", "boom");
  }

  // Handle in-page tab-login form submission
  const loginForm = document.getElementById("auth-login-form");
  const authFeedback = document.getElementById("auth-msg-feedback");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = document.getElementById("auth-username")?.value?.trim();
      const p = document.getElementById("auth-password")?.value?.trim();
      const submitBtn = document.getElementById("auth-login-submit-btn");

      if (!u || !p) return;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiLogin(u, p);
        token = res.access_token;
        currentUser = res.user;
        isLoggedIn = true;
        updateAuthUI();
        showToast(`Welcome back, ${res.user.full_name || res.user.email}!`, "success");
        setTimeout(() => {
          const dest = redirectAfterLogin || "tab-harry";
          redirectAfterLogin = null;
          navigateToTab(dest, dest.replace("tab-", ""));
        }, 600);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Handle in-page tab-login signup form submission
  const signupForm = document.getElementById("auth-signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullname = document.getElementById("signup-fullname")?.value?.trim();
      const email = document.getElementById("signup-email")?.value?.trim();
      const password = document.getElementById("signup-password")?.value?.trim();
      const submitBtn = document.getElementById("auth-signup-submit-btn");

      if (!email || !password) return;
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiSignup(email, fullname || "AI Explorer", password);
        token = res.access_token;
        currentUser = res.user;
        isLoggedIn = true;
        updateAuthUI();
        showToast(`Account registered and authenticated! Welcome!`, "success");
        setTimeout(() => {
          const dest = redirectAfterLogin || "tab-harry";
          redirectAfterLogin = null;
          navigateToTab(dest, dest.replace("tab-", ""));
        }, 600);
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Handle URL query parameter (?page=...) on initial load
  const urlParams = new URLSearchParams(window.location.search);
  const pageParam = urlParams.get("page");
  if (pageParam) {
    const tabMap = {
      Home: { id: "tab-home", img: "boom" },
      home: { id: "tab-home", img: "boom" },
      stockscreener: { id: "tab-stock", img: "stock" },
      stock: { id: "tab-stock", img: "stock" },
      newsqa: { id: "tab-harry", img: "harry" },
      harry: { id: "tab-harry", img: "harry" },
      tourAgent: { id: "tab-tour", img: "tour" },
      tour: { id: "tab-tour", img: "tour" },
      voiceAgent: { id: "tab-voice", img: "voice" },
      voice: { id: "tab-voice", img: "voice" },
      yolologo: { id: "tab-yolo", img: "yolo" },
      yolo: { id: "tab-yolo", img: "yolo" },
      image_classifer: { id: "tab-classifier", img: "classifier" },
      classifier: { id: "tab-classifier", img: "classifier" },
      clusterplay: { id: "tab-cluster", img: "cluster" },
      cluster: { id: "tab-cluster", img: "cluster" },
      Social: { id: "tab-social", img: "boom" },
      social: { id: "tab-social", img: "boom" },
      login: { id: "tab-login", img: "boom" },
    };
    if (tabMap[pageParam]) {
      navigateToTab(tabMap[pageParam].id, tabMap[pageParam].img);
    }
  }

  // Internal tab link handler
  document.querySelectorAll("[data-tab-link]").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const target = link.getAttribute("data-tab-link");
      const imgKey = target.replace("tab-", "");
      navigateToTab(target, imgKey);
    });
  });

  // Initialize sub-controllers
  initTourAgent();
  initVoiceAgent();
  initHarryScholar();
  initStockScreener();
  initYoloLogo();
  initImageClassifier();
  initClusterSandbox();
  initArchModal();
  initBackendManager();
  initSidebarCollapse();
  loadGitHubStats();
});

function initSidebarCollapse() {
  const sidebar = document.querySelector(".st-sidebar");
  const main = document.querySelector(".st-main");
  const collapseBtn = document.getElementById("sidebar-collapse-btn");
  const expandBtn = document.getElementById("sidebar-expand-btn");
  const overlay = document.getElementById("sidebar-overlay");

  if (!sidebar) return;

  function setSidebarState(collapsed) {
    if (collapsed) {
      sidebar.classList.add("collapsed");
      if (main) main.classList.add("sidebar-collapsed");
      if (expandBtn) expandBtn.classList.add("visible");
      localStorage.setItem("st_sidebar_collapsed", "true");
    } else {
      sidebar.classList.remove("collapsed");
      if (main) main.classList.remove("sidebar-collapsed");
      if (expandBtn) expandBtn.classList.remove("visible");
      localStorage.setItem("st_sidebar_collapsed", "false");
    }
  }

  // Restore saved state from localStorage (or auto-collapse on narrow mobile screens)
  const savedState = localStorage.getItem("st_sidebar_collapsed");
  if (savedState === "true") {
    setSidebarState(true);
  } else if (savedState === null && window.innerWidth < 768) {
    setSidebarState(true);
  } else {
    setSidebarState(false);
  }

  if (collapseBtn) {
    collapseBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setSidebarState(true);
    });
  }

  if (expandBtn) {
    expandBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      setSidebarState(false);
    });
  }

  if (overlay) {
    overlay.addEventListener("click", () => {
      setSidebarState(true);
    });
  }

  // On mobile screens, auto-close the drawer when navigating
  const navButtons = document.querySelectorAll(".st-nav-btn");
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (window.innerWidth < 768) {
        setSidebarState(true);
      }
    });
  });

  // Support hotkey: Ctrl + B or Cmd + B to toggle sidebar
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "b") {
      e.preventDefault();
      const isCollapsed = sidebar.classList.contains("collapsed");
      setSidebarState(!isCollapsed);
    }
  });
}

function initBackendManager() {
  const dot = document.getElementById("backend-status-dot");
  const text = document.getElementById("backend-status-text");
  const configBtn = document.getElementById("btn-configure-backend");
  const modal = document.getElementById("backend-modal-overlay");
  const closeBtn = document.getElementById("btn-close-backend-modal");
  const inputUrl = document.getElementById("input-backend-url");
  const saveBtn = document.getElementById("btn-save-backend-url");
  const resetBtn = document.getElementById("btn-reset-backend-url");
  const testResult = document.getElementById("backend-test-result");

  async function updateStatus() {
    if (text) text.textContent = "Probing Backend...";
    if (dot) dot.style.background = "#ffaa00";
    const health = await checkBackendHealth();
    const topDbStatus = document.getElementById("top-db-status");
    const topDbText = document.getElementById("top-db-text");
    const topAuthStatus = document.getElementById("top-auth-status");
    const topAuthText = document.getElementById("top-auth-text");

    if (health.ok) {
      if (dot) dot.style.background = "#00e676";
      if (text) text.textContent = "Backend: Live";

      const dbInfo = health.data?.database;
      if (topDbText) {
        if (dbInfo?.postgres_connected) {
          topDbText.textContent = "Postgres Checkpointer: Active";
          if (topDbStatus) topDbStatus.className = "st-status-pill st-status-pill-db";
        } else {
          topDbText.textContent = "Checkpointer: Memory Fallback";
          if (topDbStatus) topDbStatus.className = "st-status-pill st-status-pill-offline";
        }
      }
      if (topAuthText) {
        topAuthText.textContent = "JWT Auth Guard: Enforced";
        if (topAuthStatus) topAuthStatus.className = "st-status-pill st-status-pill-auth";
      }
    } else {
      if (dot) dot.style.background = "#ff3d00";
      if (text) text.textContent = "Backend: Disconnected";
      if (topDbText) topDbText.textContent = "Checkpointer: Offline";
      if (topDbStatus) topDbStatus.className = "st-status-pill st-status-pill-offline";
    }
  }

  if (configBtn && modal) {
    configBtn.addEventListener("click", () => {
      const current = localStorage.getItem("ai_portfolio_backend_url") || "";
      if (inputUrl) inputUrl.value = current;
      if (testResult) testResult.innerHTML = "";
      modal.style.display = "flex";
    });
  }

  if (closeBtn && modal) {
    closeBtn.addEventListener("click", () => {
      modal.style.display = "none";
    });
  }

  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) modal.style.display = "none";
    });
  }

  if (saveBtn) {
    saveBtn.addEventListener("click", async () => {
      const url = inputUrl ? inputUrl.value.trim() : "";
      if (testResult) testResult.innerHTML = `<span style="color:#ffaa00;">Testing connection to ${url || '/api'}...</span>`;
      setBackendURL(url);
      const health = await checkBackendHealth();
      if (health.ok) {
        if (testResult) testResult.innerHTML = `<span style="color:#00e676;">✅ Connected! (${health.data?.project || 'FastAPI'})</span>`;
        updateStatus();
        setTimeout(() => { if (modal) modal.style.display = "none"; }, 1000);
      } else {
        if (testResult) testResult.innerHTML = `<span style="color:#ff3d00;">❌ Offline (${health.error || health.statusText || '404'}). Ensure URL is accessible via HTTPS.</span>`;
        updateStatus();
      }
    });
  }

  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      setBackendURL("");
      if (inputUrl) inputUrl.value = "";
      if (testResult) testResult.innerHTML = `<span style="color:#00e676;">Reset to default (/api).</span>`;
      updateStatus();
      setTimeout(() => { if (modal) modal.style.display = "none"; }, 800);
    });
  }

  updateStatus();
  setInterval(updateStatus, 30000);
}

async function loadGitHubStats() {
  const reposEl = document.getElementById("gh-stats-repos");
  const followersEl = document.getElementById("gh-stats-followers");
  try {
    const res = await fetch("https://api.github.com/users/ambideXtrous9");
    if (res.ok) {
      const data = await res.json();
      if (reposEl) reposEl.innerHTML = `<strong>Public Repos:</strong> ${data.public_repos}`;
      if (followersEl) followersEl.innerHTML = `<strong>Followers:</strong> ${data.followers} • <strong>Following:</strong> ${data.following}`;
    }
  } catch (err) {
    if (reposEl) reposEl.innerHTML = "<strong>Public Repos:</strong> 35+";
    if (followersEl) followersEl.innerHTML = "<strong>Followers:</strong> 50+";
  }
}

// ── Agentic Architecture Visualizer Pop-up Controller ─────────────────────────
const ARCH_DATA = {
  harry: {
    title: "Harry Potter X Indian Mythology Lore Scholar",
    badge: "Pinecone RAG + Groq Llama-3.3-70B",
    protocol: "FastAPI Server-Sent Events (SSE) & Native Full-Duplex WebSocket",
    svg: `<svg viewBox="0 0 860 220" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display: block; max-height: 240px;">
      <defs>
        <linearGradient id="gradHPUser" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#EFF6FF"/><stop offset="100%" stop-color="#DBEAFE"/></linearGradient>
        <linearGradient id="gradHPRoute" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F5F3FF"/><stop offset="100%" stop-color="#EDE9FE"/></linearGradient>
        <linearGradient id="gradHPPine" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ECFDF5"/><stop offset="100%" stop-color="#D1FAE5"/></linearGradient>
        <linearGradient id="gradHPEpic" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFFBEB"/><stop offset="100%" stop-color="#FEF3C7"/></linearGradient>
        <linearGradient id="gradHPGroq" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FEF2F2"/><stop offset="100%" stop-color="#FEE2E2"/></linearGradient>
        <linearGradient id="gradHPOut" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F0FDF4"/><stop offset="100%" stop-color="#DCFCE7"/></linearGradient>
        <marker id="arrowHP" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#3B82F6"/></marker>
        <marker id="arrowHPGreen" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#10B981"/></marker>
        <filter id="shadowHP" x="-5%" y="-5%" width="115%" height="115%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.08"/></filter>
      </defs>
      <path d="M 135 110 L 175 110" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowHP)"/>
      <path d="M 295 95 C 320 95, 320 50, 345 50" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowHP)"/>
      <path d="M 295 125 C 320 125, 320 170, 345 170" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowHP)"/>
      <path d="M 505 50 C 530 50, 530 95, 555 95" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowHP)"/>
      <path d="M 505 170 C 530 170, 530 125, 555 125" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowHP)"/>
      <path d="M 695 110 L 735 110" stroke="#10B981" stroke-width="2" marker-end="url(#arrowHPGreen)"/>
      <g filter="url(#shadowHP)">
        <rect x="15" y="75" width="120" height="70" rx="10" fill="url(#gradHPUser)" stroke="#3B82F6" stroke-width="1.5"/>
        <text x="75" y="102" font-size="12" font-weight="700" fill="#1E3A8A" text-anchor="middle" font-family="system-ui, sans-serif">User Query</text>
        <text x="75" y="119" font-size="9.5" fill="#3B82F6" text-anchor="middle" font-family="system-ui, sans-serif">Lore / Comparison</text>
        <text x="75" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Natural Language</text>
      </g>
      <g filter="url(#shadowHP)">
        <rect x="175" y="75" width="120" height="70" rx="10" fill="url(#gradHPRoute)" stroke="#8B5CF6" stroke-width="1.5"/>
        <text x="235" y="102" font-size="12" font-weight="700" fill="#4C1D95" text-anchor="middle" font-family="system-ui, sans-serif">Intent &amp; Router</text>
        <text x="235" y="119" font-size="9.5" fill="#7C3AED" text-anchor="middle" font-family="system-ui, sans-serif">Named Entities</text>
        <text x="235" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Dual-Domain Split</text>
      </g>
      <g filter="url(#shadowHP)">
        <rect x="345" y="15" width="160" height="70" rx="10" fill="url(#gradHPPine)" stroke="#10B981" stroke-width="1.5"/>
        <text x="425" y="42" font-size="12" font-weight="700" fill="#064E3B" text-anchor="middle" font-family="system-ui, sans-serif">Pinecone Vector DB</text>
        <text x="425" y="59" font-size="9.5" fill="#059669" text-anchor="middle" font-family="system-ui, sans-serif">Index: hpvdb-openai</text>
        <text x="425" y="73" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Top-K MCP Similarity</text>
      </g>
      <g filter="url(#shadowHP)">
        <rect x="345" y="135" width="160" height="70" rx="10" fill="url(#gradHPEpic)" stroke="#F59E0B" stroke-width="1.5"/>
        <text x="425" y="162" font-size="12" font-weight="700" fill="#78350F" text-anchor="middle" font-family="system-ui, sans-serif">Indian Epics KB</text>
        <text x="425" y="179" font-size="9.5" fill="#D97706" text-anchor="middle" font-family="system-ui, sans-serif">Ramayana / Mahabharata</text>
        <text x="425" y="193" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Astras, Karma &amp; Dharma</text>
      </g>
      <g filter="url(#shadowHP)">
        <rect x="555" y="75" width="140" height="70" rx="10" fill="url(#gradHPGroq)" stroke="#EF4444" stroke-width="1.5"/>
        <text x="625" y="102" font-size="12" font-weight="700" fill="#7F1D1D" text-anchor="middle" font-family="system-ui, sans-serif">Groq LLM Engine</text>
        <text x="625" y="119" font-size="9.5" fill="#DC2626" text-anchor="middle" font-family="system-ui, sans-serif">Llama-3.3-70B Versatile</text>
        <text x="625" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Foil &amp; Mythos Synthesis</text>
      </g>
      <g filter="url(#shadowHP)">
        <rect x="735" y="75" width="110" height="70" rx="10" fill="url(#gradHPOut)" stroke="#10B981" stroke-width="1.5"/>
        <text x="790" y="102" font-size="12" font-weight="700" fill="#064E3B" text-anchor="middle" font-family="system-ui, sans-serif">Stream Egress</text>
        <text x="790" y="119" font-size="9.5" fill="#059669" text-anchor="middle" font-family="system-ui, sans-serif">SSE / WebSocket</text>
        <text x="790" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Live Markdown</text>
      </g>
    </svg>`,
    steps: [
      {
        title: "1. Natural Query Ingestion",
        desc: "Captures user inquiries contrasting Western wizarding canon with Indian Vedic mythology (e.g. Ron vs Lakshmana, Horcrux vs Samsara, Brahmastra vs Avada Kedavra).",
      },
      {
        title: "2. Pinecone Vector Retrieval",
        desc: "Performs real-time cosine vector retrieval against the <code>hpvdb-openai</code> Pinecone index via MCP tools, isolating canonical book quotes.",
      },
      {
        title: "3. Dual-Domain Vedic Lore Base",
        desc: "Cross-references Ramayana, Mahabharata, Upanishadic philosophy, celestial Astras, and moral Dharma treatises for theological parity.",
      },
      {
        title: "4. Groq Llama-3.3-70B Synthesis",
        desc: "High-throughput reasoning engine conducts deep narrative foil comparisons, virtue ethics alignment, and structural critique.",
      },
      {
        title: "5. PostgreSQL State Checkpointing & History",
        desc: "Persists multi-agent graph state with <code>AsyncPostgresSaver</code> and records conversational threads with <code>PostgresChatMessageHistory</code> for durable cross-session continuity.",
      },
      {
        title: "6. Real-Time Token Streaming",
        desc: "Streams formatted markdown directly into the chat interface with character tags, philosophical footnotes, and interactive query suggestions.",
      },
    ],
  },
  tour: {
    title: "MCP-Powered LangGraph Tour Agent Architecture",
    badge: "LangGraph + Airbnb MCP + PostgreSQL Checkpointer",
    protocol: "LangGraph StateGraph + Real-time Streaming WebSocket",
    svg: `<svg viewBox="0 0 860 220" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display: block; max-height: 240px;">
      <defs>
        <linearGradient id="gradTRPrompt" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#EFF6FF"/><stop offset="100%" stop-color="#DBEAFE"/></linearGradient>
        <linearGradient id="gradTRSuper" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F5F3FF"/><stop offset="100%" stop-color="#EDE9FE"/></linearGradient>
        <linearGradient id="gradTRBnb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFF1F2"/><stop offset="100%" stop-color="#FFE4E6"/></linearGradient>
        <linearGradient id="gradTRMeteo" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F0FDF4"/><stop offset="100%" stop-color="#DCFCE7"/></linearGradient>
        <linearGradient id="gradTRWeb" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFFBEB"/><stop offset="100%" stop-color="#FEF3C7"/></linearGradient>
        <linearGradient id="gradTRAggr" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ECFDF5"/><stop offset="100%" stop-color="#D1FAE5"/></linearGradient>
        <linearGradient id="gradTROut" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#EFF6FF"/><stop offset="100%" stop-color="#DBEAFE"/></linearGradient>
        <marker id="arrowTR" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#3B82F6"/></marker>
        <marker id="arrowTRGreen" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#10B981"/></marker>
        <filter id="shadowTR" x="-5%" y="-5%" width="115%" height="115%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.08"/></filter>
      </defs>
      <path d="M 135 110 L 175 110" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowTR)"/>
      <path d="M 315 90 C 335 90, 335 40, 355 40" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowTR)"/>
      <path d="M 315 110 L 355 110" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowTR)"/>
      <path d="M 315 130 C 335 130, 335 180, 355 180" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowTR)"/>
      <path d="M 505 40 C 525 40, 525 90, 545 90" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowTR)"/>
      <path d="M 505 110 L 545 110" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowTR)"/>
      <path d="M 505 180 C 525 180, 525 130, 545 130" stroke="#3B82F6" stroke-width="2" fill="none" marker-end="url(#arrowTR)"/>
      <path d="M 685 110 L 725 110" stroke="#10B981" stroke-width="2" marker-end="url(#arrowTRGreen)"/>
      <g filter="url(#shadowTR)">
        <rect x="15" y="75" width="120" height="70" rx="10" fill="url(#gradTRPrompt)" stroke="#3B82F6" stroke-width="1.5"/>
        <text x="75" y="102" font-size="12" font-weight="700" fill="#1E3A8A" text-anchor="middle" font-family="system-ui, sans-serif">Travel Request</text>
        <text x="75" y="119" font-size="9.5" fill="#3B82F6" text-anchor="middle" font-family="system-ui, sans-serif">Destination &amp; Dates</text>
        <text x="75" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Budget &amp; Guests</text>
      </g>
      <g filter="url(#shadowTR)">
        <rect x="175" y="75" width="140" height="70" rx="10" fill="url(#gradTRSuper)" stroke="#8B5CF6" stroke-width="1.5"/>
        <text x="245" y="102" font-size="12" font-weight="700" fill="#4C1D95" text-anchor="middle" font-family="system-ui, sans-serif">Supervisor Graph</text>
        <text x="245" y="119" font-size="9.5" fill="#7C3AED" text-anchor="middle" font-family="system-ui, sans-serif">LangGraph StateFlow</text>
        <text x="245" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Parallel Tool Planner</text>
      </g>
      <g filter="url(#shadowTR)">
        <rect x="355" y="12" width="150" height="56" rx="8" fill="url(#gradTRBnb)" stroke="#E11D48" stroke-width="1.5"/>
        <text x="430" y="34" font-size="11" font-weight="700" fill="#881337" text-anchor="middle" font-family="system-ui, sans-serif">Airbnb MCP Server</text>
        <text x="430" y="50" font-size="9" fill="#BE123C" text-anchor="middle" font-family="system-ui, sans-serif">Real Stays, Prices &amp; Rating</text>
      </g>
      <g filter="url(#shadowTR)">
        <rect x="355" y="82" width="150" height="56" rx="8" fill="url(#gradTRMeteo)" stroke="#059669" stroke-width="1.5"/>
        <text x="430" y="104" font-size="11" font-weight="700" fill="#064E3B" text-anchor="middle" font-family="system-ui, sans-serif">Open-Meteo Weather</text>
        <text x="430" y="120" font-size="9" fill="#047857" text-anchor="middle" font-family="system-ui, sans-serif">7-Day Hourly Forecast</text>
      </g>
      <g filter="url(#shadowTR)">
        <rect x="355" y="152" width="150" height="56" rx="8" fill="url(#gradTRWeb)" stroke="#D97706" stroke-width="1.5"/>
        <text x="430" y="174" font-size="11" font-weight="700" fill="#78350F" text-anchor="middle" font-family="system-ui, sans-serif">Attractions &amp; Dining</text>
        <text x="430" y="190" font-size="9" fill="#B45309" text-anchor="middle" font-family="system-ui, sans-serif">DuckDuckGo / Tavily Search</text>
      </g>
      <g filter="url(#shadowTR)">
        <rect x="545" y="75" width="140" height="70" rx="10" fill="url(#gradTRAggr)" stroke="#10B981" stroke-width="1.5"/>
        <text x="615" y="102" font-size="12" font-weight="700" fill="#064E3B" text-anchor="middle" font-family="system-ui, sans-serif">State Aggregator</text>
        <text x="615" y="119" font-size="9.5" fill="#059669" text-anchor="middle" font-family="system-ui, sans-serif">Merge Constraints</text>
        <text x="615" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Day-by-Day Optimizer</text>
      </g>
      <g filter="url(#shadowTR)">
        <rect x="725" y="75" width="120" height="70" rx="10" fill="url(#gradTROut)" stroke="#3B82F6" stroke-width="1.5"/>
        <text x="785" y="102" font-size="12" font-weight="700" fill="#1E3A8A" text-anchor="middle" font-family="system-ui, sans-serif">Trip Itinerary</text>
        <text x="785" y="119" font-size="9.5" fill="#2563EB" text-anchor="middle" font-family="system-ui, sans-serif">Interactive Plan</text>
        <text x="785" y="133" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Airbnb Cards + Weather</text>
      </g>
    </svg>`,
    steps: [
      {
        title: "1. Natural Vacation Intent",
        desc: "Extracts vacation destination, duration, guest party size, and travel style from conversational input.",
      },
      {
        title: "2. LangGraph Supervisor",
        desc: "Constructs an acyclic task graph, scheduling concurrent tool executions and managing state reduction.",
      },
      {
        title: "3. Live Airbnb Query via MCP",
        desc: "Dispatches MCP protocol requests to the Airbnb server to locate verified accommodations with pricing and ratings.",
      },
      {
        title: "4. Multi-Source Meteorological Context",
        desc: "Fetches live 7-day temperature, rainfall, and wind conditions via Open-Meteo API to adapt outdoor itineraries.",
      },
      {
        title: "5. Structured Daily Itinerary",
        desc: "Produces an actionable, day-by-day plan integrating weather badges, accommodation cards, and curated dining highlights.",
      },
      {
        title: "6. PostgreSQL State Checkpointing",
        desc: "Persists supervisor graph state transitions and checkpoints to PostgreSQL with <code>AsyncPostgresSaver</code>, enabling resume and thread isolation.",
      },
    ],
  },
  voice: {
    title: "Real-time Voice AI Agent Architecture",
    badge: "LiveKit WebRTC + Silero VAD + Groq + Cartesia",
    protocol: "WebRTC PeerConnection (Opus 48kHz) + Ultra-low Latency Media Plane",
    svg: `<svg viewBox="0 0 860 220" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg" style="display: block; max-height: 240px;">
      <defs>
        <linearGradient id="gradVCMic" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#EFF6FF"/><stop offset="100%" stop-color="#DBEAFE"/></linearGradient>
        <linearGradient id="gradVCSfu" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#F5F3FF"/><stop offset="100%" stop-color="#EDE9FE"/></linearGradient>
        <linearGradient id="gradVCVad" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FFFBEB"/><stop offset="100%" stop-color="#FEF3C7"/></linearGradient>
        <linearGradient id="gradVCStt" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#ECFDF5"/><stop offset="100%" stop-color="#D1FAE5"/></linearGradient>
        <linearGradient id="gradVCLlm" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FEF2F2"/><stop offset="100%" stop-color="#FEE2E2"/></linearGradient>
        <linearGradient id="gradVCTts" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#FDF4FF"/><stop offset="100%" stop-color="#FAE8FF"/></linearGradient>
        <marker id="arrowVC" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#3B82F6"/></marker>
        <marker id="arrowVCReturn" viewBox="0 0 10 10" refX="6" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 1 L 8 5 L 0 9 z" fill="#8B5CF6"/></marker>
        <filter id="shadowVC" x="-5%" y="-5%" width="115%" height="115%"><feDropShadow dx="0" dy="2" stdDeviation="3" flood-opacity="0.08"/></filter>
      </defs>
      <path d="M 125 90 L 155 90" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowVC)"/>
      <path d="M 275 90 L 305 90" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowVC)"/>
      <path d="M 425 90 L 455 90" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowVC)"/>
      <path d="M 575 90 L 605 90" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowVC)"/>
      <path d="M 725 90 L 755 90" stroke="#3B82F6" stroke-width="2" marker-end="url(#arrowVC)"/>
      <path d="M 805 125 C 805 190, 215 190, 215 130" stroke="#8B5CF6" stroke-width="2" stroke-dasharray="4,4" fill="none" marker-end="url(#arrowVCReturn)"/>
      <text x="510" y="180" font-size="10" font-weight="600" fill="#7C3AED" text-anchor="middle" font-family="system-ui, sans-serif">⚡ Full-Duplex WebRTC Audio Return Stream (&lt;100ms TTFB)</text>
      <g filter="url(#shadowVC)">
        <rect x="15" y="55" width="110" height="70" rx="10" fill="url(#gradVCMic)" stroke="#3B82F6" stroke-width="1.5"/>
        <text x="70" y="82" font-size="12" font-weight="700" fill="#1E3A8A" text-anchor="middle" font-family="system-ui, sans-serif">Browser Mic</text>
        <text x="70" y="99" font-size="9.5" fill="#2563EB" text-anchor="middle" font-family="system-ui, sans-serif">Opus 48kHz Audio</text>
        <text x="70" y="113" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">WebRTC Client</text>
      </g>
      <g filter="url(#shadowVC)">
        <rect x="155" y="55" width="120" height="70" rx="10" fill="url(#gradVCSfu)" stroke="#8B5CF6" stroke-width="1.5"/>
        <text x="215" y="82" font-size="12" font-weight="700" fill="#4C1D95" text-anchor="middle" font-family="system-ui, sans-serif">LiveKit SFU</text>
        <text x="215" y="99" font-size="9.5" fill="#7C3AED" text-anchor="middle" font-family="system-ui, sans-serif">Cloud Media Mesh</text>
        <text x="215" y="113" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">&lt;15ms Latency</text>
      </g>
      <g filter="url(#shadowVC)">
        <rect x="305" y="55" width="120" height="70" rx="10" fill="url(#gradVCVad)" stroke="#F59E0B" stroke-width="1.5"/>
        <text x="365" y="82" font-size="12" font-weight="700" fill="#78350F" text-anchor="middle" font-family="system-ui, sans-serif">Silero VAD</text>
        <text x="365" y="99" font-size="9.5" fill="#D97706" text-anchor="middle" font-family="system-ui, sans-serif">30ms Voice Activity</text>
        <text x="365" y="113" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">BVC Gate + Interrupts</text>
      </g>
      <g filter="url(#shadowVC)">
        <rect x="455" y="55" width="120" height="70" rx="10" fill="url(#gradVCStt)" stroke="#10B981" stroke-width="1.5"/>
        <text x="515" y="82" font-size="12" font-weight="700" fill="#064E3B" text-anchor="middle" font-family="system-ui, sans-serif">Deepgram STT</text>
        <text x="515" y="99" font-size="9.5" fill="#059669" text-anchor="middle" font-family="system-ui, sans-serif">Nova-2 Streaming</text>
        <text x="515" y="113" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Instant Words</text>
      </g>
      <g filter="url(#shadowVC)">
        <rect x="605" y="55" width="120" height="70" rx="10" fill="url(#gradVCLlm)" stroke="#EF4444" stroke-width="1.5"/>
        <text x="665" y="82" font-size="12" font-weight="700" fill="#7F1D1D" text-anchor="middle" font-family="system-ui, sans-serif">Groq LLM</text>
        <text x="665" y="99" font-size="9.5" fill="#DC2626" text-anchor="middle" font-family="system-ui, sans-serif">Llama-3.3-70B</text>
        <text x="665" y="113" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">&gt;300 Tok/s + Tools</text>
      </g>
      <g filter="url(#shadowVC)">
        <rect x="755" y="55" width="95" height="70" rx="10" fill="url(#gradVCTts)" stroke="#C026D3" stroke-width="1.5"/>
        <text x="802" y="82" font-size="12" font-weight="700" fill="#701A75" text-anchor="middle" font-family="system-ui, sans-serif">Cartesia TTS</text>
        <text x="802" y="99" font-size="9.5" fill="#A21CAF" text-anchor="middle" font-family="system-ui, sans-serif">Sonic-3 (~90ms)</text>
        <text x="802" y="113" font-size="9" fill="#6B7280" text-anchor="middle" font-family="system-ui, sans-serif">Audio &amp; 3D Orb</text>
      </g>
    </svg>`,
    steps: [
      {
        title: "1. WebRTC Audio Ingress",
        desc: "Captures microphone input using 48kHz Opus audio frames with WebRTC PeerConnection for jitter-free real-time streaming.",
      },
      {
        title: "2. LiveKit Cloud SFU Gateway",
        desc: "Distributed selective forwarding unit routes audio channels with sub-15ms packet propagation and automatic reconnect.",
      },
      {
        title: "3. Silero VAD & Interruption Handling",
        desc: "30ms frame voice activity detection and acoustic noise gate detect human speech and enable natural user interruptions.",
      },
      {
        title: "4. Streaming STT & Groq LLM Brain",
        desc: "Deepgram Nova-2 STT feeds Groq Llama-3.3-70B (>300 tokens/sec) for conversational latency under 300ms.",
      },
      {
        title: "5. Cartesia Sonic TTS & 3D Frequency Orb",
        desc: "Streams emotive synthetic voice in ~90ms TTFB while driving the real-time procedural WebGL/Canvas audio visualizer orb.",
      },
    ],
  },
};

function initArchModal() {
  const modal = document.getElementById("archModal");
  const closeBtn = document.getElementById("archModalClose");
  const titleEl = document.getElementById("archModalTitle");
  const badgeEl = document.getElementById("archModalBadge");
  const bodyEl = document.getElementById("archModalBody");
  const triggerBtns = document.querySelectorAll(".st-arch-trigger-btn");

  if (!modal || !bodyEl) return;

  function closeModal() {
    modal.classList.remove("active");
    modal.setAttribute("aria-hidden", "true");
  }

  function openModal(archKey) {
    const data = ARCH_DATA[archKey];
    if (!data) return;

    if (titleEl) titleEl.textContent = data.title;
    if (badgeEl) {
      badgeEl.textContent = data.badge;
      badgeEl.style.display = data.badge ? "inline-block" : "none";
    }

    bodyEl.innerHTML = `
      <div class="st-arch-flow-wrapper">
        ${data.svg}
      </div>
      <div style="margin-top: 1.25rem;">
        <h4 style="margin: 0 0 0.5rem 0; font-size: 1rem; color: #0F172A; font-weight: 700;">Pipeline Breakdown &amp; Execution Steps</h4>
        <div class="st-arch-grid">
          ${data.steps
            .map(
              (s) => `
            <div class="st-arch-step-card">
              <h4>${s.title}</h4>
              <p>${s.desc}</p>
            </div>
          `
            )
            .join("")}
        </div>
      </div>
      <div style="margin-top: 1.25rem; padding: 0.9rem 1.2rem; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 8px; font-size: 0.85rem; color: #475569; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 0.75rem;">
        <div><strong>Deployment Runtime:</strong> Vercel Edge &amp; Serverless Python Microservice</div>
        <div><strong>Protocol:</strong> ${data.protocol}</div>
      </div>
    `;

    modal.classList.add("active");
    modal.setAttribute("aria-hidden", "false");
  }

  triggerBtns.forEach((btn) => {
    btn.addEventListener("click", (e) => {
      e.preventDefault();
      const archKey = btn.getAttribute("data-arch");
      openModal(archKey);
    });
  });

  if (closeBtn) {
    closeBtn.addEventListener("click", closeModal);
  }

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.classList.contains("active")) {
      closeModal();
    }
  });
}

