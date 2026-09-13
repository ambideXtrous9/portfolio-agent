/**
 * Unified API Client for ambideXtrous AI Portfolio
 */

const API_BASE = window.location.origin.includes(":8000") || window.location.origin.includes(":3000")
  ? `${window.location.protocol}//${window.location.hostname}:8000/api`
  : "/api";

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

export function streamSSE(endpoint, { onStatus, onChunk, onDone, onError }) {
  const url = `${API_BASE}${endpoint}`;
  const eventSource = new EventSource(url);

  eventSource.addEventListener("status", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (onStatus) onStatus(data);
    } catch (err) {
      console.warn("Status parse error:", err);
    }
  });

  eventSource.addEventListener("chunk", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (onChunk) onChunk(data.token || "");
    } catch (err) {
      console.warn("Chunk parse error:", err);
    }
  });

  eventSource.addEventListener("done", (e) => {
    try {
      const data = JSON.parse(e.data);
      if (onDone) onDone(data);
    } catch (err) {
      if (onDone) onDone({});
    }
    eventSource.close();
  });

  eventSource.onerror = (err) => {
    console.error("SSE stream error:", err);
    if (onError) onError(err);
    eventSource.close();
  };

  return () => eventSource.close();
}
