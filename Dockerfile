# syntax=docker/dockerfile:1
# Node 24: has node:sqlite usable WITHOUT --experimental-sqlite (verified).
# Node 20 would NOT have node:sqlite — do not downgrade the base image.

FROM node:24-bookworm AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.9 --activate
# Full source BEFORE install: shared's `prepare` hook (tsc) needs its src to exist,
# so a manifest-only install would fail. (Trades some layer caching for correctness.)
COPY . .
RUN pnpm install --frozen-lockfile
# VITE_* are baked into the Mini App bundle at build time. API base stays '' (relative)
# because the app is served from the same origin as the API. Policy/offer are served
# as static files from that same origin (apps/miniapp/public -> dist).
ENV VITE_POLICY_URL=/policy.html
ENV VITE_OFFER_URL=/offer.html
# Build shared -> server -> miniapp (pnpm -r respects workspace order).
RUN pnpm -r build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Fonts for the OG share image (Cyrillic + colour emoji). Without these,
# resvg renders tofu/blank glyphs for «Я — Огонь 🔥» on every share card.
RUN apt-get update \
 && apt-get install -y --no-install-recommends fonts-noto-core fonts-noto-color-emoji \
 && rm -rf /var/lib/apt/lists/*
# Bring the whole built workspace over (built dists + resolved node_modules,
# incl. the resvg native binary — same Debian bookworm base, so it's ABI-compatible).
COPY --from=build /app ./
# The server serves the built Mini App from this path (Phase 5 Task 3).
ENV MINIAPP_DIST=/app/apps/miniapp/dist
# SQLite file lives on a mounted volume (see docker-compose). Data dir is created at boot.
ENV DATABASE_PATH=/app/data/stasis.sqlite
EXPOSE 3000
# main.ts loadContent(process.cwd()) resolves /app/content; region/env come from env_file.
CMD ["node", "apps/server/dist/main.js"]
