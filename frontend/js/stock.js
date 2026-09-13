/**
 * Stock Screener & Institutional Research Tab Controller
 * Matches Streamlit StockScan tabs and report generator.
 */

import { fetchAPI } from "./api.js";

export function initStockScreener() {
  const runBtn = document.getElementById("btn-run-stock-scan");
  const resultsContainer = document.getElementById("stock-results-container");
  const modalOverlay = document.getElementById("stock-modal-overlay");
  const modalClose = document.getElementById("modal-close-btn");
  const modalContent = document.getElementById("modal-report-content");
  const subtabs = document.querySelectorAll("#stock-subtabs .st-tab-trigger");
  const manualBtn = document.getElementById("btn-manual-report");
  const manualInput = document.getElementById("manual-stock-input");

  if (!runBtn) return;

  // Sub-tabs navigation
  subtabs.forEach(tab => {
    tab.addEventListener("click", () => {
      subtabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.getAttribute("data-subtab");
      document.querySelectorAll(".stock-subtab-content").forEach(c => c.style.display = "none");
      const activeContent = document.getElementById(target);
      if (activeContent) activeContent.style.display = "block";
    });
  });

  // Modal close handlers
  if (modalClose) {
    modalClose.addEventListener("click", () => modalOverlay.classList.remove("open"));
  }
  if (modalOverlay) {
    modalOverlay.addEventListener("click", (e) => {
      if (e.target === modalOverlay) modalOverlay.classList.remove("open");
    });
  }

  // Run scan handler
  runBtn.addEventListener("click", handleRunScan);

  // Manual report handler
  if (manualBtn && manualInput) {
    manualBtn.addEventListener("click", () => {
      const sym = manualInput.value.trim();
      if (sym) openReportModal(sym);
    });
  }

  async function handleRunScan() {
    const universe = document.querySelector("input[name='stock-universe']:checked")?.value || "NIFTY500";
    runBtn.disabled = true;
    runBtn.innerHTML = `<span class="st-spinner"></span> Running Scan on ${universe}...`;
    resultsContainer.innerHTML = `<div class="st-caption"><span class="st-spinner"></span> Scanning ${universe} breakout momentum and volume ratio...</div>`;

    try {
      const res = await fetchAPI("/stock/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          universe: universe,
          min_volume_ratio: 1.5,
          limit: 25
        })
      });

      const stocks = res.stocks || [];
      if (stocks.length === 0) {
        resultsContainer.innerHTML = `<div class="st-caption">No volume breakout stocks detected meeting criteria in ${universe}.</div>`;
        return;
      }

      resultsContainer.innerHTML = `
        <div style="background-color: #D4EDDA; color: #155724; border: 1px solid #C3E6CB; border-radius: var(--st-radius); padding: 0.75rem 1rem; margin-bottom: 1rem; font-weight: 600;">
          ✅ Scan Complete: ${stocks.length} Stocks Found in ${universe}
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 1.5rem;">
          ${stocks.map(s => `
            <div style="padding: 0.35rem 0.5rem; background: #F8F9FA; border-radius: 4px; font-size: 0.95rem;">
              <strong>${s.symbol}</strong> — ₹${s.current_price.toLocaleString()} (${s.change_pct >= 0 ? '+' : ''}${s.change_pct}%) • Vol Ratio: <strong>${s.volume_ratio}x</strong>
            </div>
          `).join("")}
        </div>

        <div style="margin: 1.5rem 0 0.5rem; font-weight: 600;">Select a Stock for Institutional Analysis:</div>
        <div style="display: flex; gap: 10px; max-width: 500px;">
          <select id="stock-select-dropdown" class="st-chat-input-field" style="border: 1px solid var(--st-border-input); border-radius: var(--st-radius); padding: 0.4rem 0.8rem; background: #FFF;">
            <option value="">-- Choose Stock --</option>
            ${stocks.map(s => `<option value="${s.symbol}">${s.symbol} - ${s.company_name}</option>`).join("")}
          </select>
          <button class="st-btn st-btn-primary" id="btn-generate-report">Generate Report 📊</button>
        </div>
      `;

      const genBtn = document.getElementById("btn-generate-report");
      const dropdown = document.getElementById("stock-select-dropdown");
      if (genBtn && dropdown) {
        genBtn.addEventListener("click", () => {
          const sym = dropdown.value;
          if (sym) openReportModal(sym);
        });
      }

    } catch (err) {
      console.error("Scan error:", err);
      resultsContainer.innerHTML = `<div style="color: #D32F2F;">⚠️ Scan error: ${err.message}</div>`;
    } finally {
      runBtn.disabled = false;
      runBtn.innerHTML = "Run Scan";
    }
  }

  async function openReportModal(symbol) {
    modalOverlay.classList.add("open");
    modalContent.innerHTML = `
      <div style="display:flex; align-items:center; gap: 12px; padding: 40px 0; justify-content:center;">
        <span class="st-spinner"></span>
        <span>Generating Wall Street analyst research report for <strong>${symbol}</strong>...</span>
      </div>
    `;

    try {
      const res = await fetchAPI("/stock/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ symbol: symbol })
      });

      if (window.marked) {
        modalContent.innerHTML = window.marked.parse(res.report_markdown);
      } else {
        modalContent.innerText = res.report_markdown;
      }
    } catch (err) {
      modalContent.innerHTML = `<div style="color: #D32F2F;">⚠️ Report generation error: ${err.message}</div>`;
    }
  }

  // Expose helper to window for other subtab buttons
  window.runCustomScan = (type) => {
    handleRunScan();
  };
}
