#!/usr/bin/env bash
# Shared helpers sourced by deploy-dev.sh, deploy-staging.sh, deploy-prod.sh
set -euo pipefail

gen_secret() {
  openssl rand -hex 32 2>/dev/null \
    || head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'
}

install_docker() {
  if command -v docker >/dev/null 2>&1 && docker compose version >/dev/null 2>&1; then
    echo "Docker already installed — skipping."
    return
  fi
  echo "Installing Docker..."
  if command -v apt-get >/dev/null 2>&1; then
    apt-get update -y
    apt-get install -y ca-certificates curl git jq openssl
  elif command -v dnf >/dev/null 2>&1; then
    dnf install -y ca-certificates curl git jq openssl
  elif command -v yum >/dev/null 2>&1; then
    yum install -y ca-certificates curl git jq openssl
  fi
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
  if [ -n "${SUDO_USER:-}" ]; then
    usermod -aG docker "$SUDO_USER" || true
  fi
  docker compose version >/dev/null 2>&1 || {
    echo "ERROR: Docker Compose plugin not found after install."
    exit 1
  }
  echo "Docker installed."
}

ensure_swap() {
  if [ -f /swapfile ]; then
    echo "Swap already exists — skipping."
    return
  fi
  local ram_mb
  ram_mb=$(free -m 2>/dev/null | awk '/^Mem:/{print $2}' || echo "99999")
  if [ "$ram_mb" -lt 8192 ]; then
    echo "Creating 4G swap (RAM: ${ram_mb}MB)..."
    fallocate -l 4G /swapfile 2>/dev/null \
      || dd if=/dev/zero of=/swapfile bs=1M count=4096
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
    grep -q '/swapfile' /etc/fstab \
      || echo '/swapfile none swap sw 0 0' >> /etc/fstab
    echo "Swap created."
  fi
}

# wait_healthy CONTAINER_NAME [MAX_ATTEMPTS=60] [SLEEP_SECS=3]
wait_healthy() {
  local container="$1"
  local max="${2:-60}"
  local sleep_sec="${3:-3}"
  echo -n "Waiting for ${container} to be healthy"
  for i in $(seq 1 "$max"); do
    local status
    status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null || echo "")
    if [ "$status" = "healthy" ]; then
      echo " ✓"
      return 0
    fi
    echo -n "."
    sleep "$sleep_sec"
  done
  echo " TIMEOUT"
  echo "--- Last 20 log lines for ${container} ---"
  docker logs "$container" --tail=20 2>&1 || true
  return 1
}

# Merge VAPID keys from deploy/env/.env.vapid into the target env file (gitignored secrets file).
apply_vapid_env() {
  local env_file="$1"
  local vapid_file="${2:-${REPO_ROOT:-}/deploy/env/.env.vapid}"
  if [ ! -f "$vapid_file" ] || [ ! -f "$env_file" ]; then
    return 0
  fi
  set -a
  # shellcheck disable=SC1090
  source "$vapid_file"
  set +a
  for key in VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY VAPID_EMAIL; do
  eval "val=\${$key:-}"
    if [ -z "$val" ]; then
      continue
    fi
    if grep -q "^${key}=" "$env_file" 2>/dev/null; then
      sed -i "s|^${key}=.*|${key}=${val}|" "$env_file"
    else
      echo "${key}=${val}" >> "$env_file"
    fi
  done
  echo "  Applied VAPID keys from $(basename "$vapid_file") to $(basename "$env_file")"
}
