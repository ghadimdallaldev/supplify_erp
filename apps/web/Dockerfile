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

# Railway: Vite vars from deploy/railway/<env>/web.env (override with Docker build args if set)
# Set RAILWAY_DEPLOY_ENV=preprod|production on Railway web builds for non-dev env files.
ARG RAILWAY_DEPLOY_ENV=development
RUN cp "deploy/railway/${RAILWAY_DEPLOY_ENV}/web.env" apps/web/.env.production

ARG VITE_API_URL=
ARG VITE_KEYCLOAK_URL=
ARG VITE_KEYCLOAK_REALM=
RUN if [ -n "$VITE_API_URL" ]; then echo "VITE_API_URL=$VITE_API_URL" >> apps/web/.env.production; fi && \
    if [ -n "$VITE_KEYCLOAK_URL" ]; then echo "VITE_KEYCLOAK_URL=$VITE_KEYCLOAK_URL" >> apps/web/.env.production; fi && \
    if [ -n "$VITE_KEYCLOAK_REALM" ]; then echo "VITE_KEYCLOAK_REALM=$VITE_KEYCLOAK_REALM" >> apps/web/.env.production; fi

# Build web only (skip tsc in container — typecheck runs in CI)
RUN pnpm --filter @supplify/web build:docker

# Production image with nginx
FROM nginx:alpine AS runner
ARG RAILWAY_DEPLOY_ENV=development

RUN apk add --no-cache gettext

# Copy built files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Railway routes traffic to $PORT — template is rendered at container start
COPY apps/web/nginx.conf.template /etc/nginx/conf.d/default.conf.template
COPY apps/web/nginx-proxy-api.conf.template /etc/nginx/conf.d/proxy-api.conf.template
COPY deploy/railway/${RAILWAY_DEPLOY_ENV}/web.env /etc/supplify/web-build.env
COPY apps/web/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

ENV PORT=80

EXPOSE 80

ENTRYPOINT ["/docker-entrypoint.sh"]
