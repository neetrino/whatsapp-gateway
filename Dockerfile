# syntax=docker/dockerfile:1.7

# ── Stage 1: install all deps for build ─────────────────────────────────────────
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund

# ── Stage 2: build TS, generate Prisma client ───────────────────────────────────
FROM node:20-alpine AS builder
WORKDIR /app
RUN apk add --no-cache openssl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npx prisma generate
RUN npm run build

# ── Stage 3: minimal runtime ───────────────────────────────────────────────────
FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    PORT=3000

RUN apk add --no-cache openssl tini && \
    addgroup -S app && adduser -S app -G app
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma
COPY package.json ./

RUN npx prisma generate && \
    npm prune --omit=dev && \
    chown -R app:app /app

USER app
EXPOSE 3000

ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/main.js"]
