/**
 * Tour Agent Tab Controller (Airbnb MCP + Weather Intelligence)
 */

import { streamSSE, fetchAPI } from "./api.js";

export function initTourAgent() {
  const chatHistory = document.getElementById("tour-chat-history");
  const inputEl = document.getElementById("tour-input");
  const sendBtn = document.getElementById("tour-send-btn");
  const chipContainer = document.getElementById("tour-chips");
  const statusBanner = document.getElementById("tour-status-banner");
  const statusMsg = document.getElementById("tour-status-msg");

  const suggestions = [
    { label: "🌴 Munnar 3-Day Trip", query: "3 days trip to Munnar from tomorrow" },
    { label: "⛰️ Manali Weekend Getaway", query: "4 days weekend getaway to Manali for 2 adults" },
    { label: "🌊 Goa Beach Vacation", query: "3 days relaxing beach vacation in Goa with weather forecast" },
    { label: "🏰 Jaipur Cultural Tour", query: "5 days heritage and culture tour in Jaipur starting next Monday" },
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
    const avatarIcon = role === "user" ? "👤" : "🏡";
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

    // Append user message
    appendBubble("user", `<p>${escapeHtml(query)}</p>`);

    // Show status stepper
    statusBanner.style.display = "flex";
    statusMsg.innerText = "🚀 Processing Travel & Lodging Request...";

    const assistantContentEl = appendBubble("assistant", '<span class="loading-cursor">▊</span>');
    let fullText = "";

    const encodedQuery = encodeURIComponent(query);
    streamSSE(`/tour/stream?query=${encodedQuery}`, {
      onStatus: (data) => {
        statusMsg.innerText = data.message || "Planning your journey...";
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
          assistantContentEl.innerHTML = window.marked.parse(data.full_itinerary || fullText);
        }
      },
      onError: (err) => {
        statusBanner.style.display = "none";
        sendBtn.disabled = false;
        if (!fullText) {
          assistantContentEl.innerHTML = `<p class="badge-negative">⚠️ Request error: Unable to retrieve tour itinerary. Please verify your connection.</p>`;
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
