# 20 · Noticiero

La sección «Noticias del día» de la portada, la página pública `/noticias` y el endpoint `GET /api/v1/noticias` muestran los titulares de diez medios venezolanos. Los titulares se leen cada hora. Esta sección reemplaza a las antiguas «Noticias fiscales del día», que se generaban con datos del BCV, del calendario y del arancel.

## Fuentes y método de lectura

| Medio | Método | Nota |
|---|---|---|
| Efecto Cocuyo, El Pitazo, Runrun.es, Crónica Uno, Caraota Digital, Monitoreamos, El Estímulo, Alertas24 | RSS (`/feed/`) | Gratis y sin límite |
| La Iguana TV | API REST de WordPress (`/wp-json/wp/v2/posts`) | No publica RSS. La imagen viene en `jetpack_featured_media_url` |
| TalCual | WorldNewsAPI (`search-news` con `news-sources`) | Su Cloudflare responde **403** («Attention Required!») a las IP de centros de datos, como la del servidor de producción, sin importar el User-Agent |

> **El resultado depende de la IP.** Desde una conexión residencial en Venezuela, Alertas24 muestra una página antibots y TalCual entrega su RSS. Desde el servidor (30/09/2026) pasa lo contrario: Alertas24 entrega su RSS (WordPress, `/feed/`) y TalCual se bloquea. La tabla describe **producción**. WorldNewsAPI no tiene artículos de Alertas24 (0 en 30 días) y sí de TalCual (unos 100 por semana). Si un medio empieza a fallar, el panel lo muestra en «Fuentes con error».

Se usa un método mixto por la cuota de WorldNewsAPI:
- El plan gratuito da **50 puntos al día**, y cada consulta cuesta alrededor de 1 punto más 0,01 por resultado.
- Consultar los 10 medios cada hora por la API superaría la cuota. Además, esa API solo indexa uno de los diez medios (TalCual).
- Por eso la API se usa solo para las fuentes sin otra vía, en **una consulta por hora** (unos 25 puntos al día). La cuota restante se guarda en cada lectura y se muestra en el panel.

Las fuentes están en `db/noticias/001_esquema.sql`. Para agregar un medio, se añade su fila (RSS, WordPress o WorldNewsAPI) y se vuelve a aplicar el archivo. Una consulta a WorldNewsAPI admite como máximo 10 medios.

## Lectura

- **Programador.** `noticias-programador` es un servicio de Docker Compose con la misma imagen que la app. Lee cada hora en el minuto `NOTICIAS_MINUTO` (por defecto 5). Al arrancar, lee enseguida si la última lectura tiene más de una hora.
- **Guardado.** Los titulares nuevos se insertan. Los existentes se actualizan solo si cambió su huella (sha256 del título, el resumen y la imagen). La portada lee la base en cada visita, así que muestra los cambios sin desplegar nada.
- **Imágenes.**
  - Primero se toma la imagen del feed: `media:content`, `media:thumbnail`, `enclosure` o la primera `<img>`. Las rutas relativas se resuelven contra el sitio del medio.
  - Si el feed no trae imagen, se lee la `og:image` del artículo. Esto se hace solo una vez por titular y como máximo 6 por medio en cada lectura; los que faltan se completan en las lecturas siguientes (`imagen_buscada`).
- **Una lectura a la vez.** Un cerrojo de PostgreSQL (`pg_try_advisory_lock`) impide que el programador y el botón «Leer ahora» del panel lean en paralelo.
- **Errores.** Si un medio falla (HTTP 403, tiempo agotado, respuesta que no es RSS), los demás siguen. El error queda en `noticias.fuente.ultimo_error` y el panel lo muestra.
- **Retención.** Se conservan 90 días de titulares y de lecturas.

Para leer a mano: `node scripts/noticias-programador.ts --una-vez`. Con `--fuente=elpitazo` se lee un solo medio.

## Seguridad

Todo lo que llega de los medios se trata como texto no confiable:
- **Texto.** Se quitan las etiquetas HTML, se decodifican las entidades y se recortan los textos (título hasta 400 caracteres, resumen hasta 600). También se elimina el pie automático de WordPress («La entrada… se publicó primero en…»). La interfaz nunca inserta HTML de terceros.
- **Enlaces.** Solo se aceptan si son del dominio del medio o de un subdominio. Se les quitan los parámetros de campaña (`utm_*`, `fbclid`, `gclid`).
- **Imágenes.**
  - Solo https; las http se pasan a https para evitar contenido mixto.
  - Se cargan desde el medio con `referrerpolicy="no-referrer"` y `loading="lazy"`.
  - Si la imagen falla (por ejemplo, por protección contra enlaces directos), se muestra una lámina con el nombre del medio.
- **Fechas.** Una fecha futura se toma como «ahora». No se guardan titulares con más de una semana de antigüedad.
- **Identificación.** El programador se identifica como `ElRenglon/0.1 (+https://elrenglonve.org; noticiero)` y lee cada medio una vez por hora.

## Tablas (esquema `noticias`)

| Tabla | Contenido |
|---|---|
| `fuente` | Medio, sitio (dominio permitido), método, dirección de lectura, activa, última lectura, último éxito y último error |
| `articulo` | Titular: URL (única), título, resumen, imagen, autor, categoría, fecha de publicación, huella, visible y quién lo ocultó |
| `lectura` | Cada lectura: origen (programador, panel o consola), nuevos, actualizados, errores y detalle por fuente con la cuota de WorldNewsAPI |

El mismo archivo agrega el permiso `noticias` a las API keys (`core.api_key` y `core.solicitud_api_key`) y, si Metabase está instalado, le da lectura del esquema.

## API

| Endpoint | Parámetros |
|---|---|
| `GET /api/v1/noticias` | `limite` (1 a 100), `pagina`, `fuente` (identificador), `q` (busca en el titular y el resumen), `desde` (ISO 8601) |
| `GET /api/v1/noticias/fuentes` | Medios con su estado y los titulares de las últimas 24 horas |

Ambos endpoints requieren una API key con el permiso `noticias`. `resumen` es texto plano y `url` lleva al artículo original. Están documentados en Swagger (`/docs`).

## Panel: sección «Noticiero»

La ven los roles super, curador y solo lectura. La gestionan el superadministrador y el curador.

- **Indicadores:** titulares de las últimas 24 horas, última lectura, fuentes con error y cuota restante de WorldNewsAPI.
- **Fuentes:** método, estado o error, último éxito, titulares en 24 horas y porcentaje con imagen. Por cada fuente hay acciones para «Leer» y «Pausar» o «Reactivar». Pausar una fuente oculta sus titulares y deja de leerla.
- **Titulares recientes:** filtro por medio y lista de ocultos. «Ocultar» retira un titular de la portada, de `/noticias` y de la API. El programador respeta esa decisión.
- **Lecturas recientes:** las últimas 12, con su origen y resultado.

Las acciones del panel quedan en la auditoría, en la categoría «Noticiero». Las lecturas horarias no se auditan; se registran en `noticias.lectura`.

## Configuración

| Variable | Uso |
|---|---|
| `WORLDNEWS_API_KEY` | Clave de worldnewsapi.com, solo en `.env` y nunca en el repositorio. Sin ella, TalCual queda con error y los demás medios funcionan |
| `NOTICIAS_MINUTO` | Minuto de cada hora en que se lee (por defecto 5) |

En producción, después de `git pull`:
1. Aplicar el esquema: `herramientas/instalar_bd.sh`, o solo `db/noticias/001_esquema.sql` con `psql`.
2. Agregar `WORLDNEWS_API_KEY` al `.env`.
3. Ejecutar `docker compose --profile app up -d --build`. Esto también levanta `noticias-programador`.
