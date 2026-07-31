# AquaZeroFit API — production container image.
#
# Built from the MONOREPO ROOT so the npm workspace linkage to
# packages/shared resolves:
#   docker build -f apps/api/Dockerfile -t aquazerofit-api .
#
# Multi-stage: stage 1 installs the full workspace (dev deps included) and runs
# typecheck + tests so a broken commit can never produce a runnable image;
# stage 2 keeps only production dependencies.

# ---------- Stage 1: install + verify ----------
FROM node:20-bookworm-slim AS build
WORKDIR /repo

# Copy manifests first so the dependency layer caches independently of source.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/

RUN npm ci --workspaces --include-workspace-root

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Gate the image on a green build.
RUN npm run typecheck --workspace packages/shared \
 && npm run typecheck --workspace apps/api \
 && npm run test --workspace apps/api

# ---------- Stage 2: runtime ----------
FROM node:20-bookworm-slim AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# dumb-init gives the process PID 1 signal semantics, so the SIGTERM handler in
# src/index.ts actually fires and the store drains before the container dies.
RUN apt-get update \
 && apt-get install -y --no-install-recommends dumb-init \
 && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Production dependency tree only. apps/web is omitted deliberately — the SPA
# is built and hosted separately (Static Web Apps / CDN).
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root \
 && npm cache clean --force

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api

# Writable runtime paths. AZF_DATA_DIR and the uploads directory must be backed
# by a mounted volume (or, properly, by Cosmos DB + Blob Storage) — the
# container filesystem is ephemeral and is lost on every restart.
RUN mkdir -p /data /repo/apps/api/uploads \
 && chown -R node:node /data /repo/apps/api/uploads
ENV AZF_DATA_DIR=/data

USER node
EXPOSE 4000
ENV PORT=4000

# Liveness is also declared here so `docker run` behaves like the platform.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start", "--workspace", "apps/api"]
