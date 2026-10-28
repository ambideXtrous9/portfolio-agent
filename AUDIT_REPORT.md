# Application Audit Report

**Branch:** `audit/app-review`
**Date:** 2026-10-28
**Scope:** Full codebase — backend (FastAPI + LangGraph), frontend (vanilla JS SPA), infrastructure (Docker, Vercel, CI), data, and dependencies.

---

## 0. Architecture Summary

| Layer | Tech | Size |
|-------|------|------|
| Backend | FastAPI, LangGraph, Neon Postgres, MCP stdio servers | ~5,900 Py lines (`stock.py` alone: 1,239) |
| Frontend | Vanilla JS SPA, Plotly, marked, LiveKit client | ~9,200 lines (index.html 1,264 / style.css 2,655 / 8 JS modules) |
| Agents | Harry (5-node LangGraph), Tour (3-node), Voice (LiveKit Worker) | `backend/app/voice_agent/` is the deployed one |
| Deployment | 1) Vercel serverless (`api/index.py`, 60s cap, no ML deps) 2) Docker Compose (nginx + FastAPI + voice-agent + Cloudflare tunnel) 3) bare `run.py` uvicorn | Both Vercel and Docker are first-class |

Route surface is mounted **twice** (`/api/...` and unprefixed) for Vercel rewrite compatibility (`backend/app/main.py:118–120`). Frontend resolves backend URL at runtime (`frontend/js/api.js:6–32`): `http://localhost:8000/api` in dev, `/api` relative on Vercel/Docker (nginx proxies). Agents stream via **SSE with REST fallback**; WebSockets exist in the backend but are unused by the frontend on Vercel (no `/ws` rewrite in `vercel.json`).

---

## 1. Critical Bugs & Security (P0 — fix first)

| # | Issue | Location |
|---|-------|----------|
| 1 | **Startup DB init is broken** — lifespan calls `await asyncio.gather(...)` but `asyncio` is never imported → `NameError`, swallowed by a broad `except`, so DB pools/checkpointer never init at startup. Only recovered by the per-request middleware fallback. | `backend/app/main.py:27` |
| 2 | **Account takeover** — `/auth/forgot-password` returns the reset JWT **directly in the JSON response** (`"reset_token": reset_token`). Knowing any user's email = owning their account. Must move to email delivery. | `backend/app/api/endpoints/auth.py:282` |
| 3 | **Unauthenticated production redeploy** — Telegram webhook never checks `X-Telegram-Bot-Api-Secret-Token` and has no chat-id allowlist; anyone can POST a fake Telegram update and use `/redeploy` to trigger a production GitHub Actions deploy. | `backend/app/api/endpoints/telegram.py:104–152, 199–207` |
| 4 | **Hardcoded JWT secret fallback** — `"portfolio-super-secret-jwt-key-2026-production"` is used whenever `JWT_SECRET_KEY` env is missing; every deployment without the var signs tokens with a public constant. | `backend/app/config.py:58` |
| 5 | **CORS misconfiguration** — `CORS_ORIGINS = ["*"]` with `allow_credentials=True` and all methods/headers — invalid/misconfigured combo defeating credential isolation. | `config.py:64`, `main.py:79–86` |
| 6 | **Auth-optional agent sockets** — Harry/Tour WebSocket run **fully unauthenticated** if no token is ever supplied; SSE takes the JWT as `?token=` **URL query param**, leaking it into proxy/access logs/browser history. | `harry.py:369–375`, `tour.py:448–455`, `frontend/js/api.js:104–105, 232` |
| 7 | **IDOR on chat threads** — `/chat/threads/{id}/history` and DELETE never verify the thread belongs to the requesting user; any authenticated user can read/delete anyone's chat threads. | `backend/app/api/endpoints/chat.py:45–99` |
| 8 | **Voice tokens for anonymous users** — `/voice/token` issues 6-hour LiveKit tokens with `roomJoin/canPublish/canSubscribe/canPublishData` to **unauthenticated** callers. | `backend/app/api/endpoints/voice.py:91–117` (6h expiry at :79) |
| 9 | **User enumeration + no brute-force protection** — login returns "Account not found; please sign up." vs "Incorrect username/email or password."; no rate limiting or lockout anywhere in the app. | `auth.py:139, 146` |
| 10 | **Multiple XSS channels (unsanitized `innerHTML`)** — screener cells, `data.about`, officer names, news `n.url`/`n.title` interpolated into `<a href>`; `marked.parse()` output of **LLM reports and chat history** injected raw with no sanitizer; LiveKit transcript text raw-injected; YOLO label raw-injected. CDN `marked` is **unpinned with no SRI**. | `frontend/js/stock.js:175–236, 543–563, 580, 530, 710, 788, 808`; `harry.js:87, 298`; `tour.js:87, 301`; `voice.js:139`; `vision.js:321–323`; `index.html:15–17` |
| 11 | **Pickle RCE vector** — `torch.load(..., weights_only=False)` on checkpoints; ironically `.semgrep.yml` allows the rule pointing at a path (`ImageClassifier/classifier.py`) that doesn't exist in the repo. | `backend/app/api/endpoints/vision.py:165`, `.semgrep.yml` |
| 12 | **Weak credential policy** — min password length **3** (`schemas/auth.py:13,54`); JWT also accepted from `?token=` query. | `schemas/auth.py`, `backend/app/api/deps.py:77` |

---

## 2. Fabricated Data Presented as Real (credibility killer)

The most damaging pattern for a portfolio project: **every failure path invents plausible-looking output instead of surfacing an error** — the API "always returns 200 with data".

- **Stock analysis**: hardcoded quarterly profits `[420.5, 480.2, 510.8, 595.4]` (`stock.py:822–828`); fabricated full shareholding series (`stock.py:833–846`); **10 fake news headlines attributed to Economic Times, LiveMint, MoneyControl, Business Standard, CNBC-TV18, NDTV Profit, Bloomberg Quint** (`stock.py:1064–1083`).
- **Vision**: on Vercel torch is not in requirements.txt, so models are never loadable — the endpoint synthesizes "accuracy" and "inference_time" from image SHA-256 + per-model hardcoded latency tables (`vision.py:326–388, 512–558`) — indistinguishable from real inference. Also queries Groq with **nonexistent model names** `"qwen/qwen3.8-27b"`, `"qwen/qwen3.6-27b"` (`vision.py:212–213`).
- **Tour**: fabricated "pleasant weather" report when geocoding fails (`tour.py:106–118`); fabricated Airbnb listings text "Verified stays..." (`tour.py:230–233`).
- **Portfolio**: hardcoded fake GitHub stats (`public_repos: 28, followers: 15`) presented as "real-time" (`portfolio.py:100–107`); frontend falls back to fabricated "35+/50+" (`app.js:1018–1028`).
- **Harry**: Pinecone/MCP outage fallback returns placeholder `"Canonical context for: {query}"` pretending to be research (`harry.py:140`).

**Fix policy:** fail loudly (503 + structured error), surface honest empty states in UI, or explicitly badge fallbacks as "demo data". Replace fake GitHub stats with a real GitHub API call cached 10–15 min (the unauthenticated 60 req/hr limit bites fast).

---

## 3. Performance & Efficiency Issues

### 3.1 Event loop is blocked everywhere (sync I/O inside `async def`)

Each of these stalls the entire app for seconds on every call:

- `yf.download` of 500–750 tickers with `threads=True` — `stock.py:79–86`
- yfinance `.info/.history/.quarterly_income_stmt` chains — `stock.py:748–799`
- screener.in HTML scraping via `requests` (spoofed UA) — `stock.py:565–657`
- GNews + Google News RSS loops — `stock.py:1005–1062`
- Weather `requests.get` and `get_forecast()` called **directly without await/executor** — `tour.py:166, 103–128, 198`
- Groq vision sync `client.chat.completions.create` — `vision.py:214–225`
- `DDGS()` DuckDuckGo sync context manager inside async tool — `voice_agent/tools.py:198`

**Fix:** shared `httpx.AsyncClient` for httpx-able calls; wrap un-async SDKs (yfinance, GNews) in `asyncio.to_thread`/`run_in_executor` behind a semaphore; add `slowapi` request throttling.

### 3.2 Per-request recomputation

- `pd.read_csv` × both universes **on every** companies/scan request + `df.iterrows()` row loop — `stock.py:94–151`
- 416KB `stock_fundamentals_cache.json` re-`json.load` synchronously inside async endpoint on mtime change — `stock.py:49–63`
- LangGraph graphs **recompiled per request** — `tour.py:362–364`, `harry.py:284–286`, `voice.py:196` → compile once at startup
- New `ChatGroq` instance per call — `core/llm.py` → singleton
- New `httpx.AsyncClient` per call in ~10 places (`portfolio.py:79`, `telegram.py:39/81/227/243`, `tools.py:68/92/116/148/176`) → one shared client
- `/stock/analysis/{symbol}` has **no cache at all** — each request = scraping + yfinance + news → add 15-min TTL keyed by symbol

### 3.3 Database layer

- Chat history table has **no index on `session_id`** (langchain-postgres default DDL) → seq scans on every fetch/delete — `core/database.py:154–157`, `delete_chat_session:231–247`
- `DB_POOL_MIN_SIZE=0` → cold-connect latency on first requests — `config.py:52`
- Every authed request = 2 queries (user lookup + blacklist check) with zero caching — `deps.py:41,55` → short-TTL in-process cache of verified users
- **Unbounded in-memory fallback state**: chat history dict, users dict, logout blacklist set, reset tokens — `database.py:92`, `auth_database.py:32–34` → cap/LRU or prune; note the in-memory set is written even in PG mode (`auth_database.py:350`)
- **Silent dual-write semantics**: DB failures on store_reset_token / blacklist / verify_reset fall through to in-memory "success" — a reset may exist only in RAM — `auth_database.py:367–370, 425–427, 462–465`

### 3.4 Frontend

- **Plotly 2.35 (~3.5MB), marked, livekit-client loaded render-blocking in `<head>`** — `index.html:15–17` → `defer` / dynamic import on tab activation (~60% cut of initial JS)
- **Orb `requestAnimationFrame` loop runs forever**, even hidden/inactive — `voice.js:122` → gate on `document.visibilityState` + tab activity
- **Mic opened twice** (room publish + separate getUserMedia for visualizer) — `voice.js:312–331`
- Cluster sliders refetch `/cluster/run` with no coalescing — `cluster.js:256–266`; stock analysis on every dropdown change **without aborting prior request** — `stock.js:398–421` → `AbortController` + debounce
- Fonts loaded **twice** (HTML `<link>` + CSS `@import`) — `style.css:8` → drop the `@import`
- `api.js` is evaluated **twice as two module records** due to mixed import specifiers: `./api.js?v=3.9` from app.js vs bare `./api.js` from features — `app.js:25–31` → drop `?v=` specifiers

---

## 4. System Design & Structure

1. **Merge duplication-by-twins.** `harry.js` (320 lines) and `tour.js` (323 lines) are ~97% identical → one `AgentWorkspace` module parameterized by config. Backend equivalent: 4 near-identical stream generators (`tour.py:476–531, 572–625` vs `harry.py:399–462, 512–568`) incl. identical persist blocks → shared `stream_agent_response()` helper.
2. **Split the monsters** (AST-verified function lengths):
   - `scan_stocks` — **393 lines**, 6 mode branches — `stock.py:159–551`
   - `get_stock_analysis` — **383 lines** — `stock.py:732–1114`
   - `renderAnalysisDashboard` — **408 lines** (frontend) — `stock.js:423–831`
   - `app.js` DOMContentLoaded initializer — **884 lines** — `app.js:56–939`
   - ~25 more functions >80 lines across endpoints

   → Introduce a `backend/app/services/stock/` package (`scraper.py`, `fundamentals.py`, `news.py`, `technical.py`, `cache.py`); each scan mode becomes its own service function.
3. **Consistency layer for failures.** Define `LLMUnavailable` / `DataUnavailable` outcomes → 503 + structured error + `degraded_mode` flag in `/system/health`. Unify the two silent-DB-fallbacks (Postgres → in-memory indistinguishably, `database.py:171–185`).
4. **Auth model.** Threads need `user_id` FK + ownership predicates; session ids must not be attacker-controllable (`tour.py` SSE `session_id` query param feeds a shared checkpointer). Remove the client-only substring auth allowlist in `fetchAPI` (`api.js:155–163` — any path containing "stock"/"cluster" bypasses the auth client-side).
5. **Config hygiene.** Legacy STREAMLIT_* env vars; hardcoded prod URLs in `telegram.py:158–159, 182, 218`; LiveKit URL hardcoded in `config.py:38` *and* `voice.py:99`; `CORS_ORIGINS` not env-driven; `.env.example` says `ACCESS_TOKEN_EXPIRE_MINUTES=1440` while code default is 60.
6. **Delete dead code:**
   - **`livekit-agent/` directory** — full parallel copy of the voice agent with its own Dockerfile; nothing builds/deploys it (compose runs `backend.app.voice_agent`) → delete
   - `streamWS` (`api.js:392–452`, never called), websocket endpoints kept only as Vercel dead weight
   - `renderCandlestickChart` targets nonexistent `#stock-candlestick-chart` — `stock.js:1029–1058`
   - `#top-user-area` / `#auth-demo-banner` handlers + ~195 lines of CSS for removed HTML — `app.js:653–696, 750–764`, `style.css:2054–2248`
   - Dead buttons referenced with optional chaining (`harry.js:25–28`, `tour.js:25–28`, `voice.js:465–471`)
   - Unused sklearn imports — `cluster.py:11–17`; unused `math` import — `stock.py:7`
   - `backend/models/classifier.py` — dead Streamlit-era code with unresolvable import
   - Empty junk dirs: `KMS/`, `scratch/`
   - Duplicate `send_telegram_msg` (`endpoints/telegram.py:23` vs `scripts/telegram_notify.py:15`)
   - Duplicated `escapeHtml` ×4 (`app.js:273`, `stock.js:1138`, `harry.js:311`, `tour.js:314`); duplicated session-id normalization (`database.py:204–212` vs `chat.py:36–42`); `UserResponse` construction ×3 (`auth.py:80, 167`, `deps.py:63`)
7. **Testing is nearly absent:** one manually-run async script (`backend/tests/test_postgres_auth.py`, not pytest-style, requires live Postgres). No pytest config; contract claim in README ("Pytest Integration Suite") doesn't match reality.
8. **Logging:** 49 raw `print()` calls + 126 broad `except Exception` in backend; no logging setup in main.py.

---

## 5. UI & Frontend Evaluation

### What works well
- Genuinely nice "Streamlit-shell" design: terracotta/sage **design token system** in CSS variables, frosted "zen card", glow accents
- Collapse + drawer sidebar with Ctrl+B hotkey and persistence; auto-collapse <768px
- Good empty states ("No recent chats yet.", "Click 'Run Scan'...", "No news found...")
- Agent workspaces with live status badges, elapsed timer, tool-call logs
- SSE → REST fallback chain with 25s timer
- Solid Plotly usage: `.react` incremental updates, client-side SMA/RSI computation, auto-fit grids
- localStorage caches for company catalog and recent sessions

### What to upgrade

| Area | Now | Recommendation |
|------|-----|----------------|
| **State management** | 884-line closure with module-level token/user state | Extract a tiny reactive store (or Preact ~3KB) — single source of truth for user/token/tab/route |
| **Rendering** | Full innerHTML string rebuilds (updateAuthUI ~135 lines, history lists, scan results) | Template elements / keyed updates instead of wholesale re-render |
| **Module loading** | 3 render-blocking CDN scripts in `<head>`, no SRI, unpinned marked/livekit | Pin versions + SRI hashes; `defer`; dynamic-import Plotly/voice per tab |
| **Accessibility** | 11 duplicate `<h1>`s, nav lacks `role="tab"/aria-selected`, modals lack `role="dialog"`/focus trap, toasts lack `aria-live`, dropzones keyboard-unreachable, no `prefers-reduced-motion`, no skip-link, minimal `:focus-visible` | One true visible `<h1>`; `aria-hidden` on inactive sections; tablist semantics; focus trap + Escape on all 5 modals; `aria-live="polite"` toasts; fix dropzones |
| **Themes** | Light-only, no `prefers-color-scheme` despite full token system | `[data-theme="dark"]` override — cheap given the token discipline |
| **Error surfaces** | 3 kinds mixed: toasts, inline red boxes, `alert()`/`confirm()` | Unify on toast + dialog; replace `confirm()` with the already-existing `#delete-chat-modal` |
| **SEO/Meta** | No description, OG/Twitter, canonical, theme-color, robots | Pure content win for an online portfolio |
| **Security headers** | No CSP, HSTS, Referrer-Policy (`vercel.json`) — urgent given JWT-in-URL patterns | Strict CSP + Referrer-Policy; move JWT out of URLs → httpOnly SameSite cookie |
| **Dead weight** | 170 inline `style=""` attrs, dead CSS (~195 lines), dead handlers | Purge; repeated inline styles → classes |

### Appropriate UX upgrades for this design
- Skeleton loaders instead of button spinners for scan/analysis
- `aria-live` streaming of assistant tokens on chat
- Server-side pagination for the 752-row companies table
- History-aware route-based tabs + deep links
- Mobile: bottom nav bar option; horizontal-scroll sub-tabs already exist

---

## 6. Infrastructure, CI & Dependencies

1. **CI validates almost nothing** — `.github/workflows/ci-cd.yaml` `validate` job = `json.tool` on vercel.json + `compileall` + file-existence checks. The test file never runs; no ruff/mypy/semgrep despite README claims. → Add: pytest with ASGI in-process smoke tests, ruff + mypy, semgrep with real rules; fix stale `ImageClassifier/classifier.py` exclusion path.
2. **Dependency truth split 3 ways** — `requirements.txt` ≡ duplicated in `pyproject.toml`, `uv.lock` present, `livekit-agent/requirements.txt` third copy; **torch/torchvision/timm/ultralytics/pytorch-lightning + `gnews`/`curl-cffi` exist only in the Dockerfile** → Vercel (locked env, no torch) can never run the real vision path. → Consolidate in pyproject with an optional `[vision]` extra; drop requirements.txt duplication.
3. **`.dockerignore` misses `.vercel/` (415MB local)** + `.agents`, `KMS`, `scratch`, `livekit-agent`, `uv.lock` → every build uploads dead context.
4. **Docker image bloat** — torch CPU stack + Node 22 + npm MCP globals preinstalled (likely 3–5GB). → Install MCP servers lazily at runtime or run as sidecar services; strip old `.so` cleanup further.
5. **Compose leaks secrets** — `voice-agent` service has blank `env_file: .env` (all 50 local secrets into the container). → Pass only the 6 needed vars. `JWT_SECRET_KEY` hardcoded default also appears in compose interpolation.
6. **`vercel.json` exposes `/docs` + `/openapi.json` in prod** → gate behind env; also add HSTS/Referrer-Policy; the frontend mismatches its own cache-busting versions (`?v=3.9` vs `?v=4.0` vs `?v=4.2`).
7. **Assets bloat** — ~4.5MB tracked media (2 decorative PNGs ≈ 2.8MB, `thor.gif` 1.4MB) → compress to WebP (−70%) — these are a visitor's first bytes.
8. **`maxDuration: 60` vs SSE agents** — the 25s frontend fallback timer exists only because of this cap; either move streaming to the Docker/tunnel path or chunk outputs within the cap.
9. **Misc:** `.gitignore` re-broadens `.env*` after the `!.env.example` negation (fragile precedence); leftover `nodev20/`-era ignore entries; two `psycopg` variants listed; `pwdlib[argon2]` + standalone `argon2-cffi` redundant.

---

## 7. Suggested Fix Order

### P0 — single sitting, highest value
- [x] `import asyncio` in `main.py`
- [x] Reset token out of the response — email delivery path
- [x] Telegram webhook: verify `secret_token` header + chat_id allowlist
- [x] JWT secret required (no default); move JWT from URLs to httpOnly cookie
- [x] Ownership check on chat threads (IDOR)
- [x] CORS: explicit origin allowlist
- [x] Pin + SRI CDN scripts; sanitize `marked` output (DOMPurify)

### P1 — a weekend
- [x] `asyncio.to_thread` for all sync I/O; shared httpx client; module caches for CSVs/JSON graphs/LLM clients
- [x] Index chat history `session_id`; user-lookup caching; cap unbounded fallback dicts
- [x] Honest-failure policy replacing every fabricated fallback
- [x] CI: pytest + ruff + mypy + semgrep
- [x] Dependency unification in pyproject (optional `[vision]` extra)
- [x] `.dockerignore` fix; compose secret scoping

### P2 — design debt
- [ ] Merge harry/tour modules (FE + BE); shared stream helper
- [ ] Split `stock.py` into a services/ package; split frontend monoliths
- [ ] App.js closure → store; dark mode + accessibility pass
- [x] Delete `livekit-agent/`, `KMS/`, `scratch/`, dead code and CSS
- [ ] Compress assets to WebP; on-demand Plotly/voice dynamic imports
