/**
 * Unified API & WebSocket Client for ambideXtrous AI Portfolio
 */

// Retrieve or compute active Backend API Base
export function getAPIBase() {
  try {
    const custom = localStorage.getItem("ai_portfolio_backend_url");
    if (custom && custom.trim()) {
      const clean = custom.trim().replace(/\/+$/, "");
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }
  } catch (_) {}

  // Auto-detect local environments
  const isLocal = window.location.hostname === "localhost" ||
                  window.location.hostname === "127.0.0.1" ||
                  window.location.hostname.startsWith("192.168.");

  if (isLocal) {
    if (window.location.port === "8000" || window.location.port === "3000" || window.location.port === "80") {
      return "/api";
    }
    return "http://localhost:8000/api";
  }

  // Cloud deployment (Vercel) defaults to /api (uses Vercel rewrites proxy)
  return "/api";
}

export function setBackendURL(url) {
  try {
    if (url && url.trim()) {
      const clean = url.trim().replace(/\/+$/, "");
      localStorage.setItem("ai_portfolio_backend_url", clean);
    } else {
      localStorage.removeItem("ai_portfolio_backend_url");
    }
  } catch (_) {}
}

export const API_BASE = getAPIBase();

// Detect WebSocket Base URL matching the active backend
export function getWebSocketURL(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  try {
    const custom = localStorage.getItem("ai_portfolio_backend_url");
    if (custom && custom.trim()) {
      const wsProto = custom.startsWith("https") ? "wss:" : "ws:";
      const host = custom.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return `${wsProto}//${host}/ws${cleanPath}`;
    }
  } catch (_) {}

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  
  if (window.location.port === "3000" || window.location.port === "80" || window.location.port === "") {
    // Via Nginx or Vercel reverse proxy
    return `${wsProtocol}//${window.location.host}/ws${cleanPath}`;
  } else if (window.location.port === "8000") {
    // Direct to FastAPI backend
    return `${wsProtocol}//${window.location.host}/ws${cleanPath}`;
  } else {
    // External dev server fallback to port 8000
    return `${wsProtocol}//${window.location.hostname}:8000/ws${cleanPath}`;
  }
}

/**
 * Check backend connectivity
 */
export async function checkBackendHealth() {
  const base = getAPIBase();
  try {
    const res = await fetch(`${base}/system/health`, { method: "GET" });
    if (res.ok) {
      const data = await res.json();
      return { ok: true, data };
    }
    return { ok: false, status: res.status, statusText: res.statusText };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

/**
 * REST Fetch utility
 */
export async function fetchAPI(endpoint, options = {}) {
  const base = getAPIBase();
  const url = `${base}${endpoint}`;
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Accept': 'application/json',
        ...(options.headers || {})
      }
    });
    if (!response.ok) {
      let errDetail = response.statusText;
      try {
        const errJson = await response.json();
        errDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
      } catch (_) {}
      throw new Error(`API Error (${response.status}): ${errDetail}`);
    }
    return await response.json();
  } catch (error) {
    console.error(`Fetch failed for ${url}:`, error);
    throw error;
  }
}

/**
 * Unified resilient Agent streaming client supporting SSE with automatic REST fallback.
 * Works seamlessly on Vercel edge proxies, Cloudflare tunnels, and local dev environments.
 *
 * @param {'tour' | 'harry'} agentType
 * @param {string} query
 * @param {object} callbacks - { onStatus, onToolCall, onToolResult, onToken, onDone, onError }
 */
export function streamAgent(agentType, query, { onStatus, onToolCall, onToolResult, onToken, onDone, onError }) {
  const base = getAPIBase();
  const sseEndpoint = agentType === "tour" 
    ? `${base}/tour/stream?query=${encodeURIComponent(query)}`
    : `${base}/harry/ask/stream?query=${encodeURIComponent(query)}`;

  console.log(`📡 [streamAgent] Starting SSE stream for ${agentType}: ${sseEndpoint}`);

  let es = null;
  let receivedDone = false;
  let aborted = false;
  let hasFallbackRun = false;

  const cleanup = () => {
    if (es) {
      try { es.close(); } catch (_) {}
      es = null;
    }
  };

  const runRestFallback = async (reason) => {
    if (receivedDone || aborted || hasFallbackRun) return;
    hasFallbackRun = true;
    cleanup();
    console.warn(`⚠️ [streamAgent] SSE ${reason} for ${agentType}. Switching to REST fallback...`);

    if (onStatus) {
      onStatus({
        node: "synthesizing",
        message: "⚡ Generating complete agent analysis...",
        elapsed: 0
      });
    }

    try {
      const endpoint = agentType === "tour" ? "/tour/plan" : "/harry/ask";
      const res = await fetchAPI(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query })
      });

      let content = "";
      if (agentType === "tour") {
        content = res.itinerary_markdown || "";
      } else {
        content = res.article || "";
      }

      receivedDone = true;
      if (onDone) {
        onDone({
          content: content,
          full_text: content,
          elapsed: res.execution_time_seconds || 0,
          raw: res
        });
      }
    } catch (restErr) {
      console.error(`❌ [streamAgent] REST fallback failed:`, restErr);
      if (onError) {
        const msg = restErr?.message || (typeof restErr === "string" ? restErr : JSON.stringify(restErr)) || "Request failed";
        onError(msg);
      }
    }
  };

  try {
    es = new EventSource(sseEndpoint);
  } catch (err) {
    console.warn(`[streamAgent] EventSource constructor failed:`, err);
    runRestFallback("init_failed");
    return { abort: () => { aborted = true; cleanup(); } };
  }

  // Fallback timer: if no event arrives within 25 seconds, switch to REST
  let initialEventTimer = setTimeout(() => {
    if (!receivedDone && !aborted && !hasFallbackRun) {
      console.warn(`[streamAgent] First event timeout for ${agentType}. Switching to REST...`);
      runRestFallback("first_event_timeout");
    }
  }, 25000);

  const clearTimer = () => {
    if (initialEventTimer) {
      clearTimeout(initialEventTimer);
      initialEventTimer = null;
    }
  };

  es.addEventListener("status", (event) => {
    clearTimer();
    try {
      const data = JSON.parse(event.data);
      if (onStatus) onStatus(data);
    } catch (_) {}
  });

  es.addEventListener("tool_call", (event) => {
    clearTimer();
    try {
      const data = JSON.parse(event.data);
      if (onToolCall) onToolCall(data.tool, data.input || data.args);
    } catch (_) {}
  });

  es.addEventListener("tool_result", (event) => {
    clearTimer();
    try {
      const data = JSON.parse(event.data);
      if (onToolResult) onToolResult(data.tool, data.output || data.message);
    } catch (_) {}
  });

  es.addEventListener("token", (event) => {
    clearTimer();
    try {
      const data = JSON.parse(event.data);
      if (onToken) onToken(data.token || data.content || "");
    } catch (_) {
      if (onToken) onToken(event.data);
    }
  });

  es.addEventListener("done", (event) => {
    clearTimer();
    receivedDone = true;
    cleanup();
    try {
      const data = JSON.parse(event.data);
      if (onDone) onDone(data);
    } catch (_) {
      if (onDone) onDone({ content: event.data, full_text: event.data });
    }
  });

  es.addEventListener("error", (event) => {
    clearTimer();
    if (receivedDone || aborted) return;
    runRestFallback("connection_error");
  });

  es.onerror = () => {
    clearTimer();
    if (receivedDone || aborted) return;
    runRestFallback("transport_error");
  };

  return {
    abort: () => {
      aborted = true;
      clearTimer();
      cleanup();
    }
  };
}

/**
 * WebSocket Streaming Client with structured agent event handling
 */
export function streamWS(endpoint, payload, { onStatus, onToolCall, onToolResult, onToken, onDone, onError }) {
  const wsUrl = getWebSocketURL(endpoint);
  console.log(`🔌 Connecting WebSocket to: ${wsUrl}`);
  
  let socket;
  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    if (onError) onError(`Failed to initialize WebSocket to ${wsUrl}: ${err.message}`);
    return null;
  }

  socket.onopen = () => {
    console.log(`🟢 WebSocket connected to ${endpoint}`);
    socket.send(JSON.stringify(payload));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      switch (data.type) {
        case 'status':
          if (onStatus) onStatus(data.content || data);
          break;
        case 'tool_call':
          if (onToolCall) onToolCall(data.tool, data.input || data.args);
          break;
        case 'tool_result':
          if (onToolResult) onToolResult(data.tool, data.output || data.message);
          break;
        case 'token':
          if (onToken) onToken(data.content || data.token || "");
          break;
        case 'done':
          if (onDone) onDone(data.content || data);
          socket.close();
          break;
        case 'error':
          if (onError) onError(data.content || data.message || "WebSocket error");
          socket.close();
          break;
        default:
          if (onToken && data.content) onToken(data.content);
      }
    } catch (e) {
      console.warn("WebSocket non-json message:", event.data);
      if (onToken) onToken(event.data);
    }
  };

  socket.onerror = (err) => {
    console.error(`❌ WebSocket error on ${endpoint}:`, err);
    if (onError) onError(`WebSocket connection failed to ${wsUrl}. Check that backend is running and supports WebSockets.`);
  };

  socket.onclose = () => {
    console.log(`🔌 WebSocket connection closed for ${endpoint}`);
  };

  return socket;
}

