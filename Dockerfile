# El Renglón · imagen de la aplicación (API + UI) y del programador de tasas BCV
FROM node:24.19-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencias AS compilacion
COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY scripts ./scripts
RUN npm run build

FROM node:24.19-alpine AS ejecucion
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=compilacion --chown=node:node /app/.next/standalone ./
COPY --from=compilacion --chown=node:node /app/.next/static ./.next/static
# Para el programador BCV (Node ejecuta TypeScript directamente) y la verificación TLS del BCV
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node config ./config
USER node
EXPOSE 3000
CMD ["node", "server.js"]
