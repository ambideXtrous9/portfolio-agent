/**
 * Vision AI Studio Tab Controller (Brand Classifier & YOLO Logo Detection)
 */

import { API_BASE } from "./api.js";

export function initVisionStudio() {
  const modeRadios = document.querySelectorAll("input[name='vision-mode']");
  const dropzone = document.getElementById("vision-dropzone");
  const fileInput = document.getElementById("vision-file-input");
  const previewBox = document.getElementById("vision-preview-box");
  const originalPreview = document.getElementById("vision-original-preview");
  const resultPanel = document.getElementById("vision-result-panel");
  const processBtn = document.getElementById("vision-process-btn");

  let currentFile = null;

  dropzone.addEventListener("click", () => fileInput.click());

  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("dragover");
  });
  dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("dragover");
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleSelectedFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files[0]) {
      handleSelectedFile(fileInput.files[0]);
    }
  });

  function handleSelectedFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (JPG, PNG, WebP).");
      return;
    }
    currentFile = file;
    const reader = new FileReader();
    reader.onload = (e) => {
      originalPreview.src = e.target.result;
      previewBox.style.display = "flex";
      resultPanel.innerHTML = `<p style="color: var(--text-muted);">Click <strong>Run Vision Inference</strong> to analyze.</p>`;
      processBtn.disabled = false;
    };
    reader.readAsDataURL(file);
  }

  processBtn.addEventListener("click", runInference);

  async function runInference() {
    if (!currentFile) return;

    const selectedMode = document.querySelector("input[name='vision-mode']:checked").value;
    processBtn.disabled = true;
    processBtn.innerHTML = `<span class="spinner"></span> Processing Neural Network...`;
    resultPanel.innerHTML = `<div style="display:flex; align-items:center; gap: 8px;"><span class="spinner"></span> Running inference...</div>`;

    const formData = new FormData();
    formData.append("file", currentFile);

    const endpoint = selectedMode === "yolo" ? "/vision/yolo" : "/vision/classify";

    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        method: "POST",
        body: formData
      });

      if (!res.ok) throw new Error(`Inference error: ${res.statusText}`);
      const data = await res.json();

      if (selectedMode === "yolo") {
        renderYoloResults(data);
      } else {
        renderClassifierResults(data);
      }
    } catch (err) {
      resultPanel.innerHTML = `<div class="badge-negative">⚠️ Error: ${err.message}</div>`;
    } finally {
      processBtn.disabled = false;
      processBtn.innerText = "🚀 Run Vision Inference";
    }
  }

  function renderClassifierResults(data) {
    const preds = data.predictions || [];
    const html = `
      <div style="background: var(--bg-surface); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-size: 13px; color: var(--text-muted); margin-bottom: 4px;">Top Predicted Class</div>
        <div style="font-size: 24px; font-weight: 800; color: var(--primary); margin-bottom: 14px;">
          🏷️ ${data.top_prediction} (${Math.round(data.confidence * 100)}%)
        </div>
        <div style="font-size: 12px; color: var(--text-muted); margin-bottom: 10px;">Classification Confidence Distribution:</div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${preds.map(p => `
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 2px;">
                <span>${p.label}</span>
                <span style="font-weight: 600;">${p.percentage}</span>
              </div>
              <div style="width: 100%; height: 6px; background: rgba(255,255,255,0.06); border-radius: 3px; overflow: hidden;">
                <div style="width: ${Math.round(p.confidence * 100)}%; height: 100%; background: linear-gradient(90deg, var(--primary), var(--secondary));"></div>
              </div>
            </div>
          `).join("")}
        </div>
      </div>
    `;
    resultPanel.innerHTML = html;
  }

  function renderYoloResults(data) {
    const dets = data.detections || [];
    const html = `
      <div style="background: var(--bg-surface); padding: 18px; border-radius: var(--radius-md); border: 1px solid var(--border-color);">
        <div style="font-size: 14px; font-weight: 700; margin-bottom: 8px;">
          🎯 Detected ${data.total_detections} Brand Logo Object(s)
        </div>
        ${data.annotated_image_base64 ? `
          <div style="margin-top: 10px; margin-bottom: 14px;">
            <img src="${data.annotated_image_base64}" style="max-width: 100%; max-height: 280px; border-radius: var(--radius-md); border: 1px solid var(--border-color);" alt="YOLO Annotated" />
          </div>
        ` : ''}
        <ul style="list-style: none; display: flex; flex-direction: column; gap: 6px;">
          ${dets.map((d, i) => `
            <li style="display: flex; justify-content: space-between; font-size: 13px; background: rgba(0,0,0,0.2); padding: 6px 10px; border-radius: 4px;">
              <span>Logo #${i+1}: <strong>${d.label}</strong></span>
              <span class="badge-positive">${Math.round(d.confidence * 100)}% Confidence</span>
            </li>
          `).join("")}
        </ul>
      </div>
    `;
    resultPanel.innerHTML = html;
  }
}
