#!/bin/sh
set -e

echo "Running database schema sync for all Prisma services..."

apk add --no-cache openssl

npm install -g prisma@5.8.0

SERVICES="
  services/catalog
  services/orders
  services/restaurants
  services/suppliers
  services/inventory
  services/loyalty
  services/promotions
  services/subscriptions
  services/notifications
  services/analytics
  services/flags
  services/auth-proxy
  services/chat
  services/invoicing
  services/database
"

for svc in $SERVICES; do
  if [ -f "/app/${svc}/prisma/schema.prisma" ]; then
    echo "  -> ${svc}"
    cd "/app/${svc}"
    prisma generate
    prisma db push --skip-generate --accept-data-loss
  fi
done

echo "Database migration complete."
