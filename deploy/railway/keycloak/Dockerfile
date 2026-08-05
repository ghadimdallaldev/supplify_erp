# Keycloak — Railway (all environments). Build context = repository root.
# Realm JSON is copied for `start --import-realm` (imports only if realm not in DB).
# `kc.sh build --db=postgres` runs at image build time; entrypoint rebuilds if cache served H2.
# DB vendor + health/metrics are build-time options; JDBC URL/credentials are runtime (entrypoint).
#
# Keycloak 24 image has no microdnf/dnf — install psql via ubi-micro chroot (Keycloak docs).
# Keycloak 24 SPI jars are Java 17 bytecode; compile with JDK 17.
FROM maven:3.9-eclipse-temurin-17 AS email-otp-build
COPY deploy/keycloak/providers/email-otp /workspace
RUN mvn -q -f /workspace/pom.xml -DskipTests package

FROM registry.access.redhat.com/ubi9 AS ubi-micro-build
RUN mkdir -p /mnt/rootfs \
  && dnf install --installroot /mnt/rootfs postgresql \
       --releasever 9 --setopt install_weak_deps=false --nodocs -y \
  && dnf --installroot /mnt/rootfs clean all \
  && rpm --root /mnt/rootfs -e --nodeps setup

FROM quay.io/keycloak/keycloak:24.0

ARG REALM_EXPORT_FILE=deploy/keycloak/realm-export.json
ARG REALM_IMPORT_FILENAME=Supplify-realm.json
# Build-time only; override per env via railway.json buildArgs.
ARG KC_METRICS_ENABLED=false
# Bump to invalidate Railway Docker layer cache when build logic changes.
ARG KEYCLOAK_BUILD_ID=postgres-v10-auth-history-guard

COPY ${REALM_EXPORT_FILE} /opt/keycloak/data/import/${REALM_IMPORT_FILENAME}
COPY --from=email-otp-build /workspace/target/email-otp-1.0.0.jar /opt/keycloak/providers/email-otp.jar
RUN test -s "/opt/keycloak/data/import/${REALM_IMPORT_FILENAME}" && test -s /opt/keycloak/providers/email-otp.jar

COPY deploy/railway/keycloak/railway-entrypoint.sh /opt/keycloak/bin/railway-entrypoint.sh

USER root
COPY --from=ubi-micro-build /mnt/rootfs /
RUN chmod +x /opt/keycloak/bin/railway-entrypoint.sh
USER 1000

# kc.db is fixed at build time. Without --db=postgres the optimized image defaults to H2.
# Do not grep keycloak.conf — Keycloak 24 persists build options separately; build exit code is authoritative.
RUN echo "Keycloak build id: ${KEYCLOAK_BUILD_ID}" \
  && /opt/keycloak/bin/kc.sh build \
       --db=postgres \
       --health-enabled=true \
       --metrics-enabled="${KC_METRICS_ENABLED}" \
  && echo "Keycloak postgres build complete"

ENTRYPOINT ["/opt/keycloak/bin/railway-entrypoint.sh"]
