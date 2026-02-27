# ==============================================
# Stage 1: Base Dependencies
# ==============================================
FROM node:20-alpine AS base

# Install pnpm globally
RUN npm install -g pnpm@8

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json pnpm-lock.yaml* ./

# ==============================================
# Stage 2: Development Dependencies
# ==============================================
FROM base AS development-deps

# Install all dependencies (including devDependencies)
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --frozen-lockfile; \
    else \
      pnpm install; \
    fi

# ==============================================
# Stage 3: Production Dependencies
# ==============================================
FROM base AS production-deps

# Install only production dependencies
RUN if [ -f pnpm-lock.yaml ]; then \
      pnpm install --prod --frozen-lockfile; \
    else \
      pnpm install --prod; \
    fi

# ==============================================
# Stage 4: Development Environment
# ==============================================
FROM base AS development

# Copy all dependencies
COPY --from=development-deps /app/node_modules ./node_modules

# Copy source code
COPY . .

# Create non-root user for security
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Expose ports
EXPOSE 4001 9101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application in development mode (with nodemon)
CMD ["pnpm", "dev"]

# ==============================================
# Stage 5: Production Environment
# ==============================================
FROM node:20-alpine AS production

# Install pnpm
RUN npm install -g pnpm@8

WORKDIR /app

# Copy production dependencies
COPY --from=production-deps /app/node_modules ./node_modules

# Copy source code
COPY src ./src
COPY package.json ./

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001 && \
    chown -R nodejs:nodejs /app

USER nodejs

# Set production environment
ENV NODE_ENV=production

EXPOSE 4001 9101

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4001/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Start application
CMD ["node", "src/index.js"]