# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (dev deps needed for tsc, but skip postinstall scripts that download binaries)
RUN npm install --ignore-scripts

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# The npm bundled with node:20-alpine (10.x) ships tar 6.2.1, which is flagged by
# CVE-2026-59873 (gzip-bomb DoS). npm 11.18.0 bundles the patched tar 7.5.19 and still
# supports Node ^20.17.0, so upgrade the CLI before installing.
RUN npm install -g npm@11.18.0 && npm cache clean --force

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# ensure zlib is upgraded to the patched release (CVE-2026-22184)
RUN apk update && apk upgrade zlib

# Copy built assets and necessary files from builder
COPY --from=builder /app/dist ./dist
# If you have static assets in public/ or other folders, copy them too
COPY --from=builder /app/public ./public 

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
