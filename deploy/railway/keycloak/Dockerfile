# Keycloak — Railway (all environments). Build context = repository root.
# Realm JSON is copied for `start --import-realm` (imports only if realm not in DB).
# When KC_PRODUCTION=true, `kc.sh build --db=postgres` runs at image build time.
# DB vendor + health/metrics are build-time options; JDBC URL/credentials are runtime (entrypoint).
#
# Keycloak 24 image has no microdnf/dnf — install psql via ubi-micro chroot (Keycloak docs).
FROM registry.access.redhat.com/ubi9 AS ubi-micro-build
RUN mkdir -p /mnt/rootfs \
  && dnf install --installroot /mnt/rootfs postgresql \
       --releasever 9 --setopt install_weak_deps=false --nodocs -y \
  && dnf --installroot /mnt/rootfs clean all \
  && rpm --root /mnt/rootfs -e --nodeps setup

FROM quay.io/keycloak/keycloak:24.0

ARG REALM_EXPORT_FILE=deploy/keycloak/realm-export.json
ARG REALM_IMPORT_FILENAME=Supplify-realm.json
ARG KC_PRODUCTION=false
# Build-time only in optimized mode; override per env via railway.json buildArgs.
ARG KC_METRICS_ENABLED=true

COPY ${REALM_EXPORT_FILE} /opt/keycloak/data/import/${REALM_IMPORT_FILENAME}
RUN test -s "/opt/keycloak/data/import/${REALM_IMPORT_FILENAME}"

COPY deploy/railway/keycloak/railway-entrypoint.sh /opt/keycloak/bin/railway-entrypoint.sh

USER root
COPY --from=ubi-micro-build /mnt/rootfs /
RUN chmod +x /opt/keycloak/bin/railway-entrypoint.sh
USER 1000

# kc.db, kc.health-enabled, kc.metrics-enabled are fixed at build time — must use CLI flags, not runtime env.
# Without --db=postgres the optimized image defaults to H2 and rejects jdbc:postgresql:// at runtime.
RUN if [ "$KC_PRODUCTION" = "true" ]; then \
      /opt/keycloak/bin/kc.sh build \
        --db=postgres \
        --health-enabled=true \
        --metrics-enabled="${KC_METRICS_ENABLED}"; \
    fi

ENTRYPOINT ["/opt/keycloak/bin/railway-entrypoint.sh"]
