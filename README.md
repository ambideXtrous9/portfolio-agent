# ambideXtrous · AI Portfolio & Multi-Agent Intelligence Hub

[![FastAPI](https://img.shields.io/badge/FastAPI-0.115+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.12+-blue)](https://www.python.org/)
[![Model Context Protocol](https://img.shields.io/badge/MCP-Unified%20MultiServer-purple)](https://modelcontextprotocol.io/)
[![Pinecone](https://img.shields.io/badge/Pinecone-hpvdb--openai-000000?logo=pinecone)](https://www.pinecone.io/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

A decoupled, production-grade **FastAPI Backend** and high-performance **Modern Single-Page Application (SPA)** showcasing cutting-edge Agentic AI, Multi-Server Model Context Protocol (MCP), Pinecone Vector Retrieval, Quantitative Equities Screener, and Vision AI.

---

## 🏗️ Decoupled Architecture

The repository provides full separation of concerns between backend services and the frontend client:

```
Streamlit-AI-Portfolio/
├── backend/
│   └── app/
│       ├── main.py                  # FastAPI entry point, CORS, static mounting
│       ├── config.py                # Environment & Pydantic settings
│       ├── core/
│       │   ├── llm.py               # Groq / OpenRouter LLM factory
│       │   └── mcp.py               # Unified MultiServerMCPClient (Airbnb & Pinecone)
│       ├── schemas/                 # Pydantic request & response schemas
│       └── api/
│           ├── router.py            # Master API router (/api/...)
│           └── endpoints/
│               ├── portfolio.py     # Profile, bio & live GitHub stats
│               ├── tour.py          # Airbnb MCP + Weather SSE streaming agent
│               ├── harry.py         # Harry Potter Lore & Mythology Pinecone MCP agent
│               ├── stock.py         # Breakout scanner & Institutional Equity report
│               ├── vision.py        # Image classification & YOLO logo detection
│               ├── cluster.py       # K-Means & DBSCAN clustering algorithms
│               └── health.py        # System health & MCP readiness
├── frontend/
│   ├── index.html                   # Responsive SPA with Sidebar & Tab Navigation
│   ├── css/
│   │   └── style.css                # Obsidian Dark Theme, glassmorphism & typography
│   ├── js/
│   │   ├── api.js                   # REST fetch & Server-Sent Events (SSE) client
│   │   ├── app.js                   # Application coordinator & tab router
│   │   ├── tour.js                  # Travel agent UI with live streaming tokens
│   │   ├── harry.js                 # Lore Scholar UI with comparative analysis
│   │   ├── stock.js                 # Equities screener & institutional report modal
│   │   ├── vision.js                # Vision AI Studio with dropzone & bounding boxes
│   │   └── cluster.js               # Interactive Plotly.js 2D clustering canvas
│   └── assets/images/               # Visual assets (thor.gif, boom.png, etc.)
├── legacy_streamlit/                # Archived Streamlit files & legacy notebooks
├── run.py                           # Single-command application launcher
├── requirements.txt                 # FastAPI, LangChain, MCP & ML dependencies
├── .env.example                     # Environment configuration template
└── README.md
```

---

## 📋 Key Modules & Features

### 1. 🏡 MCP Powered Tour Agent (`/api/tour/plan`, `/api/tour/stream`)
- **Unified MultiServerMCPClient**: Connects directly to `@openbnb/mcp-server-airbnb` using standard system Node/npx.
- **Meteorological Intelligence**: Live weather forecast and 3-day conditions via Open-Meteo geocoding and WeatherAPI.
- **Real-Time Streaming**: Tokens stream live to the frontend via Server-Sent Events (SSE).

### 2. 🪄 Harry Potter Lore Scholar (`/api/harry/ask`, `/api/harry/stream`)
- **Pinecone MCP Vector Search**: Semantic retrieval on the 8,970-vector canonical index `hpvdb-openai` using `@pinecone-database/mcp`.
- **Mythological Comparative Synthesis**: Explores philosophical archetypes between the Harry Potter universe and Indian Ancient Epics (Ramayana, Mahabharata, Dharma, Astras).
- **Critic Verification**: Automatic multi-node critique and refinement loop.

### 3. 📈 Stock Screener & Institutional Research (`/api/stock/scan`, `/api/stock/report`)
- **Volume Expansion Breakout**: Scans Nifty 500 and Nifty Microcap 250 for volume expansion (relative to 20-DMA) and price momentum.
- **Quantitative Indicators**: Real-time RSI(14), High/Low range, Moving Averages, and Volume Ratio.
- **Institutional Equity Report**: Wall Street-grade analyst research report modal generated dynamically.

### 4. 👁️ Vision AI Studio (`/api/vision/classify`, `/api/vision/yolo`)
- **Multi-Brand Classifier**: Neural network classifier recognizing 27 top corporate brands with confidence scores.
- **YOLO Logo Detection**: Object detection with bounding box annotations rendered onto uploaded images.

### 5. 🐙 Clustering Sandbox (`/api/cluster/dataset`, `/api/cluster/run`)
- **Interactive 2D Sandbox**: Concentric circle and noise benchmarks rendered via Plotly.js.
- **Algorithm Switch**: Real-time parameter tuning for K-Means (number of clusters) and DBSCAN (Epsilon and Min Samples) with Silhouette scores.

---

## 🛠️ Quickstart & Installation

### 1. Clone & Configure Environment
```bash
git clone https://github.com/ambideXtrous9/Streamlit-AI-Portfolio.git
cd Streamlit-AI-Portfolio

# Copy environment template
cp .env.example .env
# Fill in your GROQ_API_KEY and PINECONE_API_KEY in .env
```

### 2. Install Dependencies
```bash
pip install -r requirements.txt
```

### 3. Launch Application
```bash
python run.py
```

- **Frontend Application UI**: Open [http://localhost:8000](http://localhost:8000)
- **Interactive OpenAPI Documentation**: Open [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 🐳 Docker Deployment

You can build and deploy the entire multi-agent stack using Docker and Docker Compose:

### Using Docker Compose (Recommended)
```bash
# Start container in detached mode
docker compose up -d --build

# View real-time logs
docker compose logs -f

# Check container health status
docker compose ps

# Stop containers
docker compose down
```

### Using Plain Docker
```bash
# Build production image
docker build -t ambidextrous-ai-portfolio .

# Run container with environment file
docker run -d --name ambidextrous-ai-portfolio -p 8000:8000 --env-file .env ambidextrous-ai-portfolio
```

Access the application at [http://localhost:8000](http://localhost:8000).

---

## 🌐 Running Frontend Separately (Optional)

The frontend is completely decoupled. You can also run it using any static server:
```bash
cd frontend
python -m http.server 3000
# Open http://localhost:3000 (communicates with FastAPI backend on port 8000)
```

---

## 📄 License

This project is licensed under the MIT License.
