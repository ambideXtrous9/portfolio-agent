/**
 * Clustering Sandbox Tab Controller (K-Means & DBSCAN with Plotly.js)
 */

import { fetchAPI } from "./api.js";

export function initClusterSandbox() {
  const algoRadios = document.querySelectorAll("input[name='cluster-algo']");
  const kmeansParams = document.getElementById("kmeans-controls");
  const dbscanParams = document.getElementById("dbscan-controls");
  
  const kSlider = document.getElementById("cluster-k-slider");
  const kVal = document.getElementById("cluster-k-val");
  const epsSlider = document.getElementById("cluster-eps-slider");
  const epsVal = document.getElementById("cluster-eps-val");
  const minPtsSlider = document.getElementById("cluster-minpts-slider");
  const minPtsVal = document.getElementById("cluster-minpts-val");

  const runBtn = document.getElementById("cluster-run-btn");
  const statsContainer = document.getElementById("cluster-stats");

  algoRadios.forEach(r => {
    r.addEventListener("change", (e) => {
      if (e.target.value === "kmeans") {
        kmeansParams.style.display = "block";
        dbscanParams.style.display = "none";
      } else {
        kmeansParams.style.display = "none";
        dbscanParams.style.display = "block";
      }
      executeClustering();
    });
  });

  kSlider.addEventListener("input", (e) => {
    kVal.innerText = e.target.value;
  });
  kSlider.addEventListener("change", executeClustering);

  epsSlider.addEventListener("input", (e) => {
    epsVal.innerText = e.target.value;
  });
  epsSlider.addEventListener("change", executeClustering);

  minPtsSlider.addEventListener("input", (e) => {
    minPtsVal.innerText = e.target.value;
  });
  minPtsSlider.addEventListener("change", executeClustering);

  runBtn.addEventListener("click", executeClustering);

  // Initial run on mount
  executeClustering();

  async function executeClustering() {
    const algo = document.querySelector("input[name='cluster-algo']:checked").value;
    const payload = {
      algorithm: algo,
      n_clusters: parseInt(kSlider.value),
      eps: parseFloat(epsSlider.value),
      min_samples: parseInt(minPtsSlider.value)
    };

    runBtn.disabled = true;
    try {
      const data = await fetchAPI("/cluster/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      renderPlot(data);
      renderStats(data);
    } catch (err) {
      console.error("Clustering error:", err);
    } finally {
      runBtn.disabled = false;
    }
  }

  function renderStats(data) {
    statsContainer.innerHTML = `
      <div style="display: flex; gap: 14px; flex-wrap: wrap; margin-top: 14px;">
        <span class="badge-tag">Algorithm: <strong>${data.algorithm}</strong></span>
        <span class="badge-tag">Identified Clusters: <strong>${data.num_clusters}</strong></span>
        ${data.num_noise > 0 ? `<span class="badge-tag" style="border-color: var(--accent-rose); color: var(--accent-rose);">Noise Points: <strong>${data.num_noise}</strong></span>` : ''}
        ${data.silhouette_score !== null ? `<span class="badge-positive">Silhouette Score: <strong>${data.silhouette_score}</strong></span>` : ''}
      </div>
    `;
  }

  function renderPlot(data) {
    const points = data.points || [];
    const colors = [
      '#00d2ff', '#7928ca', '#10b981', '#f59e0b', '#ec4899',
      '#6366f1', '#14b8a6', '#f43f5e', '#8b5cf6', '#eab308'
    ];

    // Group points by cluster
    const clusterMap = {};
    points.forEach(p => {
      const c = p.cluster;
      if (!clusterMap[c]) clusterMap[c] = { x: [], y: [] };
      clusterMap[c].x.push(p.x);
      clusterMap[c].y.push(p.y);
    });

    const traces = Object.keys(clusterMap).map(c => {
      const cNum = parseInt(c);
      const isNoise = cNum === -1;
      return {
        x: clusterMap[c].x,
        y: clusterMap[c].y,
        mode: 'markers',
        type: 'scatter',
        name: isNoise ? 'Noise' : `Cluster ${cNum + 1}`,
        marker: {
          size: 7,
          color: isNoise ? '#64748b' : colors[cNum % colors.length],
          opacity: isNoise ? 0.4 : 0.8,
          line: { width: 1, color: isNoise ? '#334155' : '#ffffff' }
        }
      };
    });

    const layout = {
      paper_bgcolor: '#121820',
      plot_bgcolor: '#0a0d12',
      font: { color: '#94a3b8', family: 'Inter, sans-serif' },
      margin: { l: 40, r: 20, t: 30, b: 40 },
      xaxis: { gridcolor: '#1f2937', zerolinecolor: '#374151' },
      yaxis: { gridcolor: '#1f2937', zerolinecolor: '#374151' },
      legend: { orientation: 'h', y: 1.12 },
      autosize: true
    };

    const config = { responsive: true, displayModeBar: false };

    if (window.Plotly) {
      window.Plotly.newPlot('cluster-plot-canvas', traces, layout, config);
    }
  }
}
