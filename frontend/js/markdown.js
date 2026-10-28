/**
 * Safe Markdown rendering for agent output.
 *
 * All LLM/model/agent markdown MUST go through renderSafeMarkdown() before it
 * is assigned to innerHTML. marked.parse output is sanitized with DOMPurify;
 * when the sanitizer is not yet loaded (e.g. CDN blocked), the content is
 * fully escaped and rendered in a <pre> block instead — never raw HTML.
 */

export function renderSafeMarkdown(markdown) {
  const raw = markdown == null ? "" : String(markdown);

  if (window.marked && window.DOMPurify) {
    try {
      return window.DOMPurify.sanitize(window.marked.parse(raw), {
        ALLOWED_ATTR: ["href", "title", "target", "rel", "src", "alt", "class"],
        ADD_ATTR: ["target"],
      });
    } catch (err) {
      console.warn("[markdown] sanitize failed, escaping output", err);
    }
  }

  // Fallback: fully escaped plain text (never inject raw HTML)
  const container = document.createElement("div");
  container.textContent = raw;
  return `<pre class="st-md-fallback">${container.innerHTML}</pre>`;
}

/** Escapes text for safe interpolation into HTML template strings. */
export function escapeHtml(text) {
  const container = document.createElement("div");
  container.textContent = text == null ? "" : String(text);
  return container.innerHTML;
}

/** Builds a safe external anchor tag (escaped label + rel="noopener"). */
export function safeExternalLink(href, label) {
  const escapedHref = escapeHtml(href == null ? "#" : String(href));
  const escapedLabel = escapeHtml(label == null ? "" : String(label));
  // Block javascript:/data: URLs before they ever reach an href
  const url = escapedHref.trim().toLowerCase();
  if (url.startsWith("javascript:") || url.startsWith("data:") || url.startsWith("vbscript:")) {
    return `<a href="#" class="st-link-disabled" title="Blocked unsafe link">${escapedLabel}</a>`;
  }
  return `<a href="${escapedHref}" target="_blank" rel="noopener noreferrer">${escapedLabel}</a>`;
}
