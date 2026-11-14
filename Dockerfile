# trixie for git 2.46+, the first to fsck objects fetched from a bundle.
FROM node:22-trixie-slim AS base
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile

FROM deps AS build
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN pnpm build

FROM deps AS web
COPY web ./web
COPY src/runStatus.ts ./src/
RUN pnpm -C web build

FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY web/package.json ./web/
RUN pnpm install --frozen-lockfile --prod --filter mike-factory

FROM base AS runtime
RUN apt-get update \
 && apt-get install -y --no-install-recommends git ca-certificates openssh-server openssh-client \
 && rm -rf /var/lib/apt/lists/* /etc/ssh/ssh_host_* \
 && useradd --uid 10001 --create-home --shell /bin/bash agent \
 && mkdir /data /mirrors /ssh \
 && chown agent:agent /data /mirrors /ssh
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    DATA_DIR=/data
# On the volume, so worktrees hard-link from the pnpm store and both caches survive a container recreate.
ENV pnpm_config_store_dir=/data/pnpm-store \
    COREPACK_HOME=/data/corepack
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=web /app/web/dist ./web/dist
COPY package.json ./
COPY config ./config
COPY .agents/skills ./.agents/skills
COPY docker/sshd_config docker/runner.sh ./
USER agent
VOLUME ["/data"]
EXPOSE 3000
CMD ["node", "dist/main.js"]
