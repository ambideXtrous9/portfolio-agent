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

// Protected routes requiring PostgreSQL JWT authentication
const PROTECTED_TABS = [
  "tab-stock",
  "tab-harry",
  "tab-tour",
  "tab-voice",
  "tab-yolo",
  "tab-classifier",
  "tab-cluster",
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

  // Verify stored session with backend on startup
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
        currentUser = null;
        isLoggedIn = false;
        updateAuthUI();
      });
  }

  // Listen for unauthorized 401 events triggered by any protected endpoint
  window.addEventListener("portfolio:unauthorized", () => {
    clearAuthToken();
    currentUser = null;
    isLoggedIn = false;
    updateAuthUI();
    const authFeedback = document.getElementById("auth-msg-feedback");
    if (authFeedback) {
      authFeedback.innerHTML = `<div style="background: #F8D7DA; color: #721C24; padding: 0.6rem 0.8rem; border-radius: 6px; font-weight: 500;">🔒 Session expired or authentication required. Please sign in to access protected features.</div>`;
    }
    activateView("tab-login", "boom");
  });

  updateAuthUI();

  // Navigation click handler
  navButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      const imgKey = btn.getAttribute("data-img") || "boom";
      navigateToTab(targetTab, imgKey);
    });
  });

  function navigateToTab(targetTab, imgKey = "boom") {
    // Check auth protection
    if (PROTECTED_TABS.includes(targetTab) && !isLoggedIn) {
      redirectAfterLogin = targetTab;
      activateView("tab-login", "boom");
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

  // Dual view toggling between Login and Sign Up tabs
  const loginContainer = document.getElementById("auth-login-container");
  const signupContainer = document.getElementById("auth-signup-container");
  const tabBtnLogin = document.getElementById("tab-btn-show-login");
  const tabBtnSignup = document.getElementById("tab-btn-show-signup");
  const btnSwitchToSignup = document.getElementById("btn-switch-to-signup");
  const btnSwitchToLogin = document.getElementById("btn-switch-to-login");

  const showLoginView = () => {
    if (loginContainer) loginContainer.style.display = "block";
    if (signupContainer) signupContainer.style.display = "none";
    if (tabBtnLogin) tabBtnLogin.classList.add("st-btn-primary");
    if (tabBtnSignup) tabBtnSignup.classList.remove("st-btn-primary");
  };

  const showSignupView = () => {
    if (loginContainer) loginContainer.style.display = "none";
    if (signupContainer) signupContainer.style.display = "block";
    if (tabBtnSignup) tabBtnSignup.classList.add("st-btn-primary");
    if (tabBtnLogin) tabBtnLogin.classList.remove("st-btn-primary");
  };

  if (tabBtnLogin) tabBtnLogin.addEventListener("click", showLoginView);
  if (tabBtnSignup) tabBtnSignup.addEventListener("click", showSignupView);
  if (btnSwitchToSignup) btnSwitchToSignup.addEventListener("click", showSignupView);
  if (btnSwitchToLogin) btnSwitchToLogin.addEventListener("click", showLoginView);

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

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
          <div class="st-user-pill" title="${escapeHtml(currentUser.email)}">
            <span class="st-user-avatar">${escapeHtml(initials)}</span>
            <span>${escapeHtml(userLabel)}</span>
            <span class="st-role-badge ${isAdmin ? 'st-role-admin' : 'st-role-user'}">${escapeHtml(role)}</span>
          </div>
          <button class="st-session-btn" id="top-btn-logout" title="Sign Out">Sign Out</button>
        `;
        document.getElementById("top-btn-logout")?.addEventListener("click", handleLogout);
      }

      // 2. Update Left Sidebar Auth Section
      if (authContainer) {
        authContainer.innerHTML = `
          <div class="st-sidebar-user-card">
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
          <button class="st-demo-login-btn" id="top-btn-demo" style="padding: 4px 12px; font-size: 0.78rem;">⚡ 1-Click Demo</button>
        `;
        document.getElementById("top-btn-login")?.addEventListener("click", () => {
          showLoginView();
          activateView("tab-login", "boom");
        });
        document.getElementById("top-btn-demo")?.addEventListener("click", performQuickDemoLogin);
      }

      // 2. Update Left Sidebar Auth Section
      if (authContainer) {
        authContainer.innerHTML = `
          <button class="st-auth-btn" id="btn-login">Login</button>
          <button class="st-auth-btn" id="btn-signup">Signup</button>
          <button class="st-auth-btn" id="btn-sidebar-demo" style="background: linear-gradient(135deg, rgba(30, 136, 229, 0.08), rgba(124, 77, 255, 0.08)); border-color: #1E88E5; color: #1565C0; font-weight: 700;" title="Instantly authenticate with pre-seeded demo credentials">⚡ Demo</button>
        `;
        document.getElementById("btn-login")?.addEventListener("click", () => {
          showLoginView();
          activateView("tab-login", "boom");
        });
        document.getElementById("btn-signup")?.addEventListener("click", () => {
          showSignupView();
          activateView("tab-login", "boom");
        });
        document.getElementById("btn-sidebar-demo")?.addEventListener("click", performQuickDemoLogin);
      }

      // 3. Update Login Tab
      if (loggedInContainer) loggedInContainer.style.display = "none";
      if (demoBanner) demoBanner.style.display = "flex";
      showLoginView();
      document.getElementById("btn-quick-demo-login")?.addEventListener("click", performQuickDemoLogin);
    }
  }

  async function handleLogout() {
    await apiLogout();
    isLoggedIn = false;
    currentUser = null;
    updateAuthUI();
    navigateToTab("tab-home", "boom");
  }

  async function performQuickDemoLogin() {
    const bannerBtn = document.getElementById("btn-quick-demo-login");
    const topBtn = document.getElementById("top-btn-demo");
    const sideBtn = document.getElementById("btn-sidebar-demo");
    if (bannerBtn) bannerBtn.textContent = "⏳ Signing in...";
    if (topBtn) topBtn.textContent = "⏳...";
    if (sideBtn) sideBtn.textContent = "⏳...";

    try {
      const res = await apiLogin("abc", "123");
      isLoggedIn = true;
      currentUser = res.user;
      updateAuthUI();
      const dest = redirectAfterLogin || "tab-harry";
      redirectAfterLogin = null;
      navigateToTab(dest, dest.replace("tab-", ""));
    } catch (err) {
      alert("Demo sign-in note: " + err.message);
    } finally {
      if (bannerBtn) bannerBtn.textContent = "⚡ Sign In as Demo User";
      if (topBtn) topBtn.textContent = "⚡ 1-Click Demo";
      if (sideBtn) sideBtn.textContent = "⚡ Demo";
    }
  }

  // Handle Login form submission
  const loginForm = document.getElementById("auth-login-form");
  const authFeedback = document.getElementById("auth-msg-feedback");
  if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const u = document.getElementById("auth-username")?.value?.trim();
      const p = document.getElementById("auth-password")?.value?.trim();
      const submitBtn = document.getElementById("auth-login-submit-btn");

      if (!u || !p) return;

      if (authFeedback) {
        authFeedback.innerHTML = `<div style="color: var(--st-text-muted);">Authenticating credentials with PostgreSQL...</div>`;
      }
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiLogin(u, p);
        isLoggedIn = true;
        currentUser = res.user;
        updateAuthUI();
        if (authFeedback) {
          authFeedback.innerHTML = `<div style="background: #D4EDDA; color: #155724; padding: 0.6rem 0.8rem; border-radius: 6px; font-weight: 600;">✅ Logged in successfully! Welcome, ${res.user.full_name || res.user.email}. Redirecting...</div>`;
        }
        setTimeout(() => {
          const dest = redirectAfterLogin || "tab-stock";
          redirectAfterLogin = null;
          navigateToTab(dest, dest.replace("tab-", ""));
          if (authFeedback) authFeedback.innerHTML = "";
        }, 600);
      } catch (err) {
        if (authFeedback) {
          authFeedback.innerHTML = `<div style="background: #F8D7DA; color: #721C24; padding: 0.6rem 0.8rem; border-radius: 6px; font-weight: 500;">❌ ${err.message}</div>`;
        }
      } finally {
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  }

  // Handle Signup form submission
  const signupForm = document.getElementById("auth-signup-form");
  if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const fullname = document.getElementById("signup-fullname")?.value?.trim();
      const email = document.getElementById("signup-email")?.value?.trim();
      const password = document.getElementById("signup-password")?.value?.trim();
      const submitBtn = document.getElementById("auth-signup-submit-btn");

      if (!email || !password) return;

      if (authFeedback) {
        authFeedback.innerHTML = `<div style="color: var(--st-text-muted);">Creating account in PostgreSQL database...</div>`;
      }
      if (submitBtn) submitBtn.disabled = true;

      try {
        const res = await apiSignup(email, fullname || "AI Explorer", password);
        isLoggedIn = true;
        currentUser = res.user;
        updateAuthUI();
        if (authFeedback) {
          authFeedback.innerHTML = `<div style="background: #D4EDDA; color: #155724; padding: 0.6rem 0.8rem; border-radius: 6px; font-weight: 600;">✅ Account registered and authenticated! Welcome, ${res.user.full_name || res.user.email}. Redirecting...</div>`;
        }
        setTimeout(() => {
          const dest = redirectAfterLogin || "tab-stock";
          redirectAfterLogin = null;
          navigateToTab(dest, dest.replace("tab-", ""));
          if (authFeedback) authFeedback.innerHTML = "";
        }, 600);
      } catch (err) {
        if (authFeedback) {
          authFeedback.innerHTML = `<div style="background: #F8D7DA; color: #721C24; padding: 0.6rem 0.8rem; border-radius: 6px; font-weight: 500;">❌ ${err.message}</div>`;
        }
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

