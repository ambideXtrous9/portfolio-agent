# ⚡ ambideXtrous · Autonomous AI Portfolio & Multi-Agent Intelligence Hub

<p align="center">
  <img src="frontend/assets/images/portfolio_hero.png" alt="ambideXtrous AI Portfolio Workspace" width="100%" style="border-radius: 12px; box-shadow: 0 10px 30px rgba(0,0,0,0.15); border: 1px solid #eaeaea;"/>
</p>

<p align="center">
  <a href="https://github.com/ambideXtrous9/portfolio-agent/actions"><img src="https://img.shields.io/badge/GitHub%20Actions-CI%2FCD-2088FF?style=for-the-badge&logo=githubactions&logoColor=white" alt="GitHub Actions"/></a>
  <a href="https://vercel.com/"><img src="https://img.shields.io/badge/Vercel-Serverless%20Edge-000000?style=for-the-badge&logo=vercel&logoColor=white" alt="Vercel"/></a>
  <a href="https://fastapi.tiangolo.com"><img src="https://img.shields.io/badge/FastAPI-0.115+-009688?style=for-the-badge&logo=fastapi&logoColor=white" alt="FastAPI"/></a>
  <a href="https://python.org"><img src="https://img.shields.io/badge/Python-3.12-3776AB?style=for-the-badge&logo=python&logoColor=white" alt="Python 3.12"/></a>
  <a href="https://langchain-ai.github.io/langgraph/"><img src="https://img.shields.io/badge/LangGraph-StateGraph%20v0.2+-1C3C3C?style=for-the-badge&logo=langchain&logoColor=white" alt="LangGraph"/></a>
  <a href="https://neon.tech/"><img src="https://img.shields.io/badge/Neon-Serverless%20Postgres-00E599?style=for-the-badge&logo=postgresql&logoColor=black" alt="Neon Postgres"/></a>
  <a href="https://huggingface.co/ambideXtrous9/brand-logo-classifiers"><img src="https://img.shields.io/badge/HuggingFace-Model%20Hub-FFD21E?style=for-the-badge&logo=huggingface&logoColor=black" alt="Hugging Face"/></a>
  <a href="https://livekit.io/"><img src="https://img.shields.io/badge/LiveKit-WebRTC%20Voice-00A67E?style=for-the-badge&logo=livekit&logoColor=white" alt="LiveKit"/></a>
  <a href="https://www.pinecone.io/"><img src="https://img.shields.io/badge/Pinecone-8.9k%20Vectors-000000?style=for-the-badge&logo=pinecone&logoColor=white" alt="Pinecone"/></a>
  <a href="https://jwt.io/"><img src="https://img.shields.io/badge/JWT-Argon2id%20Auth-000000?style=for-the-badge&logo=jsonwebtokens&logoColor=white" alt="JWT"/></a>
  <a href="https://modelcontextprotocol.io/"><img src="https://img.shields.io/badge/MCP-MultiServer-7B1FA2?style=for-the-badge" alt="MCP"/></a>
  <a href="https://docker.com"><img src="https://img.shields.io/badge/Docker-Ready-2496ED?style=for-the-badge&logo=docker&logoColor=white" alt="Docker"/></a>
</p>

<p align="center">
  <b>A production-grade, decoupled Multi-Agent AI Platform featuring LangGraph StateGraphs, standalone Neon Serverless PostgreSQL persistence, dynamic Hugging Face Hub model checkpointing, multi-server Model Context Protocol (MCP), Pinecone vector retrieval, JWT authentication, and automated GitHub Actions CI/CD to Vercel Serverless.</b>
</p>

---

<div align="center">

### 🌐 Live Production Deployments

| Resource | Service / Provider | URL / Identifier | Status |
| :--- | :--- | :--- | :--- |
| **Production Web App** | ▲ Vercel Global Edge CDN | [`portfolio-agent-ai.vercel.app`](https://portfolio-agent-ai.vercel.app) | 🟢 `Online` |
| **API & OpenAPI Specs** | ⚡ FastAPI Serverless | [`/docs`](https://portfolio-agent-ai.vercel.app/docs) &bull; [`/redoc`](https://portfolio-agent-ai.vercel.app/redoc) | 🟢 `Public` |
| **CI/CD Automation** | 🐙 GitHub Actions | [Workflows & Automated Deployment](https://github.com/ambideXtrous9/portfolio-agent/actions) | 🟢 `Passing` |
| **Managed Database** | 🐘 Neon Serverless Postgres | AWS `us-east-1` (`iad1`) &bull; Vercel Storage | 🟢 `Active` |
| **Model Checkpoint Hub** | 🤗 Hugging Face Hub | [`ambideXtrous9/brand-logo-classifiers`](https://huggingface.co/ambideXtrous9/brand-logo-classifiers) | 🟢 `Synced` |
| **Voice Streaming Mesh** | 🎙️ LiveKit Cloud | WebRTC Real-Time SFU | 🟢 `Connected` |
| **Authentication Guard** | 🛡️ PyJWT + Argon2id | Bearer Token Gating (AI Endpoints Protected) | 🔒 `Enforced` |

</div>

---

## ⚡ System Design & Architecture

<p align="center">
  <a href="https://skillicons.dev">
    <img src="https://skillicons.dev/icons?i=githubactions,git,vercel,fastapi,python,postgres,docker,aws,pytorch,linux,html,css,js,ts&perline=14" alt="Complete Technology Stack" />
  </a>
</p>

### 🏗️ 1. End-to-End Distributed Architecture

The system is decoupled into an edge-delivered SPA, an asynchronous serverless FastAPI gateway, LangGraph StateGraph agent execution engines, and a dedicated **Neon Serverless PostgreSQL** cloud database with dual persistence (Argon2id Auth + LangGraph Checkpointing):

```mermaid
flowchart LR
    %% Modern, Compact & Proportional End-to-End System Architecture

    subgraph CICD ["🐙 CI/CD & Delivery"]
        direction TB
        Git["GitHub Repo\n(main branch)"]
        GHA["GitHub Actions CI\n• Linting & Pytest\n• uv.lock Audit"]
        Git -->|"Push / PR"| GHA
    end

    subgraph VercelEdge ["▲ Vercel Cloud Platform"]
        direction TB
        CDN["Global Edge CDN\n(HTML5 / ES6+ SPA)"]
        API["FastAPI 0.115 Gateway\n(Python 3.12 Serverless)"]
        AuthGuard["🛡️ Auth Guard\n(PyJWT + Argon2id)"]
        Lifespan["FastAPI Lifespan\n(HF Checkpoint Sync)"]
        CDN -.->|"HTTPS / JSON"| API
        API --> AuthGuard
        API -.-> Lifespan
    end

    subgraph Agents ["🧠 LangGraph Agent Runtime"]
        direction TB
        StateEngine["LangGraph StateGraph\n(Multi-Turn Graph Runner)"]
        Harry["🪄 Harry Lore RAG\n(Pinecone Vectors)"]
        Tour["🏡 Tour Planner\n(Airbnb MCP + Weather)"]
        Stock["📈 Stock Quant\n(Breakout Scanner)"]
        Vision["👁️ Vision Studio\n(27-Brand Neural)"]
        Voice["🎙️ Voice Agent\n(LiveKit WebRTC)"]
        StateEngine --> Harry & Tour & Stock & Vision & Voice
    end

    subgraph PostgresCloud ["🐘 Neon Serverless Postgres (AWS iad1)"]
        direction TB
        NeonPooler["Neon PgBouncer Pooler\n(prepare_threshold=None)"]
        subgraph AuthTables ["🔐 Auth & Security Storage"]
            UsersTable[("users\n• UUID\n• Argon2id Hashes")]
            BlacklistTable[("token_blacklist\n• Revoked JWTs")]
            ResetsTable[("password_resets")]
        end
        subgraph CheckpointTables ["💾 StateSaver & History Storage"]
            CKPTTable[("checkpoints & blobs\n(StateGraph Snapshots)")]
            WritesTable[("checkpoint_writes\n(Pending Transitions)")]
            ChatTable[("portfolio_chat_history\n(Turn Memory)")]
        end
        NeonPooler --> AuthTables
        NeonPooler --> CheckpointTables
    end

    subgraph ExternalServices ["🌐 External Cloud Registries & Mesh"]
        direction TB
        HFHub[("🤗 Hugging Face Hub\n(Brand Checkpoints)")]
        Pinecone[("🌲 Pinecone Vector DB\n(hpvdb-openai)")]
        LiveKitMesh[("📡 LiveKit Cloud\n(WebRTC Audio SFU)")]
        GroqLLM[("⚡ Groq Inference\n(Llama-3.3-70B)")]
    end

    %% Key Interconnections
    GHA -->|"Automated Deploy"| VercelEdge
    AuthGuard <==>|"1. Verify Credentials & Blacklist"| AuthTables
    AuthGuard -->|"2. Forward Authenticated Request"| StateEngine
    StateEngine <==>|"3. AsyncPostgresSaver Checkpointing"| CheckpointTables
    Harry <-->|"Vector Search"| Pinecone
    StateEngine <-->|"Token Stream"| GroqLLM
    Lifespan -.->|"Startup Sync"| HFHub
    Voice <-->|"WebRTC Stream"| LiveKitMesh
```

---

### 🔐 2. Authentication & JWT Security Lifecycle with PostgreSQL

Every authenticated request undergoes strict verification against **Neon PostgreSQL**:

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 Client (Browser)
    participant Edge as ▲ Vercel Gateway
    participant Auth as 🛡️ Auth Middleware
    participant NeonAuth as 🐘 Neon: users & blacklist
    participant Agent as 🧠 LangGraph Agents

    Note over User,NeonAuth: Registration & Login Flow
    User->>Edge: POST /api/auth/signup (email, password)
    Edge->>Auth: Hash password (Argon2id)
    Auth->>NeonAuth: INSERT INTO users (id, email, hashed_password)
    NeonAuth-->>Auth: User Created
    Auth-->>User: Return Signed JWT Bearer Token

    Note over User,Agent: Guarded AI Request Flow
    User->>Edge: POST /api/harry/ask (Bearer Token)
    Edge->>Auth: Decode & Verify Signature
    Auth->>NeonAuth: SELECT 1 FROM token_blacklist WHERE token_hash = ?
    alt Token is Blacklisted / Revoked
        NeonAuth-->>Auth: Token Found on Blacklist
        Auth-->>User: 401 Unauthorized (Token revoked)
    else Token is Valid
        NeonAuth-->>Auth: Token Not Blacklisted
        Auth->>Agent: Dispatch Request with authenticated user_id
        Agent-->>User: Stream Response
    end

    Note over User,NeonAuth: Logout & Revocation Flow
    User->>Edge: POST /api/auth/logout (Bearer Token)
    Edge->>Auth: Extract JWT jti & hash
    Auth->>NeonAuth: INSERT INTO token_blacklist (token_hash, expires_at)
    NeonAuth-->>Auth: Blacklisted
    Auth-->>User: 200 OK (Session terminated)
```

---

### 💾 3. LangGraph State Checkpointing Flow with `AsyncPostgresSaver`

Conversational state and execution history persist across stateless Vercel Serverless invocations using **LangGraph's PostgreSQL Checkpointer**:

```mermaid
sequenceDiagram
    autonumber
    actor User as 👤 User
    participant API as ⚡ FastAPI Runtime
    participant Saver as 💾 AsyncPostgresSaver
    participant NeonCKPT as 🐘 Neon: checkpoints & history
    participant Graph as 🧠 StateGraph Nodes
    participant Tool as 🔌 Tools (Pinecone / MCP)

    User->>API: POST /api/{agent}/ask (thread_id, query)
    API->>Saver: aget_tuple(config={"configurable": {"thread_id": id}})
    Saver->>NeonCKPT: SELECT * FROM checkpoints WHERE thread_id = id ORDER BY step DESC LIMIT 1
    NeonCKPT-->>Saver: Return serialized Checkpoint & Blobs
    Saver-->>API: Rehydrated StateGraph Memory
    
    API->>Graph: Execute Agent Nodes (State, User Query)
    Graph->>Tool: Execute Tool (Pinecone 8.9k chunks / MCP Airbnb)
    Tool-->>Graph: Tool Results & Context
    Graph->>API: State Delta (New Messages, Node Output)

    par Asynchronous Checkpoint Commit
        API->>Saver: aput(config, checkpoint, metadata)
        Saver->>NeonCKPT: INSERT INTO checkpoints, checkpoint_blobs, checkpoint_writes
        API->>NeonCKPT: INSERT INTO portfolio_chat_history (session_id, role, content)
    and Real-Time Client Stream
        API-->>User: Stream Server-Sent Events (SSE: data: {"token": "..."})
    end
```

---

### 🐙 4. CI/CD & Automated Delivery Pipeline (GitHub Actions → Vercel)

```mermaid
flowchart LR
    subgraph Development ["💻 Local Development"]
        Dev["Developer Commit"]
        GitPush["git push origin main"]
        Dev --> GitPush
    end

    subgraph GHA ["🐙 GitHub Actions Pipeline"]
        direction TB
        Checkout["actions/checkout@v4"]
        PythonEnv["actions/setup-python@v5\n(Python 3.12)"]
        UVLock["Verify uv.lock &\nDependencies"]
        LintTest["Run Integration Tests\n(test_postgres_auth.py)"]
        DeployTrigger["Deploy Webhook Trigger"]
        Checkout --> PythonEnv --> UVLock --> LintTest --> DeployTrigger
    end

    subgraph VercelPipeline ["▲ Vercel Cloud Production"]
        direction TB
        Build["Build Serverless Lambdas\n(Python Bytecode Optimize)"]
        EnvInject["Inject Neon & HF Secrets\n(DATABASE_URL, HF_TOKEN)"]
        CDNPublish["Publish Global Edge CDN\n(portfolio-agent-ai.vercel.app)"]
        Build --> EnvInject --> CDNPublish
    end

    GitPush --> Checkout
    DeployTrigger --> Build
```

---

### 🛠️ 5. Technology Stack & Component Mapping

| Architectural Layer | Technologies & Skill-Icons | Implementation Role |
| :--- | :--- | :--- |
| **CI/CD & Delivery** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=githubactions,git,github" height="28" alt="CI/CD" /></a> | Automated linting, test suite execution, dependency locking (`uv.lock`), and Vercel edge deployment webhooks. |
| **Cloud Edge & Hosting** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=vercel,aws,cloudflare" height="28" alt="Hosting" /></a> | Global edge CDN, zero-config TLS termination, serverless compute (AWS `iad1`), and Cloudflare tunneling. |
| **Gateway & Application** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=fastapi,python,docker,linux" height="28" alt="Backend" /></a> | FastAPI 0.115 async runtime, lifespan startup hooks, SSE token streaming, and Docker Compose orchestration. |
| **Database & Persistence** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=postgres" height="28" alt="PostgreSQL" /></a> &bull; **Neon Serverless** | Standalone Lakebase Postgres with PgBouncer connection pooling (`psycopg_pool`), Argon2id auth, and LangGraph checkpoints. |
| **Deep Learning & Models** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=pytorch,tensorflow" height="28" alt="ML" /></a> &bull; **Hugging Face Hub** | Transfer Learning (Xception, InceptionV3, MobileNetV2, EfficientNet-B0), YOLOv8, and dynamic startup checkpoint download. |
| **Presentation Layer** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=html,css,js,ts" height="28" alt="Frontend" /></a> | Decoupled SPA, Obsidian/Streamlit design system, WebSockets, SSE event handlers, and responsive CSS variables. |
| **Vector Search & MCP** | <a href="https://skillicons.dev"><img src="https://skillicons.dev/icons?i=nodejs" height="28" alt="Tools" /></a> &bull; **Pinecone DB** | 8,970 vector chunks in `hpvdb-openai` index, Neural Cross-Encoder Reranker, and Node.js Model Context Protocol stdio tools. |
| **Real-Time Voice Mesh** | **LiveKit Cloud** &bull; **WebRTC** | Full-duplex WebRTC audio streaming, Silero Voice Activity Detection (VAD), and Groq Whisper STT. |

---

### 🐘 6. Standalone Cloud Database Architecture: Neon Serverless Postgres

The PostgreSQL database hosting has been completely decoupled from the application and is deployed as a **standalone managed cloud service on Neon Serverless Postgres**:

1. **Physical Location & Co-location**:
   - The database resides on **Neon Cloud** in AWS region `us-east-1` (`iad1`), provisioned directly via Vercel Storage integration (`portfolio-db`).
   - Co-locating the database with Vercel's primary serverless compute region ensures single-digit millisecond query latencies.

2. **Decoupled Service vs. Bundled Container**:
   - PostgreSQL is **not** hosted alongside the application container or bundled in serverless Lambdas.
   - User credentials, session tokens, and LangGraph multi-turn conversation states persist permanently across redeployments, branch previews, and cold starts.
   - Leverages Neon's autoscaling and instant scale-to-zero compute to optimize cloud resources.

3. **Connection Pooling & PgBouncer Compatibility**:
   - Interacts via `psycopg` (v3) and `psycopg_pool.AsyncConnectionPool` over encrypted TLS (`sslmode=require&channel_binding=require`).
   - Configured with `prepare_threshold=None` in async connection parameters to ensure seamless operation with Neon's PgBouncer transaction pooler, avoiding prepared statement collisions.

4. **Environment Variable Ingestion**:
   - Automatically ingests standard Vercel environment variables:
     - `DATABASE_URL` / `POSTGRES_URL`: Pooled connection string for transaction queries.
     - `DATABASE_URL_UNPOOLED` / `POSTGRES_URL_NON_POOLING`: Direct connection for schema migrations and table initialization.
     - `POSTGRES_HOST`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DATABASE`.

5. **Dual Persistence Abstractions**:
   - **Authentication Database (`auth_db_manager`)**:
     - Manages `users` table with Argon2id password hashing (`$argon2id$...`).
     - Manages `token_blacklist` for immediate cryptographic JWT invalidation on logout.
     - Manages `password_reset_tokens` with automatic time-based expiry.
   - **LangGraph Checkpoint & History Manager (`db_manager`)**:
     - Drives `AsyncPostgresSaver` to save agent graph execution state (`checkpoints`, `checkpoint_blobs`, `checkpoint_writes`, `checkpoint_migrations`).
     - Maintains conversational memory via `portfolio_chat_history` matching the `PostgresChatMessageHistory` interface.
   - **Resilient Fallback**: If running offline without database environment variables, the system automatically falls back to in-memory stores (`MemorySaver`) without crashing.

---

## 🧩 Key AI Features & Capabilities

| Feature | Tech Stack | Description |
| :--- | :--- | :--- |
| **🪄 Harry Potter Lore Scholar** | LangGraph, Pinecone (`hpvdb-openai`), Groq | RAG agent querying 8,970 vector chunks with comparative Indian Epics synthesis and dedicated session history. |
| **🏡 MCP Tour Planner** | LangGraph, Airbnb MCP Server, Open-Meteo | Live Airbnb stay rate lookup and 3-day weather forecasts streamed token-by-token via Server-Sent Events (SSE). |
| **🐘 Neon Checkpointing & Auth** | LangGraph `AsyncPostgresSaver`, Neon Postgres | Real-time thread state serialization, persistent multi-turn memory, and Argon2id session authentication. |
| **🤗 HF Dynamic Checkpoints** | Hugging Face Hub, `huggingface_hub` | Dynamic lifespan startup synchronization of deep learning weights (.ckpt, .pt) keeping repo lightweight. |
| **🛡️ JWT Authentication Guard** | FastAPI, PyJWT, Argon2id | Strict authentication gating on all AI agent endpoints; public access limited strictly to Home. |
| **📈 Stock Screener & Valuation** | Pandas, Technical Analysis, Valuation Models | 20-DMA volume breakout scanner across Nifty 500/Microcap 250 with automated institutional research reports. |
| **👁️ Vision AI & YOLO Detection** | PyTorch, YOLOv8, Timm | 27-brand corporate logo neural classification with real-time bounding-box coordinates overlay. |
| **🐙 2D Clustering Sandbox** | Scikit-Learn, Plotly.js | Interactive 2D spatial canvas with real-time K-Means, DBSCAN, and Silhouette Coefficient evaluation. |
| **🎙️ Voice AI Agent** | LiveKit WebRTC, Groq Whisper, Silero VAD | Low-latency full-duplex conversational voice agent with live audio waveform visualization. |

---



## 📡 Core API Specification

| Domain | Method | Endpoint | Auth | Description |
| :--- | :---: | :--- | :---: | :--- |
| **System** | `GET` | `/api/system/health` | Public | System status and checkpointer mode. |
| **Auth** | `POST` | `/api/auth/signup` | Public | Register new user account. |
| **Auth** | `POST` | `/api/auth/login` | Public | Authenticate and issue JWT Bearer token. |
| **Auth** | `GET` | `/api/auth/me` | 🔒 Bearer | Fetch authenticated user profile. |
| **Auth** | `POST` | `/api/auth/logout` | 🔒 Bearer | Revoke token and add to PostgreSQL blacklist. |
| **Chat** | `GET` | `/api/chat/threads/{id}/history` | 🔒 Bearer | Retrieve thread chat history. |
| **Chat** | `DELETE`| `/api/chat/threads/{id}` | 🔒 Bearer | Delete thread history and checkpoints. |
| **Harry Potter** | `POST` | `/api/harry/ask` | 🔒 Bearer | Lore query with Pinecone retrieval. |
| **Harry Potter** | `GET` | `/api/harry/ask/stream` | 🔒 Bearer | Real-time SSE token stream. |
| **Tour Planner** | `POST` | `/api/tour/plan` | 🔒 Bearer | Airbnb accommodations and travel plan. |
| **Tour Planner** | `GET` | `/api/tour/stream` | 🔒 Bearer | Real-time SSE streaming with MCP tools. |
| **Stock Screener** | `POST` | `/api/stock/scan` | 🔒 Bearer | Volume breakout equity scanner. |
| **Stock Screener** | `GET` | `/api/stock/report` | 🔒 Bearer | Institutional valuation report. |
| **Vision Studio** | `POST` | `/api/vision/classify` | 🔒 Bearer | 27-brand logo classification. |
| **Vision Studio** | `POST` | `/api/vision/yolo` | 🔒 Bearer | YOLO logo bounding box detection. |
| **Clustering** | `POST` | `/api/cluster/run` | 🔒 Bearer | K-Means & DBSCAN with Silhouette scores. |
| **Voice Agent** | `GET` | `/api/voice/status` | 🔒 Bearer | LiveKit room tokens and agent readiness. |

---

## 🚀 Quickstart

### Option A: Docker Compose (Full Stack)

```bash
git clone https://github.com/ambideXtrous9/portfolio-agent.git
cd portfolio-agent
cp .env.example .env

docker compose up -d --build
```

* **Frontend**: `http://localhost:3000`
* **FastAPI Backend**: `http://localhost:8000`
* **API Docs**: `http://localhost:8000/docs`
* **Database**: Standalone Neon Serverless Postgres (`DATABASE_URL` in `.env`)

---

### Option B: Local Python Development

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env

python run.py
```

---

## 🧪 Integration Verification

Run the end-to-end integration test suite verifying authentication gating, PostgreSQL checkpointing, session isolation, and token blacklisting:

```bash
python3 backend/tests/test_postgres_auth.py
```

> **Result**: 11/11 tests passing (Health, 401 Unauthorized Gating, Signup, Login, Profile, Bearer Auth, Query Token, Chat History, Logout & Revocation).

---

## 📂 Repository Layout

```
portfolio-agent/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application & lifespan management
│   │   ├── config.py                   # Pydantic Settings
│   │   ├── core/                       # Auth, DB, LLM factory, MCP client
│   │   ├── schemas/                    # Pydantic validation models
│   │   └── api/endpoints/              # Auth-guarded feature endpoints
│   └── tests/test_postgres_auth.py     # Integration test suite
├── frontend/
│   ├── index.html                      # SPA interface with dedicated chat sidebars
│   ├── css/style.css                   # Streamlit & Obsidian design system
│   ├── js/                             # Authenticated API client & agent view modules
│   └── assets/images/                  # Hero banner, graphs, diagrams
├── docker-compose.yml                  # 3-tier production stack
└── run.py                              # Local dev runner
```

---

## 📄 License & Author

Distributed under the **MIT License**.

* **Author**: Sushovan Saha ([@ambideXtrous9](https://github.com/ambideXtrous9))
* **Repository**: [github.com/ambideXtrous9/portfolio-agent](https://github.com/ambideXtrous9/portfolio-agent)
