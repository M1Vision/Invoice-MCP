FROM node:22-slim

WORKDIR /app

# Install system dependencies and TypeScript globally
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g typescript

# Copy npm configuration
COPY .npmrc ./

# Copy root package files
COPY package*.json ./

# Copy server package files and npmrc
COPY server/package*.json ./server/
COPY server/.npmrc ./server/

# Install root dependencies with explicit registry
RUN npm install --production=false --registry=https://registry.npmjs.org/

# Copy source code
COPY . .

# Install server dependencies with explicit registry
RUN cd server && npm install --production=false --registry=https://registry.npmjs.org/

# Build the server TypeScript project
RUN cd server && npm run build

# Copy built files to root build directory
RUN mkdir -p build && cp -r server/build/* build/

# Remove dev dependencies after build to reduce image size
RUN npm prune --omit=dev
# Don't prune server dependencies as they're needed at runtime
# RUN cd server && npm prune --omit=dev

# Set NODE_PATH to include server node_modules
ENV NODE_PATH=/app/server/node_modules:/app/node_modules

# Create temp directory for invoice files
RUN mkdir -p temp

# Create non-root user for security
RUN groupadd --gid 1001 nodejs
RUN useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home invoice

# Change ownership of the app directory
RUN chown -R invoice:nodejs /app
USER invoice

# Expose port (Smithery will set PORT environment variable)
EXPOSE 8080

# Health check - Smithery will handle health checks externally
# HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
#   CMD curl -f http://localhost:${PORT:-8080}/health || exit 1

# Start the Smithery-optimized HTTP server
CMD ["node", "build/index-smithery.js"]

