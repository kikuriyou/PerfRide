FROM python:3.13-slim

WORKDIR /app

# Install uv
COPY --from=ghcr.io/astral-sh/uv:0.7 /uv /usr/local/bin/uv

# Copy dependency files
COPY pyproject.toml uv.lock* ./

# Install dependencies
RUN uv sync --frozen --no-dev 2>/dev/null || uv sync --no-dev

# Copy source code
COPY src/ ./src/
COPY knowledge/ ./knowledge/

ENV PYTHONPATH=/app/src

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "recommend_agent.main:app", "--host", "0.0.0.0", "--port", "8000"]
