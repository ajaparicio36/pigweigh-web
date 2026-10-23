FROM ghcr.io/astral-sh/uv:0.10.4 AS uv
FROM python:3.13-slim
COPY --from=uv /uv /usr/local/bin/uv
WORKDIR /app
ENV UV_COMPILE_BYTECODE=1 UV_LINK_MODE=copy PYTHONUNBUFFERED=1
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project
COPY pigweigh ./pigweigh
COPY migrations ./migrations
COPY alembic.ini ./
COPY models ./models
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser
ENV PORT=8000 PIGWEIGH_MODEL_BUNDLE=/app/models/v1/manifest.json
CMD ["sh", "-c", "exec .venv/bin/uvicorn pigweigh.main:create_app --factory --host 0.0.0.0 --port \"$PORT\""]
