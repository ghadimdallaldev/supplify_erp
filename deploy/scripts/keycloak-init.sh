#!/usr/bin/env bash
# Post-boot Keycloak setup: import realm (if missing), SSL policy, client redirect URIs.
# Used by deploy/docker-compose.{dev,staging,prod}.yml keycloak-init service.
set -euo pipefail

KEYCLOAK_SERVER="${KEYCLOAK_SERVER:-http://keycloak:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"
PUBLIC_URL="${PUBLIC_URL:-http://localhost}"
REALM_IMPORT="${REALM_IMPORT:-/import/realm-export.json}"

echo "Waiting for Keycloak admin API at ${KEYCLOAK_SERVER}..."
for i in $(seq 1 90); do
  if /opt/keycloak/bin/kcadm.sh config credentials \
    --server "$KEYCLOAK_SERVER" \
    --realm master \
    --user "$KEYCLOAK_ADMIN" \
    --password "$KEYCLOAK_ADMIN_PASSWORD" >/dev/null 2>&1; then
    echo "Keycloak ready"
    break
  fi
  if [ "$i" -eq 90 ]; then
    echo "Timeout waiting for Keycloak"
    exit 1
  fi
  sleep 2
done

if ! /opt/keycloak/bin/kcadm.sh get realms/Supplify >/dev/null 2>&1; then
  /opt/keycloak/bin/kcadm.sh create realms -f "$REALM_IMPORT"
  echo "Realm Supplify created"
else
  echo "Realm Supplify already exists"
fi

# EC2/dev over HTTP needs sslRequired=none; HTTPS production uses external.
if [[ "$PUBLIC_URL" == https://* ]]; then
  SSL_REQUIRED="external"
elif [[ "$PUBLIC_URL" == "http://localhost" ]] || [[ "$PUBLIC_URL" == http://localhost:* ]]; then
  SSL_REQUIRED="external"
else
  SSL_REQUIRED="none"
fi

/opt/keycloak/bin/kcadm.sh update realms/Supplify \
  -s "sslRequired=${SSL_REQUIRED}" \
  -s "registrationAllowed=true" \
  -s "loginWithEmailAllowed=true"
echo "Realm sslRequired=${SSL_REQUIRED} registrationAllowed=true (PUBLIC_URL=${PUBLIC_URL})"

get_client_uuid() {
  /opt/keycloak/bin/kcadm.sh get clients -r Supplify -q "clientId=$1" --fields id 2>/dev/null \
    | sed -n 's/.*"id" *: *"\([^"]*\)".*/\1/p' | head -1
}

update_client_redirects() {
  local client_id="$1"
  local uuid
  uuid="$(get_client_uuid "$client_id")"
  if [ -z "$uuid" ]; then
    echo "WARN: client ${client_id} not found in realm Supplify"
    return 0
  fi
  /opt/keycloak/bin/kcadm.sh update "clients/${uuid}" -r Supplify \
    -s "redirectUris=[\"${PUBLIC_URL}/auth/callback\",\"${PUBLIC_URL}/*\",\"http://localhost/auth/callback\",\"http://localhost/*\",\"http://localhost:5173/*\"]" \
    -s "webOrigins=[\"${PUBLIC_URL}\",\"http://localhost\",\"http://localhost:5173\"]"
  echo "Updated ${client_id} redirect URIs for ${PUBLIC_URL}"
}

if [ -n "$PUBLIC_URL" ] && [ "$PUBLIC_URL" != "http://localhost" ]; then
  update_client_redirects "supplify-api"
  update_client_redirects "supplify-web"
fi
