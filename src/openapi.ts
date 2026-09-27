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
    { name: "IVA", description: "Clasificación de bienes y servicios según la Ley de IVA (GO Ext. 6.507) y el Decreto 5.196: exento, 8 %, 16 % o 16 % + 15 %, con multiopción en zonas grises" },
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
    "/api/v1/iva/clasificar": {
      post: {
        tags: ["IVA"], summary: "Clasificar un bien o servicio",
        description: [
          "Identifica el bien o servicio por **nombre**, **códigos** (EAN/UPC/GTIN, ISBN, ISSN, PLU, SKU) y/o **código arancelario**, y devuelve las opciones fiscales con su base legal (texto de la Gaceta).",
          "",
          "- `estado`: `determinado` (una opción), `condicionado` (varias: **el operario decide**) o `no_determinado` (sin coincidencias; se registra para mejorar el catálogo). Nunca se niega una consulta por reglas de negocio.",
          "- `operacion` es obligatoria. En `importacion`, las exenciones del art. 18 no aplican mientras esté vigente el Decreto 5.196 (suspende el art. 17.1).",
          "- `precio_compra`, `precio_venta` y `moneda` **van en todo request** (pueden ser `null`): son precios unitarios sin IVA. Se convierten con la tasa BCV aplicable (art. 25) y solo cambian la clasificación donde la ley usa el precio (umbrales en USD del art. 61; en nacional se usa el de venta, en importación el de compra). Se guardan de forma anónima para estadísticas internas de precios.",
          "- `atributos` resuelve condiciones: `uso` (consumo, industrial, residencial, comercial), `cliente` (poder_publico, privado), `peso_g`.",
          "- Montos por opción en Bs. y USD: base redondeada a céntimos, IVA sobre esa base y total.",
        ].join("\n"),
        security: [{ ApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object", required: ["operacion", "precio_compra", "precio_venta", "moneda"],
                properties: {
                  nombre: { type: "string", maxLength: 300 },
                  codigo: { type: "string", description: "Código de barras, ISBN, ISSN, PLU o SKU" },
                  codigos: { type: "array", items: { type: "string" }, maxItems: 10 },
                  codigo_arancelario: { type: "string", description: "Con o sin puntos, 4 a 10 dígitos" },
                  operacion: { type: "string", enum: ["nacional", "importacion"] },
                  tipo: { type: "string", enum: ["bien", "servicio"] },
                  precio_compra: { type: ["number", "null"], exclusiveMinimum: 0 },
                  precio_venta: { type: ["number", "null"], exclusiveMinimum: 0 },
                  moneda: { type: ["string", "null"], enum: ["VES", "USD", null], description: "Obligatoria si llega algún precio" },
                  fecha: { type: "string", format: "date", description: "Fecha de la operación (por defecto hoy en Caracas)" },
                  atributos: { type: "object", properties: {
                    uso: { type: "string", enum: ["consumo", "industrial", "residencial", "comercial"] },
                    cliente: { type: "string", enum: ["poder_publico", "privado"] },
                    peso_g: { type: "number", exclusiveMinimum: 0 } } },
                  ubicacion: { type: "string", maxLength: 120, description: "Estado o ciudad (opcional, para estadísticas de precios)" },
                },
              },
              examples: {
                zona_gris: { summary: "Atún en aceite (zona gris) con precios en USD",
                  value: { nombre: "Atún en aceite 140 g", operacion: "nacional", precio_compra: 1.1, precio_venta: 1.6, moneda: "USD" } },
                importacion: { summary: "Arroz importado (Decreto 5.196)",
                  value: { nombre: "Arroz blanco 1 kg", operacion: "importacion", precio_compra: null, precio_venta: null, moneda: null } },
                suntuario: { summary: "Reloj de 400.000 Bs. (umbral de US$ 300)",
                  value: { nombre: "Reloj de pulsera", operacion: "nacional", precio_compra: null, precio_venta: 400000, moneda: "VES" } },
                arancel: { summary: "Por código arancelario y nombre",
                  value: { nombre: "Mortadela", codigo_arancelario: "1601.00.00.10", operacion: "nacional", precio_compra: null, precio_venta: null, moneda: null } },
              },
            },
          },
        },
        responses: {
          "200": { description: "Clasificación (determinado, condicionado o no_determinado)", content: { "application/json": { example: {
            estado: "condicionado", operacion: "nacional", tipo: "bien", fecha: "2026-09-27",
            opciones: [
              { orden: 1, categoria: "ALICUOTA_GENERAL", denominacion: "Gravado por alícuota general", alicuotas: [{ codigo: "GENERAL", porcentaje: "16.00" }],
                alicuota_total: "16.00", condicion: "Si 'presentación natural' excluye el atún en aceite", marca_exento: false,
                base_legal: [{ id: "LIVA-63", articulo: "63", gaceta: "GO Ext. N° 6.507 del 29/01/2020", verificado: true }],
                concepto_declaracion: "Ventas internas gravadas por alícuota general",
                montos: { bs: { base_imponible_venta: "1371.21", iva_venta: "219.39", total_venta: "1590.60" }, usd: { base_imponible_venta: "1.60", iva_venta: "0.26", total_venta: "1.86" } } },
              { orden: 2, categoria: "EXENTO", denominacion: "Operación exenta", alicuotas: [], alicuota_total: "0.00",
                condicion: "Si se considera atún enlatado en presentación natural", marca_exento: true,
                base_legal: [{ id: "LIVA-18-1-k", articulo: "18", numeral: "1", literal: "k", texto: "Atún enlatado en presentación natural.", verificado: true }],
                concepto_declaracion: "Ventas internas no gravadas" },
            ],
            precios: { moneda: "USD", tasa_bcv_bs: "857.00580000", tasa_fecha_valor: "2026-09-28", precio_venta_bs: "1371.21", umbral_evaluado_usd: 1.6 },
            reglas: [{ id: "ATUN_ACEITE", nombre: "Atún en aceite", zona_gris: true }], confianza: 0.6, metodo: ["nombre"],
            advertencias: ["Zona gris (Atún en aceite): …"], responsabilidad: "Resultado orientativo…", version_catalogo: "a8e37007b600" } } } },
          ...errores, "413": { $ref: "#/components/responses/Error" }, "415": { $ref: "#/components/responses/Error" },
        },
      },
    },
    "/api/v1/iva/alicuotas": op("IVA", "Alícuotas vigentes y categorías", "Componentes (general, reducida, adicional suntuaria) vigentes a la fecha, las categorías SENIAT con su alícuota total y los decretos vigentes.",
      [fecha("fecha", "Fecha (por defecto hoy)")]),
    "/api/v1/iva/reglas": op("IVA", "Catálogo de reglas", "Reglas del clasificador con sus opciones y base legal. Con `q`, además muestra qué regla(s) elegiría el matcher para ese texto.",
      [q("q", "Texto a buscar o clasificar"), { ...q("tipo", "Filtrar por tipo"), schema: { type: "string", enum: ["bien", "servicio"] } }]),
    "/api/v1/iva/base-legal": op("IVA", "Base legal usada", "Artículos, numerales y literales con su Gaceta. `verificado = true`: el texto se comprobó literalmente contra el PDF de la Gaceta al cargar el catálogo."),
    "/api/v1/iva/codigo/{codigo}": op("IVA", "Detectar un código de producto", "Tipo (EAN-13, UPC-A, GTIN-14, ISBN, ISSN, PLU, uso interno, SKU), dígito verificador y, si es un GTIN, el producto en Open Food Facts (ODbL).",
      [path("codigo", "Código, p. ej. 7591002100100 o 978-84-376-0494-7")]),
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
