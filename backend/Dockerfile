# vgAI backend — FastAPI served by uvicorn, dependencies resolved with uv.
#
# Two stages: the builder owns uv and the toolchain, the runtime gets only the
# finished virtualenv plus app/. Nothing here reads backend/.env — the container
# is configured through environment variables injected at run time (see
# docker-compose.yml's env_file), which is what keeps secrets out of the image.

# ---------------------------------------------------------------------------
# Stage 1 — build the virtualenv
# ---------------------------------------------------------------------------
FROM ghcr.io/astral-sh/uv:python3.13-bookworm-slim AS builder

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

WORKDIR /app

# Dependencies in their own layer, before any source is copied: editing a route
# then rebuilds in seconds instead of re-resolving the whole dependency tree.
# uv.lock is matched with a glob because it is currently gitignored (see
# awsdeployment.md §2) — with it present the build is reproducible, without it
# uv resolves fresh. Committing it is strongly recommended.
COPY pyproject.toml uv.lock* ./
RUN uv sync --no-dev --no-install-project

# README.md is required because pyproject.toml declares `readme = "README.md"`,
# which hatchling reads when it builds the project itself in the sync below.
COPY README.md ./
COPY app ./app
RUN uv sync --no-dev

# ---------------------------------------------------------------------------
# Stage 2 — runtime
# ---------------------------------------------------------------------------
FROM python:3.13-slim-bookworm AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/app/.venv/bin:$PATH" \
    UVICORN_WORKERS=2

# Run as a non-root user: nothing in this app needs root, and a container
# breakout costs a lot less from an unprivileged process.
RUN groupadd --system app && useradd --system --gid app --home-dir /app app

WORKDIR /app

COPY --from=builder --chown=app:app /app/.venv /app/.venv
COPY --from=builder --chown=app:app /app/app /app/app

USER app

EXPOSE 8000

# /health is defined in app/main.py. Uses Python rather than curl/wget because
# the slim image ships neither.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD ["python", "-c", "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/health', timeout=4).status == 200 else 1)"]

# Not `uv run dev` — that entrypoint enables --reload, which is a development
# feature (extra file-watcher processes, restarts on any touched file).
# UVICORN_WORKERS is read at start time, so worker count is tunable per host
# without rebuilding: set it in the root .env.
CMD ["sh", "-c", "exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS}"]
