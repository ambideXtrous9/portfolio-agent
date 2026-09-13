/**
 * Vision Modules: 4-Model Image Classifier & YOLO Logo Detection
 * Matches exact Streamlit functionality and side-by-side comparison UI.
 */

import { API_BASE } from "./api.js";

/**
 * 4-Model Image Classifier (Screenshot 5 Match)
 */
export function initImageClassifier() {
  const dropzone = document.getElementById("classifier-dropzone");
  const fileInput = document.getElementById("classifier-file-input");
  const resultsArea = document.getElementById("classifier-results-area");
  const uploadedImg = document.getElementById("classifier-uploaded-img");

  if (!dropzone || !fileInput) return;

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
      handleClassifierFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleClassifierFile(e.target.files[0]);
    }
  });

  async function handleClassifierFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload a valid image file (JPG, PNG).");
      return;
    }

    // Show image preview immediately
    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedImg.src = e.target.result;
      resultsArea.style.display = "block";
      resetModelCardsToLoading();
    };
    reader.readAsDataURL(file);

    // Call 4-model evaluation API
    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/vision/classify-all`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error(`Evaluation failed: ${res.statusText}`);
      const data = await res.json();
      renderAllModelCards(data.models);
    } catch (err) {
      console.error("4-Model classification error:", err);
      renderModelCardError(err.message);
    }
  }

  function resetModelCardsToLoading() {
    const models = ["xception", "inception", "mobilenet", "efficientnet"];
    models.forEach(id => {
      const clsEl = document.getElementById(`class-${id}`);
      const accEl = document.getElementById(`acc-${id}`);
      const timeEl = document.getElementById(`time-${id}`);
      if (clsEl) clsEl.innerHTML = `<span class="st-spinner"></span> Evaluating...`;
      if (accEl) accEl.textContent = "--";
      if (timeEl) timeEl.textContent = "--";
    });
  }

  function renderAllModelCards(models) {
    const keyMap = {
      "Xception": "xception",
      "InceptionV3": "inception",
      "MobileNetV2": "mobilenet",
      "EfficientNet": "efficientnet"
    };

    models.forEach(m => {
      const key = keyMap[m.model_name] || m.model_name.toLowerCase();
      const sizeEl = document.getElementById(`size-${key}`);
      const paramsEl = document.getElementById(`params-${key}`);
      const classEl = document.getElementById(`class-${key}`);
      const accEl = document.getElementById(`acc-${key}`);
      const timeEl = document.getElementById(`time-${key}`);

      if (sizeEl) sizeEl.textContent = `${m.size_mb.toFixed(2)} MB`;
      if (paramsEl) paramsEl.textContent = `${m.parameters_m.toFixed(2)} M`;
      if (classEl) {
        classEl.textContent = m.predicted_class;
        classEl.style.color = m.predicted_class !== "None" ? "#00A854" : "var(--st-text-color)";
      }
      if (accEl) accEl.textContent = m.accuracy.toFixed(2);
      if (timeEl) timeEl.textContent = `${m.inference_time_seconds.toFixed(4)} seconds`;
    });
  }

  function renderModelCardError(errMsg) {
    const models = ["xception", "inception", "mobilenet", "efficientnet"];
    models.forEach(id => {
      const clsEl = document.getElementById(`class-${id}`);
      if (clsEl) clsEl.textContent = "Error";
    });
  }
}

/**
 * YOLOv8.1 Brand Logo Detection
 */
export function initYoloLogo() {
  const dropzone = document.getElementById("yolo-dropzone");
  const fileInput = document.getElementById("yolo-file-input");
  const resultsRow = document.getElementById("yolo-results-row");
  const uploadedPreview = document.getElementById("yolo-uploaded-preview");
  const predictedPreview = document.getElementById("yolo-predicted-preview");
  const boxesSummary = document.getElementById("yolo-boxes-summary");

  if (!dropzone || !fileInput) return;

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
      handleYoloFile(e.dataTransfer.files[0]);
    }
  });

  fileInput.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      handleYoloFile(e.target.files[0]);
    }
  });

  async function handleYoloFile(file) {
    if (!file.type.startsWith("image/")) {
      alert("Please upload an image file.");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      uploadedPreview.src = e.target.result;
      predictedPreview.src = e.target.result;
      resultsRow.style.display = "block";
      boxesSummary.innerHTML = `<div class="st-caption"><span class="st-spinner"></span> Running YOLOv8.1 neural detection...</div>`;
    };
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`${API_BASE}/vision/yolo`, {
        method: "POST",
        body: formData
      });
      if (!res.ok) throw new Error(`YOLO detection failed: ${res.statusText}`);
      const data = await res.json();

      if (data.annotated_image_base64) {
        predictedPreview.src = data.annotated_image_base64;
      }

      if (data.detections && data.detections.length > 0) {
        boxesSummary.innerHTML = `
          <div style="background: #FFFFFF; border: 1px solid var(--st-border-color); border-radius: var(--st-radius); padding: 1rem; margin-top: 1rem;">
            <strong>🎯 Detected Logos (${data.total_detections}):</strong>
            <ul style="margin: 0.5rem 0 0 1.25rem;">
              ${data.detections.map(d => `
                <li><strong>${d.label}</strong> (Confidence: ${(d.confidence * 100).toFixed(1)}%)</li>
              `).join("")}
            </ul>
          </div>
        `;
      } else {
        boxesSummary.innerHTML = `<div class="st-caption">No brand logos detected above confidence threshold.</div>`;
      }
    } catch (err) {
      console.error("YOLO error:", err);
      boxesSummary.innerHTML = `<div style="color: #D32F2F; font-size: 0.9rem;">YOLO detection error: ${err.message}</div>`;
    }
  }
}
