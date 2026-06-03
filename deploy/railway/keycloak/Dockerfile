# Keycloak — Railway (all environments). Build context = repository root.
# Realm JSON is copied for `start-dev|start --import-realm` (imports only if realm not in DB).
FROM quay.io/keycloak/keycloak:24.0

ARG REALM_EXPORT_FILE=deploy/keycloak/realm-export.json
ARG REALM_IMPORT_FILENAME=Supplify-realm.json
ARG KC_PRODUCTION=false

ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=true
ENV KC_DB=postgres

COPY ${REALM_EXPORT_FILE} /opt/keycloak/data/import/${REALM_IMPORT_FILENAME}
RUN test -s "/opt/keycloak/data/import/${REALM_IMPORT_FILENAME}"

RUN if [ "$KC_PRODUCTION" = "true" ]; then /opt/keycloak/bin/kc.sh build; fi

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
