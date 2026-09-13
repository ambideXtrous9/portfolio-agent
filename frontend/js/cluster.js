/**
 * Clustering Sandbox Tab Controller (K-Means & DBSCAN)
 * Matches Streamlit clusterapp.py layout, interactive charts, and feedback notes.
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

  if (!kmeansSlider || !dbscanSlider) return;

  // Render initial raw data plot
  loadInitialDataset();

  algoRadios.forEach(radio => {
    radio.addEventListener("change", (e) => {
      if (e.target.value === "K-Means") {
        kmeansControls.style.display = "block";
        dbscanControls.style.display = "none";
        notesEl.innerText = "💡 Why don't you try DBSCAN..!!";
      } else {
        kmeansControls.style.display = "none";
        dbscanControls.style.display = "block";
        updateDbscanNotes(parseInt(dbscanSlider.value));
      }
      runClustering();
    });
  });

  kmeansSlider.addEventListener("input", (e) => {
    kmeansVal.innerText = e.target.value;
  });
  kmeansSlider.addEventListener("change", runClustering);

  dbscanSlider.addEventListener("input", (e) => {
    dbscanVal.innerText = e.target.value;
    updateDbscanNotes(parseInt(e.target.value));
  });
  dbscanSlider.addEventListener("change", runClustering);

  // Initial run
  runClustering();

  async function loadInitialDataset() {
    try {
      const data = await fetchAPI("/cluster/dataset");
      const points = data.points || [];
      const trace = {
        x: points.map(p => p.x),
        y: points.map(p => p.y),
        mode: 'markers',
        type: 'scatter',
        marker: { size: 6, color: '#1E88E5', opacity: 0.75 }
      };
      const layout = {
        title: 'Input Concentric & Noise Benchmark Dataset',
        paper_bgcolor: '#FFFFFF',
        plot_bgcolor: '#F8F9FA',
        margin: { l: 40, r: 20, t: 40, b: 40 },
        xaxis: { gridcolor: '#E6E9EF', zerolinecolor: '#CCD0D9' },
        yaxis: { gridcolor: '#E6E9EF', zerolinecolor: '#CCD0D9' },
        font: { family: '"Source Sans Pro", sans-serif', color: '#31333F' },
        autosize: true
      };
      if (window.Plotly) {
        window.Plotly.newPlot('cluster-raw-plot', [trace], layout, { responsive: true, displayModeBar: false });
      }
    } catch (err) {
      console.error("Failed to load initial dataset:", err);
    }
  }

  async function runClustering() {
    const selectedAlgo = document.querySelector("input[name='cluster-algo']:checked")?.value || "K-Means";
    const payload = {
      algorithm: selectedAlgo.toLowerCase().replace("-", ""),
      n_clusters: parseInt(kmeansSlider.value),
      eps: parseFloat(dbscanSlider.value),
      min_samples: 5
    };

    try {
      const data = await fetchAPI("/cluster/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      renderClusterPlot(data, selectedAlgo);
    } catch (err) {
      console.error("Clustering execution error:", err);
    }
  }

  function updateDbscanNotes(eps) {
    if (eps <= 5) {
      notesEl.innerText = "🌟 Interesting! If all the data points are treated as noise, it means the value of epsilon is very small and parameters need tuning.";
    } else if (eps > 5 && eps < 30) {
      notesEl.innerText = "💡 Change eps till 30 and see the result!";
    } else if (eps >= 30 && eps < 34) {
      notesEl.innerText = "🚀 DBSCAN did its job..!!";
    } else {
      notesEl.innerText = "🛑 Don't go beyond.. Outlier..!!";
    }
  }

  function renderClusterPlot(data, algoName) {
    const points = data.points || [];
    const colors = ['#FF4B4B', '#1E88E5', '#00C853', '#FF9900', '#9C27B0', '#00BCD4', '#795548', '#607D8B'];

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
          color: isNoise ? '#A0A4B0' : colors[cNum % colors.length],
          opacity: isNoise ? 0.45 : 0.85
        }
      };
    });

    const layout = {
      title: `${algoName} Output (${data.num_clusters} clusters identified)`,
      paper_bgcolor: '#FFFFFF',
      plot_bgcolor: '#F8F9FA',
      margin: { l: 40, r: 20, t: 40, b: 40 },
      xaxis: { gridcolor: '#E6E9EF', zerolinecolor: '#CCD0D9' },
      yaxis: { gridcolor: '#E6E9EF', zerolinecolor: '#CCD0D9' },
      font: { family: '"Source Sans Pro", sans-serif', color: '#31333F' },
      legend: { orientation: 'h', y: 1.12 },
      autosize: true
    };

    if (window.Plotly) {
      window.Plotly.newPlot('cluster-result-plot', traces, layout, { responsive: true, displayModeBar: false });
    }
  }
}
