# 15 · Plataforma base (API, Swagger y despliegue)

> Implementado el 27/09/2026 y ampliado hasta el 03/10/2026. Next.js 16 + PostgreSQL 16. Módulos en servicio: **IVA, BCV, Arancel (consulta y detección), Calendario, RIF, Noticias y Comparador de precios**, más el sitio público, los avisos push, la prospección por correo y el botón de contacto. Tablas y esquemas: [DATABASE.md](../DATABASE.md).

## 1. Estructura

```
src/core/            db.ts (pool pg), ruta.ts (API key, permisos, límite, errores), http.ts, validacion.ts, api-key.ts
src/modules/<mód>/   lógica de cada módulo (iva, bcv, arancel, calendario, rif, noticias, comparador, analitica, avisos,
                     prospeccion, contacto, web, admin)
src/app/api/v1/...   endpoints (Route Handlers)
src/app/docs         Swagger UI            src/openapi.ts   especificación OpenAPI 3.1
scripts/             api-key.ts, usuario.ts, bcv-programador.ts, noticias-programador.ts, comparador-tienda.ts, prueba-api.ts…
                     (Node 24 ejecuta TypeScript directamente)
db/<mód>/            esquemas y cargas SQL           herramientas/instalar_bd.sh  instala todo
```

Los módulos solo usan sintaxis TypeScript "borrable" e importaciones con extensión `.ts`: el mismo código sirve a Next.js y a los scripts, sin compilar.

## 2. Endpoints

**API con `X-API-Key`** (permiso por módulo):

| Módulo | Ruta |
|---|---|
| IVA | `POST /api/v1/iva/clasificar` · `GET /api/v1/iva/codigo/{codigo}` · `/reglas` · `/alicuotas` · `/base-legal` ([16](16-clasificador-iva.md)) |
| BCV | `/api/v1/bcv/tasas/actual` · `/tasas?fecha=` · `/tasas?desde=&hasta=&moneda=` · `/tasa-aplicable` · `/convertir` · `/monedas` · `/moneda-mayor-valor` |
| Arancel | `/api/v1/arancel/{codigo}` (2, 4 o 5–10 dígitos) · `/buscar?q=` · `/secciones` · `/catalogos/{reglas\|abreviaturas\|conversiones\|regimenes\|unidades}` · `/detectar` (GET y POST, [17](17-deteccion-arancelaria.md)) |
| Calendario | `/api/v1/calendario/proximos?rif=&tipo=` · `/obligaciones` · `/condiciones` · `/dias-inhabiles` |
| RIF | `/api/v1/rif/validar?rif=` |
| Noticias | `/api/v1/noticias` · `/api/v1/noticias/fuentes` ([20](20-noticiero.md)) |
| Comparador | `/api/v1/comparador/buscar?q=` · `/api/v1/comparador/tiendas` ([22](22-comparador.md)) |

**Sin API key** (herramientas del sitio, con límite por IP):

| Para qué | Ruta |
|---|---|
| Servicio | `GET /api/salud` · `GET /api/openapi.json` · `/docs` (Swagger) |
| Clasificador del sitio | `POST /api/publico/iva/clasificar` |
| Mis deberes | `GET /api/publico/calendario/deberes` · `GET /api/publico/calendario/condiciones` |
| Comparador del sitio | `GET /api/publico/comparador/buscar` |
| Analítica | `POST /api/publico/visita` ([23](23-analitica.md)) |
| Avisos push | `GET /api/publico/avisos/clave` · `POST /api/publico/avisos/suscripcion` · `/estado` · `/baja` ([24](24-avisos.md)) |
| Prospección | `POST /api/publico/prospeccion/baja?t=` (baja en un clic, [26](26-prospeccion.md)) |
| Botón de contacto | `POST /api/publico/contacto` ([27](27-contacto-y-bandeja.md)) |

Convenciones:
- Tasas y montos se devuelven como **texto decimal exacto**.
- Las fechas van en `AAAA-MM-DD`; si se omiten, se usa **hoy en Caracas**.
- Los errores tienen la forma `{ "error": { "codigo", "mensaje" } }` (400, 401, 403, 404, 429).

## 3. Seguridad

- **API keys** con formato `rgl_<prefijo>_<secreto>`. En la base solo se guarda su **SHA-256** y el token se muestra una sola vez.
- **Permisos por módulo** (`iva`, `bcv`, `arancel`, `calendario`, `rif`, `noticias`, `comparador`, `admin`).
- **Límite de consultas por minuto** para cada clave (por defecto 60), informado en las cabeceras `X-RateLimit-*`. La cuenta es en memoria, por instancia.
- Las claves se gestionan en el panel (**API keys**: alta, revocación y solicitudes desde `/solicitar-api-key`) o por consola. Cada alta o revocación queda en `core.auditoria`:
  ```bash
  npm run apikey -- crear --nombre "Mi app" --permisos bcv,arancel --limite 60
  npm run apikey -- listar
  npm run apikey -- revocar --prefijo 1a2b3c4d
  ```
- La base de datos y la aplicación solo escuchan en `127.0.0.1`. Para publicarlas hace falta un proxy inverso con TLS.
- El contenedor corre sin privilegios de root.
- La verificación TLS contra el BCV nunca se desactiva: se agrega el intermediario de `config/ca/`.

## 4. Lectura diaria del BCV

`bcv-programador` lee la portada a las 8, 14 y 20 h de Caracas (configurable con `BCV_HORAS`) y reintenta 3 veces, cada 15 minutos, si falla.

| Situación | Resultado |
|---|---|
| Fecha valor nueva | Se registra la tasa oficial (venta) de las 5 monedas de la portada, con origen `portada` |
| Fecha ya registrada con los mismos valores | `sin_cambios` |
| La portada contradice lo registrado | **No se sobrescribe**: se crea una observación `discrepancia_portada` y el proceso sale con código 2 |
| Variación del USD mayor al 20 % | Se rechaza para revisión |
| Llega el archivo trimestral oficial | **Completa** las filas de la portada (compra, cotizaciones, 21 monedas y fecha de operación) |

## 5. Ejecutar

```bash
cp .env.example .env                       # cambiar las contraseñas y generar los secretos (ver docs/19)
docker compose up -d db && herramientas/instalar_bd.sh
docker compose --profile app up -d --build # app (127.0.0.1:3000), bcv-programador, noticias-programador y comparador
npm run apikey -- crear --nombre "prueba" --permisos bcv,arancel,calendario,rif
```

Servicios del perfil `app`: `app` (sitio, panel y API), `bcv-programador` (tasas a las 8, 14 y 20 h), `noticias-programador` (noticiero cada hora; además, cada 5 minutos, la prospección y las respuestas en ventas@) y `comparador` (PM2, un proceso por tienda). Metabase va en el perfil `metabase`.

Desarrollo local: `npm install`, `npm run dev`, `npm run typecheck`. Producción (Caddy, dominio y Metabase): [19](19-despliegue-produccion.md).

## 6. Verificación

- `npm run build` y `tsc` sin errores.
- `scripts/prueba-api.ts` (03/10/2026, contra `https://elrenglonve.org`): **132/132 verificaciones**:

  | Sección | Verificaciones |
  |---|---:|
  | Servicio y seguridad | 6 |
  | BCV | 9 |
  | Arancel | 13 |
  | Detección arancelaria | 8 |
  | Calendario y RIF | 9 |
  | Noticias | 7 |
  | Mis deberes tributarios (público) | 3 |
  | Analítica del sitio | 2 |
  | Avisos push | 6 |
  | Comparador de precios | 6 |
  | Prospección por correo | 17 |
  | Contacto y bandeja | 6 |
  | IVA | 21 |
  | Sitio, PWA y sesiones | 19 |

  La primera versión (27/09/2026) tenía 79. Cubren:
  - seguridad: 401, 403 y 429;
  - valores oficiales conocidos del BCV, el Arancel y el Calendario;
  - prórroga del COT art. 10;
  - errores de validación.
- Lectura real de la portada del BCV, en local y dentro del contenedor: coincide con el Excel oficial (`sin_cambios`). También se probaron el registro de un día nuevo, su completado por el archivo trimestral y la discrepancia sin sobrescritura.

## 7. Pendiente en la plataforma

- ~~UI de administración, UI de consulta (A21) y auditoría~~: implementadas ([18](18-interfaz-pwa-panel.md)). A21 quedó resuelta así: la consulta es pública y sin cuenta, con límite por IP.
- Límite de consultas compartido si se despliegan varias instancias.
- ~~Módulos IVA y detección arancelaria~~: implementados ([16](16-clasificador-iva.md), [17](17-deteccion-arancelaria.md)).
- El límite por IP de las herramientas públicas también es en memoria, por instancia.
