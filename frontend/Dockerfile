# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS builder
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/index.html frontend/tsconfig.json frontend/vite.config.ts ./
COPY frontend/src/ ./src/
COPY frontend/public/ ./public/
# Relative API prefix is intentional: an empty value triggers the local :5000 fallback.
# No VITE_* secret, host .env or API collection key is passed into this build.
ENV VITE_API_BASE_URL=/backend
RUN npm run build

FROM nginx:stable-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/frontend/dist/ /usr/share/nginx/html/
EXPOSE 80
