# El Renglón · imagen de la aplicación (API + UI), de los programadores (BCV y noticiero) y del comparador (PM2)
FROM node:24.19-alpine AS dependencias
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencias AS compilacion
COPY tsconfig.json next.config.ts ./
COPY src ./src
COPY scripts ./scripts
COPY public ./public
COPY datos/comparador ./datos/comparador
RUN npm run build

FROM node:24.19-alpine AS ejecucion
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
WORKDIR /app
COPY --from=compilacion --chown=node:node /app/.next/standalone ./
COPY --from=compilacion --chown=node:node /app/.next/static ./.next/static
COPY --from=compilacion --chown=node:node /app/public ./public
# Para el programador BCV (Node ejecuta TypeScript directamente) y la verificación TLS del BCV
COPY --chown=node:node src ./src
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node config ./config
COPY --chown=node:node datos/comparador ./datos/comparador
COPY --chown=node:node comparador ./comparador
USER node
EXPOSE 3000
CMD ["node", "server.js"]

# Comparador de precios: la misma imagen con PM2, un proceso por tienda (docs/22)
FROM ejecucion AS comparador
USER root
RUN npm install -g pm2@7.0.4 && npm cache clean --force
USER node
ENV PM2_HOME=/tmp/pm2
CMD ["pm2-runtime", "comparador/ecosystem.config.cjs"]
