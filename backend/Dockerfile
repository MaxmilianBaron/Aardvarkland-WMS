FROM node:24-alpine AS base
WORKDIR /app
COPY package*.json ./

FROM base AS dependencies
RUN npm ci

FROM dependencies AS build
COPY nest-cli.json tsconfig*.json prisma.config.ts ./
COPY prisma ./prisma
COPY src ./src
RUN npm run prisma:generate
RUN npm run typecheck
RUN npm run build

FROM build AS database-init
CMD ["sh", "-c", "npm run prisma:deploy && npm run db:seed"]

FROM node:24-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/prisma ./prisma
COPY prisma.config.ts ./
EXPOSE 4001
CMD ["node", "dist/main.js"]
