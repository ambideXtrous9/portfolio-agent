/**
 * Unified API & WebSocket Client for ambideXtrous AI Portfolio
 */

// Detect API base URL
export const API_BASE = (window.location.port === "8000" || window.location.port === "3000" || window.location.port === "80" || window.location.port === "")
  ? "/api"
  : `${window.location.protocol}//${window.location.hostname}:8000/api`;

// Detect WebSocket Base URL
export function getWebSocketURL(path) {
  const wsProtocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const cleanPath = path.startsWith("/") ? path : `/${path}`;
  
  if (window.location.port === "3000" || window.location.port === "80" || window.location.port === "") {
    // Via Nginx reverse proxy
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
 * REST Fetch utility
 */
export async function fetchAPI(endpoint, options = {}) {
  const url = `${API_BASE}${endpoint}`;
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
        errDetail = errJson.detail || JSON.stringify(errJson);
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
 * WebSocket Streaming Client with structured agent event handling
 */
export function streamWS(endpoint, payload, { onStatus, onToolCall, onToolResult, onToken, onDone, onError }) {
  const wsUrl = getWebSocketURL(endpoint);
  console.log(`🔌 Connecting WebSocket to: ${wsUrl}`);
  
  let socket = null;
  let isClosedManually = false;

  try {
    socket = new WebSocket(wsUrl);
  } catch (err) {
    console.error("Failed to instantiate WebSocket:", err);
    if (onError) onError(err);
    return () => {};
  }

  socket.onopen = () => {
    console.log(`✅ WebSocket connected to ${endpoint}`);
    socket.send(JSON.stringify(payload));
  };

  socket.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      const type = data.type;

      if (type === "status" && onStatus) {
        onStatus(data);
      } else if (type === "tool_call" && onToolCall) {
        onToolCall(data);
      } else if (type === "tool_result" && onToolResult) {
        onToolResult(data);
      } else if (type === "token" && onToken) {
        onToken(data.token || "");
      } else if (type === "done" && onDone) {
        onDone(data);
        socket.close();
      } else if (type === "error" && onError) {
        onError(new Error(data.message || "Unknown error"));
        socket.close();
      }
    } catch (e) {
      console.warn("Error parsing WebSocket frame:", e, event.data);
    }
  };

  socket.onerror = (err) => {
    console.error(`❌ WebSocket error on ${endpoint}:`, err);
    if (onError) onError(err);
  };

  socket.onclose = (e) => {
    if (!isClosedManually) {
      console.log(`🔌 WebSocket connection closed (${e.code})`);
    }
  };

  return () => {
    isClosedManually = true;
    if (socket && socket.readyState === WebSocket.OPEN) {
      socket.close();
    }
  };
}
