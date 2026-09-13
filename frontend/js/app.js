/**
 * Main Application Orchestrator & Router
 */

import { fetchAPI } from "./api.js";
import { initTourAgent } from "./tour.js";
import { initHarryAgent } from "./harry.js";
import { initStockScreener } from "./stock.js";
import { initVisionStudio } from "./vision.js";
import { initClusterSandbox } from "./cluster.js";

document.addEventListener("DOMContentLoaded", async () => {
  setupNavigation();
  await loadSystemHealth();
  await loadPortfolioData();

  // Initialize individual agent & tool controllers
  initTourAgent();
  initHarryAgent();
  initStockScreener();
  initVisionStudio();
  initClusterSandbox();
});

function setupNavigation() {
  const navLinks = document.querySelectorAll(".nav-link");
  const tabViews = document.querySelectorAll(".tab-view");
  const topTitle = document.getElementById("top-tab-title");

  const tabTitles = {
    "tab-portfolio": "⚡ Developer Profile & Bio",
    "tab-tour": "🏡 MCP Powered Tour Agent",
    "tab-harry": "🪄 Harry Potter Lore Scholar (Pinecone MCP)",
    "tab-stock": "📈 Stock Screener & Breakout Scanner",
    "tab-vision": "👁️ Vision AI Studio (Classifier & YOLO)",
    "tab-cluster": "🐙 Interactive Clustering Sandbox",
    "tab-social": "🌐 Connect & Social Networks"
  };

  navLinks.forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const targetTab = link.getAttribute("data-tab");

      navLinks.forEach(l => l.classList.remove("active"));
      link.classList.add("active");

      tabViews.forEach(v => {
        if (v.id === targetTab) {
          v.classList.add("active");
        } else {
          v.classList.remove("active");
        }
      });

      if (topTitle && tabTitles[targetTab]) {
        topTitle.innerText = tabTitles[targetTab];
      }

      // Resize Plotly if switching to cluster tab
      if (targetTab === "tab-cluster" && window.Plotly) {
        window.dispatchEvent(new Event('resize'));
      }
    });
  });
}

async function loadSystemHealth() {
  const modelBadge = document.getElementById("active-model-badge");
  const mcpBadge = document.getElementById("mcp-status-badge");
  const statusText = document.getElementById("footer-status-text");

  try {
    const health = await fetchAPI("/system/health");
    if (modelBadge) modelBadge.innerText = `Model: ${health.llm_model.split('/').pop()}`;
    if (mcpBadge) {
      const airbnbOk = health.mcp_servers.airbnb === "available";
      const pineconeOk = health.mcp_servers.pinecone === "ready";
      mcpBadge.innerText = `MCP: Airbnb (${airbnbOk ? '✅' : '⚠️'}) · Pinecone (${pineconeOk ? '✅' : '⚠️'})`;
    }
    if (statusText) statusText.innerText = "System Online · FastAPI";
  } catch (err) {
    if (statusText) statusText.innerText = "Backend Offline";
  }
}

async function loadPortfolioData() {
  try {
    const [profile, github] = await Promise.all([
      fetchAPI("/portfolio/profile"),
      fetchAPI("/portfolio/github").catch(() => null)
    ]);

    // Populate profile details
    const bioEl = document.getElementById("profile-bio");
    if (bioEl) bioEl.innerText = profile.bio;

    const skillsContainer = document.getElementById("profile-skills-grid");
    if (skillsContainer && profile.skills) {
      skillsContainer.innerHTML = profile.skills.map(s => `
        <div style="background: var(--bg-surface); padding: 16px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
          <div style="font-weight: 700; color: var(--primary); font-size: 14px; margin-bottom: 8px;">${s.category}</div>
          <div style="display: flex; flex-wrap: wrap; gap: 6px;">
            ${s.items.map(item => `<span class="badge-tag">${item}</span>`).join("")}
          </div>
        </div>
      `).join("");
    }

    // Populate GitHub stats
    if (github) {
      const ghRepos = document.getElementById("gh-repos");
      const ghFollowers = document.getElementById("gh-followers");
      const ghFollowing = document.getElementById("gh-following");
      if (ghRepos) ghRepos.innerText = github.public_repos;
      if (ghFollowers) ghFollowers.innerText = github.followers;
      if (ghFollowing) ghFollowing.innerText = github.following;
    }
  } catch (err) {
    console.warn("Portfolio data load note:", err);
  }
}
