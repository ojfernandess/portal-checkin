# syntax=docker/dockerfile:1

FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
RUN apk add --no-cache libc6-compat
# Lock file gerado com npm 11; node:22-alpine traz npm 10 e quebra npm ci.
RUN npm install -g npm@11.6.1
COPY package.json package-lock.json ./
# npm install (em vez de npm ci) tolera diferenças de plataforma no lock file.
RUN npm install --no-audit --no-fund

FROM base AS build
RUN npm install -g npm@11.6.1
# Easypanel: pass GIT_COMMIT on each deploy to invalidate Docker layer cache.
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV GIT_COMMIT=$GIT_COMMIT
ENV BUILD_DATE=$BUILD_DATE
ENV NITRO_PRESET=node-server
RUN echo "Building commit ${GIT_COMMIT} at ${BUILD_DATE}"
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app
RUN apk add --no-cache libc6-compat
ARG GIT_COMMIT=unknown
ARG BUILD_DATE=unknown
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
ENV APP_BUILD_COMMIT=$GIT_COMMIT
ENV APP_BUILD_DATE=$BUILD_DATE

COPY --from=build /app/.output ./.output
COPY --from=build /app/package.json ./package.json

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", ".output/server/index.mjs"]
