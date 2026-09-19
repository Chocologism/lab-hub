# Resolve supported patch versions and pin both image digests at execution time.
ARG NODE_IMAGE
ARG PYTHON_IMAGE
FROM ${NODE_IMAGE} AS frontend_builder
WORKDIR /build/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM ${PYTHON_IMAGE}
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    LABHUB_DB_PATH=/app/data/labhub.db
WORKDIR /app
# The executor must generate and test this production lock first.
COPY backend/requirements-prod.lock /app/backend/requirements-prod.lock
RUN pip install --no-cache-dir -r /app/backend/requirements-prod.lock \
    && groupadd --gid 10001 labhub \
    && useradd --uid 10001 --gid 10001 --no-create-home labhub \
    && mkdir -p /app/data \
    && chown 10001:10001 /app/data
COPY --chown=10001:10001 backend/ /app/backend/
COPY --from=frontend_builder --chown=10001:10001 /build/frontend/dist/ /app/frontend/dist/
USER 10001:10001
EXPOSE 8000
# The only exposed host port is loopback; the shared network contains this app and Caddy.
CMD ["uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000", "--workers", "1", "--proxy-headers", "--forwarded-allow-ips", "*", "--no-access-log"]
