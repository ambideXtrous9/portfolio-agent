/**
 * Master Application Coordinator for ambideXtrous AI Portfolio
 * Handles Streamlit-style navigation, dynamic sidebar banner image updates, and controller initialization.
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
  cluster: "https://cdn.dribbble.com/userupload/20456242/file/original-f31f3824dec1d33b1abf5895ce03de45.gif"
};

document.addEventListener("DOMContentLoaded", () => {
  console.log("⚡ ambideXtrous Streamlit SPA Initialized");

  const sidebarImg = document.getElementById("sidebar-banner-img");
  const navButtons = document.querySelectorAll(".st-nav-btn");
  const tabViews = document.querySelectorAll(".st-tab-view");

  // Navigation click handler
  navButtons.forEach(btn => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      const imgKey = btn.getAttribute("data-img") || "boom";

      // 1. Update active button
      navButtons.forEach(b => b.classList.remove("active"));
      btn.classList.add("active");

      // 2. Switch tab view
      tabViews.forEach(v => v.classList.remove("active"));
      const activeView = document.getElementById(targetTab);
      if (activeView) {
        activeView.classList.add("active");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }

      // 3. Update dynamic circular sidebar image
      if (sidebarImg && SIDEBAR_IMAGES[imgKey]) {
        sidebarImg.src = SIDEBAR_IMAGES[imgKey];
      }
    });
  });

  // Initialize sub-controllers
  initTourAgent();
  initHarryScholar();
  initStockScreener();
  initYoloLogo();
  initImageClassifier();
  initClusterSandbox();
  loadGitHubStats();

  // Login & Signup modal alerts
  const loginBtn = document.getElementById("btn-login");
  const signupBtn = document.getElementById("btn-signup");
  if (loginBtn) {
    loginBtn.addEventListener("click", () => alert("User session active. You have full access to all features."));
  }
  if (signupBtn) {
    signupBtn.addEventListener("click", () => alert("Portfolio guest access is currently unlocked for all evaluation tools."));
  }
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
