FROM node:20-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable

WORKDIR /app
COPY package.json pnpm-lock.yaml* ./

FROM base AS prod-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --prod --frozen-lockfile

FROM base AS build-deps
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM base AS build
COPY --from=build-deps /app/node_modules /app/node_modules
COPY . .
RUN pnpm build || true

FROM base
RUN apt-get update && apt-get install -y --no-install-recommends \
  chromium \
  chromium-sandbox \
  ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV CHROME_PATH=/usr/bin/chromium

COPY --from=prod-deps /app/node_modules /app/node_modules
COPY --from=build /app/dist /app/dist
COPY --from=build /app/templates /app/templates
COPY --from=build /app/skills /app/skills
COPY --from=build /app/package.json /app/package.json

ENTRYPOINT ["node", "dist/cli/index.js"]
CMD ["--help"]
