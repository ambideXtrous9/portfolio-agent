/**
 * Harry Potter Lore & Mythology Agent Controller using WebSockets
 * Streams live node steps, Pinecone MCP queries, tool calls, and LLM tokens.
 */

import { streamAgent } from "./api.js";

export function initHarryScholar() {
  const chatHistory = document.getElementById("harry-chat-history");
  const userInput = document.getElementById("harry-user-input");
  const sendBtn = document.getElementById("harry-send-btn");
  const chips = document.querySelectorAll("#tab-harry .st-suggestion-chip");

  if (!chatHistory || !userInput || !sendBtn) return;

  // Suggestion chips handler
  chips.forEach(chip => {
    chip.addEventListener("click", () => {
      const q = chip.getAttribute("data-query");
      if (q) {
        userInput.value = q;
        submitHarryQuery();
      }
    });
  });

  // Enter key handler
  userInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitHarryQuery();
    }
  });

  sendBtn.addEventListener("click", submitHarryQuery);

  function submitHarryQuery() {
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
      <div class="st-chat-avatar">🪄</div>
      <div class="st-chat-content">
        <div class="st-agent-status-badge" id="harry-status-badge">
          <span class="st-spinner"></span>
          <span class="st-status-label">🚀 Starting Harry & Mythology Multi-Agent Workflow... (0.0s)</span>
        </div>
        <div class="st-tools-log" style="margin-bottom: 0.75rem;"></div>
        <div class="st-markdown-body"></div>
      </div>
    `;
    chatHistory.appendChild(assistantMsg);
    assistantMsg.scrollIntoView({ behavior: "smooth" });

    const statusBadge = assistantMsg.querySelector("#harry-status-badge");
    const statusLabel = assistantMsg.querySelector(".st-status-label");
    const toolsLog = assistantMsg.querySelector(".st-tools-log");
    const markdownBody = assistantMsg.querySelector(".st-markdown-body");

    // 3. Connect via streamAgent (SSE with automatic REST fallback)
    streamAgent("harry", query, {
      onStatus: (data) => {
        if (statusLabel) {
          const msg = data.message || "Processing...";
          const elapsed = data.elapsed != null ? ` (${data.elapsed}s)` : "";
          statusLabel.textContent = `${msg}${elapsed}`;
        }
      },
      onToolCall: (toolName, args) => {
        const card = document.createElement("div");
        card.className = "st-tool-call-card";
        card.id = `tool-${toolName}`;
        card.innerHTML = `
          <div class="st-tool-header">🌲 ${escapeHtml(toolName)}</div>
          ${args ? `<div class="st-tool-body">Query: ${escapeHtml(typeof args === 'string' ? args : JSON.stringify(args, null, 2))}</div>` : ""}
        `;
        toolsLog.appendChild(card);
      },
      onToolResult: (toolName, result) => {
        let card = toolsLog.querySelector(`#tool-${toolName}`);
        if (!card) {
          card = document.createElement("div");
          card.className = "st-tool-call-card";
          card.id = `tool-${toolName}`;
          card.innerHTML = `<div class="st-tool-header">🌲 ${escapeHtml(toolName)}</div>`;
          toolsLog.appendChild(card);
        }
        const resEl = document.createElement("div");
        resEl.style.marginTop = "4px";
        resEl.style.color = "#00A854";
        resEl.style.fontSize = "0.85rem";
        resEl.innerHTML = `<strong>Result:</strong> ${escapeHtml(typeof result === 'string' ? result : JSON.stringify(result))}`;
        card.appendChild(resEl);
      },
      onToken: () => {
        // Suppress intermediate token drafting so output only appears after critic node is complete
      },
      onDone: (data) => {
        if (statusBadge) statusBadge.style.display = "none";
        sendBtn.disabled = false;
        const text = data.content || data.full_text || "";
        if (text) {
          markdownBody.innerHTML = marked.parse(text);
        }
      },
      onError: (err) => {
        if (statusBadge) statusBadge.style.display = "none";
        const errMsg = err?.message || (typeof err === "string" ? err : JSON.stringify(err)) || "An unexpected error occurred.";
        markdownBody.innerHTML = `<div style="color: #D32F2F; padding: 0.5rem; background: #FDE8E8; border-radius: 4px;">⚠️ Error: ${escapeHtml(errMsg)}</div>`;
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
