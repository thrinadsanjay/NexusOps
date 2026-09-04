# Build the SPA in CI / `docker compose build`. Runtime is nginx only —
# Vite/esbuild at container start fails on Proxmox LXC (ENOTCONN on spawn).
FROM node:20-bookworm-slim AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --include=optional
COPY . .
# Leave empty so the image is host-agnostic; config.js + nginx /api proxy
# pick up VITE_API_BASE_URL / PUBLIC_HOST at container start.
ARG VITE_API_BASE_URL=
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL}
RUN npx vite build

FROM nginx:1.27-alpine

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.d/99-nexusops-config.sh /docker-entrypoint.d/99-nexusops-config.sh
RUN chmod +x /docker-entrypoint.d/99-nexusops-config.sh
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 5173
