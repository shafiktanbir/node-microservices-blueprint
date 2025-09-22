# Stage 1: Build shared core and todo-service
FROM node:20-alpine AS builder
WORKDIR /app

# Copy root workspace configs
COPY package.json package-lock.json ./
COPY services/shared/package.json ./services/shared/
COPY services/todo-service/package.json ./services/todo-service/

# Install workspace dependencies
RUN npm ci

# Copy source code
COPY services/shared ./services/shared
COPY services/todo-service ./services/todo-service

# Build shared core then todo-service
RUN npm run --workspace=services/shared build
RUN npm run --workspace=services/todo-service build

# Stage 2: Production runtime
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Security: non-root user
USER node

# Copy built artifacts and production dependencies
COPY --chown=node:node --from=builder /app/package.json /app/package-lock.json ./
COPY --chown=node:node --from=builder /app/node_modules ./node_modules
COPY --chown=node:node --from=builder /app/services/shared/dist ./services/shared/dist
COPY --chown=node:node --from=builder /app/services/shared/package.json ./services/shared/package.json
COPY --chown=node:node --from=builder /app/services/todo-service/dist ./services/todo-service/dist
COPY --chown=node:node --from=builder /app/services/todo-service/package.json ./services/todo-service/package.json

EXPOSE 3002

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3002/health || exit 1

CMD ["node", "services/todo-service/dist/index.js"]
