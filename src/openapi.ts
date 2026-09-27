// Especificación OpenAPI 3.1 de El Renglón (se sirve en /api/openapi.json y se muestra en /docs).
type Obj = Record<string, unknown>;

const q = (name: string, description: string, extra: Obj = {}): Obj =>
  ({ name, in: "query", description, required: false, schema: { type: "string" }, ...extra });
const qr = (name: string, description: string, extra: Obj = {}): Obj => q(name, description, { required: true, ...extra });
const path = (name: string, description: string): Obj => ({ name, in: "path", required: true, description, schema: { type: "string" } });
const fecha = (name: string, description: string, requerida = false): Obj =>
  ({ ...q(name, description, { schema: { type: "string", format: "date" } }), required: requerida });

const errores = {
  "400": { $ref: "#/components/responses/Error" }, "401": { $ref: "#/components/responses/Error" },
  "403": { $ref: "#/components/responses/Error" }, "404": { $ref: "#/components/responses/Error" },
  "429": { $ref: "#/components/responses/Error" },
};
const op = (tag: string, summary: string, description: string, parameters: Obj[] = [], ejemplo?: unknown): Obj => ({
  get: {
    tags: [tag], summary, description, parameters, security: [{ ApiKey: [] }],
    responses: { "200": { description: "OK", content: { "application/json": ejemplo ? { example: ejemplo } : {} } }, ...errores },
  },
});

export const especificacion = {
  openapi: "3.1.0",
  info: {
    title: "El Renglón API",
    version: "0.1.0",
    description: [
      "Ecosistema abierto de información fiscal venezolana, homologado a la terminología del SENIAT.",
      "",
      "**Autenticación:** cabecera `X-API-Key` con permiso para el módulo consultado. **Límite:** consultas por minuto según la clave (cabeceras `X-RateLimit-*`).",
      "",
      "**Números:** tasas y montos se devuelven como texto decimal exacto (p. ej. `\"857.00580000\"`). **Fechas:** `AAAA-MM-DD`; si se omite, se usa la fecha de hoy en Caracas.",
      "",
      "Resultados orientativos: no constituyen asesoría tributaria ni aduanera.",
    ].join("\n"),
  },
  servers: [{ url: "/" }],
  tags: [
    { name: "BCV", description: "Tipo de Cambio de Referencia del BCV (histórico desde 2025, tasa aplicable según art. 25 Ley IVA)" },
    { name: "Arancel", description: "Arancel de Aduanas vigente: Decreto 4.944 con reformas 5.103, 5.147 y 5.198" },
    { name: "Calendario", description: "Calendario tributario 2026: especiales (Providencia SNAT/2025/000091) y ordinarios (Reglamento IVA art. 60); COT art. 10" },
    { name: "RIF", description: "Validación del RIF con dígito verificador" },
    { name: "Servicio", description: "Estado del servicio" },
  ],
  components: {
    securitySchemes: { ApiKey: { type: "apiKey", in: "header", name: "X-API-Key" } },
    responses: {
      Error: {
        description: "Error",
        content: { "application/json": { example: { error: { codigo: "fecha_invalida", mensaje: "'fecha' debe ser una fecha válida en formato AAAA-MM-DD" } } } },
      },
    },
  },
  paths: {
    "/api/salud": { get: { tags: ["Servicio"], summary: "Estado del servicio y frescura de los datos", security: [], responses: { "200": { description: "OK" } } } },
    "/api/v1/bcv/tasas/actual": op("BCV", "Tasas USD y EUR vigentes", "Tasa aplicable a la fecha (por defecto hoy): si es día no hábil, la del siguiente día hábil.",
      [fecha("fecha", "Fecha de la operación")],
      { fecha_consultada: "2026-09-27", fecha_valor: "2026-09-28", tasas: { USD: { tasa_bs: "857.00580000" }, EUR: { tasa_bs: "976.90091142" } }, advertencias: [] }),
    "/api/v1/bcv/tasas": op("BCV", "Publicación por fecha valor o histórico",
      "Con `fecha`: todas las monedas publicadas para esa fecha valor (compra, venta y cotización). Con `desde` y `hasta`: histórico de una moneda (máx. 2 años).",
      [fecha("fecha", "Fecha valor exacta"), q("moneda", "Código de moneda (USD, EUR, CNY…)"), fecha("desde", "Inicio del histórico"), fecha("hasta", "Fin del histórico")]),
    "/api/v1/bcv/tasa-aplicable": op("BCV", "Tasa aplicable a una operación (art. 25 Ley IVA)",
      "La del día de la operación; si ese día no es hábil para el sector financiero, la vigente el día hábil inmediatamente siguiente. Nunca se estima una tasa futura.",
      [fecha("fecha", "Fecha de la operación"), q("moneda", "Moneda (por defecto USD)")]),
    "/api/v1/bcv/convertir": op("BCV", "Convertir montos entre VES y monedas publicadas", "Usa la tasa aplicable a la fecha. Aritmética decimal exacta; `resultado` redondeado a 2 decimales.",
      [qr("monto", "Monto con punto decimal"), qr("de", "Moneda de origen (VES, USD, EUR…)"), q("a", "Moneda de destino (por defecto VES)"), fecha("fecha", "Fecha de la operación")]),
    "/api/v1/bcv/monedas": op("BCV", "Monedas publicadas por el BCV", "Incluye el código ISO 4217 vigente (el BCV usa MXP para el peso mexicano)."),
    "/api/v1/bcv/moneda-mayor-valor": op("BCV", "Moneda de mayor valor (COT arts. 91 y 92)", "Base de cálculo de las multas del Código Orgánico Tributario.",
      [fecha("fecha", "Fecha")]),
    "/api/v1/arancel/{codigo}": op("Arancel", "Detalle de un código arancelario",
      "2 dígitos: capítulo; 4: partida con sus subpartidas; 5 a 10: subpartida con ruta completa, AEC, Ex-AEC, régimen legal, unidad e historial de reformas. Acepta puntos.",
      [path("codigo", "Código, p. ej. 1006.30.11.10, 100630 o 10")]),
    "/api/v1/arancel/buscar": op("Arancel", "Buscar en la nomenclatura", "Todas las palabras deben aparecer en la ruta jerárquica (sin distinguir acentos). Ordena por similitud.",
      [qr("q", "Texto a buscar, p. ej. 'arroz blanqueado'"), q("solo_declarables", "true (por defecto) o false"), q("limite", "1 a 100 (por defecto 20)")]),
    "/api/v1/arancel/secciones": op("Arancel", "Secciones y capítulos", "Las 22 secciones del Sistema Armonizado con sus capítulos."),
    "/api/v1/arancel/catalogos/{nombre}": op("Arancel", "Catálogos del arancel",
      "`reglas` (Reglas Generales de Interpretación), `abreviaturas`, `conversiones` (tabla de conversión de unidades), `regimenes` (art. 21), `unidades`.",
      [{ ...path("nombre", "Catálogo"), schema: { type: "string", enum: ["reglas", "abreviaturas", "conversiones", "regimenes", "unidades"] } }]),
    "/api/v1/calendario/proximos": op("Calendario", "Próximos deberes de un contribuyente",
      "`fecha` es la de la norma; `fecha_limite` incluye la prórroga del COT art. 10 cuando la fecha cae en un día inhábil (p. ej. lunes bancario).",
      [qr("rif", "RIF, p. ej. J-00002961-0"), { ...qr("tipo", "Tipo de contribuyente"), schema: { type: "string", enum: ["ESPECIAL", "ORDINARIO"] } },
        q("condiciones", "Separadas por coma: MINERIA_HIDROCARBUROS, SOLO_EXENTO_EXONERADO, JUEGOS_AZAR, LOTERIA, EJERCICIO_IRREGULAR, GRANDES_PATRIMONIOS, ENTE_PUBLICO"),
        fecha("desde", "Desde (por defecto hoy)"), q("limite", "1 a 100 (por defecto 10)")]),
    "/api/v1/calendario/obligaciones": op("Calendario", "Obligaciones y su base legal", ""),
    "/api/v1/calendario/condiciones": op("Calendario", "Condiciones que puede declarar el contribuyente", ""),
    "/api/v1/calendario/dias-inhabiles": op("Calendario", "Días inhábiles (feriados y días bancarios)", "", [q("anio", "Año (por defecto 2026)")]),
    "/api/v1/rif/validar": op("RIF", "Validar un RIF", "Formato, tipo de persona, terminal y dígito verificador (módulo 11).", [qr("rif", "RIF con o sin guiones")],
      { entrada: "J-00002961-0", valido: true, rif: "J000029610", rif_formateado: "J-00002961-0", prefijo: "J", tipo_persona: "Persona jurídica", terminal: 0, digito_verificado: true, mensaje: "RIF válido" }),
  },
};
