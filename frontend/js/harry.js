/**
 * Harry Potter Lore Scholar & Indian Mythology Tab Controller (Pinecone MCP)
 */

import { streamSSE } from "./api.js";

export function initHarryAgent() {
  const chatHistory = document.getElementById("harry-chat-history");
  const inputEl = document.getElementById("harry-input");
  const sendBtn = document.getElementById("harry-send-btn");
  const chipContainer = document.getElementById("harry-chips");
  const statusBanner = document.getElementById("harry-status-banner");
  const statusMsg = document.getElementById("harry-status-msg");

  const suggestions = [
    { label: "⚡ Elder Wand Origin", query: "Who created the Elder Wand according to the Tale of the Three Brothers?" },
    { label: "🕉️ Horcruxes vs Brahmashira", query: "Compare Voldemort's Horcruxes with indestructible divine Astras from the Mahabharata" },
    { label: "📜 Deathly Hallows & Dharma", query: "How does Master of Death reflect the philosophical concept of Moksha and Dharma?" },
    { label: "🦌 Snape's Patronus & Bhakti", query: "Analyze Severus Snape's silver doe Patronus through the lens of Nishkama Bhakti" }
  ];

  chipContainer.innerHTML = suggestions.map(s => `
    <button class="chip" data-query="${s.query}">${s.label}</button>
  `).join("");

  chipContainer.querySelectorAll(".chip").forEach(chip => {
    chip.addEventListener("click", () => {
      inputEl.value = chip.getAttribute("data-query");
      handleSend();
    });
  });

  sendBtn.addEventListener("click", handleSend);
  inputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleSend();
  });

  function appendBubble(role, htmlContent) {
    const bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    const avatarIcon = role === "user" ? "👤" : "🪄";
    bubble.innerHTML = `
      <div class="chat-avatar">${avatarIcon}</div>
      <div class="chat-content markdown-body">${htmlContent}</div>
    `;
    chatHistory.appendChild(bubble);
    chatHistory.scrollTop = chatHistory.scrollHeight;
    return bubble.querySelector(".chat-content");
  }

  function handleSend() {
    const query = inputEl.value.trim();
    if (!query) return;

    inputEl.value = "";
    sendBtn.disabled = true;

    appendBubble("user", `<p>${escapeHtml(query)}</p>`);

    statusBanner.style.display = "flex";
    statusMsg.innerText = "🧠 Initializing Lore Scholar & Pinecone Vector Search...";

    const assistantContentEl = appendBubble("assistant", '<span class="loading-cursor">▊</span>');
    let fullText = "";

    const encodedQuery = encodeURIComponent(query);
    streamSSE(`/harry/stream?query=${encodedQuery}`, {
      onStatus: (data) => {
        statusMsg.innerText = data.message || "Synthesizing lore parallels...";
      },
      onChunk: (token) => {
        fullText += token;
        if (window.marked) {
          assistantContentEl.innerHTML = window.marked.parse(fullText);
        } else {
          assistantContentEl.innerText = fullText;
        }
        chatHistory.scrollTop = chatHistory.scrollHeight;
      },
      onDone: (data) => {
        statusBanner.style.display = "none";
        sendBtn.disabled = false;
        if (window.marked) {
          assistantContentEl.innerHTML = window.marked.parse(data.article || fullText);
        }
      },
      onError: (err) => {
        statusBanner.style.display = "none";
        sendBtn.disabled = false;
        if (!fullText) {
          assistantContentEl.innerHTML = `<p class="badge-negative">⚠️ Unable to query Harry Potter Pinecone index. Please check your Pinecone API connection.</p>`;
        }
      }
    });
  }

  function escapeHtml(text) {
    return text.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
    }[m]));
  }
}
