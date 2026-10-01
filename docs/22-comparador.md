# 22 · Comparador de precios

«¿Dónde está más barato?»: buscas un producto y El Renglón lo consulta **en vivo** en las tiendas venezolanas en línea. Empareja el mismo producto entre tiendas y muestra el mejor precio en bolívares y en dólares, a la tasa BCV del día. Está en grande en la portada (`/#comparador`), en la API (`/api/v1/comparador`) y en el panel (Contenido → Comparador de precios).

## Arquitectura

```
navegador ──▶ app (Next) ──▶ comparador-locatel      ─▶ www.locatel.com.ve
   ▲            │  en paralelo ─▶ comparador-farmaciasaas ─▶ www.farmaciasaas.com
   └── NDJSON ◀─┘              ─▶ comparador-damasco      ─▶ www.damascovzla.com
                                     (PM2 en el contenedor «comparador»)
```

- **Un servicio por tienda bajo PM2.** Corre en el contenedor `comparador` (imagen `elrenglon-comparador`, `pm2-runtime`). Cada servicio escucha en su puerto, solo dentro de la red interna de Docker (no hay puertos publicados), y responde:
  - `GET /buscar?q=`: las ofertas de la tienda, en su moneda.
  - `GET /salud`: si está vivo, cuántos términos tiene en caché y cuántas consultas en curso.
- **Credencial interna.** La app y los servicios usan la cabecera `x-comparador`, derivada de `APP_SECRETO`. Así otros contenedores de la red no pueden usar los servicios.
- **Cuidado con las tiendas.**
  - Caché de 15 minutos por término.
  - Como mucho 2 consultas a la vez a cada tienda.
  - Si la misma búsqueda ya está en curso, se comparte la respuesta en lugar de repetirla.
  - Nos identificamos como `ElRenglon/0.1 (+https://elrenglonve.org; comparador de precios)`.
- **La app pregunta a todas a la vez.** Va enviando cada respuesta en cuanto llega: el endpoint público responde en **NDJSON**, con un evento `inicio`, luego un `tienda` o un `error` por tienda, y al final un `fin`. La portada muestra los resultados a medida que aparecen.
- **PM2.**
  - Estado: `docker exec elrenglon-comparador pm2 ls`.
  - Registros: `docker logs elrenglon-comparador`.
  - Fuera de Docker: `npx pm2 start comparador/ecosystem.config.cjs`.
  - Si un servicio se cae, PM2 lo reinicia con espera creciente. También se reinicia si pasa de 200 MB.

### Tiendas y plataformas

Las tiendas se registran en `datos/comparador/tiendas.json`: id, nombre, sitio, plataforma, moneda en que publica, rubros y puerto. Los servicios se sincronizan con la tabla `comparador.tienda` al arrancar.

| Tienda | Cómo se lee | Moneda | Estado |
|---|---|---|---|
| Locatel | VTEX, API pública de catálogo (trae el EAN) | Bs. | Activa |
| Farmacias SAAS | VTEX | US$ | Activa |
| Damasco | VTEX | US$ | Activa (electrónica y hogar) |
| Central Madeirense | WooCommerce, página de búsqueda **de cada sede** (`/Bello-Monte-08/?s=…`) | US$ («REF») | Activa, con **16 sedes** (Gran Caracas, Altos Mirandinos y Maiquetía); por defecto, Bello Monte |
| La Alacena Market | Página de búsqueda (`/buscar?filtro=`) | US$ | Activa (Maracaibo, Zulia) |
| Ivoo | Magento, API GraphQL pública (`nuweapp.com/graphql`) | US$ | Activa (electrónica y hogar) |
| Farmatodo | **Por índice**: sitemap (13.589 productos) y datos estructurados de cada página | Bs. | Activa. Su `robots.txt` prohíbe la búsqueda (`/buscar*`) pero permite las páginas de producto. Vuelta completa ≈ 7,5 h (2 s por página) |
| Plan Suárez | **Por índice**: sitemap (9.766 productos) y la página de cada producto; el código de barras sale del nombre de la imagen | Bs. | Activa. Prohíbe la búsqueda (`route=product/search`) y pide `Crawl-delay: 5`. Vuelta completa ≈ 13,5 h |
| Gama | **Por índice**: sitemap (1.024 productos) y su API pública de producto (OCC) | US$ («REF») | Activa. Prohíbe la búsqueda (`*?query=*`). Vuelta completa ≈ 35 min |
| Mercasa, Que Mantequilla | Next.js propio | — | **Pendientes.** Buscan desde el navegador por su `/api`, que su `robots.txt` prohíbe |
| Río Market | Instaleap | — | **Pendiente.** Su API exige credenciales internas del sitio |
| Multimax | Astro | — | **Excluida.** Cloudflare responde con un desafío antibots (`cf-mitigated: challenge`) |
| Plazas | Cloudflare | — | **Excluida.** Desafío antibots |
| Makro (tienda.makro.com.co) | — | — | **Excluida.** Es de Colombia (pesos colombianos); Makro Venezuela no vende en línea |

### Tiendas por índice

Algunas tiendas prohíben en su `robots.txt` la búsqueda automática, pero permiten sus páginas de producto y las publican en su sitemap precisamente para que se lean. Para ellas no se consulta su buscador. Su servicio (`src/modules/comparador/indice/`) funciona así:

1. **Lee el sitemap** una vez al día y guarda las páginas de producto en `comparador.indice_url`. Las que dejan de aparecer ya no se leen.
2. **Recorre las páginas una a una**, empezando por la que lleva más tiempo sin leerse, con una pausa entre cada una: la mayor entre la configurada en `tiendas.json` y el `Crawl-delay` de la tienda.
   - Antes de cada página **comprueba su `robots.txt`**, que se relee cada día. Una URL vetada se marca y no se vuelve a pedir.
3. **Guarda** producto, precio e historial en las mismas tablas que las demás tiendas. Además guarda el nombre normalizado y la fecha de lectura (`leido_en`).
4. **Si la tienda responde 429, 403 o 5xx**, deja de leer y espera cada vez más tiempo (1, 2, 4… minutos, hasta 1 hora).

La búsqueda de esas tiendas se resuelve **en el índice propio**:
- todas las palabras deben aparecer, sin acentos y en cualquier orden (índice trigram de PostgreSQL);
- solo se usan páginas leídas en los últimos 3 días, con su último precio.

Cada precio indica hace cuánto se leyó: en la portada («· hace 3 h») y en la API (`precio_leido_en`).

**Lo buscado pasa al frente de la fila.** La primera vuelta completa toma horas (Farmatodo ≈ 7,5 h). Para que una búsqueda no espere tanto, en las tiendas cuyas URL llevan el nombre del producto (Farmatodo y Gama, `slug: true`) funciona así:
- Al buscar, hasta 15 páginas cuya URL contiene todas las palabras, y que no se han leído en las últimas 6 horas, reciben **prioridad**.
- El recorrido las lee primero, **al mismo ritmo** de siempre (una cada 2 s).
- Mientras tanto, la portada indica «leyendo N páginas de su catálogo». Una búsqueda repetida a los pocos segundos ya las trae.
- Plan Suárez no puede priorizarse, porque sus URL solo llevan un número (`product_id`); se completa con la vuelta normal.

`COMPARADOR_INDICE=0` apaga el recorrido en una copia; la búsqueda sigue con lo ya indexado. **Debe estar encendido solo en producción**, para no duplicar la carga sobre las tiendas.

**Reglas para leer una tienda:**
- Se respeta su `robots.txt`: si prohíbe la búsqueda pero permite las páginas de producto, se usa el índice; si prohíbe ambas, no se lee.
- No se evaden protecciones antibots, como el desafío de Cloudflare.
- No se usan APIs privadas ni credenciales internas.
- Se lee solo lo que su propio buscador muestra a cualquier visitante.

**Sedes.** Algunas tiendas tienen un catálogo por sede: Central Madeirense publica un sitio por sucursal y los precios cambian entre ellas.
- En `tiendas.json`, esas tiendas declaran `sucursales` (clave, nombre, ciudad, estado) y una `predeterminada`.
- La portada muestra un selector («Sede de Central Madeirense»), recordado en el navegador.
- En la URL o la API se pide con `sucursal.<tienda>=<clave>`, por ejemplo `sucursal.centralmadeirense=Chacaito-07`.
- Las tiendas de una sola ciudad declaran su `ubicacion`, que se muestra junto a su nombre.

**Sumar una tienda:**
- Si su plataforma ya tiene lector (por ejemplo, otra VTEX), basta con una entrada en `tiendas.json` con un puerto libre, y reconstruir.
- Si es una plataforma nueva, hay que escribir su lector en `src/modules/comparador/adaptadores/` (devuelve `OfertaTienda[]`) y agregar una línea en `adaptadores/index.ts`.

## Emparejamiento

Está en `src/modules/comparador/emparejar.ts` y es el mismo en el servidor (API) y en el navegador.

1. **Código de barras.** Si dos ofertas tienen el mismo EAN o UPC válido (se comprueba el dígito verificador GS1), son el mismo producto. Los códigos internos de las tiendas (por ejemplo, `D0006035` en Damasco) se descartan.
2. **Sin código de barras.** Hacen falta todas estas condiciones:
   - **Misma presentación**, normalizada en `normalizar.ts`: `1KG` = `1 kg` = 1000 g; `X10` = `10 tabletas` = `10 comp`. Los números de modelo (`2T-C32GF2060L`) no cuentan como cantidad.
   - **Misma marca.** Si una tienda no la envía, el nombre de su producto debe contener la marca de la otra.
   - **Nombres que difieren como mucho en una palabra, de un solo lado**, sin contar la marca ni las palabras de empaque (frasco, paquete, tipo…). Se aceptan abreviaturas («arr» = «arroz», «dulc» = «dulce») y el género («blanco» = «blanca»).
   - Esa palabra no puede ser un **atributo distintivo**, como descremada, completa, integral, sin gluten, amarilla o dulce. Es mejor no comparar que comparar mal.
3. **Cada oferta debe ser compatible con todas las del grupo**, no solo con una, así que no se forman cadenas. Dos productos distintos de la misma tienda y sede nunca se juntan.
5. **Precio dudoso.** Dentro de un mismo producto, una oferta por debajo del 40 % o por encima de 2,5 veces la mediana se marca como «precio dudoso». La mediana se calcula con todas las ofertas, si hay 3 o más; con 2, se marcan ambas si una cuesta más de 4 veces la otra. Esa oferta va al final y nunca sale como «el más barato» (en la API, `precio_dudoso`). Ejemplo real: Farmatodo publicaba la Harina PAN 1 kg a Bs. 84,20 en su propia página, con las demás tiendas alrededor de Bs. 1.000.
4. **Dos ofertas con códigos de barras distintos nunca se juntan.** Si comparten código, son el mismo producto aunque cada tienda lo rotule distinto (por ejemplo, Genven y Leti).

Medido con 10 búsquedas reales (harina pan, arroz mary, mayonesa mavesa, pasta primor, leche en polvo…): 33 productos comparables entre tiendas, sin emparejamientos falsos.

Los productos se ordenan así: primero los más pertinentes a la búsqueda, luego los que aparecen en más tiendas (los comparables) y por último el precio. Dentro de cada producto, las ofertas van de la más barata a la más cara, con la diferencia en porcentaje.

## Precios

- Cada tienda publica en su moneda.
- La conversión usa la **tasa BCV aplicable a hoy** (art. 25 de la Ley de IVA, `bcv.tasa_aplicable`): Bs. = US$ × tasa, y al revés.
- La API entrega `precio` y `moneda` tal como los publica la tienda, más `precio_bs` y `precio_usd`.

## Datos guardados (esquema `comparador`)

No se descargan catálogos completos. Se guarda solo lo que devuelven las búsquedas, así que la base crece con lo que la gente busca de verdad y forma un historial de precios.

| Tabla | Contenido |
|---|---|
| `tienda` | Registro sincronizado, si está activa y su última respuesta o error |
| `sucursal` | Sede o sucursal. Cada tienda tiene la «Tienda en línea»; las que publican por sucursal (Central Madeirense por ruta, Plazas por subdominio) tendrán una fila por sucursal con su `clave`, estado y ciudad |
| `producto` | Producto de una sucursal: id en la tienda, nombre, marca, EAN válido, URL e imagen; en las tiendas por índice, también el nombre normalizado y `leido_en` |
| `indice_url` / `indice_estado` | Tiendas por índice: páginas de su sitemap con el resultado de su última lectura, y el estado del recorrido (pausa, espera por errores) |
| `precio` | Historial: una fila cuando cambian el precio o la existencia, o como mucho una al día |
| `busqueda` | Término, origen (portada o API), resultados, tiendas que respondieron y duración. No se guarda quién busca |

## API

| Endpoint | Uso |
|---|---|
| `GET /api/v1/comparador/buscar?q=&limite=` | Permiso `comparador`. Espera a todas las tiendas y devuelve los productos emparejados, con su mejor precio y las ofertas |
| `GET /api/v1/comparador/tiendas` | Tiendas activas, rubros y moneda |
| `GET /api/publico/comparador/buscar?q=` | Sin API key: es el buscador de la portada. Responde en NDJSON y admite 12 búsquedas por minuto por IP |

## Panel

Contenido → Comparador de precios. Lo ven super, curador y lectura; pausa y reactiva tiendas el super o el curador.

- **Indicadores:** búsquedas de hoy y de 7 días, productos registrados, precios en el historial y búsquedas sin resultado.
- **Tiendas:** plataforma, estado del servicio de PM2 (consultando su `/salud`), último fallo de la tienda, última respuesta y productos con EAN. Pausar una tienda la quita de la portada y de la API, pero su servicio sigue corriendo.
- **Búsquedas:** lo más buscado (7 días), lo buscado sin resultado (30 días, para saber qué tiendas o productos faltan) y las búsquedas recientes.

## Próximos pasos

- Las tiendas pendientes, si cambian sus condiciones o con un acuerdo con cada cadena.
- Sucursales de Central Madeirense (por ruta).
- Precio por unidad (Bs./kg) para comparar presentaciones distintas.
- Historial de precio por producto y alertas.
- Vectores (pgvector) para emparejar los productos que no tienen código de barras y se escriben muy distinto.

## Producción

Después de `git pull`:
1. `herramientas/instalar_bd.sh`: crea el esquema `comparador` y el permiso.
2. `docker compose --profile app up -d --build`: también construye y levanta `elrenglon-comparador`.

No hace falta ninguna variable nueva: la app encuentra los servicios en `comparador` (`COMPARADOR_HOST`) y la credencial sale de `APP_SECRETO`.

**Comprobar desde el servidor que cada tienda responde.** Algunas bloquean las IP de centros de datos; ya pasó con TalCual en el noticiero. Si una falla, el panel lo muestra y se puede pausar.
