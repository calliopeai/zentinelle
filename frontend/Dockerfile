# Build stage
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm install --legacy-peer-deps

# Copy source
COPY . .

# Build arguments for environment-specific config
ARG NEXT_PUBLIC_GQL_URL
ARG NEXT_PUBLIC_API_URL

# Build Next.js app
ENV NEXT_PUBLIC_GQL_URL=$NEXT_PUBLIC_GQL_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# Production stage - run Next.js server
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Install wget for health checks and create non-root user
RUN apk add --no-cache wget && \
    addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

# Copy built assets
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# Copy startup script
COPY start.sh ./start.sh
RUN chmod +x start.sh

USER nextjs

EXPOSE 3002

ENV PORT=3002

CMD ["./start.sh"]
