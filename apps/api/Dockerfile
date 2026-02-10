FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.0 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/
COPY infra/package.json ./infra/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Rebuild the source code only when needed
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY . .

# Production image, copy all the files and run the app
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=4000

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 supplify

# Copy necessary files
COPY --from=builder --chown=supplify:nodejs /app/apps/api ./apps/api
COPY --from=builder --chown=supplify:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=supplify:nodejs /app/apps/api/node_modules ./apps/api/node_modules

USER supplify

EXPOSE 4000

ENV NODE_ENV=production

CMD ["node", "apps/api/src/server.js"]
