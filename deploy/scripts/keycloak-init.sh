#!/usr/bin/env bash
# Post-boot Keycloak setup: import realm (if missing), SSL policy, client redirect URIs.
# Used by deploy/docker-compose.{dev,staging,prod}.yml keycloak-init service.
set -euo pipefail

KEYCLOAK_SERVER="${KEYCLOAK_SERVER:-http://keycloak:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:?KEYCLOAK_ADMIN_PASSWORD is required}"
PUBLIC_URL="${PUBLIC_URL:-http://localhost}"
WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:5173}"
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

# Local/dev over HTTP needs sslRequired=none; HTTPS production uses external.
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

# Keycloak 19+ validates post_logout_redirect_uri against post.logout.redirect.uris (## separator).
build_post_logout_uris() {
  local uris="${PUBLIC_URL}/login##${PUBLIC_URL}/*"
  uris="${uris}##${WEB_ORIGIN}/login##${WEB_ORIGIN}/*"
  uris="${uris}##http://localhost:5173/login##http://localhost:5173/*"
  uris="${uris}##http://localhost:4000/login##http://localhost:4000/*"
  uris="${uris}##http://localhost/login##http://localhost/*"
  echo "$uris"
}

update_client_oidc() {
  local client_id="$1"
  local uuid
  uuid="$(get_client_uuid "$client_id")"
  if [ -z "$uuid" ]; then
    echo "WARN: client ${client_id} not found in realm Supplify"
    return 0
  fi
  local post_logout patch_file
  post_logout="$(build_post_logout_uris)"
  /opt/keycloak/bin/kcadm.sh update "clients/${uuid}" -r Supplify \
    -s "redirectUris=[\"${PUBLIC_URL}/auth/callback\",\"${PUBLIC_URL}/*\",\"http://localhost/auth/callback\",\"http://localhost/*\",\"http://localhost:5173/*\"]" \
    -s "webOrigins=[\"${PUBLIC_URL}\",\"http://localhost\",\"http://localhost:5173\"]"
  # kcadm -s does not apply nested attributes; use a JSON partial update (Keycloak 19+).
  patch_file="/tmp/kc-post-logout-${client_id}.json"
  cat >"${patch_file}" <<EOF
{
  "attributes": {
    "post.logout.redirect.uris": "${post_logout}"
  }
}
EOF
  /opt/keycloak/bin/kcadm.sh update "clients/${uuid}" -r Supplify -f "${patch_file}"
  if [ "$client_id" = "supplify-api" ]; then
    /opt/keycloak/bin/kcadm.sh update "clients/${uuid}" -r Supplify -s directAccessGrantsEnabled=true
    echo "Enabled direct access grants on supplify-api (invite signup login)"
  fi
  echo "Updated ${client_id} redirect and post-logout URIs (PUBLIC_URL=${PUBLIC_URL}, WEB_ORIGIN=${WEB_ORIGIN})"
}

update_client_oidc "supplify-api"
update_client_oidc "supplify-web"

update_client_mobile() {
  local uuid
  uuid="$(get_client_uuid "supplify-mobile")"
  if [ -z "$uuid" ]; then
    echo "WARN: client supplify-mobile not found in realm Supplify"
    return 0
  fi
  /opt/keycloak/bin/kcadm.sh update "clients/${uuid}" -r Supplify \
    -s 'redirectUris=["supplify://auth/callback","exp://127.0.0.1:8081/--/auth/callback","exp://localhost:8081/--/auth/callback","http://localhost:8081/auth/callback","http://127.0.0.1:8081/auth/callback","http://localhost:8081/*","http://127.0.0.1:8081/*"]' \
    -s 'webOrigins=["+"]' \
    -s standardFlowEnabled=true \
    -s directAccessGrantsEnabled=false
  patch_file="/tmp/kc-post-logout-supplify-mobile.json"
  cat >"${patch_file}" <<EOF
{
  "attributes": {
    "pkce.code.challenge.method": "S256",
    "post.logout.redirect.uris": "supplify://auth/logout"
  }
}
EOF
  /opt/keycloak/bin/kcadm.sh update "clients/${uuid}" -r Supplify -f "${patch_file}"
  echo "Updated supplify-mobile redirect URIs for Expo/native auth"
}

update_client_mobile
