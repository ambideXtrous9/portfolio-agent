/**
 * Tour Agent Controller
 * Supports LangGraph Checkpointing & PostgreSQL Chat History
 * Modern Conversational UI matching Gemini / ChatGPT / Perplexity aesthetic
 */

import { streamAgent, apiGetChatHistory, apiClearChatHistory, getAuthToken } from "./api.js";

export function initTourAgent() {
  const workspace = document.getElementById("tour-workspace");
  const heroView = document.getElementById("tour-hero-view");
  const chatHistory = document.getElementById("tour-chat-history");
  const bottomBar = document.getElementById("tour-bottom-bar");

  // Hero Inputs
  const heroInput = document.getElementById("tour-user-input");
  const heroSendBtn = document.getElementById("tour-send-btn");
  const heroThinkBtn = document.getElementById("tour-think-btn");
  const heroMicBtn = document.getElementById("tour-mic-btn");
  const heroPlusBtn = document.getElementById("tour-plus-btn");

  // Bottom Floating Inputs
  const bottomInput = document.getElementById("tour-bottom-input");
  const bottomSendBtn = document.getElementById("tour-bottom-send-btn");
  const bottomThinkBtn = document.getElementById("tour-bottom-think-btn");
  const bottomMicBtn = document.getElementById("tour-bottom-mic-btn");
  const bottomPlusBtn = document.getElementById("tour-bottom-plus-btn");

  // Topbar / Controls
  const threadDisplay = document.getElementById("tour-thread-id-display");
  const btnNewChat = document.getElementById("tour-btn-new-chat");
  const btnNewChatSidebar = document.getElementById("tour-btn-new-chat-sidebar");
  const btnReloadHistory = document.getElementById("tour-btn-reload-history");
  const btnClearHistory = document.getElementById("tour-btn-clear-history");

  if (!chatHistory || !heroInput) return;

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
            <div class="st-chat-avatar">${isUser ? "👤" : "🏡"}</div>
            <div class="st-chat-content">
              <strong>${isUser ? "You" : "Travel Agent"}</strong><br>
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
      console.warn("Could not load Tour chat history:", e);
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
          targetInput.placeholder = "Listening to your destination ideas...";
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
            submitTourQuery(targetInput.value.trim());
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
      inputEl.value = "Plan a vacation itinerary for 2 adults to ";
    });
  }
  setupPlus(heroPlusBtn, heroInput);
  setupPlus(bottomPlusBtn, bottomInput);

  // Start fresh thread
  function startNewChat() {
    currentThreadId = "tour-" + Math.random().toString(36).substring(2, 9);
    localStorage.setItem("portfolio_tour_thread_id", currentThreadId);
    updateThreadUI();
    setHeroState(true);
    window.dispatchEvent(new CustomEvent("portfolio:thread_switched"));
  }

  btnNewChat?.addEventListener("click", startNewChat);
  btnNewChatSidebar?.addEventListener("click", startNewChat);

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
  document.querySelectorAll("#tab-tour .st-agent-prompt-item, #tab-tour .st-suggestion-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const q = chip.getAttribute("data-query") || chip.textContent.trim();
      if (q) {
        submitTourQuery(q);
      }
    });
  });

  // Enter key handlers
  [heroInput, bottomInput].forEach((input) => {
    input?.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        submitTourQuery();
      }
    });
  });

  heroSendBtn?.addEventListener("click", () => submitTourQuery());
  bottomSendBtn?.addEventListener("click", () => submitTourQuery());

  function submitTourQuery(queryOverride) {
    const query = (queryOverride || heroInput?.value || bottomInput?.value || "").trim();
    if (!query) return;

    if (!getAuthToken()) {
      window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { feature: "AI Tour Planner" } }));
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
        if (heroSendBtn) heroSendBtn.disabled = false;
        if (bottomSendBtn) bottomSendBtn.disabled = false;
        const text = data.content || data.full_text || fullMarkdown || "";
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
