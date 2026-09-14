/**
 * Clustering Sandbox Tab Controller (K-Means & DBSCAN)
 * Matches exact Streamlit Clustering/clusterapp.py & cluster_util.py:
 * - Clean responsive canvas with circular geometry (equal 1:1 aspect ratio)
 * - Initial unclustered dataset visualization (#cluster-raw-plot)
 * - Interactive K-Means and DBSCAN clustered output (#cluster-result-plot)
 * - Epsilon-dependent guidance notes and K-Distance graph toggle
 * - Bulletproof rendering on tab switch, window resize, and network status
 */

import { fetchAPI } from "./api.js";

// Helper to wait for Plotly CDN
async function waitForPlotly() {
  if (typeof window !== "undefined" && window.Plotly) {
    return window.Plotly;
  }
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (typeof window !== "undefined" && window.Plotly) {
      return window.Plotly;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic concentric circle dataset generator (matching clusterapp.py dataGen)
// ─────────────────────────────────────────────────────────────────────────────
function generateFallbackDataset() {
  const points = [];
  let seed = 42;
  function pseudoRandom() {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  }
  function normalRandom(mean, std) {
    let u = 0, v = 0;
    while (u === 0) u = pseudoRandom();
    while (v === 0) v = pseudoRandom();
    const z = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    return mean + z * std;
  }

  function addCircum(r, n) {
    for (let x = 1; x <= n; x++) {
      const angle = (2 * Math.PI / n) * x;
      points.push({
        x: Math.round((Math.cos(angle) * r + normalRandom(-30, 30)) * 100) / 100,
        y: Math.round((Math.sin(angle) * r + normalRandom(-30, 30)) * 100) / 100,
        cluster: 0,
      });
    }
  }

  addCircum(500, 1000);
  addCircum(300, 700);
  addCircum(100, 300);
  for (let i = 0; i < 300; i++) {
    points.push({
      x: Math.round((pseudoRandom() * 1200 - 600) * 100) / 100,
      y: Math.round((pseudoRandom() * 1200 - 600) * 100) / 100,
      cluster: 0,
    });
  }
  return points;
}

// ─────────────────────────────────────────────────────────────────────────────
// Client-side clustering fallbacks (ensures instantaneous response)
// ─────────────────────────────────────────────────────────────────────────────
function clientKMeans(points, k, maxIter = 20) {
  if (!points || points.length === 0) return { points: [], num_clusters: 0, num_noise: 0 };
  const n = points.length;
  const centroids = [];
  const step = Math.floor(n / k);
  for (let i = 0; i < k; i++) {
    const idx = (i * step + 42) % n;
    centroids.push({ x: points[idx].x, y: points[idx].y });
  }

  const labels = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      const p = points[i];
      let bestDist = Infinity;
      let bestIdx = 0;
      for (let c = 0; c < k; c++) {
        const dx = p.x - centroids[c].x;
        const dy = p.y - centroids[c].y;
        const d = dx * dx + dy * dy;
        if (d < bestDist) {
          bestDist = d;
          bestIdx = c;
        }
      }
      if (labels[i] !== bestIdx) {
        labels[i] = bestIdx;
        changed = true;
      }
    }
    if (!changed) break;

    const sums = Array.from({ length: k }, () => ({ x: 0, y: 0, count: 0 }));
    for (let i = 0; i < n; i++) {
      const c = labels[i];
      sums[c].x += points[i].x;
      sums[c].y += points[i].y;
      sums[c].count++;
    }
    for (let c = 0; c < k; c++) {
      if (sums[c].count > 0) {
        centroids[c].x = sums[c].x / sums[c].count;
        centroids[c].y = sums[c].y / sums[c].count;
      }
    }
  }

  return {
    algorithm: "KMEANS",
    num_clusters: k,
    num_noise: 0,
    points: points.map((p, i) => ({ x: p.x, y: p.y, cluster: labels[i] })),
  };
}

function clientDBSCAN(points, eps, minSamples = 5) {
  if (!points || points.length === 0) return { points: [], num_clusters: 0, num_noise: 0 };
  const n = points.length;
  const epsSq = eps * eps;
  const labels = new Array(n).fill(-1);
  const visited = new Uint8Array(n);
  let clusterId = 0;

  const cellSize = Math.max(10, eps);
  const grid = new Map();
  for (let i = 0; i < n; i++) {
    const gx = Math.floor(points[i].x / cellSize);
    const gy = Math.floor(points[i].y / cellSize);
    const key = `${gx},${gy}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(i);
  }

  function getNeighbors(idx) {
    const p = points[idx];
    const gx = Math.floor(p.x / cellSize);
    const gy = Math.floor(p.y / cellSize);
    const neighbors = [];
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const cell = grid.get(`${gx + dx},${gy + dy}`);
        if (cell) {
          for (let j = 0; j < cell.length; j++) {
            const otherIdx = cell[j];
            const op = points[otherIdx];
            const d = (p.x - op.x) * (p.x - op.x) + (p.y - op.y) * (p.y - op.y);
            if (d <= epsSq) neighbors.push(otherIdx);
          }
        }
      }
    }
    return neighbors;
  }

  for (let i = 0; i < n; i++) {
    if (visited[i]) continue;
    visited[i] = 1;
    const neighbors = getNeighbors(i);
    if (neighbors.length < minSamples) {
      labels[i] = -1;
    } else {
      labels[i] = clusterId;
      const queue = [...neighbors];
      let head = 0;
      while (head < queue.length) {
        const curr = queue[head++];
        if (!visited[curr]) {
          visited[curr] = 1;
          const currNeighbors = getNeighbors(curr);
          if (currNeighbors.length >= minSamples) {
            for (let k = 0; k < currNeighbors.length; k++) {
              queue.push(currNeighbors[k]);
            }
          }
        }
        if (labels[curr] === -1) {
          labels[curr] = clusterId;
        }
      }
      clusterId++;
    }
  }

  const numNoise = labels.filter((l) => l === -1).length;
  return {
    algorithm: "DBSCAN",
    num_clusters: clusterId,
    num_noise: numNoise,
    points: points.map((p, i) => ({ x: p.x, y: p.y, cluster: labels[i] })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Module State
// ─────────────────────────────────────────────────────────────────────────────
let cachedDatasetPoints = null;
let isRawPlotDrawn = false;
let isResultPlotDrawn = false;

export function initClusterSandbox() {
  const clusterTab = document.getElementById("tab-cluster");
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

  // Pre-seed cached points immediately so they are ready
  if (!cachedDatasetPoints) {
    cachedDatasetPoints = generateFallbackDataset();
  }

  // Ensure dataset points are fetched from backend in background
  fetchBackendDataset();

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

  // Function to ensure plots are rendered and properly sized whenever visible
  async function ensurePlotsReady() {
    if (!clusterTab) return;
    const isVisible = clusterTab.classList.contains("active") || clusterTab.offsetParent !== null;
    if (!isVisible) return;

    const Plotly = await waitForPlotly();
    if (!Plotly) return;

    // Render raw dataset plot if not drawn
    if (!isRawPlotDrawn) {
      await loadInitialDataset();
    } else {
      const rawPlot = document.getElementById("cluster-raw-plot");
      if (rawPlot) Plotly.Plots.resize(rawPlot);
    }

    // Render clustered output plot if not drawn
    if (!isResultPlotDrawn) {
      await runClustering();
    } else {
      const resultPlot = document.getElementById("cluster-result-plot");
      if (resultPlot) Plotly.Plots.resize(resultPlot);
    }

    const kdistPlotEl = document.getElementById("cluster-kdist-plot");
    if (kdistPlotEl && kdistPlotEl.style.display !== "none") {
      Plotly.Plots.resize(kdistPlotEl);
    }
  }

  // Tab activation listeners
  window.addEventListener("portfolio:activate_cluster", () => {
    setTimeout(ensurePlotsReady, 50);
  });

  if (clusterTab) {
    const observer = new MutationObserver(() => {
      if (clusterTab.classList.contains("active")) {
        setTimeout(ensurePlotsReady, 80);
      }
    });
    observer.observe(clusterTab, { attributes: true, attributeFilter: ["class"] });
  }

  window.addEventListener("resize", () => {
    if (clusterTab && clusterTab.classList.contains("active") && window.Plotly) {
      const rawPlot = document.getElementById("cluster-raw-plot");
      const resultPlot = document.getElementById("cluster-result-plot");
      const kdistPlotEl = document.getElementById("cluster-kdist-plot");
      if (rawPlot) window.Plotly.Plots.resize(rawPlot);
      if (resultPlot) window.Plotly.Plots.resize(resultPlot);
      if (kdistPlotEl && kdistPlotEl.style.display !== "none") window.Plotly.Plots.resize(kdistPlotEl);
    }
  });

  // Initial render check if page loaded directly on cluster tab
  if (clusterTab && clusterTab.classList.contains("active")) {
    ensurePlotsReady();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 1. Fetch backend dataset in background
  // ─────────────────────────────────────────────────────────────────────────
  async function fetchBackendDataset() {
    try {
      const data = await fetchAPI("/cluster/dataset");
      if (data && data.points && data.points.length > 0) {
        cachedDatasetPoints = data.points;
        // If already rendered with fallback, re-render raw plot with server points
        if (isRawPlotDrawn && clusterTab && clusterTab.classList.contains("active")) {
          renderRawPlot(cachedDatasetPoints);
        }
      }
    } catch (err) {
      console.warn("Backend dataset fetch note (using fallback):", err);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2. Initial Dataset Visualization (PlotData() from clusterapp.py)
  // ─────────────────────────────────────────────────────────────────────────
  async function loadInitialDataset() {
    const Plotly = await waitForPlotly();
    if (!Plotly) return;

    if (!cachedDatasetPoints || cachedDatasetPoints.length === 0) {
      cachedDatasetPoints = generateFallbackDataset();
    }

    renderRawPlot(cachedDatasetPoints);
  }

  function renderRawPlot(points) {
    const rawPlot = document.getElementById("cluster-raw-plot");
    if (!rawPlot || !window.Plotly) return;

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
        font: { color: "#23201B", size: 20, family: "Newsreader, Georgia, serif" },
      },
      paper_bgcolor: "#FAF8F5",
      plot_bgcolor: "#FDFCFB",
      showlegend: false,
      autosize: true,
      margin: { l: 60, r: 60, t: 60, b: 60 },
      xaxis: {
        title: { text: "Feature 1", font: { color: "#554D40", size: 14 } },
        range: [-650, 650],
        fixedrange: true,
        color: "#554D40",
        showgrid: true,
        gridcolor: "#EDE8E0",
        gridwidth: 1,
        zeroline: true,
        zerolinecolor: "#DFD8CC",
        tickfont: { color: "#8E8270", size: 12 },
      },
      yaxis: {
        title: { text: "Feature 2", font: { color: "#554D40", size: 14 } },
        range: [-650, 650],
        fixedrange: true,
        scaleanchor: "x",
        scaleratio: 1,
        color: "#554D40",
        showgrid: true,
        gridcolor: "#EDE8E0",
        gridwidth: 1,
        zeroline: true,
        zerolinecolor: "#DFD8CC",
        tickfont: { color: "#8E8270", size: 12 },
      },
    };

    window.Plotly.react("cluster-raw-plot", [trace], layout, {
      responsive: true,
      displayModeBar: false,
    });
    isRawPlotDrawn = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3. Run Clustering Algorithm (kmeans() / DBScan() from clusterapp.py)
  // ─────────────────────────────────────────────────────────────────────────
  async function runClustering() {
    const selectedAlgo = document.querySelector("input[name='cluster-algo']:checked")?.value || "K-Means";
    const kVal = parseInt(kmeansSlider.value) || 3;
    const epsVal = parseFloat(dbscanSlider.value) || 5;
    const isDbscan = selectedAlgo === "DBSCAN";

    const payload = {
      algorithm: selectedAlgo.toLowerCase().replace("-", ""),
      n_clusters: kVal,
      eps: epsVal,
      min_samples: 5,
    };

    let clusterData = null;
    try {
      clusterData = await fetchAPI("/cluster/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    } catch (err) {
      console.warn("Backend cluster API note (executing client clustering):", err);
    }

    // Seamless fallback to client clustering if backend was unreachable
    if (!clusterData || !clusterData.points || clusterData.points.length === 0) {
      const basePts = cachedDatasetPoints || generateFallbackDataset();
      if (isDbscan) {
        clusterData = clientDBSCAN(basePts, epsVal, 5);
      } else {
        clusterData = clientKMeans(basePts, kVal);
      }
    }

    renderClusteredPlot(clusterData, selectedAlgo);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4. Render Clustered Scatter Plot (Matches kmeans() & DBScan() styling)
  // ─────────────────────────────────────────────────────────────────────────
  function renderClusteredPlot(data, algoName) {
    const resultPlot = document.getElementById("cluster-result-plot");
    if (!resultPlot || !window.Plotly) return;

    const points = data.points || [];
    const isDbscan = algoName === "DBSCAN";
    const titleText = isDbscan
      ? "DBSCAN Clustering Visualization"
      : "K-Means Clustering Visualization";

    // Build distinct HSV color palette matching sns.color_palette('hsv', n)
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
        showlegend: false,
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
        font: { color: "#23201B", size: 20, family: "Newsreader, Georgia, serif" },
      },
      paper_bgcolor: "#FAF8F5",
      plot_bgcolor: "#FDFCFB",
      showlegend: false,
      autosize: true,
      margin: { l: 60, r: 60, t: 60, b: 60 },
      xaxis: {
        title: { text: "Feature 1", font: { color: "#554D40", size: 14 } },
        range: [-650, 650],
        fixedrange: true,
        color: "#554D40",
        showgrid: true,
        gridcolor: "#EDE8E0",
        gridwidth: 1,
        zeroline: true,
        zerolinecolor: "#DFD8CC",
        tickfont: { color: "#8E8270", size: 12 },
      },
      yaxis: {
        title: { text: "Feature 2", font: { color: "#554D40", size: 14 } },
        range: [-650, 650],
        fixedrange: true,
        scaleanchor: "x",
        scaleratio: 1,
        color: "#554D40",
        showgrid: true,
        gridcolor: "#EDE8E0",
        gridwidth: 1,
        zeroline: true,
        zerolinecolor: "#DFD8CC",
        tickfont: { color: "#8E8270", size: 12 },
      },
    };

    window.Plotly.react("cluster-result-plot", traces, layout, {
      responsive: true,
      displayModeBar: false,
    });
    isResultPlotDrawn = true;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5. Contextual Feedback Notes & Guidance (from cluster_util.py)
  // ─────────────────────────────────────────────────────────────────────────
  function updateDbscanGuidance(eps) {
    if (!notesEl) return;
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
  // 6. K-Distance Graph (KDistGraph() from clusterapp.py)
  // ─────────────────────────────────────────────────────────────────────────
  async function loadKDistGraph() {
    const Plotly = await waitForPlotly();
    if (!Plotly || !kdistPlot) return;

    let xData = [];
    let yData = [];

    try {
      const data = await fetchAPI("/cluster/kdist");
      xData = data.x || [];
      yData = data.y || [];
    } catch (err) {
      console.warn("Backend kdist fetch note (generating client curve):", err);
    }

    if (xData.length === 0) {
      // Analytical K-distance curve for 2300 points
      const n = 2300;
      xData = Array.from({ length: n }, (_, i) => i);
      yData = xData.map((i) => {
        const t = i / n;
        return Math.round((4.0 + Math.pow(t, 6) * 120.0 + (t > 0.85 ? (t - 0.85) * 200.0 : 0)) * 100) / 100;
      });
    }

    const trace = {
      x: xData,
      y: yData,
      mode: "lines",
      type: "scatter",
      line: { color: "#C8684D", width: 2.5 },
      showlegend: false,
    };

    const layout = {
      title: {
        text: "K-Distance Graph",
        font: { color: "#23201B", size: 20, family: "Newsreader, Georgia, serif" },
      },
      paper_bgcolor: "#FAF8F5",
      plot_bgcolor: "#FDFCFB",
      showlegend: false,
      autosize: true,
      margin: { l: 60, r: 40, t: 60, b: 60 },
      xaxis: {
        title: { text: "Data Points Sorted by Distance", font: { color: "#554D40", size: 14 } },
        range: [0, xData.length],
        color: "#554D40",
        showgrid: true,
        gridcolor: "#EDE8E0",
        gridwidth: 0.5,
        zeroline: false,
        tickfont: { color: "#8E8270", size: 12 },
      },
      yaxis: {
        title: { text: "Epsilon", font: { color: "#554D40", size: 14 } },
        color: "#554D40",
        showgrid: true,
        gridcolor: "#EDE8E0",
        gridwidth: 0.5,
        zeroline: false,
        tickfont: { color: "#8E8270", size: 12 },
      },
    };

    window.Plotly.react("cluster-kdist-plot", [trace], layout, {
      responsive: true,
      displayModeBar: false,
    });
  }
}
