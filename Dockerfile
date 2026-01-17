# Multi-stage Dockerfile for Protocol TX
FROM node:22-slim AS base

# Install dependencies for native modules
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files
COPY package*.json ./

# Development stage
FROM base AS development

# Install all dependencies (including dev dependencies)
RUN npm ci

# Copy source code
COPY . .

# Expose ports
# 5000: Vite dev server (client)
# 7000: HTTP monitoring API
# 8000: WebSocket server (multiplayer)
EXPOSE 5000 7000 8000

# Default command for development
CMD ["npm", "run", "dev"]

# Production build stage
FROM base AS build

# Install all dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:22-slim AS production

WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./
RUN npm ci --only=production

# Copy built assets from build stage
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/index.html ./
COPY --from=build /app/src/server ./src/server
COPY --from=build /app/src/shared ./src/shared

# Install tsx for running server
RUN npm install -g tsx

# Expose ports
EXPOSE 4173 7000 8000

# Start both preview server and game server
CMD ["sh", "-c", "npm run serve & npm run server"]
