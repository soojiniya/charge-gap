# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app/backend
COPY backend/requirements.docker.txt ./requirements.docker.txt
RUN python -m pip install --no-cache-dir -r requirements.docker.txt \
    && groupadd --gid 10001 chargegap \
    && useradd --uid 10001 --gid chargegap --no-create-home chargegap

COPY --chown=10001:10001 backend/chargegap_api/ ./chargegap_api/
# Data and chart metadata are supplied only by read-only Compose bind mounts.
USER 10001:10001
EXPOSE 5000
CMD ["waitress-serve", "--host=0.0.0.0", "--port=5000", "--threads=4", "--call", "chargegap_api:create_app"]
