#!/bin/sh
set -e

PORT="${PORT:-80}"
export PORT

if [ -z "${API_UPSTREAM:-}" ] && [ -f /etc/supplify/web-build.env ]; then
  API_UPSTREAM="$(grep -E '^NGINX_API_UPSTREAM=' /etc/supplify/web-build.env | head -1 | cut -d= -f2- | tr -d '\r')"
  export API_UPSTREAM
fi

# Derive the API host (strip scheme + path) for the keepalive upstream + Host/SNI headers.
API_HOST=""
if [ -n "${API_UPSTREAM:-}" ]; then
  API_HOST="$(printf '%s' "$API_UPSTREAM" | sed -E 's#^[a-zA-Z]+://##; s#/.*$##')"
fi
export API_HOST

if [ -n "$API_HOST" ]; then
  envsubst '${API_HOST}' < /etc/supplify/proxy-api.conf.template > /etc/supplify/proxy-api.conf
  # Single-line upstream block (http context) with a keepalive connection pool.
  UPSTREAM_BLOCK="upstream supplify_api { server ${API_HOST}:443; keepalive 32; }"
else
  printf '%s\n' '# API proxy disabled (set NGINX_API_UPSTREAM or API_UPSTREAM)' > /etc/supplify/proxy-api.conf
  UPSTREAM_BLOCK=""
fi
export UPSTREAM_BLOCK

envsubst '${PORT} ${UPSTREAM_BLOCK}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
