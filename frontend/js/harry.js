/**
 * Harry Potter Lore & Mythology Agent Controller
 * Supports LangGraph Checkpointing & PostgreSQL Chat History
 * Modern Conversational UI matching Gemini / ChatGPT / Perplexity aesthetic
 */

import { streamAgent, apiGetChatHistory, apiClearChatHistory, getAuthToken } from "./api.js";

export function initHarryScholar() {
  const workspace = document.getElementById("harry-workspace");
  const heroView = document.getElementById("harry-hero-view");
  const chatHistory = document.getElementById("harry-chat-history");
  const bottomBar = document.getElementById("harry-bottom-bar");

  // Hero Inputs
  const heroInput = document.getElementById("harry-user-input");
  const heroSendBtn = document.getElementById("harry-send-btn");
  const heroThinkBtn = document.getElementById("harry-think-btn");
  const heroMicBtn = document.getElementById("harry-mic-btn");
  const heroPlusBtn = document.getElementById("harry-plus-btn");

  // Bottom Floating Inputs
  const bottomInput = document.getElementById("harry-bottom-input");
  const bottomSendBtn = document.getElementById("harry-bottom-send-btn");
  const bottomThinkBtn = document.getElementById("harry-bottom-think-btn");
  const bottomMicBtn = document.getElementById("harry-bottom-mic-btn");
  const bottomPlusBtn = document.getElementById("harry-bottom-plus-btn");

  // Topbar / Controls
  const threadDisplay = document.getElementById("harry-thread-id-display");
  const btnNewChat = document.getElementById("harry-btn-new-chat");
  const btnNewChatSidebar = document.getElementById("harry-btn-new-chat-sidebar");
  const btnReloadHistory = document.getElementById("harry-btn-reload-history");
  const btnClearHistory = document.getElementById("harry-btn-clear-history");

  if (!chatHistory || !heroInput) return;

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

  let isThinkingEnabled = false;

  function setHeroState(isHero) {
    if (isHero) {
      if (workspace) workspace.classList.add("state-hero");
      if (heroView) heroView.style.display = "block";
      if (chatHistory) {
        chatHistory.style.display = "none";
        chatHistory.innerHTML = "";
      }
      if (bottomBar) bottomBar.style.display = "none";
      if (heroInput) {
        heroInput.value = "";
        heroInput.focus();
      }
    } else {
      if (workspace) workspace.classList.remove("state-hero");
      if (heroView) heroView.style.display = "none";
      if (chatHistory) chatHistory.style.display = "flex";
      if (bottomBar) bottomBar.style.display = "block";
      if (bottomInput) bottomInput.focus();
    }
  }

  // Restore history from PostgreSQL
  async function loadThreadHistory() {
    if (!getAuthToken()) {
      setHeroState(true);
      return;
    }
    try {
      const res = await apiGetChatHistory(currentThreadId);
      if (res && res.messages && res.messages.length > 0) {
        setHeroState(false);
        chatHistory.innerHTML = "";
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
      } else {
        setHeroState(true);
      }
    } catch (e) {
      console.warn("Could not load Harry chat history:", e);
      setHeroState(true);
    }
  }

  // Initial load
  loadThreadHistory();

  // Think button toggler
  function toggleThink() {
    isThinkingEnabled = !isThinkingEnabled;
    [heroThinkBtn, bottomThinkBtn].forEach((btn) => {
      if (btn) {
        btn.classList.toggle("is-active", isThinkingEnabled);
        btn.title = isThinkingEnabled ? "Deep Reasoning: Enabled" : "Toggle Deep Reasoning";
      }
    });
  }
  heroThinkBtn?.addEventListener("click", toggleThink);
  bottomThinkBtn?.addEventListener("click", toggleThink);

  // Mic speech recognition setup
  function setupMic(micBtn, targetInput) {
    if (!micBtn || !targetInput) return;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      micBtn.addEventListener("click", () => {
        alert("Voice speech recognition is supported in modern Chrome, Edge, and Safari.");
      });
      return;
    }

    let recognition = null;
    let isListening = false;

    micBtn.addEventListener("click", () => {
      if (isListening) {
        if (recognition) recognition.stop();
        return;
      }

      try {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = "en-US";

        recognition.onstart = () => {
          isListening = true;
          micBtn.classList.add("is-listening");
          micBtn.title = "Listening... Click to finish";
          targetInput.placeholder = "Listening to your voice...";
        };

        recognition.onresult = (e) => {
          const text = Array.from(e.results).map((r) => r[0].transcript).join("");
          targetInput.value = text;
        };

        recognition.onerror = () => {
          cleanup();
        };

        recognition.onend = () => {
          cleanup();
          if (targetInput.value.trim()) {
            submitHarryQuery(targetInput.value.trim());
          }
        };

        recognition.start();
      } catch (err) {
        cleanup();
      }

      function cleanup() {
        isListening = false;
        micBtn.classList.remove("is-listening");
        micBtn.title = "Voice Input";
        targetInput.placeholder = "Ask anything...";
      }
    });
  }

  setupMic(heroMicBtn, heroInput);
  setupMic(bottomMicBtn, bottomInput);

  // Plus button sample context prompt
  function setupPlus(btn, inputEl) {
    btn?.addEventListener("click", () => {
      inputEl.focus();
      inputEl.value = "Examine the philosophical alignment between ";
    });
  }
  setupPlus(heroPlusBtn, heroInput);
  setupPlus(bottomPlusBtn, bottomInput);

  // Start fresh thread
  function startNewChat() {
    currentThreadId = "hp-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("portfolio_hp_thread_id", currentThreadId);
    updateThreadUI();
    setHeroState(true);
    window.dispatchEvent(new CustomEvent("portfolio:thread_switched"));
  }

  btnNewChat?.addEventListener("click", startNewChat);
  btnNewChatSidebar?.addEventListener("click", startNewChat);

  // Cross-view events
  window.addEventListener("portfolio:reload_harry_history", (e) => {
    if (e.detail?.threadId) {
      currentThreadId = e.detail.threadId;
      localStorage.setItem("portfolio_hp_thread_id", currentThreadId);
      updateThreadUI();
      loadThreadHistory();
      window.dispatchEvent(new CustomEvent("portfolio:thread_switched"));
    }
  });

  window.addEventListener("portfolio:reset_harry_chat", () => {
    startNewChat();
  });

  // Reload / Restore History Handler
  btnReloadHistory?.addEventListener("click", async () => {
    btnReloadHistory.innerHTML = "⏳ Restoring...";
    await loadThreadHistory();
    btnReloadHistory.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/></svg>
      <span>Restore</span>
    `;
  });

  // Clear History Handler
  btnClearHistory?.addEventListener("click", async () => {
    if (!confirm("Are you sure you want to clear chat history for this thread in PostgreSQL?")) return;
    try {
      await apiClearChatHistory(currentThreadId);
      setHeroState(true);
    } catch (err) {
      alert("Failed to clear history: " + err.message);
    }
  });

  // Suggestion action prompts handler
  document.querySelectorAll("#tab-harry .st-agent-prompt-item, #tab-harry .st-suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.getAttribute("data-query") || chip.textContent.trim();
      if (q) {
        submitHarryQuery(q);
      }
    });
  });

  // Enter key handlers
  [heroInput, bottomInput].forEach((input) => {
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitHarryQuery();
      }
    });
  });

  heroSendBtn?.addEventListener("click", () => submitHarryQuery());
  bottomSendBtn?.addEventListener("click", () => submitHarryQuery());

  function submitHarryQuery(queryOverride) {
    const query = (queryOverride || heroInput?.value || bottomInput?.value || "").trim();
    if (!query) return;

    if (!getAuthToken()) {
      window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { feature: "Harry Potter Lore Scholar" } }));
      return;
    }

    if (heroInput) heroInput.value = "";
    if (bottomInput) bottomInput.value = "";
    if (heroSendBtn) heroSendBtn.disabled = true;
    if (bottomSendBtn) bottomSendBtn.disabled = true;

    setHeroState(false);

    // Track in sidebar recent chats
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
        if (heroSendBtn) heroSendBtn.disabled = false;
        if (bottomSendBtn) bottomSendBtn.disabled = false;
        const text = data.content || data.full_text || "";
        if (text) {
          markdownBody.innerHTML = window.marked ? marked.parse(text) : escapeHtml(text);
        }
      },
      onError: (err) => {
        if (statusBadge) statusBadge.style.display = "none";
        const errMsg = err?.message || (typeof err === "string" ? err : JSON.stringify(err)) || "An unexpected error occurred.";
        markdownBody.innerHTML = `<div style="color: #D32F2F; padding: 0.5rem; background: #FDE8E8; border-radius: 4px;">⚠️ Error: ${escapeHtml(errMsg)}</div>`;
        if (heroSendBtn) heroSendBtn.disabled = false;
        if (bottomSendBtn) bottomSendBtn.disabled = false;
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
