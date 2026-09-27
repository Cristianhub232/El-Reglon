# 12 · Análisis del repositorio calendarioapi (premisa 13)

> **Repositorio:** https://github.com/Cristianhub232/calendarioapi (1 commit, 28/01/2026). API Node.js/Express + PostgreSQL que devuelve los próximos deberes fiscales de un RIF.
> **Analizado el:** 27/09/2026, **sin ejecutar su código**.
> **Método:** se transcribieron las tablas de la **Gaceta oficial** y se compararon celda por celda con la semilla del repositorio (`database/seed.sql`).

## 1. Veredicto

| Aspecto | Evaluación |
|---|---|
| **Datos del calendario SPE 2026** | ✅ **10 de 12 tablas coinciden al 100 %** con la Gaceta. ❌ **Ejercicios irregulares: 76 de 110 fechas erradas** y ❌ falta una fecha de retenciones de lotería |
| **Alcance** | ⚠️ Solo cubre **Sujetos Pasivos Especiales**. **No tiene el calendario de IVA de los contribuyentes ordinarios** (no especiales), que es la mitad del objetivo "calendario de IVA según tipo de contribuyente" |
| **Fuente citada** | ⚠️ Cita la GO 43.273 (09/12/2025) y un número inexistente ("432.2.47339"). El calendario fue **reimpreso por error material en la GO 43.283 (23/12/2025)**. La reimpresión no cambió fechas, pero es la versión que debe citarse |
| **Lógica de la API** | ❌ Un defecto grave de fecha de referencia y varios errores de interpretación (§3) |
| **Reutilización** | Se aprovechan las **ideas** (consulta por terminal del RIF, filtros por perfil, prioridad por días restantes). **Los datos se toman de nuestra transcripción de la Gaceta**, no de su semilla |

## 2. Contraste con la Gaceta

**Fuente oficial:** Providencia Administrativa **SNAT/2025/000091** del 24/11/2025, *"Calendario de Sujetos Pasivos Especiales y Agentes de Retención para aquellas obligaciones que deben cumplirse para el año 2026"*, publicada en la **GO N° 43.283 del 23/12/2025** (págs. 470.452 a 470.454; reimpresión de la GO 43.273). Copia en `fuentes/calendario/`. Es un escaneo, así que las tablas se transcribieron visualmente a 300 dpi en [herramientas/calendario/transcripcion_spe_2026.py](../../herramientas/calendario/transcripcion_spe_2026.py). La transcripción se verificó automáticamente: 646 vencimientos, 0 fechas inexistentes, 0 en fin de semana, cada terminal una sola vez por mes, quincena 1 siempre desde el día 16 y quincena 2 siempre hasta el 16.

| Tabla (Providencia) | Celdas | Repositorio |
|---|---|---|
| a.1 IVA, anticipos ISLR, IGTF y retenciones IVA (días 01–15) | 120 | ✅ 120/120 |
| a.2 Ídem (días 16–último) | 120 | ✅ 120/120 en fechas, ❌ período mal rotulado (§3) |
| b) Estimadas de ISLR | 120 | ✅ |
| c) Retenciones de ISLR | 120 | ✅ |
| d) Juegos de envite o azar | 120 | ✅ |
| e.1) Retenciones ISLR premios de lotería (01–15) | 120 | ✅ |
| e.2) Ídem (16–último) | 120 | ❌ **falta junio** (vence el 03/06/2026) |
| f) Autoliquidación anual ISLR 2025 | 10 | ✅ |
| **g) Autoliquidación ISLR ejercicios irregulares** | 110 | ❌ **76 fechas distintas, 12 faltan, 10 sobran** |
| h) Grandes Patrimonios | 20 | ✅ |
| i) Aporte del 70 % | 120 | ✅ |
| Art. 2: IVA mensual de minería e hidrocarburos | 120 | ✅ en fechas (el repo lo llama "IVA trimestral", ver §3) |

**Causa del error en la tabla g):** en la Gaceta esa tabla **no tiene columna de marzo** (pasa de FEB a ABR). El repositorio asumió 12 meses y corrió los valores una columna: el vencimiento oficial de abril quedó en mayo, el de mayo en junio, y así hasta noviembre. Por eso aparecían **18 vencimientos en sábado o domingo**, que es imposible. Ejemplo (RIF 0 y 8): oficial 23/04, 20/05, 23/06, 17/07; repositorio 20/04, 23/05 (sábado), 17/06, 26/07 (domingo).

**No verificables con esta Gaceta:** la Contribución Especial para la Protección de las Pensiones (120 filas; es otra providencia, que el repositorio cita como SNAT/2025/000093 y la prensa especializada como 000094) y los juegos de azar de no especiales (Providencia de 2007, GO 38.696).

## 3. Hallazgos en la lógica

| # | Severidad | Hallazgo |
|---|---|---|
| C1 | 🔴 Alta | **Fecha de referencia fija:** si la consulta no trae `?fecha=`, usa `FECHA_REFERENCIA` = **06/01/2026** (valor por defecto en `constants.js`), no la fecha actual. Hoy (27/09/2026) devolvería como "próximos" los deberes de **enero**, ya vencidos, y con días restantes negativos |
| C2 | 🔴 Alta | **Quincena 2 mal rotulada:** la columna "ENE" de la tabla a.2 corresponde a las operaciones del **16 al 31 de diciembre**, que se pagan en enero. El repositorio la rotula "Días 16 al último de **Enero**" con vencimiento 15/01, un período que aún no terminó. Se le dice al usuario que declara el período equivocado |
| C3 | 🟠 Media | **Art. 2 y 3 confundidos:** el art. 2 es **IVA mensual** para SPE de minería/hidrocarburos; el art. 3 es la **declaración informativa trimestral** para SPE con actividades **exclusivamente exentas o exoneradas** (usa las fechas del art. 2). El repositorio tiene un único "IVA_TRIMESTRAL" que solo se activa con el filtro de minería: omite a los SPE exentos y mezcla ambos casos. Además, a un SPE minero le sigue mostrando la tabla a), cuando el art. 5 la reserva a los demás |
| C4 | 🟠 Media | **Sin contribuyentes ordinarios:** para `NO_SPE` solo existen las 12 fechas de juegos de azar. Un contribuyente ordinario no recibe ninguna fecha de IVA |
| C5 | 🟡 Baja | **Validación del RIF incompleta:** no verifica el **dígito verificador**; acepta el prefijo `D`, que no es estándar; y queda código muerto (`tipoContribuyente.js`) que deduce SPE por la longitud del RIF, contradiciendo la propia documentación |
| C6 | 🟡 Baja | Sin autenticación, CORS abierto y un historial de consultas que guarda RIF e IP sin política de retención |
| C7 | ℹ️ Nota | 11 vencimientos **oficiales** caen en lunes bancarios (p. ej. 19/01 y 18/05, días sin tasa BCV). No es un error del repositorio: la providencia fija esas fechas. Conviene mostrarlo como aviso ("día no bancario: prevea el pago") |

`CREDENCIALES.md` solo trae valores de ejemplo (`postgres`/`postgres`, local); no expone secretos reales.

## 4. Plan para el módulo Calendario de El Renglón

> ✅ **Ejecutado** el 27/09/2026: ver [13](../13-modulo-calendario.md). Contribuyentes ordinarios: Reglamento IVA art. 60.

1. **Datos:** cargar la transcripción oficial (`datos/calendario/spe_2026/`), con `obligacion` (base legal: artículo y literal) y `vencimiento` (terminales del RIF y fecha). La versión normativa es la Providencia SNAT/2025/000091, GO 43.283.
2. **Período declarado explícito:** cada vencimiento indica el período que cubre (p. ej. "16–31/12/2025"), calculado según su tabla.
3. **Perfiles:** SPE general (art. 1 y 5), SPE de minería/hidrocarburos (art. 2), SPE exclusivamente exento (art. 3), agente de retención y **contribuyente ordinario** (pendiente de fuente, ver A40).
4. **Fecha actual por defecto**, en la zona horaria America/Caracas.
5. **Aviso de día bancario** usando `bcv.dia_sin_publicacion` del módulo BCV.
6. **RIF:** se usa el módulo de validación del RIF (con dígito verificador), que ya estaba previsto como módulo futuro.
