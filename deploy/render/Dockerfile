# syntax=docker/dockerfile:1
FROM python:3.12-slim-bookworm
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 PIP_NO_CACHE_DIR=1 \
    OPENBLAS_NUM_THREADS=1 OMP_NUM_THREADS=1 MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 VECLIB_MAXIMUM_THREADS=1 BLIS_NUM_THREADS=1
WORKDIR /app/backend
COPY backend/requirements.docker.txt ./requirements.docker.txt
RUN pip install --no-cache-dir -r requirements.docker.txt \
    && groupadd --gid 10001 chargegap \
    && useradd --uid 10001 --gid chargegap --no-create-home chargegap \
    && mkdir -p /app/data/processed /app/reports /app/outputs/charts \
    && chown -R 10001:10001 /app/data /app/reports /app/outputs
COPY --chown=10001:10001 backend/chargegap_api/ ./chargegap_api/
COPY deploy/render/start.py deploy/render/download_data.py deploy/render/data-manifest.json /app/deploy/render/
USER 10001:10001
EXPOSE 10000
CMD ["python", "-B", "/app/deploy/render/start.py"]
