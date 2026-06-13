# Build
FROM node:20-alpine AS builder
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --no-audit --no-fund
COPY frontend/ .
RUN npm run build

# Production
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_PRIVATE_LOCAL_STORAGE=/tmp

COPY --from=builder --chown=node:node /app/.next/standalone/ /app/
COPY --from=builder --chown=node:node /app/.next/static /app/.next/static

EXPOSE 3000
ENV PORT=3000

USER node

CMD ["node", "server.js"]
