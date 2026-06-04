#!/bin/sh
set -e

PORT="${PORT:-80}"
export PORT

if [ -z "${API_UPSTREAM:-}" ] && [ -f /etc/supplify/web-build.env ]; then
  API_UPSTREAM="$(grep -E '^NGINX_API_UPSTREAM=' /etc/supplify/web-build.env | head -1 | cut -d= -f2- | tr -d '\r')"
  export API_UPSTREAM
fi

if [ -n "${API_UPSTREAM:-}" ]; then
  envsubst '${API_UPSTREAM}' < /etc/supplify/proxy-api.conf.template > /etc/supplify/proxy-api.conf
else
  printf '%s\n' '# API proxy disabled (set NGINX_API_UPSTREAM or API_UPSTREAM)' > /etc/supplify/proxy-api.conf
fi

envsubst '${PORT}' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf
exec nginx -g 'daemon off;'
