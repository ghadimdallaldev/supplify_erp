# Build context MUST be the repository root (not apps/web).
# Railway: Root Directory = empty; Config file = /apps/web/railway.json; Dockerfile = apps/web/Dockerfile
FROM node:22-alpine AS base

# Install dependencies only when needed
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate

# Copy package files
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/

# Install web workspace and its dependency tree only
RUN pnpm install --frozen-lockfile --filter @supplify/web...

# Rebuild the source code only when needed
FROM base AS builder
RUN corepack enable && corepack prepare pnpm@8.15.9 --activate
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
COPY . .

ARG VITE_API_URL=http://localhost:4000
ARG VITE_KEYCLOAK_URL=http://localhost:8080
ARG VITE_KEYCLOAK_REALM=Supplify
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL
ENV VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM

# Build web only (skip tsc in container — typecheck runs in CI)
RUN pnpm --filter @supplify/web build:docker

# Production image with nginx
FROM nginx:alpine AS runner

RUN apk add --no-cache gettext

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Railway routes traffic to $PORT — template is rendered at container start
COPY apps/web/nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=80

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
