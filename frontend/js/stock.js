/**
 * Stock Screener & Institutional Research Tab Controller
 */

import { fetchAPI } from "./api.js";

export function initStockScreener() {
  const universeSelect = document.getElementById("stock-universe-select");
  const minVolInput = document.getElementById("stock-min-vol");
  const scanBtn = document.getElementById("stock-scan-btn");
  const tableBody = document.getElementById("stock-table-body");
  const scanSummary = document.getElementById("stock-scan-summary");
  const searchInput = document.getElementById("stock-search-filter");

  // Modal elements
  const modalOverlay = document.getElementById("stock-modal");
  const modalTitle = document.getElementById("stock-modal-title");
  const modalContent = document.getElementById("stock-modal-content");
  const modalClose = document.getElementById("stock-modal-close");

  let currentStocks = [];

  modalClose.addEventListener("click", () => {
    modalOverlay.classList.remove("active");
  });
  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) modalOverlay.classList.remove("active");
  });

  scanBtn.addEventListener("click", handleScan);
  searchInput.addEventListener("input", filterStocks);

  async function handleScan() {
    scanBtn.disabled = true;
    scanBtn.innerHTML = `<span class="spinner"></span> Scanning...`;
    scanSummary.innerText = "Analyzing volume expansions and price breakouts...";

    try {
      const payload = {
        universe: universeSelect.value,
        min_volume_ratio: parseFloat(minVolInput.value) || 1.5,
        limit: 30
      };
      const res = await fetchAPI("/stock/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      currentStocks = res.stocks || [];
      scanSummary.innerText = `Found ${res.breakouts_found} breakouts across ${res.total_scanned} scanned candidates in ${res.universe.toUpperCase()}.`;
      renderTable(currentStocks);
    } catch (err) {
      scanSummary.innerHTML = `<span class="badge-negative">⚠️ Scan failed: ${err.message}</span>`;
    } finally {
      scanBtn.disabled = false;
      scanBtn.innerHTML = `🚀 Run Breakout Scanner`;
    }
  }

  function renderTable(stocks) {
    if (!stocks || stocks.length === 0) {
      tableBody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 24px; color: var(--text-muted);">No breakout stocks detected meeting criteria. Try lowering the volume ratio threshold.</td></tr>`;
      return;
    }

    tableBody.innerHTML = stocks.map(s => {
      const chgClass = s.change_pct >= 0 ? "badge-positive" : "badge-negative";
      const chgSign = s.change_pct >= 0 ? "+" : "";
      const rsiBadge = s.rsi ? (s.rsi > 70 ? `<span class="badge-negative">${s.rsi} (OB)</span>` : (s.rsi < 35 ? `<span class="badge-positive">${s.rsi} (OS)</span>` : `${s.rsi}`)) : "—";
      
      return `
        <tr>
          <td><strong>${s.symbol}</strong></td>
          <td>${s.company_name}</td>
          <td>₹${s.current_price.toLocaleString()}</td>
          <td><span class="${chgClass}">${chgSign}${s.change_pct}%</span></td>
          <td>${s.volume.toLocaleString()}</td>
          <td><strong>${s.volume_ratio}x</strong></td>
          <td>${rsiBadge}</td>
          <td><span class="badge-tag">${s.breakout_signal}</span></td>
          <td>
            <button class="btn btn-secondary btn-analyze" data-symbol="${s.symbol}" style="padding: 4px 10px; font-size: 11px;">
              Analyze 📊
            </button>
          </td>
        </tr>
      `;
    }).join("");

    tableBody.querySelectorAll(".btn-analyze").forEach(btn => {
      btn.addEventListener("click", () => {
        const sym = btn.getAttribute("data-symbol");
        openReportModal(sym);
      });
    });
  }

  function filterStocks() {
    const q = searchInput.value.toLowerCase().trim();
    if (!q) {
      renderTable(currentStocks);
      return;
    }
    const filtered = currentStocks.filter(s =>
      s.symbol.toLowerCase().includes(q) || s.company_name.toLowerCase().includes(q)
    );
    renderTable(filtered);
  }

  async function openReportModal(symbol) {
    modalOverlay.classList.add("active");
    modalTitle.innerText = `Institutional Equity Report: ${symbol}`;
    modalContent.innerHTML = `
      <div style="display:flex; align-items:center; gap: 12px; padding: 30px 0; justify-content:center;">
        <span class="spinner"></span>
        <span>Gathering fundamentals & generating institutional research report...</span>
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
      modalContent.innerHTML = `<div class="badge-negative">⚠️ Report generation error: ${err.message}</div>`;
    }
  }
}
