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

| Tienda | Plataforma | Moneda | Estado |
|---|---|---|---|
| Locatel | VTEX (API pública de catálogo) | Bs. | Activa |
| Farmacias SAAS | VTEX | US$ | Activa |
| Damasco | VTEX | US$ | Activa (electrónica y hogar) |
| Río Market, Gama, Ivoo, Plan Suárez, Central Madeirense, Que Mantequilla, La Alacena, Multimax, Mercasa, Farmatodo | Varias (Next.js propio, SAP Commerce, Magento, OpenCart, WooCommerce, Algolia) | — | Próximas: un lector por plataforma, una por una |
| Plazas | Cloudflare con desafío antibots | — | Excluida: no se evaden protecciones |
| Makro (tienda.makro.com.co) | — | — | Excluida: es de Colombia (pesos colombianos) |

**Sumar una tienda:**
- Si su plataforma ya tiene lector (por ejemplo, otra VTEX), basta con una entrada en `tiendas.json` con un puerto libre, y reconstruir.
- Si es una plataforma nueva, hay que escribir su lector en `src/modules/comparador/adaptadores/` (devuelve `OfertaTienda[]`) y agregar una línea en `adaptadores/index.ts`.

## Emparejamiento

Está en `src/modules/comparador/emparejar.ts` y es el mismo en el servidor (API) y en el navegador.

1. **Código de barras.** Si dos ofertas tienen el mismo EAN o UPC válido (se comprueba el dígito verificador GS1), son el mismo producto. Los códigos internos de las tiendas (por ejemplo, `D0006035` en Damasco) se descartan.
2. **Sin código de barras.** Hacen falta las tres cosas:
   - la misma **presentación** (normalizada en `normalizar.ts`: `1KG` = `1 kg` = 1000 g; `X10` = `10 tabletas` = `10 comp`);
   - la misma marca, si ambas la tienen;
   - nombres con al menos el 75 % de las palabras en común (sin acentos ni palabras vacías, singular y plural iguales).
3. **Dos ofertas con códigos de barras distintos nunca se juntan.**

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
| `producto` | Producto de una sucursal: id en la tienda, nombre, marca, EAN válido, URL e imagen |
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

- Lectores para las demás plataformas, una tienda a la vez.
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
