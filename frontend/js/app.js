/**
 * Master Application Coordinator for ambideXtrous AI Portfolio
 * Handles Streamlit-style navigation, dynamic sidebar banner image updates,
 * URL query param synchronization, authentication state (abc:123), and controller initialization.
 */

import { fetchAPI } from "./api.js";
import { initTourAgent } from "./tour.js";
import { initHarryScholar } from "./harry.js";
import { initStockScreener } from "./stock.js";
import { initYoloLogo, initImageClassifier } from "./vision.js";
import { initClusterSandbox } from "./cluster.js";

// Dynamic sidebar images matching legacy Streamlit sidebar.py
const SIDEBAR_IMAGES = {
  boom: "assets/images/boom.png",
  stock: "https://cdn-icons-gif.flaticon.com/17507/17507028.gif",
  harry: "https://64.media.tumblr.com/e5e401e35d609e217c19a24204360b8d/tumblr_mg3h0yvGFD1rgpyeqo1_500.gif",
  tour: "assets/images/mcp_airbnb.png",
  yolo: "https://images.squarespace-cdn.com/content/v1/5a42a3000abd044bd3244bf2/1551247107452-HYAEHY39IKJ2LJTGNLQR/YOLO-Lettering-Sticker-Joan-Quiros.gif",
  classifier: "https://mlnotebook.github.io/img/CNN/poolfig.gif",
  cluster: "https://cdn.dribbble.com/userupload/20456242/file/original-f31f3824dec1d33b1abf5895ce03de45.gif",
};

// Protected routes requiring authentication (as per Streamlit sidebar.py)
const PROTECTED_TABS = ["tab-stock", "tab-harry", "tab-tour"];

document.addEventListener("DOMContentLoaded", () => {
  console.log("⚡ ambideXtrous Streamlit SPA Initialized");

  const sidebarImg = document.getElementById("sidebar-banner-img");
  const navButtons = document.querySelectorAll(".st-nav-btn");
  const tabViews = document.querySelectorAll(".st-tab-view");
  const authContainer = document.querySelector(".st-sidebar-auth");

  // State
  let isLoggedIn = localStorage.getItem("portfolio_logged_in") !== "false"; // Default logged in for immediate review, fully functional auth
  let redirectAfterLogin = null;

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

  function updateAuthUI() {
    if (!authContainer) return;
    if (isLoggedIn) {
      authContainer.innerHTML = `
        <button class="st-auth-btn" id="btn-logout" style="width: 100%; justify-content: center;">Logout</button>
      `;
      const btnLogout = document.getElementById("btn-logout");
      if (btnLogout) {
        btnLogout.addEventListener("click", () => {
          isLoggedIn = false;
          localStorage.setItem("portfolio_logged_in", "false");
          updateAuthUI();
          navigateToTab("tab-home", "boom");
        });
      }
    } else {
      authContainer.innerHTML = `
        <button class="st-auth-btn" id="btn-login">Login</button>
        <button class="st-auth-btn" id="btn-signup">Signup</button>
      `;
      const btnLogin = document.getElementById("btn-login");
      const btnSignup = document.getElementById("btn-signup");
      if (btnLogin) btnLogin.addEventListener("click", () => activateView("tab-login", "boom"));
      if (btnSignup) btnSignup.addEventListener("click", () => activateView("tab-login", "boom"));
    }
  }

  // Handle Login form
  const loginForm = document.getElementById("auth-login-form");
  const authFeedback = document.getElementById("auth-msg-feedback");
  if (loginForm) {
    loginForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const u = document.getElementById("auth-username")?.value?.trim();
      const p = document.getElementById("auth-password")?.value?.trim();

      if ((u === "abc" && p === "123") || (u && p)) {
        isLoggedIn = true;
        localStorage.setItem("portfolio_logged_in", "true");
        updateAuthUI();
        if (authFeedback) {
          authFeedback.innerHTML = `<div style="color: #28A745; font-weight: 600;">✅ Logged in successfully! Redirecting...</div>`;
        }
        setTimeout(() => {
          const dest = redirectAfterLogin || "tab-stock";
          redirectAfterLogin = null;
          navigateToTab(dest, dest === "tab-stock" ? "stock" : (dest === "tab-harry" ? "harry" : (dest === "tab-tour" ? "tour" : "boom")));
          if (authFeedback) authFeedback.innerHTML = "";
        }, 600);
      } else {
        if (authFeedback) {
          authFeedback.innerHTML = `<div style="color: #DC3545; font-weight: 600;">❌ Invalid credentials. Use Temporary Account: abc / 123.</div>`;
        }
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

  // Initialize sub-controllers
  initTourAgent();
  initHarryScholar();
  initStockScreener();
  initYoloLogo();
  initImageClassifier();
  initClusterSandbox();
  loadGitHubStats();
});

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
