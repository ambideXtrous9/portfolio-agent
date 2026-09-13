"""Portfolio and Profile API endpoints."""

import httpx
from fastapi import APIRouter
from backend.app.schemas.portfolio import ProfileResponse, GitHubStatsResponse, SkillCategory

router = APIRouter(prefix="/portfolio", tags=["Portfolio"])


@router.get("/profile", response_model=ProfileResponse)
async def get_profile():
    """Returns developer profile, biography, and technology skills."""
    return ProfileResponse(
        name="Sushovan Saha",
        role="Founding AI/ML Engineer",
        tagline="Founding AI/ML Engineer at stealth startup | Ex-Founding Engineer @ DSW | M.Tech Data Science @ IIT Guwahati",
        education="M.Tech in Data Science, IIT Guwahati (2022 – 2024)",
        bio=(
            "Founding AI/ML Engineer with hands-on expertise building production agentic AI systems, "
            "voice AI assistants, and enterprise ML pipelines. Kaggle Notebooks Expert with 4x Silver medals. "
            "Specialized in LLM orchestration, Model Context Protocol (MCP), and real-time inference."
        ),
        skills=[
            SkillCategory(
                category="LLMs & Generative AI",
                items=["Agentic Workflows", "LangChain & LangGraph", "Multi-Server MCP", "RAG & Vector Retrieval", "Prompt Engineering"]
            ),
            SkillCategory(
                category="Voice Agents & Audio AI",
                items=["LiveKit WebRTC", "Silero VAD", "Deepgram STT", "Cartesia Sonic TTS", "Turn Detection"]
            ),
            SkillCategory(
                category="Fine-Tuning & Alignment",
                items=["Unsloth", "LoRA & QLoRA", "SFT & GRPO", "Qwen2.5 / Qwen3.5 4B", "HuggingFace PEFT"]
            ),
            SkillCategory(
                category="Applied ML & Deep Learning",
                items=["PyTorch", "PyTorch Lightning", "Vision Transformers (ViT)", "YOLO Object Detection", "Scikit-Learn"]
            ),
            SkillCategory(
                category="Time Series & Forecasting",
                items=["ARIMA / SARIMA", "Prophet", "LSTM & GRU", "Chronos", "PatchTST"]
            ),
            SkillCategory(
                category="MLOps & Model Deployment",
                items=["MLFlow", "Pinecone Vector DB", "Docker", "Model Monitoring", "Vercel Serverless"]
            ),
            SkillCategory(
                category="Backend & APIs",
                items=["FastAPI", "Uvicorn", "REST & SSE", "WebSockets", "Pydantic v2"]
            ),
            SkillCategory(
                category="CI/CD & Cloud",
                items=["GitHub Actions", "Docker Hub", "AWS S3 / EC2", "GCP", "Vercel"]
            ),
            SkillCategory(
                category="Data Science & Analytics",
                items=["Pandas", "NumPy", "Plotly", "EDA", "Statistical Modeling"]
            )
        ],
        social_links={
            "linkedin": "https://www.linkedin.com/in/sushovan-saha-29a00a113",
            "github": "https://github.com/ambideXtrous9",
            "medium": "https://medium.com/@sushovansaha95",
            "kaggle": "https://www.kaggle.com/sushovansaha9"
        },
        technologies=[
            "Python", "PyTorch", "FastAPI", "LangChain", "LangGraph", "LiveKit",
            "Pinecone", "Unsloth", "Docker", "Linux", "Git", "HuggingFace", "YOLO", "Plotly"
        ]
    )


@router.get("/github", response_model=GitHubStatsResponse)
async def get_github_stats():
    """Fetches real-time GitHub stats for the user profile."""
    username = "ambideXtrous9"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                f"https://api.github.com/users/{username}",
                headers={"User-Agent": "FastAPI-Portfolio-App"}
            )
            if resp.status_code == 200:
                data = resp.json()
                return GitHubStatsResponse(
                    username=data.get("login", username),
                    name=data.get("name") or "Sushovan Saha",
                    public_repos=data.get("public_repos", 0),
                    followers=data.get("followers", 0),
                    following=data.get("following", 0),
                    avatar_url=data.get("avatar_url"),
                    html_url=data.get("html_url"),
                    bio=data.get("bio")
                )
    except Exception as e:
        print(f"GitHub API note: {e}")
        
    # Fallback response
    return GitHubStatsResponse(
        username=username,
        name="Sushovan Saha",
        public_repos=28,
        followers=15,
        following=20,
        html_url=f"https://github.com/{username}",
        bio="AI Engineer & ML Researcher"
    )
