#!/usr/bin/env bash
# EC2 user-data example — paste into "Advanced details > User data" at launch.
# Replace YOUR_GIT_REPO_URL with your repository HTTPS URL.

set -euo pipefail

export SUPPLIFY_REPO="https://github.com/ghadimdallaldev/supplify_erp.git"
export SUPPLIFY_DIR="/opt/supplify"

git clone --branch dev "$SUPPLIFY_REPO" "$SUPPLIFY_DIR"
chmod +x "$SUPPLIFY_DIR/deploy/ec2/bootstrap.sh" "$SUPPLIFY_DIR/deploy/ec2/deploy.sh"
"$SUPPLIFY_DIR/deploy/ec2/bootstrap.sh"
"$SUPPLIFY_DIR/deploy/ec2/deploy.sh"
