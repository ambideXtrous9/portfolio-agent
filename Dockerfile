# ==============================================================================
# BUILDER STAGE
# ==============================================================================
FROM python:3.12-slim AS builder

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    UV_HTTP_TIMEOUT=100

WORKDIR /app

# Install native build tools
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    pkg-config \
    libgl1 \
    libglib2.0-0t64 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && rm -rf /var/lib/apt/lists/*

# Install UV (fast Python package manager)
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uv/bin/

# Create virtual environment
RUN /uv/bin/uv venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"

# Copy requirements for optimal layer caching
COPY requirements.txt .

# Install CPU-optimized torch, torchvision and requirements
RUN /uv/bin/uv pip install --no-cache torch --index-url https://download.pytorch.org/whl/cpu && \
    /uv/bin/uv pip install --no-cache torchvision --index-url https://download.pytorch.org/whl/cpu && \
    /uv/bin/uv pip install --no-cache -r requirements.txt --extra-index-url https://download.pytorch.org/whl/cpu --index-strategy unsafe-best-match

# Clean virtual environment
RUN find /opt/venv -name '*.so' -type f -exec strip --strip-unneeded '{}' + 2>/dev/null || true && \
    find /opt/venv -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null && \
    find /opt/venv -name "*.pyc" -delete 2>/dev/null

# ==============================================================================
# RUNTIME STAGE
# ==============================================================================
FROM python:3.12-slim

ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PORT=8000 \
    HOST=0.0.0.0

WORKDIR /app

# Install runtime dependencies + Node.js 20.x & npm (for MCP stdio servers via npx)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    gnupg \
    libgl1 \
    libglib2.0-0t64 \
    libsm6 \
    libxext6 \
    libxrender1 \
    && mkdir -p /etc/apt/keyrings \
    && curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
    && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
    && apt-get update \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/* \
    && apt-get purge -y --auto-remove \
    && apt-get clean \
    && npm cache clean --force

# Verify Node.js and npx are available for MCP tools
RUN node -v && npx --version

# Pre-install MCP servers globally for fast cold starts (avoids runtime npm downloads)
RUN npm install -g @openbnb/mcp-server-airbnb @pinecone-database/mcp \
    && npm cache clean --force

# Copy virtual environment from builder
COPY --from=builder /opt/venv /opt/venv

# Copy application files (backend, frontend, run script)
COPY backend/ ./backend/
COPY frontend/ ./frontend/
COPY run.py .
COPY .env.example .

# Create non-root user and cache directory for security
RUN useradd -m -u 1000 appuser && \
    mkdir -p /home/appuser/.cache && \
    chown -R appuser:appuser /home/appuser /app

ENV HOME=/home/appuser

USER appuser

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --retries=3 --start-period=30s \
    CMD curl -f http://localhost:8000/api/system/health || exit 1

CMD ["python", "run.py"]
