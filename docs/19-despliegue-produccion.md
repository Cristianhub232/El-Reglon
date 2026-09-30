# 19 · Despliegue en producción

> Desplegado el 30/09/2026 en una VPS Ubuntu 26.04 (4 GB de RAM). Dominio **elrenglonve.org** (Spaceship). Aplicación, programador BCV, PostgreSQL y Metabase con Docker Compose, detrás de **Caddy** con TLS automático de Let's Encrypt.

## 1. Arquitectura

| Dirección pública | Servicio | Escucha en |
|---|---|---|
| `https://elrenglonve.org` | `app` (sitio, panel, API y Swagger) | `127.0.0.1:3000` |
| `https://metabase.elrenglonve.org` | `metabase` (análisis) | `127.0.0.1:3001` |
| `www.elrenglonve.org` y el IP a secas | redirigen a `https://elrenglonve.org` | — |
| — | `db` (PostgreSQL 16: bases `elrenglon` y `metabase`) | `127.0.0.1:55432` |
| — | `bcv-programador` (lectura del BCV a las 8, 14 y 20 h) | — |

Solo Caddy (puertos 80 y 443) y SSH quedan expuestos. Todos los contenedores tienen `restart: unless-stopped` y Docker y Caddy arrancan con el sistema.

## 2. Servidor

```bash
sudo apt-get install -y docker.io docker-compose-v2 poppler-utils caddy
sudo usermod -aG docker $USER            # y volver a entrar
```

- **Node 24 oficial, no el de Ubuntu.** El paquete `nodejs` de Ubuntu (22.22) se compila **sin** el soporte para quitar tipos, y los scripts `.ts` fallan con `ERR_UNKNOWN_FILE_EXTENSION` aunque la versión sea ≥ 22.18. Hace falta el binario de nodejs.org (el mismo 24.19 de la imagen Docker):
  ```bash
  V=v24.19.0; curl -fsSLO https://nodejs.org/dist/$V/node-$V-linux-x64.tar.xz
  curl -fsSL https://nodejs.org/dist/$V/SHASUMS256.txt | grep node-$V-linux-x64.tar.xz | sha256sum -c -
  sudo tar -xJf node-$V-linux-x64.tar.xz -C /usr/local --strip-components=1
  ```
- **Memoria.** Metabase (Java) ocupa ~1,2 GB. Con 4 GB de RAM se agregan 2 GB de swap (`/swapfile`, `vm.swappiness=10`) y se limita Java con `METABASE_JAVA_OPTS=-Xmx1g`. Para tableros pesados conviene una instancia de 8 GB.

## 3. Instalación

```bash
git clone https://github.com/Cristianhub232/El-Reglon.git && cd El-Reglon && npm ci
cp .env.example .env && chmod 600 .env
#   POSTGRES_PASSWORD, APP_SECRETO, METABASE_DB_PASSWORD, METABASE_LECTURA_PASSWORD y
#   MB_ENCRYPTION_SECRET_KEY: cada uno con  openssl rand -hex 32
#   COMPOSE_PROFILES=app,metabase   (así "docker compose up -d" levanta todo)
docker compose up -d db && herramientas/instalar_bd.sh && herramientas/instalar_metabase.sh
docker compose up -d --build
node scripts/usuario.ts crear --correo usted@empresa.com.ve --nombre "Su nombre" --rol super
BASE_URL=http://127.0.0.1:3000 node scripts/prueba-api.ts      # 79/79
```

## 4. Metabase

- **Base interna.** Metabase guarda preguntas, tableros y usuarios en la base `metabase` (rol `metabase`) del mismo PostgreSQL, no en H2.
- **Conexión a los datos.** Se agrega la base `elrenglon` con el rol **`metabase_lectura`** (`db/metabase/001_roles.sql`):
  - solo `SELECT`, con `default_transaction_read_only` y `statement_timeout` de 120 s;
  - esquemas `arancel`, `bcv`, `calendario`, `iva` y `rif`, incluidas las tablas que se creen después;
  - de `core`, solo `auditoria`, `uso_diario` y `solicitud_api_key`. **No ve** `usuario`, `sesion` ni `api_key`.
- **Configuración inicial antes de publicar.** El asistente de Metabase queda abierto para el primero que llegue. Complételo por un túnel (`ssh -L 3001:127.0.0.1:3001 servidor`, luego `http://localhost:3001`) o por la API (`POST /api/setup` con el `setup-token` de `/api/session/properties`) y **después** active su bloque en Caddy.
- En la conexión, filtre los esquemas a `arancel,bcv,calendario,iva,rif,core`. El host es `db`, el puerto `5432` y el usuario `metabase_lectura`.

## 5. Dominio y TLS

1. En el DNS (Spaceship → Registros DNS): registros **A** de `@`, `www` y `metabase` hacia el IP del servidor. Borre los registros de estacionamiento.
2. `sudo cp despliegue/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`. Caddy pide y renueva los certificados solo.

Mientras el dominio no resuelva se puede publicar provisionalmente con `<ip-con-guiones>.sslip.io`, que resuelve al IP y admite certificado de Let's Encrypt, sin desactivar `COOKIE_SEGURA`.

## 6. Actualizar

```bash
git pull && npm ci
herramientas/instalar_bd.sh                 # si cambiaron esquemas o semillas (idempotente)
docker compose up -d --build
```
