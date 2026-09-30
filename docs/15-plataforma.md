# 15 · Plataforma base (API, Swagger y despliegue)

> Implementado el 27/09/2026. Next.js 16 + PostgreSQL 16. Módulos en servicio: **BCV, Arancel (consulta), Calendario y RIF**. Pendientes: IVA (clasificador) y detección arancelaria.

## 1. Estructura

```
src/core/            db.ts (pool pg), ruta.ts (API key, permisos, límite, errores), http.ts, validacion.ts, api-key.ts
src/modules/<mód>/   consultas.ts (y bcv/ingesta.ts)
src/app/api/v1/...   endpoints (Route Handlers)
src/app/docs         Swagger UI            src/openapi.ts   especificación OpenAPI 3.1
scripts/             api-key.ts, bcv-ingesta.ts, bcv-programador.ts, prueba-api.ts (Node 24 ejecuta TypeScript directamente)
db/<mód>/            esquemas y cargas SQL           herramientas/instalar_bd.sh  instala todo
```

Los módulos solo usan sintaxis TypeScript "borrable" e importaciones con extensión `.ts`: el mismo código sirve a Next.js y a los scripts, sin compilar.

## 2. Endpoints (todos con `X-API-Key`, salvo `/api/salud`)

| Módulo | Ruta |
|---|---|
| Servicio | `GET /api/salud` · `GET /api/openapi.json` · `/docs` (Swagger) · `/` |
| BCV | `/api/v1/bcv/tasas/actual` · `/tasas?fecha=` · `/tasas?desde=&hasta=&moneda=` · `/tasa-aplicable` · `/convertir` · `/monedas` · `/moneda-mayor-valor` |
| Arancel | `/api/v1/arancel/{codigo}` (2, 4 o 5–10 dígitos) · `/buscar?q=` · `/secciones` · `/catalogos/{reglas\|abreviaturas\|conversiones\|regimenes\|unidades}` |
| Calendario | `/api/v1/calendario/proximos?rif=&tipo=` · `/obligaciones` · `/condiciones` · `/dias-inhabiles` |
| RIF | `/api/v1/rif/validar?rif=` |

Convenciones:
- Tasas y montos se devuelven como **texto decimal exacto**.
- Las fechas van en `AAAA-MM-DD`; si se omiten, se usa **hoy en Caracas**.
- Los errores tienen la forma `{ "error": { "codigo", "mensaje" } }` (400, 401, 403, 404, 429).

## 3. Seguridad

- **API keys** con formato `rgl_<prefijo>_<secreto>`. En la base solo se guarda su **SHA-256** y el token se muestra una sola vez.
- **Permisos por módulo** (`bcv`, `arancel`, `calendario`, `rif`, `iva`, `admin`).
- **Límite de consultas por minuto** para cada clave (por defecto 60), informado en las cabeceras `X-RateLimit-*`. La cuenta es en memoria, por instancia.
- Mientras no exista la UI de administración, las claves se gestionan por consola, y cada alta o revocación queda en `core.auditoria`:
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
cp .env.example .env                       # cambiar la contraseña
docker compose up -d db && herramientas/instalar_bd.sh
docker compose --profile app up -d --build # API/UI en http://127.0.0.1:3000 y programador BCV
npm run apikey -- crear --nombre "prueba" --permisos bcv,arancel,calendario,rif
```

Desarrollo local: `npm install`, `npm run dev`, `npm run typecheck`. Producción (Caddy, dominio y Metabase): [19](19-despliegue-produccion.md).

## 6. Verificación (27/09/2026)

- `npm run build` y `tsc` sin errores.
- `scripts/prueba-api.ts`: **79/79 verificaciones** (37 de la plataforma base, 20 del clasificador de IVA, 8 de la detección arancelaria y 14 del sitio, la PWA y las sesiones), tanto con el servidor local como contra los contenedores. Cubren:
  - seguridad: 401, 403 y 429;
  - valores oficiales conocidos del BCV, el Arancel y el Calendario;
  - prórroga del COT art. 10;
  - errores de validación.
- Lectura real de la portada del BCV, en local y dentro del contenedor: coincide con el Excel oficial (`sin_cambios`). También se probaron el registro de un día nuevo, su completado por el archivo trimestral y la discrepancia sin sobrescritura.

## 7. Pendiente en la plataforma

- ~~UI de administración, UI de consulta (A21) y auditoría~~: implementadas ([18](18-interfaz-pwa-panel.md)). A21 quedó resuelta así: la consulta es pública y sin cuenta, con límite por IP.
- Límite de consultas compartido si se despliegan varias instancias.
- ~~Módulos IVA y detección arancelaria~~: implementados ([16](16-clasificador-iva.md), [17](17-deteccion-arancelaria.md)).
