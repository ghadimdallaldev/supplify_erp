# Keycloak — Railway (all environments). Build context = repository root.
# Realm JSON is copied for `start --import-realm` (imports only if realm not in DB).
# When KC_PRODUCTION=true, `kc.sh build` runs at image build time (no Quarkus rebuild on boot).
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
# Build-time only in optimized mode; override per env via railway.json buildArgs (dev: false).
ARG KC_METRICS_ENABLED=true

ENV KC_HEALTH_ENABLED=true
ENV KC_METRICS_ENABLED=${KC_METRICS_ENABLED}
ENV KC_DB=postgres

COPY ${REALM_EXPORT_FILE} /opt/keycloak/data/import/${REALM_IMPORT_FILENAME}
RUN test -s "/opt/keycloak/data/import/${REALM_IMPORT_FILENAME}"

COPY deploy/railway/keycloak/railway-entrypoint.sh /opt/keycloak/bin/railway-entrypoint.sh

USER root
COPY --from=ubi-micro-build /mnt/rootfs /
RUN chmod +x /opt/keycloak/bin/railway-entrypoint.sh
USER 1000

RUN if [ "$KC_PRODUCTION" = "true" ]; then /opt/keycloak/bin/kc.sh build; fi

ENTRYPOINT ["/opt/keycloak/bin/railway-entrypoint.sh"]
