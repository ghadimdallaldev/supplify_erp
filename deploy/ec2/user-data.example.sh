#!/usr/bin/env bash
# EC2 user-data example — paste into "Advanced details > User data" at launch.
# Replace YOUR_GIT_REPO_URL with your repository HTTPS/SSH URL.

set -euo pipefail

export SUPPLIFY_REPO="YOUR_GIT_REPO_URL"
export SUPPLIFY_DIR="/opt/supplify"

curl -fsSL https://raw.githubusercontent.com/YOUR_ORG/supplify_erp/main/deploy/ec2/bootstrap.sh -o /tmp/supplify-bootstrap.sh
chmod +x /tmp/supplify-bootstrap.sh
/tmp/supplify-bootstrap.sh

cd /opt/supplify
./deploy/ec2/deploy.sh
