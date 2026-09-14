/**
 * Clustering Sandbox Tab Controller (K-Means & DBSCAN)
 * Matches exact Streamlit Clustering/clusterapp.py & cluster_util.py:
 * - Pure Black (#000000) canvas with white typography
 * - Equal 1:1 aspect ratio preserving true circular geometry
 * - No legend clutter (showlegend: false)
 * - HSV spectrum palette with darkblue point boundaries
 * - Cyan K-Distance Graph with dashed grid
 * - Exact conditional feedback notes and K-Distance graph toggle
 */

import { fetchAPI } from "./api.js";

export function initClusterSandbox() {
  const algoRadios = document.querySelectorAll("input[name='cluster-algo']");
  const kmeansControls = document.getElementById("kmeans-controls");
  const dbscanControls = document.getElementById("dbscan-controls");
  const kmeansSlider = document.getElementById("kmeans-slider");
  const kmeansVal = document.getElementById("kmeans-val-display");
  const dbscanSlider = document.getElementById("dbscan-slider");
  const dbscanVal = document.getElementById("dbscan-val-display");
  const notesEl = document.getElementById("cluster-notes");
  const kdistSection = document.getElementById("dbscan-kdist-section");
  const kdistPlot = document.getElementById("cluster-kdist-plot");
  const kdistNote = document.getElementById("cluster-kdist-note");
  const kdistRadios = document.querySelectorAll("input[name='show-k-graph']");

  if (!kmeansSlider || !dbscanSlider) return;

  // Load initial raw dataset plot (PlotData() in clusterapp.py)
  loadInitialDataset();

  // Algorithm selector
  algoRadios.forEach((radio) => {
    radio.addEventListener("change", (e) => {
      const algo = e.target.value;
      if (algo === "K-Means") {
        kmeansControls.style.display = "block";
        dbscanControls.style.display = "none";
        notesEl.innerText = "💡 Why don't you try DBSCAN..!!";
        if (kdistSection) kdistSection.style.display = "none";
      } else {
        kmeansControls.style.display = "none";
        dbscanControls.style.display = "block";
        updateDbscanGuidance(parseInt(dbscanSlider.value));
      }
      runClustering();
    });
  });

  // Slider controls
  kmeansSlider.addEventListener("input", (e) => {
    kmeansVal.innerText = e.target.value;
  });
  kmeansSlider.addEventListener("change", runClustering);

  dbscanSlider.addEventListener("input", (e) => {
    const eps = parseInt(e.target.value);
    dbscanVal.innerText = eps;
    updateDbscanGuidance(eps);
  });
  dbscanSlider.addEventListener("change", runClustering);

  // K-Distance graph radio listener
  kdistRadios.forEach((r) => {
    r.addEventListener("change", (e) => {
      if (e.target.value === "Yes") {
        if (kdistPlot) kdistPlot.style.display = "block";
        if (kdistNote) kdistNote.style.display = "block";
        loadKDistGraph();
      } else {
        if (kdistPlot) kdistPlot.style.display = "none";
        if (kdistNote) kdistNote.style.display = "none";
      }
    });
  });

  // Tab visibility and window resize observers for proper Plotly sizing
  const clusterTab = document.getElementById("tab-cluster");
  const resizePlots = () => {
    if (clusterTab && clusterTab.classList.contains("active") && window.Plotly) {
      const rawPlot = document.getElementById("cluster-raw-plot");
      const resultPlot = document.getElementById("cluster-result-plot");
      const kdistPlotEl = document.getElementById("cluster-kdist-plot");
      if (rawPlot) window.Plotly.Plots.resize(rawPlot);
      if (resultPlot) window.Plotly.Plots.resize(resultPlot);
      if (kdistPlotEl && kdistPlotEl.style.display !== "none") window.Plotly.Plots.resize(kdistPlotEl);
    }
  };

  if (clusterTab) {
    const observer = new MutationObserver(() => {
      setTimeout(resizePlots, 100);
    });
    observer.observe(clusterTab, { attributes: true, attributeFilter: ["class"] });
  }
  window.addEventListener("resize", resizePlots);

  // Initial run
  runClustering();

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Initial Dataset Visualization (PlotData() from clusterapp.py)
  // ─────────────────────────────────────────────────────────────────────────
  async function loadInitialDataset() {
    try {
      const data = await fetchAPI("/cluster/dataset");
      const points = data.points || [];

      const trace = {
        x: points.map((p) => p.x),
        y: points.map((p) => p.y),
        mode: "markers",
        type: "scatter",
        name: "Data",
        marker: {
          size: 7,
          color: "#0284C7",
          opacity: 0.75,
          line: { color: "#0369A1", width: 1 },
        },
      };

      const layout = {
        title: {
          text: "Dataset Visualization",
          font: { color: "#1F2937", size: 20, family: "Source Sans Pro, sans-serif" },
        },
        paper_bgcolor: "#FFFFFF",
        plot_bgcolor: "#FAFAFA",
        showlegend: false,
        autosize: true,
        margin: { l: 60, r: 60, t: 60, b: 60 },
        xaxis: {
          title: { text: "Feature 1", font: { color: "#4B5563", size: 14 } },
          range: [-650, 650],
          fixedrange: true,
          color: "#4B5563",
          showgrid: true,
          gridcolor: "#E5E7EB",
          gridwidth: 1,
          zeroline: true,
          zerolinecolor: "#D1D5DB",
          tickfont: { color: "#6B7280", size: 12 },
        },
        yaxis: {
          title: { text: "Feature 2", font: { color: "#4B5563", size: 14 } },
          range: [-650, 650],
          fixedrange: true,
          scaleanchor: "x",
          scaleratio: 1,
          color: "#4B5563",
          showgrid: true,
          gridcolor: "#E5E7EB",
          gridwidth: 1,
          zeroline: true,
          zerolinecolor: "#D1D5DB",
          tickfont: { color: "#6B7280", size: 12 },
        },
      };

      if (window.Plotly) {
        window.Plotly.newPlot("cluster-raw-plot", [trace], layout, {
          responsive: true,
          displayModeBar: false,
        });
      }
    } catch (err) {
      console.error("Failed to load initial dataset:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Run Clustering Algorithm (kmeans() / DBScan() from clusterapp.py)
  // ─────────────────────────────────────────────────────────────────────────
  async function runClustering() {
    const selectedAlgo = document.querySelector("input[name='cluster-algo']:checked")?.value || "K-Means";
    const payload = {
      algorithm: selectedAlgo.toLowerCase().replace("-", ""),
      n_clusters: parseInt(kmeansSlider.value),
      eps: parseFloat(dbscanSlider.value),
      min_samples: 5,
    };

    try {
      const data = await fetchAPI("/cluster/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      renderClusteredPlot(data, selectedAlgo);
    } catch (err) {
      console.error("Clustering execution error:", err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Render Clustered Scatter Plot (Matches kmeans() & DBScan() styling)
  // ─────────────────────────────────────────────────────────────────────────
  function renderClusteredPlot(data, algoName) {
    const points = data.points || [];
    const isDbscan = algoName === "DBSCAN";
    const titleText = isDbscan
      ? "DBSCAN Clustering Visualization"
      : "K-Means Clustering Visualization";

    // Build HSV color palette matching sns.color_palette('hsv', n)
    const uniqueClusters = Array.from(new Set(points.map((p) => p.cluster))).sort((a, b) => a - b);
    const nonNoiseClusters = uniqueClusters.filter((c) => c !== -1);
    const totalColors = Math.max(1, nonNoiseClusters.length);

    // Group points by cluster label
    const clusterMap = {};
    points.forEach((p) => {
      const c = p.cluster;
      if (!clusterMap[c]) clusterMap[c] = { x: [], y: [] };
      clusterMap[c].x.push(p.x);
      clusterMap[c].y.push(p.y);
    });

    const traces = uniqueClusters.map((c) => {
      const isNoise = c === -1;
      let pointColor = "#94A3B8";
      let borderColor = "#64748B";
      if (!isNoise) {
        const idx = nonNoiseClusters.indexOf(c);
        const hue = Math.round((idx / totalColors) * 360);
        pointColor = `hsl(${hue}, 85%, 48%)`;
        borderColor = `hsl(${hue}, 90%, 30%)`;
      }

      return {
        x: clusterMap[c].x,
        y: clusterMap[c].y,
        mode: "markers",
        type: "scatter",
        name: isNoise ? "Noise" : `Cluster ${c + 1}`,
        showlegend: false, // Explicitly no legend matching ax.legend([],[], frameon=False)
        marker: {
          size: 7,
          color: pointColor,
          opacity: 0.8,
          line: { color: borderColor, width: 1 },
        },
      };
    });

    const layout = {
      title: {
        text: titleText,
        font: { color: "#1F2937", size: 20, family: "Source Sans Pro, sans-serif" },
      },
      paper_bgcolor: "#FFFFFF",
      plot_bgcolor: "#FAFAFA",
      showlegend: false,
      autosize: true,
      margin: { l: 60, r: 60, t: 60, b: 60 },
      xaxis: {
        title: { text: "Feature 1", font: { color: "#4B5563", size: 14 } },
        range: [-650, 650],
        fixedrange: true,
        color: "#4B5563",
        showgrid: true,
        gridcolor: "#E5E7EB",
        gridwidth: 1,
        zeroline: true,
        zerolinecolor: "#D1D5DB",
        tickfont: { color: "#6B7280", size: 12 },
      },
      yaxis: {
        title: { text: "Feature 2", font: { color: "#4B5563", size: 14 } },
        range: [-650, 650],
        fixedrange: true,
        scaleanchor: "x",
        scaleratio: 1,
        color: "#4B5563",
        showgrid: true,
        gridcolor: "#E5E7EB",
        gridwidth: 1,
        zeroline: true,
        zerolinecolor: "#D1D5DB",
        tickfont: { color: "#6B7280", size: 12 },
      },
    };

    if (window.Plotly) {
      window.Plotly.newPlot("cluster-result-plot", traces, layout, {
        responsive: true,
        displayModeBar: false,
      });
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Contextual Feedback Notes & K-Distance Toggle (from cluster_util.py)
  // ─────────────────────────────────────────────────────────────────────────
  function updateDbscanGuidance(eps) {
    if (eps <= 5) {
      notesEl.innerText =
        "🌟 Interesting! If all the data points are now of the same color, it means they are treated as noise. It is because the value of epsilon is very small and we didn’t optimize parameters. Therefore, we need to find the value of epsilon and minPoints and then train our model again.";
      if (kdistSection) kdistSection.style.display = "block";
    } else if (eps > 5 && eps < 30) {
      notesEl.innerText = "💡 Change eps till 30 and see the result!";
      if (kdistSection) kdistSection.style.display = "block";
    } else if (eps >= 30 && eps < 34) {
      notesEl.innerText = "🚀 DBSCAN did its job..!!";
      if (kdistSection) kdistSection.style.display = "none";
    } else {
      notesEl.innerText = "🛑 Don't go beyond.. Outlier..!!";
      if (kdistSection) kdistSection.style.display = "none";
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. K-Distance Graph (KDistGraph() from clusterapp.py)
  // ─────────────────────────────────────────────────────────────────────────
  async function loadKDistGraph() {
    if (!window.Plotly || !kdistPlot) return;
    try {
      const data = await fetchAPI("/cluster/kdist");
      const trace = {
        x: data.x,
        y: data.y,
        mode: "lines",
        type: "scatter",
        line: { color: "#1E88E5", width: 2.5 },
        showlegend: false,
      };

      const layout = {
        title: {
          text: "K-Distance Graph",
          font: { color: "#1F2937", size: 20, family: "Source Sans Pro, sans-serif" },
        },
        paper_bgcolor: "#FFFFFF",
        plot_bgcolor: "#FAFAFA",
        showlegend: false,
        autosize: true,
        margin: { l: 60, r: 40, t: 60, b: 60 },
        xaxis: {
          title: { text: "Data Points Sorted by Distance", font: { color: "#4B5563", size: 14 } },
          range: [0, data.x.length],
          color: "#4B5563",
          showgrid: true,
          gridcolor: "#E5E7EB",
          gridwidth: 0.5,
          zeroline: false,
          tickfont: { color: "#6B7280", size: 12 },
        },
        yaxis: {
          title: { text: "Epsilon", font: { color: "#4B5563", size: 14 } },
          color: "#4B5563",
          showgrid: true,
          gridcolor: "#E5E7EB",
          gridwidth: 0.5,
          zeroline: false,
          tickfont: { color: "#6B7280", size: 12 },
        },
      };

      window.Plotly.newPlot("cluster-kdist-plot", [trace], layout, {
        responsive: true,
        displayModeBar: false,
      });
    } catch (err) {
      console.error("Failed to load K-Distance data:", err);
    }
  }
}
