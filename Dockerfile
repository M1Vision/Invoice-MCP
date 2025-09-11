FROM node:22-slim

WORKDIR /app

# Install system dependencies and TypeScript globally
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*
RUN npm install -g typescript

# Copy root package files
COPY package*.json ./

# Copy server package files
COPY server/package*.json ./server/

# Install dependencies in both locations
RUN npm install --production=false
RUN cd server && npm install --production=false

# Copy source code
COPY . .

# Build the server TypeScript project
RUN cd server && npm run build

# Copy built files to root build directory
RUN mkdir -p build && cp -r server/build/* build/

# Remove dev dependencies after build to reduce image size
RUN npm prune --omit=dev
RUN cd server && npm prune --omit=dev

# Create temp directory for invoice files
RUN mkdir -p temp

# Create non-root user for security
RUN groupadd --gid 1001 nodejs
RUN useradd --uid 1001 --gid nodejs --shell /bin/bash --create-home invoice

# Change ownership of the app directory
RUN chown -R invoice:nodejs /app
USER invoice

# Expose port (Smithery will set PORT=8081)
EXPOSE 8081

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:8081/health || exit 1

# Start the Smithery-optimized HTTP server
CMD ["node", "build/index-smithery.js"]

