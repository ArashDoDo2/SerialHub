FROM node:18-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build
RUN mkdir -p dist/migrations
RUN cp src/migrations/*.sql dist/migrations/

FROM node:18-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist
RUN mkdir -p /app/data /app/logs && chown -R node:node /app

USER node

EXPOSE 3001

CMD ["node", "dist/server.js"]
