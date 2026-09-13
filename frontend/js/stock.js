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

  // Renders scan results with Streamlit styled success box, DataFrame table, and dropdown
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
            <div style="padding: 0.5rem 0.75rem; background: #F8F9FA; border: 1px solid var(--st-border-input); border-radius: 4px; font-size: 0.95rem; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <strong>${s["Symbol"]}</strong> — ${s["Current Price"]} (${s["Change %"]})
              </div>
              <span style="font-size: 0.85rem; background: #E3F2FD; color: #1565C0; padding: 2px 8px; border-radius: 4px; font-weight: 600;">${s["Vol Ratio"]}</span>
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
              ${stocks.map((row) => `
                <tr>
                  ${columns.map((col) => `<td>${row[col] !== undefined && row[col] !== null ? row[col] : "N/A"}</td>`).join("")}
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      `;
    }

    container.innerHTML = `
      <div style="background-color: #D4EDDA; color: #155724; border: 1px solid #C3E6CB; border-radius: var(--st-radius); padding: 0.75rem 1rem; margin-bottom: 1rem; font-weight: 600;">
        ✅ Scan Complete: ${stocks.length} Stocks Found
      </div>

      ${dataDisplayHtml}

      <div style="margin: 1.5rem 0 0.5rem; font-weight: 600; font-size: 1.05rem;">Select a Stock for Analysis:</div>
      <div style="display: flex; gap: 12px; max-width: 600px; align-items: center;">
        <select id="sel-${prefix}" class="st-chat-input-field" style="border: 1px solid var(--st-border-input); border-radius: var(--st-radius); padding: 0.5rem 0.8rem; background: #FFF; font-size: 0.95rem; flex: 1;">
          <option value="">Select the Stock</option>
          ${stocks.map((s) => `<option value="${s.Symbol}">${s.Symbol} ${s["Company Name"] ? `- ${s["Company Name"]}` : ""}</option>`).join("")}
        </select>
      </div>
    `;

    const selectEl = document.getElementById(`sel-${prefix}`);
    if (selectEl) {
      selectEl.addEventListener("change", () => {
        const sym = selectEl.value;
        if (sym) {
          renderInlineStockAnalysis(sym);
        }
      });
    }
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
    inlineContainer.innerHTML = `
      <div style="margin-top: 2.5rem; padding-top: 2rem; border-top: 2px solid var(--st-border-color);">

        <!-- Company Header (render_company_header) -->
        <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.25rem;">
          <div>
            <h1 style="margin: 0; font-size: 2.1rem; font-weight: 700; color: var(--st-text-color);">${data.company_name}</h1>
            <div style="font-size: 1rem; color: var(--st-text-muted); margin-top: 4px;">
              <strong>${data.symbol}</strong> • ${data.sector} • ${data.industry}
            </div>
          </div>
          <div style="text-align: right;">
            <div style="font-size: 2.2rem; font-weight: 800; color: #1E88E5;">${data.current_price}</div>
            <div style="font-size: 0.9rem; color: var(--st-text-muted);">Current Market Price</div>
          </div>
        </div>

        <!-- 4-Metric Grid Summary -->
        <div class="st-metric-grid">
          <div class="st-metric-card">
            <div class="st-metric-label">Market Cap</div>
            <div class="st-metric-value">${data.market_cap}</div>
          </div>
          <div class="st-metric-card">
            <div class="st-metric-label">P/E Ratio</div>
            <div class="st-metric-value">${data.pe_ratio}</div>
          </div>
          <div class="st-metric-card">
            <div class="st-metric-label">Return on Equity (ROE)</div>
            <div class="st-metric-value">${data.roe}</div>
          </div>
          <div class="st-metric-card">
            <div class="st-metric-label">52-Week Range</div>
            <div class="st-metric-value" style="font-size: 1.15rem;">${data.fifty_two_week_range}</div>
          </div>
        </div>

        <!-- About Section -->
        <div style="background: #F8F9FA; border-left: 4px solid #1E88E5; padding: 1rem 1.25rem; border-radius: 4px; margin: 1.5rem 0; font-size: 0.98rem; line-height: 1.6; color: #333;">
          <strong>About ${data.company_name}:</strong><br>
          <em>${data.about}</em>
        </div>

        <!-- Subtabs for Deep Dive (Overview, Valuation, Financials, Multibagger) -->
        <div class="st-tabs-nav" id="deepdive-subtabs" style="margin-top: 2rem;">
          <button class="st-tab-trigger active" data-div="tab-funda-overview">📊 Overview</button>
          <button class="st-tab-trigger" data-div="tab-funda-val">📈 Valuation</button>
          <button class="st-tab-trigger" data-div="tab-funda-fin">💰 Financial Health</button>
          <button class="st-tab-trigger" data-div="tab-funda-multi">💎 Multibagger Analysis</button>
        </div>

        <!-- Tab 1: Overview -->
        <div class="deepdive-pane" id="tab-funda-overview" style="display: block;">
          <div class="st-metric-grid">
            <div class="st-metric-card"><div class="st-metric-label">Day Range</div><div class="st-metric-value" style="font-size: 1.15rem;">${data.day_range}</div></div>
            <div class="st-metric-card"><div class="st-metric-label">Volume</div><div class="st-metric-value" style="font-size: 1.25rem;">${data.volume}</div></div>
            <div class="st-metric-card"><div class="st-metric-label">Average Volume (20-day)</div><div class="st-metric-value" style="font-size: 1.25rem;">${data.avg_volume}</div></div>
            <div class="st-metric-card"><div class="st-metric-label">ROCE</div><div class="st-metric-value">${data.roce}</div></div>
          </div>
        </div>

        <!-- Tab 2: Valuation -->
        <div class="deepdive-pane" id="tab-funda-val" style="display: none;">
          <div class="st-metric-grid">
            ${Object.entries(data.valuation).map(([k, v]) => `
              <div class="st-metric-card"><div class="st-metric-label">${k}</div><div class="st-metric-value" style="font-size: 1.25rem;">${v}</div></div>
            `).join("")}
          </div>
        </div>

        <!-- Tab 3: Financial Health -->
        <div class="deepdive-pane" id="tab-funda-fin" style="display: none;">
          <div class="st-metric-grid">
            ${Object.entries(data.financials).map(([k, v]) => `
              <div class="st-metric-card"><div class="st-metric-label">${k}</div><div class="st-metric-value" style="font-size: 1.25rem;">${v}</div></div>
            `).join("")}
          </div>
        </div>

        <!-- Tab 4: Multibagger Analysis -->
        <div class="deepdive-pane" id="tab-funda-multi" style="display: none;">
          <div class="st-metric-grid">
            ${Object.entries(data.multibagger).map(([k, v]) => `
              <div class="st-metric-card"><div class="st-metric-label">${k}</div><div class="st-metric-value" style="font-size: 1.2rem;">${v}</div></div>
            `).join("")}
          </div>
          <div style="margin-top: 1rem; padding: 0.85rem; background: #E8F5E9; border-radius: 4px; font-size: 0.92rem; color: #1B5E20;">
            <strong>💡 Multibagger Framework:</strong> Consistent EPS growth &gt;15%, low Debt/Equity &lt;0.5, robust free cash flows, and high ROE &gt;15% signal high capital efficiency and reinvestment runway.
          </div>
        </div>

        <!-- Expander: View Technical Indicators (compute_latest_technical_indicators) -->
        <div class="st-expander" style="margin-top: 1.5rem;">
          <div class="st-expander-header" id="expander-tech-toggle">
            <span>📈 View Technical Indicators</span>
            <span id="expander-arrow">▼</span>
          </div>
          <div class="st-expander-content" id="expander-tech-body" style="display: none;">
            <div class="st-metric-grid">
              ${Object.entries(data.technical_indicators).map(([k, v]) => `
                <div class="st-metric-card"><div class="st-metric-label">${k}</div><div class="st-metric-value" style="font-size: 1.2rem;">${v}</div></div>
              `).join("")}
            </div>
          </div>
        </div>

        <!-- Candlestick Chart (plotChart(option)) -->
        <div style="margin: 2rem 0;">
          <h3>📈 1-Year Candlestick Price History</h3>
          <div id="stock-candlestick-chart" style="width: 100%; height: 460px; background: #FFFFFF; border: 1px solid var(--st-border-input); border-radius: var(--st-radius);"></div>
        </div>

        <!-- Financial & Shareholding Status (analyze_financial_data) -->
        <div style="margin: 2.5rem 0;">
          <h3>📊 Financial & Shareholding Trend Analysis</h3>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 1rem;">
            <!-- Column 1 -->
            <div style="background: #F8F9FA; padding: 1.25rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input);">
              <div style="margin-bottom: 1.25rem;">
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 0.95rem;">1. Quarterly Profit Status:</div>
                <span class="st-status-badge ${data.financial_status.quarterly_profit.status_type}">${data.financial_status.quarterly_profit.badge}</span>
              </div>
              <div style="margin-bottom: 1.25rem;">
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 0.95rem;">3. FII Shareholding Status:</div>
                <span class="st-status-badge ${data.financial_status.fii_holding.status_type}">${data.financial_status.fii_holding.badge}</span>
              </div>
              <div>
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 0.95rem;">5. Promoters Shareholding Status:</div>
                <span class="st-status-badge ${data.financial_status.promoter_holding.status_type}">${data.financial_status.promoter_holding.badge}</span>
              </div>
            </div>

            <!-- Column 2 -->
            <div style="background: #F8F9FA; padding: 1.25rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input);">
              <div style="margin-bottom: 1.25rem;">
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 0.95rem;">2. Yearly Profit Status:</div>
                <span class="st-status-badge ${data.financial_status.yearly_profit.status_type}">${data.financial_status.yearly_profit.badge}</span>
              </div>
              <div style="margin-bottom: 1.25rem;">
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 0.95rem;">4. DII Shareholding Status:</div>
                <span class="st-status-badge ${data.financial_status.dii_holding.status_type}">${data.financial_status.dii_holding.badge}</span>
              </div>
              <div>
                <div style="font-weight: 600; margin-bottom: 6px; font-size: 0.95rem;">6. Public Shareholding Status:</div>
                <span class="st-status-badge ${data.financial_status.public_holding.status_type}">${data.financial_status.public_holding.badge}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Shareholding & Financial Subplots (plotShareholding) -->
        <div style="margin: 2.5rem 0;">
          <h3>📉 Financial & Ownership Trajectory Plots</h3>
          <div id="stock-shareholding-subplots" style="width: 100%; height: 580px; background: #FFFFFF; border: 1px solid var(--st-border-input); border-radius: var(--st-radius);"></div>
        </div>

        <!-- Latest News Headlines (CompanyNews) -->
        <div style="margin: 2.5rem 0;">
          <h3>📰 Latest News on ${data.company_name}</h3>
          <div style="background: #FFFFFF; border: 1px solid var(--st-border-input); border-radius: var(--st-radius); padding: 1rem 1.5rem;">
            ${(data.news && data.news.length > 0) ? `
              <ul style="margin: 0; padding-left: 1.25rem; line-height: 2;">
                ${data.news.map((n) => `
                  <li>
                    <a href="${n.url}" target="_blank" style="color: #1E88E5; font-weight: 600; text-decoration: none;">${n.title}</a>
                    ${n.publisher ? `<span style="color: var(--st-text-muted); font-size: 0.85rem; margin-left: 6px;">— ${n.publisher}</span>` : ""}
                  </li>
                `).join("")}
              </ul>
            ` : `<div style="color: var(--st-text-muted);">No recent news articles found.</div>`}
          </div>
        </div>

        <!-- AI Report Generator Button (reportGenerator) -->
        <div style="margin: 3rem 0; padding: 2rem; background: #F8F9FA; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); text-align: center;">
          <button class="st-btn st-btn-primary" id="btn-generate-ai-report" style="font-size: 1.15rem; padding: 0.75rem 2rem; font-weight: 600;">
            🤖 AI Research Report
          </button>
          <div style="font-size: 0.9rem; color: var(--st-text-muted); margin-top: 8px;">
            Synthesizes institutional commentary, valuation metrics, technical indicators, and investment roadmap via Groq LLM.
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

    // Render Plotly Candlestick
    renderCandlestickChart(data);

    // Render Plotly Financial Subplots
    renderShareholdingSubplots(data);

    // Wire AI Research Report Generator
    const btnAiReport = document.getElementById("btn-generate-ai-report");
    const aiReportContainer = document.getElementById("ai-report-output-container");
    if (btnAiReport && aiReportContainer) {
      btnAiReport.addEventListener("click", async () => {
        btnAiReport.disabled = true;
        btnAiReport.innerHTML = `<span class="st-spinner"></span> Generating Report...`;
        aiReportContainer.innerHTML = `
          <div style="padding: 2rem; text-align: center;">
            <span class="st-spinner" style="width: 24px; height: 24px;"></span>
            <div style="margin-top: 8px; color: var(--st-text-muted);">
              Analyzing fundamentals, macro drivers, and generating institutional research report...
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
              <h2 style="display: flex; align-items: center; gap: 8px;">
                <img src="https://raw.githubusercontent.com/Tarikul-Islam-Anik/Animated-Fluent-Emojis/master/Emojis/Travel%20and%20places/Rocket.png" alt="Rocket" width="40" height="40" />
                AI Financial Research Report
              </h2>

              <!-- Expandable Reasoning Box (Click to Expand) -->
              <div class="st-expander" style="margin: 1.25rem 0; border: 1px solid #90CAF9; background: #F0F7FF;">
                <div class="st-expander-header" id="reasoning-toggle" style="background: #E3F2FD; color: #0D47A1;">
                  <span>🧠 Agent Reasoning (Click to Expand)</span>
                  <span id="reasoning-arrow">▼</span>
                </div>
                <div class="st-expander-content" id="reasoning-body" style="display: none; background: #FAFCFF; font-family: monospace; font-size: 0.9rem; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(thinkingPart)}</div>
              </div>

              <!-- Main Report Output -->
              <div style="background: #FFFFFF; padding: 2rem; border-radius: var(--st-radius); border: 1px solid var(--st-border-input); line-height: 1.8; box-shadow: 0 2px 8px rgba(0,0,0,0.05);">
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
      xaxis: { rangeslider: { visible: false } },
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

  function renderShareholdingSubplots(data) {
    if (!window.Plotly || !data.shareholding_series) return;
    const s = data.shareholding_series;
    const keys = Object.keys(s).filter((k) => s[k] && s[k].length > 0);
    if (!keys.length) return;

    const traces = keys.map((key) => {
      const vals = s[key];
      return {
        x: vals.map((_, i) => `Period ${i + 1}`),
        y: vals,
        name: key,
        mode: "lines+markers",
        type: "scatter",
        line: { width: 2.5 },
      };
    });

    const layout = {
      title: "Financial Data Analysis (Net Profit & Shareholding)",
      margin: { t: 50, r: 30, b: 40, l: 50 },
      template: "plotly_white",
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FFFFFF",
      legend: { orientation: "h", y: -0.2 },
    };

    window.Plotly.newPlot("stock-shareholding-subplots", traces, layout, {
      responsive: true,
      displayModeBar: false,
    });
  }

  function escapeHtml(text) {
    const div = document.createElement("div");
    div.innerText = text;
    return div.innerHTML;
  }
}
