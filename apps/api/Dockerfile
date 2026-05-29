# Build context MUST be the repository root (not apps/api).
# Railway: Root Directory = empty; Config file = /apps/api/railway.json; Dockerfile = apps/api/Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/

# Install API workspace and its dependency tree only
RUN pnpm install --frozen-lockfile --filter @supplify/api...

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

# Production image — copy only runtime-needed API files
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 supplify

COPY --from=builder --chown=supplify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=supplify:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=supplify:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=supplify:nodejs /app/apps/api/src ./apps/api/src
COPY --from=builder --chown=supplify:nodejs /app/apps/api/db/migrations ./apps/api/db/migrations
COPY --from=builder --chown=supplify:nodejs /app/apps/api/scripts/migrate.js ./apps/api/scripts/migrate.js
COPY --from=builder --chown=supplify:nodejs /app/apps/api/scripts/run-migration.js ./apps/api/scripts/run-migration.js
COPY --from=builder --chown=supplify:nodejs /app/apps/api/scripts/lib ./apps/api/scripts/lib

# Writable local upload root (STORAGE_DRIVER=local). Mount a Railway volume here for persistence.
RUN mkdir -p /app/uploads && chown supplify:nodejs /app/uploads

USER supplify

EXPOSE 4000

CMD ["node", "apps/api/src/server.js"]
