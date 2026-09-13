/**
 * Stock Screener & Institutional Research Tab Controller
 * Provides complete 1:1 parity with Streamlit StockScreener/screener.py:
 * - 6 Screener Tabs (Breakout, Highest EPS, Low Debt, Bullish Engulfing, Profit Jump, Stocks Analysis)
 * - In-line Interactive Candlestick Chart (1Y daily)
 * - Shareholding & Financial Profit Subplots (Plotly.js)
 * - Financial & Shareholding Status Indicators (Increased ✅ / Decreased ❌)
 * - Deep Dive Metric Tabs (Overview, Valuation, Financials, Multibagger)
 * - Latest News Headliner with clickable links
 * - AI Research Report with expandable "🧠 Agent Reasoning (Click to Expand)"
 */

import { fetchAPI } from "./api.js";

export function initStockScreener() {
  const stockNav = document.getElementById("stock-subtabs");
  if (stockNav) stockNav.scrollLeft = 0;
  const subtabs = document.querySelectorAll("#stock-subtabs .st-tab-trigger");
  const inlineContainer = document.getElementById("stock-inline-analysis-container");

  // Tab switching
  subtabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      subtabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const target = tab.getAttribute("data-subtab");
      document.querySelectorAll(".stock-subtab-content").forEach((c) => (c.style.display = "none"));
      const activeContent = document.getElementById(target);
      if (activeContent) activeContent.style.display = "block";
    });
  });

  // Wire Subtab 1: Volume Breakout
  const btnVolScan = document.getElementById("btn-run-stock-scan");
  const volResults = document.getElementById("stock-results-container");
  if (btnVolScan) {
    btnVolScan.addEventListener("click", async () => {
      const universe = document.querySelector("input[name='stock-universe']:checked")?.value || "NIFTY500";
      btnVolScan.disabled = true;
      btnVolScan.innerHTML = `<span class="st-spinner"></span> Scanning ${universe}...`;
      volResults.innerHTML = `<div class="st-caption"><span class="st-spinner"></span> Scanning ${universe} breakout momentum and volume expansion...</div>`;

      try {
        const res = await fetchAPI("/stock/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universe: universe,
            mode: "volume_breakout",
            min_volume_ratio: 1.4,
            limit: 20,
          }),
        });
        renderScanResults(volResults, res, "vol");
      } catch (err) {
        volResults.innerHTML = `<div style="color: #D32F2F;">⚠️ Scan error: ${err.message}</div>`;
      } finally {
        btnVolScan.disabled = false;
        btnVolScan.innerHTML = "Run Scan";
      }
    });
  }

  // Wire Subtabs 2-5
  wireGenericScreenerTab("btn-run-eps", "eps-results", "highest_eps", "eps");
  wireGenericScreenerTab("btn-run-debt", "debt-results", "low_debt", "debt");
  wireGenericScreenerTab("btn-run-bull", "bull-results", "bullish_engulfing", "bull");
  wireGenericScreenerTab("btn-run-profit", "profit-results", "profit_jump", "profit");

  // Wire Subtab 6: Stocks Analysis Searchable Dropdown
  initStocksAnalysisDropdown();

  function wireGenericScreenerTab(btnId, containerId, mode, prefix) {
    const btn = document.getElementById(btnId);
    const container = document.getElementById(containerId);
    if (!btn || !container) return;

    btn.addEventListener("click", async () => {
      btn.disabled = true;
      btn.innerHTML = `<span class="st-spinner"></span> Scanning...`;
      container.innerHTML = `<div class="st-caption"><span class="st-spinner"></span> Evaluating fundamental metrics across Nifty 500 universe...</div>`;

      try {
        const res = await fetchAPI("/stock/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            universe: "nifty500",
            mode: mode,
            limit: 25,
          }),
        });
        renderScanResults(container, res, prefix);
      } catch (err) {
        container.innerHTML = `<div style="color: #D32F2F;">⚠️ Scan error: ${err.message}</div>`;
      } finally {
        btn.disabled = false;
        btn.innerHTML = "Run Scan";
      }
    });
  }

  // Renders scan results with Streamlit styled success box, DataFrame table, and clickable rows
  function renderScanResults(container, res, prefix) {
    const stocks = res.stocks || [];
    if (stocks.length === 0) {
      container.innerHTML = `<div class="st-caption">Scan Complete: 0 Stocks Found meeting criteria.</div>`;
      return;
    }

    const columns = res.columns || Object.keys(stocks[0]).filter((k) => !k.startsWith("_"));

    // Check if volume breakout 2-column format or table format
    let dataDisplayHtml = "";
    if (res.mode === "volume_breakout") {
      dataDisplayHtml = `
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 10px; margin: 1rem 0;">
          ${stocks.map((s) => `
            <div class="stock-clickable-item" data-symbol="${s["Symbol"] || s.symbol}" style="padding: 0.65rem 0.85rem; background: #F8F9FA; border: 1px solid var(--st-border-input); border-radius: 4px; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong style="color: #1E88E5;">${s["Symbol"]}</strong> — ${s["Company Name"] || ""} (${s["Change %"] || ""})
              </div>
              <span style="font-size: 0.85rem; background: #E3F2FD; color: #1565C0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${s["Vol Ratio"] || ""}</span>
            </div>
          `).join("")}
        </div>
      `;
    } else {
      dataDisplayHtml = `
        <div class="st-dataframe-container">
          <table class="st-table">
            <thead>
              <tr>${columns.map((c) => `<th>${c}</th>`).join("")}</tr>
            </thead>
            <tbody>
              ${stocks.map((row) => {
                const sym = row["Symbol"] || row["symbol"] || Object.values(row)[0];
                return `
                <tr class="stock-clickable-row" data-symbol="${sym}" title="Click to analyze ${sym}">
                  ${columns.map((col) => `<td>${row[col] !== undefined && row[col] !== null ? row[col] : "N/A"}</td>`).join("")}
                </tr>
              `;
              }).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="background-color: #D4EDDA; color: #155724; border: 1px solid #C3E6CB; border-radius: var(--st-radius); padding: 0.75rem 1rem; margin-bottom: 0.75rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 8px;">
        <span>✅ Scan Complete: ${stocks.length} Stocks Found</span>
        <span style="font-size: 0.88rem; font-weight: 500; opacity: 0.9;">💡 Click any stock row below to view full analysis</span>
      </div>

      ${dataDisplayHtml}
    `;

    // Attach click listeners to all clickable rows and cards
    container.querySelectorAll(".stock-clickable-row, .stock-clickable-item").forEach((el) => {
      el.addEventListener("click", () => {
        const sym = el.getAttribute("data-symbol");
        if (sym) {
          container.querySelectorAll(".stock-clickable-row, .stock-clickable-item").forEach((r) => r.classList.remove("selected-stock-row"));
          el.classList.add("selected-stock-row");
          renderInlineStockAnalysis(sym);
        }
      });
    });
  }

  // Subtab 6: Load full company catalog for individual search
  async function initStocksAnalysisDropdown() {
    const analysisSelect = document.getElementById("analysis-company-select");
    const selectedDisplay = document.getElementById("analysis-selected-display");
    if (!analysisSelect) return;

    try {
      const companies = await fetchAPI("/stock/companies");
      analysisSelect.innerHTML = `<option value="">Select the Stock</option>` +
        companies.map((c) => `<option value="${c.symbol}">${c.company_name} (${c.symbol})</option>`).join("");

      analysisSelect.addEventListener("change", () => {
        const sym = analysisSelect.value;
        if (sym) {
          if (selectedDisplay) selectedDisplay.innerText = `You selected: ${analysisSelect.options[analysisSelect.selectedIndex].text}`;
          renderInlineStockAnalysis(sym);
        }
      });
    } catch (err) {
      console.warn("Could not pre-load companies list:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Inline Stock Report Generator (Matches reportGenerator(option))
  // ─────────────────────────────────────────────────────────────────────────
  async function renderInlineStockAnalysis(symbol) {
    if (!inlineContainer) return;

    inlineContainer.scrollIntoView({ behavior: "smooth", block: "start" });
    inlineContainer.innerHTML = `
      <div style="padding: 2.5rem 1rem; text-align: center; border-top: 2px solid var(--st-border-color); margin-top: 2rem;">
        <span class="st-spinner" style="width: 28px; height: 28px; border-width: 3px;"></span>
        <div style="margin-top: 1rem; font-weight: 600; font-size: 1.1rem; color: var(--st-text-color);">
          Fetching live fundamentals, technical indicators, and shareholding records for <strong>${symbol}</strong>...
        </div>
      </div>
    `;

    try {
      const data = await fetchAPI(`/stock/analysis/${symbol}`);
      renderAnalysisDashboard(data);
    } catch (err) {
      inlineContainer.innerHTML = `
        <div style="padding: 1.5rem; background: #F8D7DA; color: #721C24; border: 1px solid #F5C6CB; border-radius: var(--st-radius); margin-top: 2rem;">
          <strong>Error fetching stock analysis:</strong> ${err.message}
        </div>
      `;
    }
  }

  function renderAnalysisDashboard(data) {
    // 1. Build Valuation Table HTML (2-column split table matching .valuation-table in screener.py)
    const valLeft = [
      ["Market Cap", data.market_cap || "N/A"],
      ["P/E (TTM)", data.pe_ratio || "N/A"],
      ["Forward P/E", data.valuation["Forward P/E"] || "N/A"],
      ["PEG Ratio", data.valuation["PEG Ratio"] || "N/A"],
      ["P/S (TTM)", data.valuation["Price/Sales"] || "N/A"],
      ["P/B", data.valuation["Price/Book"] || "N/A"],
    ];
    const valRight = [
      ["P/FCF", data.valuation["Price/FCF"] || "N/A"],
      ["EV/EBITDA", data.valuation["EV/EBITDA"] || "N/A"],
      ["EPS (TTM)", data.eps_ttm || "N/A"],
      ["Forward EPS", data.eps_forward || "N/A"],
      ["EPS Growth (QoQ)", data.eps_growth || "N/A"],
      ["Dividend Yield", data.financials["Dividend Yield"] || "N/A"],
    ];
    let valTableRows = "";
    for (let i = 0; i < valLeft.length; i++) {
      const l = valLeft[i];
      const r = valRight[i] || ["", ""];
      valTableRows += `
        <tr>
          <td class="metric-col">${l[0]}</td>
          <td class="value-col">${l[1]}</td>
          <td class="spacer-col"></td>
          <td class="metric-col">${r[0]}</td>
          <td class="value-col">${r[1]}</td>
        </tr>
      `;
    }

    // 2. Build Financials Table HTML (2-column split table matching .financial-table in screener.py)
    const finLeft = [
      ["Current Ratio", data.financials["Current Ratio"] || "N/A"],
      ["Quick Ratio", data.financials["Quick Ratio"] || "N/A"],
      ["Debt/Equity", data.financials["Debt/Equity"] || "N/A"],
      ["Interest Coverage", data.financials["Interest Coverage"] || "N/A"],
      ["ROE", data.roe || "N/A"],
      ["ROA", data.financials["ROA"] || "N/A"],
      ["ROIC", data.financials["ROIC"] || "N/A"],
    ];
    const finRight = [
      ["Operating Margin", data.growth["Operating Margin"] || "N/A"],
      ["Net Margin", data.growth["Net Margin"] || "N/A"],
      ["EBITDA Margin", data.growth["EBITDA Margin"] || "N/A"],
      ["Revenue Growth (YoY)", data.growth["Revenue Growth (YoY)"] || "N/A"],
      ["Earnings Growth (YoY)", data.growth["Earnings Growth (YoY)"] || "N/A"],
      ["FCF Growth (YoY)", data.growth["FCF Growth (YoY)"] || "N/A"],
      ["Dividend Payout Ratio", data.financials["Payout Ratio"] || "N/A"],
    ];
    let finTableRows = "";
    const maxFin = Math.max(finLeft.length, finRight.length);
    for (let i = 0; i < maxFin; i++) {
      const l = finLeft[i] || ["", ""];
      const r = finRight[i] || ["", ""];
      finTableRows += `
        <tr>
          <td class="metric-col">${l[0]}</td>
          <td class="value-col">${l[1]}</td>
          <td class="spacer-col"></td>
          <td class="metric-col">${r[0]}</td>
          <td class="value-col">${r[1]}</td>
        </tr>
      `;
    }

    // 3. Build Multibagger Table HTML (matching #multibagger-table in screener.py)
    const mRows = data.multibagger_table || [];
    let multibaggerTableHtml = "";
    if (mRows.length > 0) {
      multibaggerTableHtml = `
        <div style="margin: 15px 0; overflow-x: auto;">
          <table id="multibagger-table">
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Your Value</th>
                <th>Target</th>
                <th>Verdict</th>
                <th>Why It Matters</th>
              </tr>
            </thead>
            <tbody>
              ${mRows.map(row => `
                <tr>
                  <td><strong>${row.parameter}</strong></td>
                  <td style="font-weight: 600;">${row.your_value}</td>
                  <td>${row.target}</td>
                  <td><span class="verdict-badge ${row.verdict_type}">${row.verdict}</span></td>
                  <td style="color: #555; font-size: 0.9rem;">${row.why_it_matters}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    // 4. Build Key Executives HTML
    const officers = data.company_officers || [];
    const officersHtml = officers.length > 0
      ? `
        <div style="margin-top: 1.25rem;">
          <h4 style="margin-bottom: 0.5rem; font-size: 1.05rem;">Key Executives</h4>
          <ul style="margin: 0; padding-left: 1.25rem; line-height: 1.8;">
            ${officers.map(o => `<li><strong>${o.name}</strong>: ${o.title}</li>`).join("")}
          </ul>
        </div>
      `
      : "";

    // 5. Main Dashboard Render
    inlineContainer.innerHTML = `
      <div style="margin-top: 2.5rem; padding-top: 2rem; border-top: 2px solid var(--st-border-color);">

        <!-- Company Header (render_company_header) -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
          <div>
            <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: var(--st-text-color);">${data.company_name}</h1>
            <div style="font-size: 14px; color: #666; margin-top: 4px;">
              ${data.symbol} • ${data.industry}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 2.2rem; font-weight: 800; color: #1E88E5;">${data.current_price}</div>
            <div style="font-size: 0.85rem; color: var(--st-text-muted);">Current Market Price</div>
          </div>
        </div>

        <!-- 8-Metric Grid Summary (render_metrics_grid matching Streamlit 4-column layout) -->
        <div class="st-metric-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; margin-bottom: 1.5rem;">
          <div class="st-metric-card"><div class="st-metric-label">Current Price</div><div class="st-metric-value">${data.current_price}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">52-Week Range</div><div class="st-metric-value" style="font-size: 1.05rem;">${data.fifty_two_week_range}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">Market Cap</div><div class="st-metric-value">${data.market_cap}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">Volume / Avg</div><div class="st-metric-value" style="font-size: 1.05rem;">${data.volume} / ${data.avg_volume}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">P/E (TTM)</div><div class="st-metric-value">${data.pe_ratio}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">Sector</div><div class="st-metric-value" style="font-size: 1.05rem;">${data.sector}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">EPS (TTM)</div><div class="st-metric-value">${data.eps_ttm || "N/A"}</div></div>
          <div class="st-metric-card"><div class="st-metric-label">EPS Growth (QoQ)</div><div class="st-metric-value">${data.eps_growth || "N/A"}</div></div>
        </div>

        <!-- 4 Deep-Dive Tabs (render_overview_tab, render_valuation_tab, render_financials_tab, render_multibagger_tab) -->
        <div class="st-tabs-nav" id="deepdive-subtabs" style="margin-top: 1.75rem;">
          <button class="st-tab-trigger active" data-div="tab-funda-overview">📊 Overview</button>
          <button class="st-tab-trigger" data-div="tab-funda-val">📈 Valuation</button>
          <button class="st-tab-trigger" data-div="tab-funda-fin">💰 Financials</button>
          <button class="st-tab-trigger" data-div="tab-funda-multi">💎 Multibagger</button>
        </div>

        <!-- Tab 1: Overview -->
        <div class="deepdive-pane" id="tab-funda-overview" style="display: block;">
          <h3 style="font-size: 1.2rem; margin-top: 1rem;">Company Information</h3>
          <div style="margin: 0.5rem 0 1rem; font-size: 0.95rem;"><strong>Industry:</strong> ${data.industry}</div>
          <div style="background: #F8F9FA; border-left: 4px solid #1E88E5; padding: 1rem 1.25rem; border-radius: 4px; font-size: 0.95rem; line-height: 1.6; color: #333;">
            <h4 style="margin: 0 0 0.5rem 0;">About</h4>
            <em>${data.about}</em>
          </div>
          ${officersHtml}
        </div>

        <!-- Tab 2: Valuation (Exact 2-column split valuation table) -->
        <div class="deepdive-pane" id="tab-funda-val" style="display: none;">
          <h3 style="font-size: 1.2rem; margin-top: 1rem;">Valuation Metrics</h3>
          <table class="valuation-table">
            <thead>
              <tr>
                <th class="metric-col">Metric</th>
                <th style="text-align: right;">Value</th>
                <th class="spacer-col"></th>
                <th class="metric-col">Metric</th>
                <th style="text-align: right;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${valTableRows}
            </tbody>
          </table>
          <div style="margin-top: 10px; font-size: 13px; color: #666;">
            <strong>Note:</strong> All valuation metrics are based on the most recent available data. P/E and other ratios are calculated using TTM (Trailing Twelve Months) figures unless specified.
          </div>
        </div>

        <!-- Tab 3: Financial Health (Exact 2-column split financials table) -->
        <div class="deepdive-pane" id="tab-funda-fin" style="display: none;">
          <h3 style="font-size: 1.2rem; margin-top: 1rem;">Financial Health</h3>
          <table class="financial-table">
            <thead>
              <tr>
                <th class="metric-col">Metric</th>
                <th style="text-align: right;">Value</th>
                <th class="spacer-col"></th>
                <th class="metric-col">Metric</th>
                <th style="text-align: right;">Value</th>
              </tr>
            </thead>
            <tbody>
              ${finTableRows}
            </tbody>
          </table>
        </div>

        <!-- Tab 4: Multibagger Analysis (Exact Multibagger Potential Table) -->
        <div class="deepdive-pane" id="tab-funda-multi" style="display: none;">
          <h3 style="font-size: 1.2rem; margin-top: 1rem;">Multibagger Potential Analysis</h3>
          <div style="font-style: italic; color: #666; font-size: 0.95rem; margin-bottom: 0.75rem;">Comprehensive evaluation of key financial metrics</div>
          <h4 style="margin: 1rem 0 0.5rem 0;">Key Financial Metrics</h4>
          ${multibaggerTableHtml}
          <div style="margin-top: 1rem; padding: 0.85rem 1.25rem; background: #E8F5E9; border-radius: 4px; font-size: 0.92rem; color: #1B5E20; line-height: 1.6;">
            <strong>💡 Multibagger Framework:</strong> Consistent EPS growth &gt;15%, low Debt/Equity &lt;0.5, robust free cash flows, and high ROE &gt;15% signal high capital efficiency and reinvestment runway.
          </div>
        </div>

        <!-- Technical Indicators Expander (with st.expander("📈 View Technical Indicators")) -->
        <div class="st-expander" style="margin-top: 1.75rem; border: 1px solid var(--st-border-input); border-radius: var(--st-radius);">
          <div class="st-expander-header" id="expander-tech-toggle" style="cursor: pointer; padding: 0.85rem 1.25rem; font-weight: 600; display: flex; justify-content: space-between; align-items: center; background: #F8F9FA;">
            <span>📈 View Technical Indicators</span>
            <span id="expander-arrow">▼</span>
          </div>
          <div class="st-expander-content" id="expander-tech-body" style="display: none; padding: 1.25rem; border-top: 1px solid var(--st-border-input); background: #FFFFFF;">
            <div class="st-metric-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px;">
              ${Object.entries(data.technical_indicators).map(([k, v]) => `
                <div class="st-metric-card"><div class="st-metric-label">${k}</div><div class="st-metric-value" style="font-size: 1.15rem;">${v}</div></div>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- Multi-Panel Technical Chart (chart(ticker=option) from mlpchart.py: Candlesticks + SMAs + Volume + RSI) -->
        <div style="margin: 2.5rem 0;">
          <h3 style="font-size: 1.25rem; margin-bottom: 0.5rem;">📊 Institutional Technical Chart (Candlesticks, SMAs, Volume, RSI)</h3>
          <div id="stock-technical-chart" style="width: 100%; min-height: 520px; background: #FFFFFF; border: 1px solid var(--st-border-input); border-radius: var(--st-radius);"></div>
        </div>

        <!-- Financial & Shareholding Status (analyze_financial_data matching Streamlit columns) -->
        <div style="margin: 2.5rem 0;">
          <h3 style="font-size: 1.25rem; margin-bottom: 1rem;">📊 Financial Data Analysis</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
            <!-- Column 1 -->
            <div style="background: #FFFFFF; padding: 1.5rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div class="st-status-item">
                <div class="st-status-title">1. Quarterly Profit Status:</div>
                <div class="st-status-verdict ${data.financial_status.quarterly_profit.status_type}">${data.financial_status.quarterly_profit.badge}</div>
              </div>
              <div class="st-status-item">
                <div class="st-status-title">3. FII Shareholding Status:</div>
                <div class="st-status-verdict ${data.financial_status.fii_holding.status_type}">${data.financial_status.fii_holding.badge}</div>
              </div>
              <div class="st-status-item" style="margin-bottom: 0;">
                <div class="st-status-title">5. Promoters Shareholding Status:</div>
                <div class="st-status-verdict ${data.financial_status.promoter_holding.status_type}">${data.financial_status.promoter_holding.badge}</div>
              </div>
            </div>

            <!-- Column 2 -->
            <div style="background: #FFFFFF; padding: 1.5rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
              <div class="st-status-item">
                <div class="st-status-title">2. Yearly Profit Status:</div>
                <div class="st-status-verdict ${data.financial_status.yearly_profit.status_type}">${data.financial_status.yearly_profit.badge}</div>
              </div>
              <div class="st-status-item">
                <div class="st-status-title">4. DII Shareholding Status:</div>
                <div class="st-status-verdict ${data.financial_status.dii_holding.status_type}">${data.financial_status.dii_holding.badge}</div>
              </div>
              <div class="st-status-item" style="margin-bottom: 0;">
                <div class="st-status-title">6. Public Shareholding Status:</div>
                <div class="st-status-verdict ${data.financial_status.public_holding.status_type}">${data.financial_status.public_holding.badge}</div>
              </div>
            </div>
          </div>
        </div>

        <!-- Shareholding & Financial Subplots (plotShareholding 2-column subplot grid) -->
        <div style="margin: 2.5rem 0;">
          <h3 style="font-size: 1.25rem; margin-bottom: 1rem;">📉 Financial & Ownership Trajectory Plots</h3>
          <div id="stock-subplots-container" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(460px, 1fr)); gap: 16px;"></div>
        </div>

        <!-- Latest News on Company (CompanyNews) -->
        <div style="margin: 2.5rem 0;">
          <h3 style="font-size: 1.25rem; margin-bottom: 1rem;">📰 Latest News on ${data.company_name}</h3>
          <div style="background: #FFFFFF; border: 1px solid var(--st-border-input); border-radius: var(--st-radius); padding: 1.25rem 1.5rem; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            ${(data.news && data.news.length > 0) ? `
              <ul style="margin: 0; padding-left: 1.25rem; line-height: 2.2;">
                ${data.news.map((n) => `
                  <li>
                    <a href="${n.url}" target="_blank" style="color: #1E88E5; font-weight: 600; text-decoration: none; font-size: 0.98rem;">${n.title}</a>
                    ${n.publisher ? `<span style="color: var(--st-text-muted); font-size: 0.85rem; margin-left: 8px;">— ${n.publisher}</span>` : ""}
                  </li>
                `).join("")}
              </ul>
            ` : `<div style="color: var(--st-text-muted);">No news found for this topic.</div>`}
          </div>
        </div>

        <!-- AI Research Report Button & Output (reportGenerator) -->
        <div style="margin: 3.5rem 0; padding: 2.5rem; background: #F8F9FA; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); text-align: center;">
          <button class="st-btn st-btn-primary" id="btn-generate-ai-report" style="font-size: 1.2rem; padding: 0.85rem 2.5rem; font-weight: 700; box-shadow: 0 4px 12px rgba(30,136,229,0.25);">
            🤖 AI Research Report
          </button>
          <div style="font-size: 0.95rem; color: var(--st-text-muted); margin-top: 10px;">
            Generates institutional-grade equity analysis with valuation comparison, ownership trends, and technical price roadmap.
          </div>
          <div id="ai-report-output-container" style="text-align: left; margin-top: 2rem;"></div>
        </div>

      </div>
    `;

    // Initialize Deep Dive Subtabs
    const deepTabs = document.querySelectorAll("#deepdive-subtabs .st-tab-trigger");
    deepTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        deepTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const divId = tab.getAttribute("data-div");
        document.querySelectorAll(".deepdive-pane").forEach((p) => (p.style.display = "none"));
        const activePane = document.getElementById(divId);
        if (activePane) activePane.style.display = "block";
      });
    });

    // Technical Expander Toggle
    const expanderToggle = document.getElementById("expander-tech-toggle");
    const expanderBody = document.getElementById("expander-tech-body");
    const expanderArrow = document.getElementById("expander-arrow");
    if (expanderToggle && expanderBody) {
      expanderToggle.addEventListener("click", () => {
        const isHidden = expanderBody.style.display === "none";
        expanderBody.style.display = isHidden ? "block" : "none";
        expanderArrow.innerText = isHidden ? "▲" : "▼";
      });
    }

    // Render Institutional Technical Chart (mlpchart Candlestick + SMAs + Volume + RSI)
    renderTechnicalChart(data);

    // Render Multi-Panel Financial & Shareholding Subplots
    renderShareholdingSubplots(data);

    // Wire AI Research Report Generator
    const btnAiReport = document.getElementById("btn-generate-ai-report");
    const aiReportContainer = document.getElementById("ai-report-output-container");
    if (btnAiReport && aiReportContainer) {
      btnAiReport.addEventListener("click", async () => {
        btnAiReport.disabled = true;
        btnAiReport.innerHTML = `<span class="st-spinner"></span> Generating Report...`;
        aiReportContainer.innerHTML = `
          <div style="padding: 2.5rem; text-align: center;">
            <span class="st-spinner" style="width: 28px; height: 28px;"></span>
            <div style="margin-top: 12px; font-weight: 600; color: var(--st-text-color);">
              Synthesizing institutional equity research report via Groq LLM...
            </div>
          </div>
        `;

        try {
          const repRes = await fetchAPI("/stock/report", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ symbol: data.symbol }),
          });

          const thinkingPart = repRes.thinking_part || "Reasoning synthesized based on institutional factors.";
          const reportHtml = window.marked ? window.marked.parse(repRes.report_markdown) : repRes.report_markdown;

          aiReportContainer.innerHTML = `
            <div style="margin-top: 1.5rem;">
              <h2 style="display: flex; align-items: center; gap: 8px; font-size: 1.6rem; color: #2C3E50;">
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Rocket.png" alt="Rocket" width="40" height="40" />
                AI Financial Research Report
              </h2>

              <!-- Expandable Reasoning Box (Click to Expand) matching with st.expander("🧠 Agent Reasoning") -->
              <div class="st-expander" style="margin: 1.25rem 0; border: 1px solid #90CAF9; background: #F0F7FF; border-radius: var(--st-radius);">
                <div class="st-expander-header" id="reasoning-toggle" style="background: #E3F2FD; color: #0D47A1; cursor: pointer; padding: 0.85rem 1.25rem; font-weight: 600; display: flex; justify-content: space-between;">
                  <span>🧠 Agent Reasoning (Click to Expand)</span>
                  <span id="reasoning-arrow">▼</span>
                </div>
                <div class="st-expander-content" id="reasoning-body" style="display: none; padding: 1.25rem; background: #FAFCFF; font-family: monospace; font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap; border-top: 1px solid #BBDEFB;">${escapeHtml(thinkingPart)}</div>
              </div>

              <!-- Main Report Output -->
              <div style="background: #FFFFFF; padding: 2.25rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); line-height: 1.8; box-shadow: 0 2px 8px rgba(0,0,0,0.06);">
                ${reportHtml}
              </div>
            </div>
          `;

          const rToggle = document.getElementById("reasoning-toggle");
          const rBody = document.getElementById("reasoning-body");
          const rArrow = document.getElementById("reasoning-arrow");
          if (rToggle && rBody) {
            rToggle.addEventListener("click", () => {
              const isClosed = rBody.style.display === "none";
              rBody.style.display = isClosed ? "block" : "none";
              rArrow.innerText = isClosed ? "▲" : "▼";
            });
          }
        } catch (repErr) {
          aiReportContainer.innerHTML = `<div style="color: #D32F2F;">⚠️ Report generation error: ${repErr.message}</div>`;
        } finally {
          btnAiReport.disabled = false;
          btnAiReport.innerHTML = "🤖 AI Research Report";
        }
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Institutional Technical Multi-Panel Chart (Candlesticks, SMAs, Volume, RSI)
  // ─────────────────────────────────────────────────────────────────────────
  function renderTechnicalChart(data) {
    if (!window.Plotly || !data.candlestick || !data.candlestick.dates.length) return;
    const c = data.candlestick;
    const dates = c.dates;
    const close = c.close;

    // Calculate SMA helper
    function calcSMA(prices, windowSize) {
      const result = [];
      for (let i = 0; i < prices.length; i++) {
        if (i < windowSize - 1) {
          result.push(null);
        } else {
          const slice = prices.slice(i - windowSize + 1, i + 1);
          const sum = slice.reduce((a, b) => a + b, 0);
          result.push(roundTo2(sum / windowSize));
        }
      }
      return result;
    }

    function roundTo2(val) {
      return Math.round(val * 100) / 100;
    }

    const sma20 = calcSMA(close, 20);
    const sma50 = calcSMA(close, 50);
    const sma200 = calcSMA(close, 200);

    // Calculate RSI (14) helper
    function calcRSI(prices, period = 14) {
      const rsi = [];
      let gains = 0;
      let losses = 0;

      for (let i = 0; i < prices.length; i++) {
        if (i === 0) {
          rsi.push(null);
          continue;
        }
        const diff = prices[i] - prices[i - 1];
        if (i <= period) {
          if (diff >= 0) gains += diff;
          else losses -= diff;
          rsi.push(null);
          if (i === period) {
            let avgGain = gains / period;
            let avgLoss = losses / period;
            let rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
            rsi[i] = roundTo2(100 - (100 / (1 + rs)));
          }
        } else {
          const gain = diff > 0 ? diff : 0;
          const loss = diff < 0 ? -diff : 0;
          gains = (gains * (period - 1) + gain) / period;
          losses = (losses * (period - 1) + loss) / period;
          let rs = losses === 0 ? 100 : gains / losses;
          rsi.push(roundTo2(100 - (100 / (1 + rs))));
        }
      }
      return rsi;
    }

    const rsiValues = calcRSI(close, 14);

    // Panel 1: Candlestick + SMAs
    const candleTrace = {
      x: dates,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      type: "candlestick",
      name: "Price",
      yaxis: "y",
      increasing: { line: { color: "#26A69A", width: 1.2 } },
      decreasing: { line: { color: "#EF5350", width: 1.2 } },
    };

    const sma20Trace = {
      x: dates,
      y: sma20,
      type: "scatter",
      mode: "lines",
      name: "SMA 20",
      yaxis: "y",
      line: { color: "#2196F3", width: 1.5 },
    };

    const sma50Trace = {
      x: dates,
      y: sma50,
      type: "scatter",
      mode: "lines",
      name: "SMA 50",
      yaxis: "y",
      line: { color: "#FF9800", width: 1.5 },
    };

    const sma200Trace = {
      x: dates,
      y: sma200,
      type: "scatter",
      mode: "lines",
      name: "SMA 200",
      yaxis: "y",
      line: { color: "#9C27B0", width: 1.8 },
    };

    // Panel 2: Volume Bar
    const volColors = c.close.map((cl, i) => (i > 0 && cl >= c.close[i - 1]) ? "#26A69A" : "#EF5350");
    const volumeTrace = {
      x: dates,
      y: c.volume,
      type: "bar",
      name: "Volume",
      yaxis: "y2",
      marker: { color: volColors },
    };

    // Panel 3: RSI (14)
    const rsiTrace = {
      x: dates,
      y: rsiValues,
      type: "scatter",
      mode: "lines",
      name: "RSI (14)",
      yaxis: "y3",
      line: { color: "#673AB7", width: 1.5 },
    };

    const layout = {
      margin: { t: 30, r: 30, b: 35, l: 50 },
      height: 580,
      template: "plotly_white",
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
      showlegend: true,
      legend: { orientation: "h", y: 1.06, x: 0 },
      xaxis: {
        rangeslider: { visible: false },
        anchor: "y3",
      },
      yaxis: {
        domain: [0.45, 1.0],
        title: "Price (₹)",
      },
      yaxis2: {
        domain: [0.25, 0.40],
        title: "Volume",
        showgrid: true,
      },
      yaxis3: {
        domain: [0.0, 0.20],
        title: "RSI",
        range: [0, 100],
        showgrid: true,
      },
      shapes: [
        // RSI 70 line
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          yref: "y3",
          y0: 70,
          y1: 70,
          line: { color: "#E53935", width: 1, dash: "dash" },
        },
        // RSI 30 line
        {
          type: "line",
          xref: "paper",
          x0: 0,
          x1: 1,
          yref: "y3",
          y0: 30,
          y1: 30,
          line: { color: "#43A047", width: 1, dash: "dash" },
        },
      ],
    };

    window.Plotly.newPlot("stock-technical-chart", [candleTrace, sma20Trace, sma50Trace, sma200Trace, volumeTrace, rsiTrace], layout, {
      responsive: true,
      displayModeBar: false,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Interactive Candlestick Chart (plotChart(option))
  // ─────────────────────────────────────────────────────────────────────────
  function renderCandlestickChart(data) {
    if (!window.Plotly || !data.candlestick || !data.candlestick.dates.length) return;
    const c = data.candlestick;
    const trace = {
      x: c.dates,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      type: "candlestick",
      name: data.symbol,
      increasing: { line: { color: "#26A69A" } },
      decreasing: { line: { color: "#EF5350" } },
    };

    const layout = {
      margin: { t: 30, r: 30, b: 35, l: 50 },
      height: 440,
      xaxis: { rangeslider: { visible: true } },
      yaxis: { title: "Price (₹)" },
      template: "plotly_white",
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
    };

    window.Plotly.newPlot("stock-candlestick-chart", [trace], layout, {
      responsive: true,
      displayModeBar: false,
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Financial & Shareholding Subplots (plotShareholding from screener.py)
  // ─────────────────────────────────────────────────────────────────────────
  function renderShareholdingSubplots(data) {
    const container = document.getElementById("stock-subplots-container");
    if (!container || !window.Plotly || !data.shareholding_series) return;
    const s = data.shareholding_series;

    const titlesMap = {
      Quarter: "Quarterly Net Profit (₹ Cr)",
      Yearly: "Yearly Net Profit (₹ Cr)",
      Promoters: "Promoters Holding (%)",
      FII: "FII Holding (%)",
      DII: "DII Holding (%)",
      Public: "Public Holding (%)",
    };

    const colorsMap = {
      Quarter: "#1E88E5",
      Yearly: "#00897B",
      Promoters: "#7B1FA2",
      FII: "#FB8C00",
      DII: "#43A047",
      Public: "#E53935",
    };

    const keys = ["Quarter", "Yearly", "Promoters", "FII", "DII", "Public"].filter(
      (k) => s[k] && s[k].length > 0
    );

    container.innerHTML = keys
      .map(
        (key) => `
        <div style="background: #FFFFFF; padding: 1rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
          <div style="font-weight: 600; font-size: 0.95rem; margin-bottom: 0.5rem; color: #2C3E50;">${titlesMap[key] || key}</div>
          <div id="plot-series-${key}" style="width: 100%; height: 240px;"></div>
        </div>
      `
      )
      .join("");

    keys.forEach((key) => {
      const vals = s[key];
      const isProfit = key === "Quarter" || key === "Yearly";
      const trace = {
        x: vals.map((_, i) => `Period ${i + 1}`),
        y: vals,
        type: "scatter",
        mode: "lines+markers",
        line: { color: colorsMap[key] || "#1E88E5", width: 2.5 },
        marker: { size: 7, color: colorsMap[key] || "#1E88E5" },
        showlegend: false,
      };

      const layout = {
        margin: { t: 20, r: 25, b: 35, l: 45 },
        height: 240,
        template: "plotly_white",
        paper_bgcolor: "#FFFFFF",
        plot_bgcolor: "#FFFFFF",
        yaxis: {
          title: isProfit ? "Net Profit" : "Holding (%)",
          ticksuffix: isProfit ? "" : "%",
          showgrid: true,
          gridcolor: "#F0F0F0",
        },
        xaxis: {
          showgrid: false,
        },
      };

      window.Plotly.newPlot(`plot-series-${key}`, [trace], layout, {
        responsive: true,
        displayModeBar: false,
      });
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
  }
}
