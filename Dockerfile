# Immagine di produzione per Dokploy (build type "Dockerfile").
# Il database SQLite vive nel volume /app/data: montarlo in Dokploy, altrimenti i dati si perdono a ogni deploy.
FROM node:20-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npx prisma generate && npm run build

FROM node:20-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl tzdata && rm -rf /var/lib/apt/lists/*
WORKDIR /app
# Orari di lezioni e calendari sono interpretati nel fuso del server: deve essere quello della scuola
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 DATABASE_URL=file:/app/data/ln.db TZ=Europe/Rome
# node_modules completo: servono prisma (migrazioni) e tsx (seed del catalogo, scripts/crea-utente.ts)
COPY --from=build /app/package.json /app/package-lock.json /app/next.config.ts /app/tsconfig.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY docker-entrypoint.sh ./
RUN mkdir -p /app/data && chown -R node:node /app/data && chmod +x docker-entrypoint.sh
USER node
VOLUME /app/data
EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
