#!/usr/bin/env sh
# Create MinIO buckets and optional public download policy (product images, logos).
# Used by docker minio-init and deploy scripts. Requires: mc, MINIO_ROOT_USER, MINIO_ROOT_PASSWORD.
set -eu

MINIO_ALIAS="${MINIO_ALIAS:-local}"
MINIO_URL="${MINIO_URL:-http://minio:9000}"
# Comma-separated list; defaults to primary S3_BUCKET
S3_BUCKETS="${S3_BUCKETS:-${S3_BUCKET:-supplify}}"
MINIO_PUBLIC_READ="${MINIO_PUBLIC_READ:-true}"

echo "MinIO init: alias=${MINIO_ALIAS} url=${MINIO_URL} buckets=${S3_BUCKETS}"

until mc alias set "${MINIO_ALIAS}" "${MINIO_URL}" "${MINIO_ROOT_USER}" "${MINIO_ROOT_PASSWORD}" 2>/dev/null; do
  echo "  waiting for MinIO..."
  sleep 2
done

# Split comma-separated bucket names (POSIX sh)
bucket_list=$(printf '%s' "${S3_BUCKETS}" | tr ',' ' ')

for bucket in ${bucket_list}; do
  bucket=$(printf '%s' "${bucket}" | tr -d ' ')
  [ -n "${bucket}" ] || continue

  mc mb "${MINIO_ALIAS}/${bucket}" --ignore-existing

  if [ "${MINIO_PUBLIC_READ}" = "true" ]; then
    mc anonymous set download "${MINIO_ALIAS}/${bucket}" || {
      echo "WARN: could not set public download on ${bucket}" >&2
    }
  fi

  mc ls "${MINIO_ALIAS}/${bucket}" >/dev/null
  echo "  bucket ready: ${bucket}"
done

echo "MinIO buckets initialized."
