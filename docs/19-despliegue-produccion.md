# 19 · Despliegue en producción

> Desplegado el 30/09/2026 en una VPS Ubuntu 26.04 de OVH (4 GB de RAM y 4 GB de swap). Dominio **elrenglonve.org** (Spaceship). Aplicación, programadores, comparador, PostgreSQL y Metabase con Docker Compose, detrás de **Caddy** con TLS automático de Let's Encrypt. Correo con **Spacemail**. Tablas y esquemas: [DATABASE.md](../DATABASE.md).

## 1. Arquitectura

| Dirección pública | Servicio | Escucha en |
|---|---|---|
| `https://elrenglonve.org` | `app` (sitio, panel, API y Swagger) | `127.0.0.1:3000` |
| `https://metabase.elrenglonve.org` | `metabase` (análisis) | `127.0.0.1:3001` |
| `www.elrenglonve.org` y el IP a secas | redirigen a `https://elrenglonve.org` | — |
| — | `db` (PostgreSQL 16: bases `elrenglon` y `metabase`) | `127.0.0.1:55432` |
| — | `bcv-programador` (lectura del BCV a las 8, 14 y 20 h; avisos push de la tasa) | — |
| — | `noticias-programador` (noticiero cada hora; purga de analítica; avisos push programados; cada 5 min, prospección por correo y respuestas en ventas@) | — |
| — | `comparador` (PM2, un proceso por tienda; solo red interna) | puertos 4101–41xx internos |

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
- **Memoria.** Metabase (Java) ocupa ~1,2 GB y el comparador ~440 MB (12 tiendas, unos 35–40 MB por tienda). Con 4 GB de RAM hay **4 GB de swap** (`/swapfile` y `/swapfile2`, ambos en `/etc/fstab`; `vm.swappiness=10`) y Java se limita con `METABASE_JAVA_OPTS=-Xmx1g`. **Recomendado: subir a 8 GB** si crecen las tiendas o el uso de Metabase.

### Capacidad del servidor (medida el 03/10/2026)

**Plan:** OVH **VPS-1 2027** (Ubuntu 26.04). Se amplía desde el panel de OVH («pasando a la gama superior»); los cambios de RAM o vCores suelen requerir un reinicio, tras el cual todo vuelve a arrancar solo.

| Recurso | Capacidad | Uso medido | Margen |
|---|---|---|---|
| CPU | **2 vCores** (Intel Haswell) | carga media 0,2–0,35 | Sobrado |
| RAM | **4 GB** | ~3 GB usados, ~840 MB disponibles | **Justo: es el límite del servidor** |
| Swap | 4 GB (`/swapfile` y `/swapfile2`) | ~2,1 GB usados | Se usa de verdad: lo que va al swap responde más lento |
| Disco | **40 GB** (sin discos adicionales) | ~16 GB usados, ~23 GB libres (tras limpiar la caché de builds) | Suficiente |

**Memoria por servicio:**

| Servicio | Memoria | Nota |
|---|---|---|
| `metabase` (Java) | ~0,9–1,2 GB | El mayor consumo. Limitado con `-Xmx1g` |
| `comparador` | ~300–440 MB | 12 procesos PM2; unos 35–40 MB más por cada tienda nueva |
| `db` (PostgreSQL) | ~170–330 MB | Crece con las consultas pesadas (el directorio tiene 2 millones de filas) |
| `app` | ~100 MB | |
| `noticias-programador` y `bcv-programador` | ~15–45 MB cada uno | |
| Fuera de Docker | ~400–500 MB | Servidor de VS Code y Claude Code, usados para administrar el servidor. Al cerrar la sesión del editor se libera |

**Disco:** imágenes de Docker ~3,3 GB, volumen de PostgreSQL ~1,3 GB y respaldos en `~/respaldos/` (~41 MB cada uno; se conservan los 10 más recientes, §6). La caché de builds de Docker crece con cada despliegue: el 03/10/2026 se recuperaron 3,9 GB con `docker builder prune -f`, que no toca imágenes en uso, contenedores ni datos. Conviene repetirlo cuando el disco libre baje de 10 GB.

### Antes de desplegar otra API en este servidor

La CPU y el disco alcanzan; **la RAM no tiene margen**. Una API de Node ocupa al menos 100–200 MB, y si trae su propia base de datos, otros 150–300 MB. Con 4 GB, todo eso iría al swap y el sitio, la API y Metabase responderían más lento.

1. **Ampliar a 8 GB de RAM** (recomendado) desde el panel de OVH antes de desplegarla. Alternativas si no se amplía: detener Metabase cuando no se use (`docker compose stop metabase`, libera ~1 GB), o bajar su memoria (`METABASE_JAVA_OPTS=-Xmx768m`).
2. **Puertos:** ya usados `127.0.0.1:3000` (app), `3001` (Metabase) y `55432` (PostgreSQL). La nueva API debe escuchar solo en `127.0.0.1` y en otro puerto (p. ej. `3002`); nunca exponerla directamente.
3. **Dirección pública:** un subdominio nuevo, con su registro **A** en Spaceship hacia `40.160.143.39` y su bloque en `/etc/caddy/Caddyfile` (`reverse_proxy 127.0.0.1:3002`). Caddy emite el certificado solo.
4. **Separación:** su propio proyecto de Docker Compose y su propio `.env` (o un servicio aparte en este compose), con `restart: unless-stopped` y nombres de contenedor distintos de `elrenglon-*`.
5. **Base de datos:** si usa PostgreSQL, mejor una base aparte en el mismo contenedor `db` (con su propio rol) que un segundo PostgreSQL, que ocuparía más memoria. Incluirla en los respaldos.
6. Medir después del despliegue (`free -m`, `docker stats --no-stream`) y actualizar esta tabla.

## 3. Instalación

```bash
git clone https://github.com/Cristianhub232/El-Reglon.git && cd El-Reglon && npm ci
cp .env.example .env && chmod 600 .env
#   POSTGRES_PASSWORD, APP_SECRETO, METABASE_DB_PASSWORD, METABASE_LECTURA_PASSWORD y
#   MB_ENCRYPTION_SECRET_KEY: cada uno con  openssl rand -hex 32
#   COMPOSE_PROFILES=app,metabase   (así "docker compose up -d" levanta todo)
#   VAPID_PUBLICO y VAPID_PRIVADO: npx web-push generate-vapid-keys (docs/24; no se cambian después)
#   CORREO_SMTP_CLAVE y CORREO_SOPORTE_CLAVE: contraseñas de ventas@ y soporte@, ENTRE COMILLAS SIMPLES
#   WORLDNEWS_API_KEY (docs/20) y SOPORTE_CORREO=soporte@elrenglonve.org
docker compose up -d db && herramientas/instalar_bd.sh && herramientas/instalar_metabase.sh
docker compose up -d --build
node scripts/usuario.ts crear --correo usted@empresa.com.ve --nombre "Su nombre" --rol super
BASE_URL=http://127.0.0.1:3000 node scripts/prueba-api.ts      # 132/132 al 03/10/2026
```

## 4. Metabase

- **Base interna.** Metabase guarda preguntas, tableros y usuarios en la base `metabase` (rol `metabase`) del mismo PostgreSQL, no en H2.
- **Conexión a los datos.** Se agrega la base `elrenglon` con el rol **`metabase_lectura`** (`db/metabase/001_roles.sql`): solo `SELECT`, con `default_transaction_read_only` y `statement_timeout` de 120 s.
- **Qué ve:** **lectura completa de todos los esquemas y tablas**, incluidas las que se creen en ellos después (decisión del responsable, 03/10/2026; antes había tablas con permisos por columna y Metabase fallaba con `SELECT *`). Incluye datos personales: correos, IP, teléfonos, el directorio, los mensajes de contacto, las suscripciones push con sus claves y los hashes de contraseñas y tokens. Sigue siendo **solo lectura**. Si Metabase se abre a otras personas, conviene restringirlo.
- `db/metabase/001_roles.sql` (vía `herramientas/instalar_metabase.sh`, después de `instalar_bd.sh`) deja exactamente ese acceso. Un esquema **nuevo** necesita volver a correrlo.
- **Configuración inicial antes de publicar.** El asistente de Metabase queda abierto para el primero que llegue. Complételo por un túnel (`ssh -L 3001:127.0.0.1:3001 servidor`, luego `http://localhost:3001`) o por la API (`POST /api/setup` con el `setup-token` de `/api/session/properties`) y **después** active su bloque en Caddy.
- En la conexión, el host es `db`, el puerto `5432` y el usuario `metabase_lectura`. Tras crear esquemas o dar permisos nuevos: Administración → Bases de datos → El Renglón → «Sincronizar esquema ahora».

## 5. Dominio y TLS

1. En el DNS (Spaceship → Registros DNS): registros **A** de `@`, `www` y `metabase` hacia el IP del servidor. Borre los registros de estacionamiento.
2. `sudo cp despliegue/Caddyfile /etc/caddy/Caddyfile && sudo systemctl reload caddy`. Caddy pide y renueva los certificados solo.

Mientras el dominio no resuelva se puede publicar provisionalmente con `<ip-con-guiones>.sslip.io`, que resuelve al IP y admite certificado de Let's Encrypt, sin desactivar `COOKIE_SEGURA`.

## 6. Actualizar

Procedimiento usado en cada despliegue:

```bash
cd ~/renglon-produccion && set -a && . ./.env && set +a
docker compose exec -T db pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc > ~/respaldos/elrenglon-$(date +%Y%m%d-%H%M).dump
ls -t ~/respaldos/*.dump | tail -n +11 | xargs -r rm      # se conservan los 10 respaldos más recientes
git pull && npm ci
herramientas/instalar_bd.sh                 # esquemas y semillas (idempotente; también recarga el directorio si está su semilla)
docker compose build app comparador && docker compose up -d
BASE_URL=https://elrenglonve.org node scripts/prueba-api.ts
```

- Los respaldos (`pg_dump -Fc`, solo legibles por el usuario) quedan en `~/respaldos/`. Restaurar: `pg_restore -c -d elrenglon` dentro del contenedor `db`.
- Si cambiaron las tablas, regenerar [DATABASE.md](../DATABASE.md): `python3 herramientas/documentar_bd.py`.

## 7. Historial de la puesta en marcha (30/09/2026)

1. Aplicación y Metabase publicados provisionalmente en `https://40-160-143-39.sslip.io` y `https://metabase.40-160-143-39.sslip.io` mientras se verificaba la compra del dominio.
2. Dominio **elrenglonve.org** comprado en Spaceship (registro por 1 año, renovación automática y privacidad incluidas). Ojo: es `.org`, no `.com`.
3. En Spaceship → Registros DNS se reemplazaron los registros de estacionamiento (`34.216.117.25` y `54.149.79.189`) por tres registros **A** hacia `40.160.143.39`: `@`, `www` y `metabase`. La propagación fue inmediata.
4. Caddy emitió los certificados, las direcciones provisionales pasaron a redirigir al dominio y Metabase adoptó su dirección definitiva.
5. `scripts/prueba-api.ts` contra `https://elrenglonve.org`: **79/79**.
6. El Caddyfile con las direcciones provisionales quedó respaldado en el servidor como `/etc/caddy/Caddyfile.bak-sslip`.

### Despliegues posteriores

| Fecha | Versión | Qué entró |
|---|---|---|
| 30/09/2026 | PR #1 y #2 | Despliegue (Caddy, Metabase, reinicio de la base) e indexación en Google (robots, sitemap, canonical) |
| 30/09/2026 | PR #3 | Noticiero: Alertas24 por RSS y TalCual por WorldNewsAPI (desde el servidor el bloqueo por IP es al revés) |
| 01/10/2026 | `7960a05` | Comparador de precios (9 tiendas) y «El día en cifras» |
| 01/10/2026 | `aa2824f` | Avisos push, analítica con cookie propia, `/privacidad`, «Mis deberes» y comparador con 12 cadenas; claves VAPID generadas y swap ampliado a 4 GB |
| 03/10/2026 | PR #4 | Prospección por correo y directorio de contribuyentes (semilla copiada aparte; 639 contribuyentes especiales cargados como prospectos) |
| 03/10/2026 | PR #5 | Buscador de prospectos, búsqueda en el directorio, «Ver su correo» y «Enviar ahora» |
| 03/10/2026 | PR #6 | Botón flotante de contacto y Bandeja (ventas@ y soporte@) |

## 8. Tareas del responsable

Estado al 03/10/2026:

- [x] Cambiar las contraseñas temporales del panel y de Metabase.
- [x] Subir el TTL del registro `@` a 30 minutos en Spaceship.
- [x] Google Search Console: dominio verificado, sitemap procesado e indexación de la portada solicitada (§9).
- [ ] **Activar la verificación en dos pasos** de la cuenta de superadministrador (Panel → Mi cuenta). Es la única cuenta y tiene acceso total.
- [ ] **Cambiar las contraseñas de los buzones** `ventas@`, `admin@` y `soporte@` por contraseñas generadas, antes de activar la prospección. Las nuevas de `ventas@` y `soporte@` van al `.env` entre comillas simples y hay que reiniciar los servicios.
- [ ] Agregar `CORREO_SOPORTE_CLAVE` al `.env` para que la Bandeja lea soporte@ (docs/27).
- [ ] Mantener activa la **renovación automática del dominio** (vence en septiembre de 2027) y del plan de Spacemail.
- [ ] Recomendado: subir la VPS a 8 GB de RAM (§2), **imprescindible antes de desplegar otra API** en este servidor.
- [ ] Opcional: borrar la "Sample Database" de Metabase (Administración → Bases de datos).

## 9. Indexación en Google (SEO)

| Pieza | Implementación |
|---|---|
| `/robots.txt` | `src/app/robots.ts`: permite todo el sitio, bloquea `/admin` y `/api/` y anuncia el sitemap |
| `/sitemap.xml` | `src/app/sitemap.ts`: `/`, `/noticias`, `/solicitar-api-key`, `/docs` y `/privacidad` con su URL canónica |
| Canonical | En cada página pública (`alternates.canonical`). No va en el layout raíz: todas las páginas lo heredarían y dirían ser la portada |
| `noindex` | `/admin` (y sus páginas), `/ingresar`, `/sin-conexion` y `/baja` |
| URL base | `src/core/sitio.ts` (`SITIO_URL`, por defecto `https://elrenglonve.org`): `metadataBase`, Open Graph (`es_VE`), robots y sitemap |
| Versión canónica | `https://elrenglonve.org/`: `http://`, `www` y el IP redirigen a ella con 301/308 en un solo salto |

`scripts/prueba-api.ts` verifica robots, sitemap, canonical y `noindex`.

**Google Search Console** (hecho el 30/09/2026: propiedad de dominio verificada por TXT en Spaceship —no borrar ese registro—, sitemap procesado e indexación de la portada solicitada). Pasos, por si hay que repetirlos:
1. Agregar una propiedad de tipo **Dominio** para `elrenglonve.org`.
2. Copiar el registro **TXT** que entrega Google y crearlo en Spaceship (Host `@`, Tipo `TXT`). Después, pulsar **Verificar**.
3. En **Sitemaps**, enviar `sitemap.xml`.
4. En **Inspección de URL**, probar `https://elrenglonve.org/` y pulsar **Solicitar indexación**.
5. Revisar **Indexación → Páginas** unos días después.
