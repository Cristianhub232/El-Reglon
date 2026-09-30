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

### Direcciones en servicio

| Qué | Dirección |
|---|---|
| Sitio y herramientas públicas | https://elrenglonve.org |
| Panel de administración | https://elrenglonve.org/ingresar |
| API (Swagger) | https://elrenglonve.org/docs |
| Metabase | https://metabase.elrenglonve.org |

### Redirecciones

| Desde | Hacia |
|---|---|
| `http://…` | `https://…` (Caddy, automático) |
| `www.elrenglonve.org` | `https://elrenglonve.org` (301) |
| El IP `40.160.143.39` a secas | `https://elrenglonve.org` (301) |
| `40-160-143-39.sslip.io` y `metabase.40-160-143-39.sslip.io` (direcciones provisionales, §7) | el dominio equivalente (301), para que los enlaces ya compartidos sigan funcionando. Solo en el Caddyfile del servidor, no en `despliegue/Caddyfile` |

### TLS

- Certificados de **Let's Encrypt** para `elrenglonve.org`, `www` y `metabase`, emitidos el 30/09/2026 y vigentes hasta el **29/12/2026**. Caddy los **renueva solo** unos 30 días antes; no hay que hacer nada.
- Cabecera **HSTS** (`max-age` de un año): los navegadores entran siempre por HTTPS.
- Metabase usa `METABASE_URL=https://metabase.elrenglonve.org` como dirección oficial, así que sus enlaces y correos apuntan al dominio.

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

## 7. Historial de la puesta en marcha (30/09/2026)

1. Aplicación y Metabase publicados provisionalmente en `https://40-160-143-39.sslip.io` y `https://metabase.40-160-143-39.sslip.io` mientras se verificaba la compra del dominio.
2. Dominio **elrenglonve.org** comprado en Spaceship (registro por 1 año, renovación automática y privacidad incluidas). Ojo: es `.org`, no `.com`.
3. En Spaceship → Registros DNS se reemplazaron los registros de estacionamiento (`34.216.117.25` y `54.149.79.189`) por tres registros **A** hacia `40.160.143.39`: `@`, `www` y `metabase`. La propagación fue inmediata.
4. Caddy emitió los certificados, las direcciones provisionales pasaron a redirigir al dominio y Metabase adoptó su dirección definitiva.
5. `scripts/prueba-api.ts` contra `https://elrenglonve.org`: **79/79**.
6. El Caddyfile con las direcciones provisionales quedó respaldado en el servidor como `/etc/caddy/Caddyfile.bak-sslip`.

## 8. Tareas del responsable

- [ ] **Cambiar las contraseñas temporales** del panel de El Renglón y de Metabase. El panel lo exige al primer ingreso y pide activar la **verificación en dos pasos**.
- [ ] En Spaceship, subir el TTL del registro `@` de 5 a 30 minutos, igual que `www` y `metabase`. El TTL bajo solo hacía falta durante el cambio.
- [ ] Mantener activa la **renovación automática del dominio** (vence al año de la compra, en septiembre de 2027). Si el dominio vence, se caen el sitio, la API y Metabase.
- [ ] Opcional: borrar la "Sample Database" de Metabase (Administración → Bases de datos).
