/**
 * Unified API & WebSocket Client for ambideXtrous AI Portfolio
 */

// Retrieve or compute active Backend API Base
export function getAPIBase() {
  const isLocal = window.location.hostname === "localhost" ||
                  window.location.hostname === "127.0.0.1" ||
                  window.location.hostname.startsWith("192.168.");

  try {
    const custom = localStorage.getItem("ai_portfolio_backend_url");
    if (custom && custom.trim()) {
      const clean = custom.trim().replace(/\/+$/, "");
      if (!isLocal && (clean.includes("localhost") || clean.includes("127.0.0.1") || clean.startsWith("http://"))) {
        // Discard stale localhost override when on public HTTPS deployment to prevent mixed content
        return "/api";
      }
      return clean.endsWith("/api") ? clean : `${clean}/api`;
    }
  } catch (_) {}

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

// ─────────────────────────────────────────────────────────────────────────────
// Authentication & JWT State Management
// ─────────────────────────────────────────────────────────────────────────────
export function getAuthToken() {
  try {
    return localStorage.getItem("portfolio_auth_token") || "";
  } catch (_) {
    return "";
  }
}

export function setAuthToken(token) {
  try {
    if (token) {
      localStorage.setItem("portfolio_auth_token", token);
    } else {
      localStorage.removeItem("portfolio_auth_token");
    }
  } catch (_) {}
}

export function clearAuthToken() {
  try {
    localStorage.removeItem("portfolio_auth_token");
    localStorage.removeItem("portfolio_auth_user");
  } catch (_) {}
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem("portfolio_auth_user");
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

export function setAuthUser(user) {
  try {
    if (user) {
      localStorage.setItem("portfolio_auth_user", JSON.stringify(user));
    } else {
      localStorage.removeItem("portfolio_auth_user");
    }
  } catch (_) {}
}

// Detect WebSocket Base URL matching the active backend
export function getWebSocketURL(path) {
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  const token = getAuthToken();
  const tokenQuery = token ? (cleanPath.includes("?") ? `&token=${encodeURIComponent(token)}` : `?token=${encodeURIComponent(token)}`) : "";

  try {
    const custom = localStorage.getItem("ai_portfolio_backend_url");
    if (custom && custom.trim()) {
      const wsProto = custom.startsWith("https") ? "wss:" : "ws:";
      const host = custom.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
      return `${wsProto}//${host}/ws${cleanPath}${tokenQuery}`;
    }
  } catch (_) {}

  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  
  if (window.location.port === "3000" || window.location.port === "80" || window.location.port === "") {
    // Via Nginx or Vercel reverse proxy
    return `${wsProtocol}//${window.location.host}/ws${cleanPath}${tokenQuery}`;
  } else if (window.location.port === "8000") {
    // Direct to FastAPI backend
    return `${wsProtocol}//${window.location.host}/ws${cleanPath}${tokenQuery}`;
  } else {
    // External dev server fallback to port 8000
    return `${wsProtocol}//${window.location.hostname}:8000/ws${cleanPath}${tokenQuery}`;
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
 * REST Fetch utility with automatic Authorization Bearer token header
 */
export async function fetchAPI(endpoint, options = {}) {
  const base = getAPIBase();
  const url = `${base}${endpoint}`;
  const token = getAuthToken();

  const isPublicEndpoint = endpoint.includes("/system/health") || 
                          endpoint.includes("/auth/login") || 
                          endpoint.includes("/auth/signup") ||
                          endpoint.includes("/auth/forgot-password") ||
                          endpoint.includes("/auth/reset-password") ||
                          endpoint.includes("/voice") ||
                          endpoint.includes("/portfolio") ||
                          endpoint.includes("/stock") ||
                          endpoint.includes("/cluster");

  if (!token && !isPublicEndpoint) {
    window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { endpoint } }));
    throw new Error("Authentication required. Please sign in to access this feature.");
  }

  const headers = {
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(options.headers || {})
  };
  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      let errDetail = response.statusText;
      try {
        const errJson = await response.json();
        errDetail = errJson.detail || errJson.message || JSON.stringify(errJson);
      } catch (_) {}

      // If unauthorized, clear invalid token and broadcast auth event
      if (response.status === 401) {
        clearAuthToken();
        clearAuthUser();
        window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { endpoint } }));
      }

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
export function streamAgent(agentType, query, { sessionId, onStatus, onToolCall, onToolResult, onToken, onDone, onError }) {
  const base = getAPIBase();
  const token = getAuthToken();

  // Guard against unauthenticated invocation
  if (!token) {
    window.dispatchEvent(new CustomEvent("portfolio:unauthorized", { detail: { agentType } }));
    if (onError) onError("Authentication required. Please sign in to consult the agent.");
    return { abort: () => {} };
  }

  const tokenParam = `&token=${encodeURIComponent(token)}`;
  const sessionParam = sessionId ? `&session_id=${encodeURIComponent(sessionId)}` : "";
  const sseEndpoint = agentType === "tour" 
    ? `${base}/tour/stream?query=${encodeURIComponent(query)}${sessionParam}${tokenParam}`
    : `${base}/harry/ask/stream?query=${encodeURIComponent(query)}${sessionParam}${tokenParam}`;

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
      const payload = { query: query };
      if (sessionId) payload.session_id = sessionId;
      const res = await fetchAPI(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
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

// ─────────────────────────────────────────────────────────────────────────────
// Authentication API Operations
// ─────────────────────────────────────────────────────────────────────────────
export async function apiSignup(email, fullName, password) {
  const data = await fetchAPI("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, full_name: fullName, password }),
  });
  if (data.access_token) {
    setAuthToken(data.access_token);
    setAuthUser(data.user);
  }
  return data;
}

export async function apiLogin(email, password) {
  const data = await fetchAPI("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (data.access_token) {
    setAuthToken(data.access_token);
    setAuthUser(data.user);
  }
  return data;
}

export async function apiLogout() {
  try {
    await fetchAPI("/auth/logout", { method: "POST" });
  } catch (_) {}
  clearAuthToken();
}

export async function apiGetMe() {
  return await fetchAPI("/auth/me", { method: "GET" });
}

export async function apiForgotPassword(email) {
  return await fetchAPI("/auth/forgot-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim().toLowerCase() }),
  });
}

export async function apiResetPassword(token, newPassword) {
  return await fetchAPI("/auth/reset-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token: token.trim(), new_password: newPassword }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Chat History & PostgreSQL Checkpoint Operations
// ─────────────────────────────────────────────────────────────────────────────
export async function apiGetChatHistory(threadId) {
  return await fetchAPI(`/chat/threads/${encodeURIComponent(threadId)}/history`, { method: "GET" });
}

export async function apiClearChatHistory(threadId) {
  return await fetchAPI(`/chat/threads/${encodeURIComponent(threadId)}`, { method: "DELETE" });
}


