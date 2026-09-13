/**
 * Harry Potter Lore & Mythology Agent Controller
 * Supports LangGraph Checkpointing & PostgreSQL Chat History
 */

import { streamAgent, apiGetChatHistory, apiClearChatHistory, getAuthToken } from "./api.js";

export function initHarryScholar() {
  const chatHistory = document.getElementById("harry-chat-history");
  const userInput = document.getElementById("harry-user-input");
  const sendBtn = document.getElementById("harry-send-btn");
  const chips = document.querySelectorAll("#tab-harry .st-suggestion-chip");
  const threadDisplay = document.getElementById("harry-thread-id-display");
  const btnNewChat = document.getElementById("harry-btn-new-chat");
  const btnReloadHistory = document.getElementById("harry-btn-reload-history");
  const btnClearHistory = document.getElementById("harry-btn-clear-history");

  if (!chatHistory || !userInput || !sendBtn) return;

  // Stable or stored Thread/Session ID
  let currentThreadId = localStorage.getItem("portfolio_hp_thread_id");
  if (!currentThreadId) {
    currentThreadId = "hp-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("portfolio_hp_thread_id", currentThreadId);
  }

  const updateThreadUI = () => {
    if (threadDisplay) {
      threadDisplay.textContent = `#${currentThreadId}`;
    }
  };
  updateThreadUI();

  const welcomeHTML = `
    <div class="st-chat-message assistant">
      <div class="st-chat-avatar">🪄</div>
      <div class="st-chat-content">
        <strong>Welcome to the Harry Potter & Indian Mythology Lore Scholar!</strong><br>
        I utilize Pinecone vector retrieval (<code>hpvdb-openai</code>) via MCP to cross-examine characters, Astras, Dharma, and wizarding lore with Indian ancient epics.
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
            <div class="st-chat-avatar">${isUser ? "👤" : "🪄"}</div>
            <div class="st-chat-content">
              <strong>${isUser ? "You" : "Lore Scholar"}</strong><br>
              ${isUser ? escapeHtml(msg.content) : (window.marked ? marked.parse(msg.content) : escapeHtml(msg.content))}
            </div>
          `;
          chatHistory.appendChild(msgDiv);
        });
        chatHistory.lastElementChild?.scrollIntoView({ behavior: "smooth" });
      }
    } catch (e) {
      console.warn("Could not load Harry chat history:", e);
    }
  }

  // Load history on initialization
  loadThreadHistory();

  // New Thread Handler
  if (btnNewChat) {
    btnNewChat.addEventListener("click", () => {
      currentThreadId = "hp-" + Math.random().toString(36).substring(2, 9);
      localStorage.setItem("portfolio_hp_thread_id", currentThreadId);
      updateThreadUI();
      chatHistory.innerHTML = welcomeHTML;
      const note = document.createElement("div");
      note.style.cssText = "text-align: center; font-size: 0.78rem; color: var(--st-text-muted); margin: 0.5rem 0;";
      note.textContent = `⚡ Started fresh thread #${currentThreadId} with empty checkpointer state.`;
      chatHistory.appendChild(note);
    });
  }

  // Cross-view events
  window.addEventListener("portfolio:reload_harry_history", (e) => {
    if (e.detail?.threadId) {
      currentThreadId = e.detail.threadId;
      localStorage.setItem("portfolio_hp_thread_id", currentThreadId);
      updateThreadUI();
      loadThreadHistory();
    }
  });

  window.addEventListener("portfolio:reset_harry_chat", () => {
    currentThreadId = "hp-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("portfolio_hp_thread_id", currentThreadId);
    updateThreadUI();
    chatHistory.innerHTML = welcomeHTML;
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
      if (!confirm("Are you sure you want to clear chat history for this thread in PostgreSQL?")) return;
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

    if (!getAuthToken()) {
      window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { feature: "Harry Potter Lore Scholar" } }));
      return;
    }

    userInput.value = "";
    sendBtn.disabled = true;

    // Dispatch event to track in sidebar recent chats
    window.dispatchEvent(new CustomEvent("portfolio:chat_updated", {
      detail: {
        agent: "harry",
        agentName: "Harry",
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

    // 3. Connect via streamAgent with current thread session_id
    streamAgent("harry", query, {
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
        // Suppress intermediate drafting so verified final synthesis is presented
      },
      onDone: (data) => {
        if (statusBadge) statusBadge.style.display = "none";
        sendBtn.disabled = false;
        const text = data.content || data.full_text || "";
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
