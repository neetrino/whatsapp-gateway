# syntax=docker/dockerfile:1.7

# ── Stage 1: install all deps for build ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ── Stage 2: build TS, generate Prisma client ───────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
ENV DATABASE_URL=file:/app/data/gateway.db
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: production node_modules only (keeps fat install out of runtime layers)
FROM node:20-alpine AS prod-deps
WORKDIR /app
ENV DATABASE_URL=file:/app/data/gateway.db
RUN apk add --no-cache openssl
COPY package.json package-lock.json* ./
COPY --from=deps /app/node_modules ./node_modules
COPY prisma ./prisma
RUN npx prisma generate && npm prune --omit=dev

# ── Stage 4: minimal runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000

RUN apk add --no-cache openssl tini && \
    addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./
COPY docker-entrypoint.sh ./docker-entrypoint.sh

RUN mkdir -p /app/data && chmod +x /app/docker-entrypoint.sh && chown -R app:app /app

USER app
EXPOSE 3000
VOLUME ["/app/data"]

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/docker-entrypoint.sh"]
