# 10 · Análisis del repositorio tasas-bcv (premisa 12)

> **Repositorio:** https://git.grkzn.com/sirumatek/bnpl/tasas-bcv (NestJS + TypeORM + PostgreSQL, 4 commits, 15/05/2026)
> **Analizado el:** 27/09/2026. Se clonó y se leyó todo el código **sin ejecutarlo**. Los selectores del scraper se probaron contra la portada real del BCV.
> **Responde la pregunta A28:** cómo obtiene hoy la tasa el servicio BCV del equipo.

## 1. Veredicto

Es un **microservicio pequeño, claro y bien documentado**: unas 400 líneas de TypeScript, SQL parametrizado, migraciones, `.env` fuera de git, zona horaria de Caracas en Docker y sin secretos en el historial. **Su lógica se puede portar casi tal cual** al módulo BCV de El Renglón (también TypeScript), pero tiene **un defecto urgente** y algunos ajustes necesarios para cumplir la premisa 10.

| Aspecto | Evaluación |
|---|---|
| Fuente | ✅ Portada oficial `www.bcv.org.ve`, bloque "Tipo de cambio oficial del BCV" |
| Fecha | ✅ Usa la **fecha valor** publicada (atributo `content` de `span.date-display-single`), que es la correcta |
| Monedas | EUR y USD (el BCV publica además CNY, TRY y RUB) |
| Selectores | ✅ **Funcionan hoy.** Con el HTML real del 27/09/2026 se lee USD 857,00580000 y EUR 976,90091142, fecha valor lunes 28/09/2026 |
| Precisión | ⚠️ Guarda `numeric(18,6)` y el BCV publica **8 decimales**: redondea |
| Números mayores a 1.000 | ❌ **Defecto urgente** (§2.1) |
| TLS | ⚠️ Ofrece desactivar la verificación (`BCV_INSECURE_TLS=1`). La causa real está identificada y tiene solución segura (§2.3) |
| Semántica legal | ⚠️ Solo consulta por fecha exacta: los fines de semana y feriados responde 404. No aplica la regla del art. 25 de la Ley de IVA (§2.4) |
| Datos históricos | El CSV "Listado de Tasas Diarias.csv" **no está en el repositorio** |

## 2. Hallazgos

### 2.1 🔴 Urgente: el parser falla con tasas de 1.000 o más

`parseEuropeanRate` hace `texto.replace(',', '.')`, es decir, solo cambia la coma decimal. El BCV usa **punto de miles**: en la misma portada aparece "5.355,5058" en el tipo de cambio de referencia. Con una tasa como "1.023,45678901" el resultado es `NaN`, el scraper lanza error y **deja de guardar tasas**.

- **Cuándo ocurrirá:** el **EUR ya está en 976,90** (fecha valor 28/09/2026). Si cruza 1.000, el servicio en producción (BNPL) dejará de actualizar el EUR y el USD, porque se guardan juntos.
- **Corrección propuesta** (probada con "857,00580000", "1.023,45678901", "12.345.678,5" y entradas inválidas):

```ts
private parseEuropeanRate(text: string): number {
  const s = text.trim().replace(/\s+/g, '');
  // formato venezolano: punto de miles opcional y coma decimal ("857,00580000", "1.023,45678901")
  if (!/^(\d{1,3}(\.\d{3})+|\d+)(,\d+)?$/.test(s)) {
    throw new Error(`Tasa con formato inesperado: ${JSON.stringify(text)}`);
  }
  const value = Number(s.replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) throw new Error(`Tasa no válida: ${JSON.stringify(text)}`);
  return value;
}
```

La importación CSV (`csv-import.service.ts`) tiene el mismo patrón: con "1.234,56" falla. Allí al menos falla con un error visible, antes de insertar nada.

### 2.2 Precisión: 6 decimales frente a los 8 del BCV

`rat_exc numeric(18,6)` redondea "976,90091142" a 976,900911. En montos grandes la diferencia es visible, y la factura debe usar la tasa oficial. **Propuesta:** `numeric(20,8)`.

### 2.3 TLS: la cadena incompleta del BCV (solución segura)

El certificado del BCV (`*.bcv.org.ve`, vence el **20/11/2026**) lo emitió *Sectigo Public Server Authentication CA DV R36*, pero el servidor envía otro intermediario, antiguo. Por eso Node falla con `unable to verify the first certificate`, y el repositorio sugiere `BCV_INSECURE_TLS=1`, que **desactiva la verificación** y deja la puerta abierta a un ataque de intermediario: alguien podría inyectar una tasa falsa.

- **Solución verificada:** agregar el intermediario oficial con `NODE_EXTRA_CA_CERTS`. El archivo está en [config/ca/](../../config/ca/LEEME.md), con su huella SHA-256. Con él, la conexión verifica correctamente (HTTP 200, verificación = 0).
- Hay que revisarlo cuando el BCV renueve su certificado.

### 2.4 "Tasa aplicable" (art. 25 de la Ley de IVA) y fecha valor

- El BCV publica por la tarde la tasa del **siguiente día hábil**. Hoy, domingo 27/09, la portada ya muestra la del lunes 28/09. El servicio guarda esa fecha valor, lo cual es correcto.
- El art. 25 dispone que, si la operación ocurre en un **día no hábil**, se aplica la tasa **vigente en el día hábil inmediatamente siguiente**. El servicio solo responde por fecha exacta y devuelve 404 los fines de semana y feriados.
- El Renglón debe exponer ambas: la **tasa publicada para una fecha valor** y la **tasa aplicable a una operación**, indicando qué fecha valor se usó y por qué.

### 2.5 Otros

| # | Hallazgo | Propuesta |
|---|---|---|
| O1 | Si ya existen EUR y USD para la fecha valor, **no se reescribe**. Si el BCV corrige una tasa el mismo día, la corrección se pierde | Detectar el cambio y guardar el historial, con auditoría, en lugar de ignorarlo |
| O2 | No guarda **cuándo** se capturó la tasa ni de dónde (solo `created_at`, que no se actualiza en el upsert) | Guardar `capturado_en`, la URL y un hash del bloque HTML leído |
| O3 | Si una ejecución falla, no reintenta hasta la siguiente hora programada (8, 14 o 20 h) | Reintentos con espera creciente |
| O4 | La API no tiene autenticación, `enableCors()` abre CORS a cualquier origen y Docker publica `3000:3000` en todas las interfaces | En El Renglón: API key, límite de peticiones y CORS restringido |
| O5 | El contenedor corre como **root** | `USER node` en el Dockerfile |
| O6 | La importación CSV inserta fila por fila **sin transacción** | Una sola transacción |
| O7 | Solo guarda EUR y USD | Guardar las 5 monedas publicadas (no cuesta nada) y exponer USD y EUR, como se confirmó |
| O8 | Commits de prueba ("hola.txt") en el historial | Menor |

## 3. Cómo se integra en El Renglón

Por decisión del equipo, el BCV es un **módulo propio** del ecosistema ([07](../07-ecosistema.md) §3), no un servicio externo. Propuesta:

1. **Portar la lógica** de `bcv-sync.service.ts` (lectura de la portada y fecha valor) al módulo `modules/bcv` de El Renglón, con las correcciones de §2.1 a §2.4 y O1 a O3.
2. **Esquema** `bcv.tasa`: `fecha_valor`, `moneda`, `tasa_bs numeric(20,8)`, `capturado_en`, `fuente`, `hash_fuente`. Más una tabla de **correcciones** si el BCV cambia un valor.
3. ✅ **Histórico:** se cargó desde los **archivos oficiales del BCV** (2025–2026, 8 decimales, 21 monedas), en lugar del CSV de 6 decimales ([11](../11-historico-tasas-bcv.md)).
4. **Endpoints:** `/api/v1/bcv/tasas/actual`, `?fecha=` (publicada) y `/aplicable?fecha=` (art. 25), más `/convertir`.
5. **Mientras tanto,** aplicar al servicio en producción **al menos la corrección de §2.1**, antes de que el EUR supere 1.000.

## 4. Mapeo de datos

| tasas-bcv (`"DBO"."tasas_diarias"`) | El Renglón (`bcv.tasa`) |
|---|---|
| `cur_cod` | `moneda` |
| `valid_from` | `fecha_valor` |
| `rat_exc` numeric(18,6) | `tasa_bs` numeric(20,8). Lo migrado se marca con `precision_origen = 6` |
| `created_at` | `capturado_en` (aproximado para lo migrado) |
| — | `fuente` (`bcv.org.ve`, `csv`, `migracion_bnpl`), `hash_fuente` |
