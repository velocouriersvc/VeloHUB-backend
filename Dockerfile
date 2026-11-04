# Node 24 "Krypton" is the current LTS (supported until 2028-04-30).
#
# This image was on node:20-alpine, which went end of life on 2026-04-30 and so
# never received the 21 October 2026 security release. That release fixed, among
# others, CVE-2026-111497: an out-of-bounds write in the Brotli decoder bundled
# with Node that lets malformed input decompressed through node:zlib corrupt
# process memory, up to remote code execution. End-of-life lines get no fix, so
# the only remedy is moving to a supported line.
FROM node:24.22.2-alpine AS builder

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
FROM node:24.22.2-alpine

WORKDIR /app

# ensure zlib is upgraded to the patched release (CVE-2026-22184)
RUN apk update && apk upgrade zlib && rm -rf /var/cache/apk/*

# Copy package files
COPY package*.json ./

# Install production dependencies only. The npm bundled with Node 24.22.2 is
# 11.19.1, which vendors tar 7.5.22 and so is already past CVE-2026-59873 (the
# gzip-bomb DoS). The previous global `npm install -g npm@11.18.0` would now
# downgrade it, so it is gone.
RUN npm install --omit=dev && npm cache clean --force

# Copy built assets and necessary files from builder
COPY --from=builder /app/dist ./dist
# If you have static assets in public/ or other folders, copy them too
COPY --from=builder /app/public ./public

# Drop root. The app listens on 3000 (unprivileged) and writes nothing to disk -
# uploads are held in memory and streamed to MinIO - so it has no reason to run
# as uid 0. `node` is the unprivileged user the official image already ships.
RUN chown -R node:node /app
USER node

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
