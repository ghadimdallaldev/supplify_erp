# Keycloak — Railway development (build context = repository root)
# Bakes realm import so `start-dev --import-realm` works without manual file upload.
FROM quay.io/keycloak/keycloak:24.0

COPY deploy/keycloak/realm-export.json /opt/keycloak/data/import/Supplify-realm.json

ENTRYPOINT ["/opt/keycloak/bin/kc.sh"]
CMD ["start-dev", "--import-realm"]
