#!/bin/sh
# Runtime API URL for the prebuilt SPA. Vite env vars are compile-time only.
# An empty apiBaseUrl means the browser calls /api on this origin (nginx proxy).
set -eu
API="${VITE_API_BASE_URL:-}"
API="${API%/}"
case "$API" in
  ""|http://localhost:*|https://localhost:*|http://127.0.0.1:*|https://127.0.0.1:*)
    API=""
    ;;
esac
escaped=$(printf '%s' "$API" | sed 's/\\/\\\\/g; s/"/\\"/g')
printf 'window.__NEXUSOPS_RUNTIME = { apiBaseUrl: "%s" };\n' "$escaped" > /usr/share/nginx/html/config.js
