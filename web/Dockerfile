# Dev stage (for docker-compose local development)
FROM node:22-alpine AS dev

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

ENV PORT=3000
EXPOSE 3000

CMD ["npx", "next", "dev", "--hostname", "0.0.0.0"]

# Build stage
FROM node:22-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Set public env for production build
ENV NEXT_PUBLIC_ENV=production

# Build the Next.js app
RUN npm run build

# Production stage
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

USER nextjs

EXPOSE 8080

CMD ["node", "server.js"]
