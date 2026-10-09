# 28 · Tasa de mercado USDT/VES (Binance P2P)

Referencia de mercado **no oficial**, que se muestra junto a la tasa BCV. Se agregó el 09/10/2026.

> **No es la tasa aplicable a efectos tributarios**: esa es la del BCV (Ley de IVA, art. 25). En el sitio y en la API se presenta siempre como «referencia de mercado · no oficial», con su fuente y su hora, y nunca como «dólar paralelo».
>
> **Riesgo a evaluar.** Publicar una tasa no oficial y su brecha con el BCV es sensible en Venezuela. Conviene que lo revise un abogado antes de mostrarlo en producción.

## Fuente

| Fuente | Uso | Motivo |
|---|---|---|
| **CriptoYa**, `https://criptoya.com/api/binancep2p/USDT/VES/1` | ✅ La que se usa | API pública; su `robots.txt` lo permite todo. Da la tasa de Binance P2P: `ask` (lo que se paga por 1 USDT) y `bid` (lo que se recibe al venderlo) |
| API oficial de Binance | ❌ | No tiene el par USDT/VES (el P2P no está en su API pública) |
| API interna de Binance P2P (`p2p.binance.com/bapi/…`) | ❌ | Su `robots.txt` la prohíbe (`Disallow: /bapi/`) |
| DolarApi (`ve.dolarapi.com`) | — | Su tasa «paralela» no dice de dónde sale: no es la de Binance |

## Cómo funciona

- **Lectura:** `noticias-programador` llama a `leerP2P()` (`src/modules/mercado/p2p.ts`) al arrancar y luego cada 30 minutos.
- **Validación:** se rechazan los valores menores que la mitad de la tasa BCV o mayores que 5 veces esa tasa. Si CriptoYa falla, se registra el error y se sigue mostrando la última lectura.
- **Base de datos (`db/mercado/001_esquema.sql`):**
  - `mercado.tasa_p2p` guarda compra, venta, promedio (calculado), hora del dato en la fuente y hora de lectura, sin repetir el mismo dato;
  - se conservan 400 días (`mercado.purgar()`);
  - Metabase la puede leer.
- **Cálculo** (`tasaP2PActual()`), con la última lectura de las últimas 24 h:
  - **promedio** = (compra + venta) / 2;
  - **brecha** = (promedio / tasa BCV del dólar − 1) × 100;
  - **ejemplo** de US$ 100 a una y otra tasa, con la diferencia.

  La tasa BCV es la misma que muestra la tarjeta de la portada: la de hoy o la del próximo día hábil ya publicada, o si no hay, la última.

## Dónde se ve

- **Portada**, tarjeta «Tasa oficial BCV», debajo de la fuente del BCV, con fondo blanco como el dólar y el euro. Muestra:
  - «USDT · Binance P2P» y, a la derecha, la brecha frente al BCV: **roja al alza**, verde a la baja;
  - el promedio por 1 USDT, centrado;
  - una fila con compra, venta y la tasa BCV de referencia;
  - el pie «Fuente: Binance P2P».

  Si no hay lectura en 24 horas, el bloque no aparece.
- **API:** `GET /api/v1/mercado/usdt` (permiso `bcv`) devuelve `compra`, `venta`, `promedio`, `bcv`, `brecha_pct`, `ejemplo_100_usd`, `oficial: false`, la fuente y una nota. Responde 503 `sin_datos` si no hay lectura reciente. Está documentada en Swagger.

## Producción

1. Crear la tabla: `docker compose exec -T db psql -U … -d … -f /db/mercado/001_esquema.sql` (o `herramientas/instalar_bd.sh`).
2. Reconstruir `app` y `noticias-programador`. La primera lectura ocurre al arrancar.
