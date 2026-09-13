/**
 * Tour Agent Controller using WebSockets
 * Streams live agent steps, tool calls, MCP updates, and LLM tokens.
 */

import { streamWS } from "./api.js";

export function initTourAgent() {
  const chatHistory = document.getElementById("tour-chat-history");
  const userInput = document.getElementById("tour-user-input");
  const sendBtn = document.getElementById("tour-send-btn");
  const chips = document.querySelectorAll("#tab-tour .st-suggestion-chip");

  if (!chatHistory || !userInput || !sendBtn) return;

  // Suggestion chips handler
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const q = chip.getAttribute("data-query");
      if (q) {
        userInput.value = q;
        submitTourQuery();
      }
    });
  });

  // Enter key press
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitTourQuery();
    }
  });

  sendBtn.addEventListener("click", submitTourQuery);

  function submitTourQuery() {
    const query = userInput.value.trim();
    if (!query) return;

    userInput.value = "";
    sendBtn.disabled = true;

    // 1. Append User message bubble
    const userMsg = document.createElement("div");
    userMsg.className = "st-chat-message user";
    userMsg.innerHTML = `
      <div class="st-chat-avatar">👤</div>
      <div class="st-chat-content"><strong>You</strong><br>${escapeHtml(query)}</div>
    `;
    chatHistory.appendChild(userMsg);

    // 2. Append Assistant message bubble with live step container
    const assistantMsg = document.createElement("div");
    assistantMsg.className = "st-chat-message assistant";
    assistantMsg.innerHTML = `
      <div class="st-chat-avatar">🏡</div>
      <div class="st-chat-content">
        <div class="st-agent-status-badge" id="tour-status-badge">
          <span class="st-spinner"></span>
          <span class="st-status-label">🚀 Processing Tour Guide Request... (0.0s)</span>
        </div>
        <div class="st-tools-log" style="margin-bottom: 0.75rem;"></div>
        <div class="st-markdown-body"></div>
      </div>
    `;
    chatHistory.appendChild(assistantMsg);
    assistantMsg.scrollIntoView({ behavior: "smooth" });

    const statusBadge = assistantMsg.querySelector("#tour-status-badge");
    const statusLabel = assistantMsg.querySelector(".st-status-label");
    const toolsLog = assistantMsg.querySelector(".st-tools-log");
    const markdownBody = assistantMsg.querySelector(".st-markdown-body");

    let fullMarkdown = "";

    // 3. Connect via WebSocket
    streamWS("/tour", { prompt: query }, {
      onStatus: (data) => {
        statusLabel.textContent = `${data.message} (${data.elapsed || 0}s)`;
        assistantMsg.scrollIntoView({ behavior: "smooth" });
      },
      onToolCall: (data) => {
        const card = document.createElement("div");
        card.className = "st-tool-call-card";
        card.id = `tool-${data.tool}`;
        card.innerHTML = `
          <div class="st-tool-header">🛠️ ${escapeHtml(data.tool)} (${data.elapsed || 0}s)</div>
          <div style="margin-bottom: 4px;">${escapeHtml(data.message)}</div>
          ${data.args ? `<div class="st-tool-body">Input: ${escapeHtml(JSON.stringify(data.args, null, 2))}</div>` : ""}
        `;
        toolsLog.appendChild(card);
        assistantMsg.scrollIntoView({ behavior: "smooth" });
      },
      onToolResult: (data) => {
        const card = toolsLog.querySelector(`#tool-${data.tool}`);
        if (card) {
          const resEl = document.createElement("div");
          resEl.style.marginTop = "4px";
          resEl.style.color = "#00A854";
          resEl.style.fontSize = "0.85rem";
          resEl.innerHTML = `<strong>Result:</strong> ${escapeHtml(data.message)}`;
          card.appendChild(resEl);
        }
      },
      onToken: (token) => {
        fullMarkdown += token;
        markdownBody.innerHTML = marked.parse(fullMarkdown);
        assistantMsg.scrollIntoView({ behavior: "smooth" });
      },
      onDone: (data) => {
        statusBadge.style.display = "none";
        sendBtn.disabled = false;
        if (data.full_text) {
          markdownBody.innerHTML = marked.parse(data.full_text);
        }
        assistantMsg.scrollIntoView({ behavior: "smooth" });
      },
      onError: (err) => {
        statusLabel.textContent = `⚠️ Error: ${err.message}`;
        statusLabel.style.color = "#D32F2F";
        sendBtn.disabled = false;
      }
    });
  }

  function escapeHtml(str) {
    if (!str) return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }
}
