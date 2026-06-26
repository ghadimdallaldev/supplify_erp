# Build context MUST be the repository root (not apps/api).
# Railway: Root Directory = empty; Config file = /apps/api/railway.json; Dockerfile = apps/api/Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

# Copy package files (include vendored xlsx tarball — file: dependency in apps/api/package.json)
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY vendor/sheetjs/xlsx-0.20.3.tgz ./vendor/sheetjs/xlsx-0.20.3.tgz

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

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 supplify

COPY --from=builder --chown=supplify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=supplify:nodejs /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=builder --chown=supplify:nodejs /app/apps/api/package.json ./apps/api/package.json
COPY --from=builder --chown=supplify:nodejs /app/apps/api/src ./apps/api/src
COPY --from=builder --chown=supplify:nodejs /app/apps/api/db/migrations ./apps/api/db/migrations
# Full scripts tree: migrate.js, role/org backfills, and Railway shell one-offs (run-migration.js)
COPY --from=builder --chown=supplify:nodejs /app/apps/api/scripts ./apps/api/scripts
# Railway runtime defaults (api.env per env) + in-process cron config (CRONS_ENABLED, CRON_*)
COPY --from=builder --chown=supplify:nodejs /app/deploy/railway ./deploy/railway

# Writable local upload root (STORAGE_DRIVER=local). Mount a Railway volume here for persistence.
RUN mkdir -p /app/uploads && chown supplify:nodejs /app/uploads

USER supplify

EXPOSE 4000

# Listen on Railway-injected PORT at runtime (see deploy/railway/development/api.env)
CMD ["node", "apps/api/src/server.js"]
