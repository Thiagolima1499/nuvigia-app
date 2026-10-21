# Hub Nuvigia. Construir a partir da raiz do repositório:
#   docker compose -f apps/hub/docker-compose.yml up -d --build
FROM node:22-bookworm-slim AS build
WORKDIR /repo
RUN corepack enable
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY packages/shared/package.json packages/shared/
COPY apps/hub/package.json apps/hub/
RUN pnpm install --frozen-lockfile --filter @nuvigia/hub...
COPY packages/shared packages/shared
COPY apps/hub apps/hub
RUN pnpm --filter @nuvigia/hub build

FROM node:22-bookworm-slim
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg ca-certificates \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# O @nuvigia/shared já está dentro do bundle; aqui entram só as dependências do npm.
COPY apps/hub/package.json ./package.json
RUN node -e "const p=require('./package.json');delete p.dependencies['@nuvigia/shared'];delete p.devDependencies;require('fs').writeFileSync('package.json',JSON.stringify(p))" \
  && npm install --omit=dev --no-audit --no-fund
COPY --from=build /repo/apps/hub/dist ./dist
ENV NODE_ENV=production DATA_DIR=/data
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME ["/data"]
EXPOSE 8787
CMD ["node", "--disable-warning=ExperimentalWarning", "dist/index.js"]
