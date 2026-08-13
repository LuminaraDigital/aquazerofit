# AquaZeroFit API — production container image.
#
# Built from the MONOREPO ROOT so the npm workspace linkage to
# packages/shared resolves:
#   docker build -f apps/api/Dockerfile -t aquazerofit-api .
#
# Multi-stage: stage 1 installs the full workspace (dev deps included) and runs
# typecheck + tests so a broken commit can never produce a runnable image;
# stage 2 keeps only production dependencies on distroless base.

# ---------- Stage 1: install + verify ----------
FROM node:20-bookworm-slim@sha256:cd565714d4da3e84bfd341e31448f81d47c6362198f152345297c9c1154e6341 AS build
WORKDIR /repo

# OCI labels for provenance
LABEL org.opencontainers.image.source="https://github.com/aquazerofit/aquazerofit" \
      org.opencontainers.image.description="AquaZeroFit API" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.vendor="AquaZeroFit"

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

# Create writable directories for runtime stage to copy
RUN mkdir -p /repo/data /repo/apps/api/uploads

# ---------- Stage 2: runtime ----------
FROM gcr.io/distroless/nodejs20-debian12@sha256:aadeb54a6d25fa4f8c47160ca38cfdc2ff7a6227b5d41c8544f9cffb80a31823 AS runtime
ENV NODE_ENV=production
WORKDIR /repo

# OCI labels for provenance
LABEL org.opencontainers.image.source="https://github.com/aquazerofit/aquazerofit" \
      org.opencontainers.image.description="AquaZeroFit API" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later" \
      org.opencontainers.image.vendor="AquaZeroFit"

# Copy production dependency manifests
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/

# Install production dependencies only (from builder stage via layer caching)
# Using npm from the builder stage's node_modules/.bin is not possible in distroless,
# so we copy the built node_modules from builder stage instead.
COPY --from=build --chown=nonroot:nonroot /repo/node_modules /repo/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/packages/shared/node_modules /repo/packages/shared/node_modules
COPY --from=build --chown=nonroot:nonroot /repo/apps/api/node_modules /repo/apps/api/node_modules

# Copy source code
COPY --chown=nonroot:nonroot tsconfig.base.json ./
COPY --chown=nonroot:nonroot packages/shared packages/shared
COPY --chown=nonroot:nonroot apps/api apps/api

# Writable runtime paths. AZF_DATA_DIR and the uploads directory must be backed
# by a mounted volume (or, properly, by Cosmos DB + Blob Storage) — the
# container filesystem is ephemeral and is lost on every restart.
# Distroless has no shell, so we create directories in builder stage and copy them.
COPY --from=build --chown=nonroot:nonroot /repo/data /data
COPY --from=build --chown=nonroot:nonroot /repo/apps/api/uploads /repo/apps/api/uploads
ENV AZF_DATA_DIR=/data

# Distroless has nonroot:nonroot (UID 65532) built-in
USER nonroot:nonroot

EXPOSE 4000
ENV PORT=4000

# Liveness is also declared here so `docker run` behaves like the platform.
# Note: distroless has no shell, so we use the exec form with node directly.
HEALTHCHECK --interval=30s --timeout=3s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||4000)+'/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]

# Distroless entrypoint is "node" by default; we run tsx directly (no npm, no dumb-init)
# tsx is copied from builder stage's node_modules
CMD ["tsx", "apps/api/src/index.ts"]