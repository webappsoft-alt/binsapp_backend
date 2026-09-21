# Use official Node.js 20.14.0 image as base
FROM node:20.14.0-alpine

# Create and set working directory
WORKDIR /app

# Install dependencies first to leverage Docker cache
COPY package.json package-lock.json ./

# Install dependencies (including devDependencies for potential build steps)
RUN npm ci

# Copy application files (excluding what's in .dockerignore)
COPY . .

# Environment variables
ARG NODE_ENV=production
ENV NODE_ENV=${NODE_ENV}
ENV PORT=3000

# Verify mongoose is installed (debugging step)
# RUN npm list mongoose

# Set proper permissions
RUN chown -R node:node /app

# Switch to non-root user for security
USER node

# Expose the application port
EXPOSE ${PORT}

# Health check
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "require('http').request({host: 'localhost', port: ${PORT}, method: 'GET'}, (r) => {process.exit(r.statusCode === 200 ? 0 : 1)}).end()"

# Start command with ES modules support
CMD ["node", "--es-module-specifier-resolution=node", "src/server.js"]