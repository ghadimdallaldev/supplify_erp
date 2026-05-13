#!/bin/bash
# Idempotent: create the Supplify realm via Keycloak Admin API if it does not exist.
set -eu

KEYCLOAK_URL="${KEYCLOAK_URL:-http://keycloak:8080}"
KEYCLOAK_ADMIN="${KEYCLOAK_ADMIN:-admin}"
KEYCLOAK_ADMIN_PASSWORD="${KEYCLOAK_ADMIN_PASSWORD:-admin}"
KEYCLOAK_REALM="${KEYCLOAK_REALM:-Supplify}"
REALM_FILE="${REALM_FILE:-/import/realm-export.json}"
MAX_ATTEMPTS="${MAX_ATTEMPTS:-90}"

echo "==> Waiting for Keycloak at ${KEYCLOAK_URL} ..."
ready=0
i=1
while [ "$i" -le "$MAX_ATTEMPTS" ]; do
  if /opt/keycloak/bin/kcadm.sh config credentials \
    --server "${KEYCLOAK_URL}" \
    --realm master \
    --user "${KEYCLOAK_ADMIN}" \
    --password "${KEYCLOAK_ADMIN_PASSWORD}" >/dev/null 2>&1; then
    ready=1
    break
  fi
  sleep 2
  i=$((i + 1))
done

if [ "$ready" -ne 1 ]; then
  echo "ERROR: Keycloak did not become ready in time." >&2
  exit 1
fi

echo "==> Keycloak is ready."

if /opt/keycloak/bin/kcadm.sh get "realms/${KEYCLOAK_REALM}" >/dev/null 2>&1; then
  echo "==> Realm '${KEYCLOAK_REALM}' already exists - skipping import."
  exit 0
fi

echo "==> Creating realm '${KEYCLOAK_REALM}' from ${REALM_FILE} ..."
/opt/keycloak/bin/kcadm.sh create realms -f "${REALM_FILE}"
echo "==> Realm '${KEYCLOAK_REALM}' created successfully."
