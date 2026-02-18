# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build the application
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install production dependencies only
RUN npm install --omit=dev

# Copy built assets and necessary files from builder
COPY --from=builder /app/dist ./dist
# If you have static assets in public/ or other folders, copy them too
COPY --from=builder /app/public ./public 

# Expose the port the app runs on
EXPOSE 3000

# Start the application
CMD ["npm", "start"]
