#!/usr/bin/env bash
# Bootstrap a fresh Amazon Linux 2023 / Ubuntu EC2 instance for Supplify.
# Run as root or with sudo:  curl -fsSL <raw-url> | sudo bash
# Or after cloning:         sudo ./deploy/ec2/bootstrap.sh

set -euo pipefail

REPO_DIR="${SUPPLIFY_DIR:-/opt/supplify}"
REPO_URL="${SUPPLIFY_REPO:-}"

echo "=== Supplify EC2 Bootstrap ==="

if command -v apt-get >/dev/null 2>&1; then
  apt-get update -y
  apt-get install -y ca-certificates curl git jq openssl
elif command -v dnf >/dev/null 2>&1; then
  dnf install -y ca-certificates curl git jq openssl
elif command -v yum >/dev/null 2>&1; then
  yum install -y ca-certificates curl git jq openssl
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "Installing Docker..."
  curl -fsSL https://get.docker.com | sh
  systemctl enable docker
  systemctl start docker
fi

if [ -n "${SUDO_USER:-}" ]; then
  usermod -aG docker "$SUDO_USER" || true
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose plugin not found — install Docker CE latest from get.docker.com"
  exit 1
fi

if [ ! -f /swapfile ] && [ "$(free -m | awk '/^Mem:/{print $2}')" -lt 8192 ]; then
  echo "Creating 4G swap file (low-memory instance)..."
  fallocate -l 4G /swapfile || dd if=/dev/zero of=/swapfile bs=1M count=4096
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

if [ -n "$REPO_URL" ] && [ ! -d "$REPO_DIR/.git" ]; then
  git clone --branch dev "$REPO_URL" "$REPO_DIR"
fi

if [ ! -d "$REPO_DIR/deploy" ]; then
  echo "Supplify repo not found at $REPO_DIR"
  echo "Set SUPPLIFY_REPO to your git URL or clone manually into $REPO_DIR"
  exit 1
fi

mkdir -p "$REPO_DIR/env" "$REPO_DIR/backups"

ENV_FILE="$REPO_DIR/env/.env"
ENV_EXAMPLE="$REPO_DIR/deploy/env/.env.example"

if [ ! -f "$ENV_FILE" ]; then
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  chmod 600 "$ENV_FILE"

  PUBLIC_IP=$(curl -sf http://169.254.169.254/latest/meta-data/public-ipv4 2>/dev/null || hostname -I | awk '{print $1}')
  gen_secret() { openssl rand -hex 16 2>/dev/null || head -c 16 /dev/urandom | od -An -tx1 | tr -d ' \n'; }

  PG_PASS=$(gen_secret)
  SESSION_SEC=$(gen_secret)

  sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=${PG_PASS}|" "$ENV_FILE"
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=${SESSION_SEC}|" "$ENV_FILE"
  sed -i "s|postgresql://supplify:change_me@|postgresql://supplify:${PG_PASS}@|" "$ENV_FILE"
  sed -i "s|^PUBLIC_URL=.*|PUBLIC_URL=http://${PUBLIC_IP}|" "$ENV_FILE"
  sed -i "s|^VITE_API_URL=.*|VITE_API_URL=http://${PUBLIC_IP}|" "$ENV_FILE"
  sed -i "s|^WEB_ORIGIN=.*|WEB_ORIGIN=http://${PUBLIC_IP}|" "$ENV_FILE"

  echo "Created $ENV_FILE with auto-generated secrets."
  echo "Review and edit before production use (especially PUBLIC_URL for a domain)."
fi

cp "$REPO_DIR/deploy/systemd/supplify.service" /etc/systemd/system/supplify.service
sed -i "s|/opt/supplify|$REPO_DIR|g" /etc/systemd/system/supplify.service
systemctl daemon-reload
systemctl enable supplify.service

echo ""
echo "=== Bootstrap complete ==="
echo "  Repo:    $REPO_DIR"
echo "  Config:  $ENV_FILE"
echo ""
echo "Next steps:"
echo "  1. Edit $ENV_FILE (set PUBLIC_URL, AWS keys, Keycloak if used)"
echo "  2. Open EC2 security group: TCP 80 (and 443 if using TLS)"
echo "  3. Run:  cd $REPO_DIR && ./deploy/ec2/deploy.sh"
echo "  4. Or:   sudo systemctl start supplify"
