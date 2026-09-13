/**
 * Tour Agent Controller
 * Supports LangGraph Checkpointing & PostgreSQL Chat History
 */

import { streamAgent, apiGetChatHistory, apiClearChatHistory, getAuthToken } from "./api.js";

export function initTourAgent() {
  const chatHistory = document.getElementById("tour-chat-history");
  const userInput = document.getElementById("tour-user-input");
  const sendBtn = document.getElementById("tour-send-btn");
  const chips = document.querySelectorAll("#tab-tour .st-suggestion-chip");
  const threadDisplay = document.getElementById("tour-thread-id-display");
  const btnNewChat = document.getElementById("tour-btn-new-chat");
  const btnReloadHistory = document.getElementById("tour-btn-reload-history");
  const btnClearHistory = document.getElementById("tour-btn-clear-history");

  if (!chatHistory || !userInput || !sendBtn) return;

  // Stable or stored Thread/Session ID
  let currentThreadId = localStorage.getItem("portfolio_tour_thread_id");
  if (!currentThreadId) {
    currentThreadId = "tour-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("portfolio_tour_thread_id", currentThreadId);
  }

  const updateThreadUI = () => {
    if (threadDisplay) {
      threadDisplay.textContent = `#${currentThreadId}`;
    }
  };
  updateThreadUI();

  const welcomeHTML = `
    <div class="st-chat-message assistant">
      <div class="st-chat-avatar">🏡</div>
      <div class="st-chat-content">
        <strong>Welcome to the MCP-Powered Travel Agent!</strong><br>
        I query live accommodations via the <strong>Airbnb MCP Server</strong> (<code>@openbnb/mcp-server-airbnb</code>) and real-time meteorology APIs to synthesize comprehensive, verified itineraries with live stay rates and weather forecasts.
      </div>
    </div>
  `;

  // Restore history from PostgreSQL
  async function loadThreadHistory() {
    if (!getAuthToken()) return;
    try {
      const res = await apiGetChatHistory(currentThreadId);
      if (res && res.messages && res.messages.length > 0) {
        chatHistory.innerHTML = welcomeHTML;
        res.messages.forEach((msg) => {
          const isUser = msg.type === "human" || msg.type === "user";
          const msgDiv = document.createElement("div");
          msgDiv.className = `st-chat-message ${isUser ? "user" : "assistant"}`;
          msgDiv.innerHTML = `
            <div class="st-chat-avatar">${isUser ? "👤" : "🏡"}</div>
            <div class="st-chat-content">
              <strong>${isUser ? "You" : "Travel Agent"}</strong><br>
              ${isUser ? escapeHtml(msg.content) : (window.marked ? marked.parse(msg.content) : escapeHtml(msg.content))}
            </div>
          `;
          chatHistory.appendChild(msgDiv);
        });
        chatHistory.lastElementChild?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      console.warn("Could not load Tour chat history:", e);
    }
  }

  // Load history on initialization
  loadThreadHistory();

  // New Thread Handler
  if (btnNewChat) {
    btnNewChat.addEventListener("click", () => {
      currentThreadId = "tour-" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("portfolio_tour_thread_id", currentThreadId);
      updateThreadUI();
      chatHistory.innerHTML = welcomeHTML;
      const note = document.createElement("div");
      note.style.cssText = "text-align: center; font-size: 0.78rem; color: var(--st-text-muted); margin: 0.5rem 0;";
      note.textContent = `⚡ Started fresh thread #${currentThreadId} with empty checkpointer state.`;
      chatHistory.appendChild(note);
      window.dispatchEvent(new CustomEvent("portfolio:thread_switched"));
    });
  }

  // Cross-view events
  window.addEventListener("portfolio:reload_tour_history", (e) => {
    if (e.detail?.threadId) {
      currentThreadId = e.detail.threadId;
      localStorage.setItem("portfolio_tour_thread_id", currentThreadId);
      updateThreadUI();
      loadThreadHistory();
      window.dispatchEvent(new CustomEvent("portfolio:thread_switched"));
    }
  });

  window.addEventListener("portfolio:reset_tour_chat", () => {
    currentThreadId = "tour-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("portfolio_tour_thread_id", currentThreadId);
    updateThreadUI();
    chatHistory.innerHTML = welcomeHTML;
    window.dispatchEvent(new CustomEvent("portfolio:thread_switched"));
  });

  // Reload / Restore History Handler
  if (btnReloadHistory) {
    btnReloadHistory.addEventListener("click", async () => {
      btnReloadHistory.textContent = "⏳ Restoring...";
      await loadThreadHistory();
      btnReloadHistory.textContent = "📜 Restore History";
    });
  }

  // Clear History Handler
  if (btnClearHistory) {
    btnClearHistory.addEventListener("click", async () => {
      if (!confirm("Are you sure you want to clear chat history for this tour thread in PostgreSQL?")) return;
      try {
        await apiClearChatHistory(currentThreadId);
        chatHistory.innerHTML = welcomeHTML;
      } catch (err) {
        alert("Failed to clear history: " + err.message);
      }
    });
  }

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

    if (!getAuthToken()) {
      window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { feature: "AI Tour Planner" } }));
      return;
    }

    userInput.value = "";
    sendBtn.disabled = true;

    // Dispatch event to track in sidebar recent chats
    window.dispatchEvent(new CustomEvent("portfolio:chat_updated", {
      detail: {
        agent: "tour",
        agentName: "Tour",
        threadId: currentThreadId,
        title: query.length > 40 ? query.substring(0, 37) + "..." : query
      }
    }));

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

    // 3. Connect via streamAgent with current thread session_id
    streamAgent("tour", query, {
      sessionId: currentThreadId,
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
          <div class="st-tool-header">🛠️ ${escapeHtml(toolName)}</div>
          ${args ? `<div class="st-tool-body">Input: ${escapeHtml(typeof args === 'string' ? args : JSON.stringify(args, null, 2))}</div>` : ""}
        `;
        toolsLog.appendChild(card);
      },
      onToolResult: (toolName, result) => {
        let card = toolsLog.querySelector(`#tool-${toolName}`);
        if (!card) {
          card = document.createElement("div");
          card.className = "st-tool-call-card";
          card.id = `tool-${toolName}`;
          card.innerHTML = `<div class="st-tool-header">🛠️ ${escapeHtml(toolName)}</div>`;
          toolsLog.appendChild(card);
        }
        const resEl = document.createElement("div");
        resEl.style.marginTop = "4px";
        resEl.style.color = "#00A854";
        resEl.style.fontSize = "0.85rem";
        resEl.innerHTML = `<strong>Result:</strong> ${escapeHtml(typeof result === 'string' ? result : JSON.stringify(result))}`;
        card.appendChild(resEl);
      },
      onToken: (token) => {
        fullMarkdown += token;
        markdownBody.innerHTML = window.marked ? marked.parse(fullMarkdown) : escapeHtml(fullMarkdown);
      },
      onDone: (data) => {
        if (statusBadge) statusBadge.style.display = "none";
        sendBtn.disabled = false;
        const text = data.content || data.full_text || fullMarkdown || "";
        if (text) {
          markdownBody.innerHTML = window.marked ? marked.parse(text) : escapeHtml(text);
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
