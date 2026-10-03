// Plantillas de la prospección comercial (docs/26): un primer correo por sector y un único seguimiento.
// Estilo de carta, como lo escribiría una persona: sin logo, sin botones ni cajas de color y con enlaces de texto
// directos a cada herramienta. Así Gmail lo deja en Principal; el aspecto de boletín lo manda a Promociones.
// Lo que llama la atención es un dato real, no el diseño: ejemplos de IVA (comercios, farmacias), los próximos
// deberes del RIF (contribuyentes especiales) o dónde está más barato hoy un producto básico (personas naturales).
// Todo dato del prospecto se escapa. La baja va al final, en una línea discreta.
import { SITIO_URL } from "../../core/sitio.ts";

export const SECTORES = {
  general: "General",
  comercio: "Comercio y bodegas",
  farmacia: "Farmacias",
  importador: "Importadores",
  contador: "Contadores",
  desarrollador: "Desarrolladores y software",
  especial: "Contribuyentes especiales (con RIF)",
  consumidor: "Personas naturales (con consentimiento)",
} as const;
export type Sector = keyof typeof SECTORES;
export type TipoCorreo = "inicial" | "seguimiento";

export interface DatosCorreo { empresa: string; contacto: string | null; sector: Sector; token: string; rif?: string | null }
export interface Tasa { usd: string; eur: string; fecha_valor: string }
export interface Deber { fecha_limite: string; nombre: string; periodo: string | null }
export interface PrecioEjemplo { producto: string; consulta: string; minimo: number; maximo: number; cadenas: number; tienda: string }
export interface Contexto { tasa: Tasa | null; deberes?: Deber[] | null; precios?: PrecioEjemplo[] | null }
export interface Correo { asunto: string; html: string; texto: string; urlBaja: string }

// Herramientas del sitio a las que enlaza el correo: [texto del enlace, ruta, para qué sirve]
const HERRAMIENTAS = {
  iva: ["Clasificador de IVA", "/#herramientas", "escriba un producto o su código de barras y vea si es exento, 8 %, 16 % o 31 %, con el artículo de la ley"],
  iva_arancel: ["Clasificador de IVA", "/#herramientas", "acepta también el código arancelario: alícuota en la importación y base legal"],
  comparador: ["Comparador de precios", "/#comparador", "el precio del mismo producto en 15 cadenas del país"],
  comparador_farmacia: ["Comparador de precios", "/#comparador", "compare con Farmatodo, Locatel, Farmacias SAAS y otras cadenas"],
  deberes: ["Mis deberes tributarios", "/#deberes", "los próximos vencimientos con el SENIAT según el RIF, especiales u ordinarios"],
  tasas: ["Tasa oficial del BCV", "/#tasas", "la del día, su historial y un conversor de bolívares, dólares y euros"],
  api: ["Documentación de la API", "/docs", "IVA, tasas del BCV, arancel, calendario tributario y RIF para su sistema"],
  apikey: ["API key gratuita", "/solicitar-api-key", "para empezar a integrar hoy mismo"],
} as const;
type Herramienta = keyof typeof HERRAMIENTAS;

// Ejemplos de IVA fijos y verificados contra el clasificador (scripts/prueba-api.ts los vuelve a comprobar):
// no se consulta el clasificador por cada correo para no inflar sus estadísticas.
type Alicuota = "exento" | "16";
export const EJEMPLOS_IVA: Record<string, [string, Alicuota, string]> = {
  harina: ["Harina de maíz precocida 1 kg", "exento", "Ley del IVA, art. 18, num. 1, lit. d"],
  arroz: ["Arroz blanco 1 kg", "exento", "Ley del IVA, art. 18, num. 1, lit. c"],
  cafe: ["Café molido 500 g", "exento", "Ley del IVA, art. 18, num. 1, lit. i"],
  refresco: ["Refresco de cola 2 L", "16", "Ley del IVA, art. 63"],
  jabon: ["Jabón de baño", "16", "Ley del IVA, art. 63"],
  acetaminofen: ["Acetaminofén 500 mg", "exento", "Ley del IVA, art. 18, num. 3"],
  protector: ["Protector solar 60 ml", "16", "Ley del IVA, art. 63"],
  panales: ["Pañales desechables", "16", "Ley del IVA, art. 63"],
};

// Cierra la oración sin duplicar el punto de «C.A.» o «S.A.»
const fin = (e: string) => (e.endsWith(".") ? e : `${e}.`);

interface Guion { asunto: string; intro: string; herramientas: Herramienta[]; iva?: (keyof typeof EJEMPLOS_IVA)[] }
const GUIONES: Record<Sector, (empresa: string, c: Contexto, rif: string | null) => Guion> = {
  general: (e) => ({
    asunto: `${e}: ¿qué lleva IVA y qué no? Ejemplos con su base legal`,
    intro: `Le escribimos desde El Renglón, un sitio gratuito con la información fiscal que un negocio venezolano consulta a diario. Pensamos que le puede ahorrar tiempo a ${fin(e)}`,
    herramientas: ["iva", "tasas", "deberes", "comparador"], iva: ["arroz", "jabon", "acetaminofen"],
  }),
  comercio: (e) => ({
    asunto: `${e}: la harina no paga IVA, el refresco sí (16 %)`,
    intro: `Le escribimos desde El Renglón. En el mostrador no hay tiempo para leer la Ley del IVA, y por eso hicimos un sitio gratuito que lo resuelve en segundos. Pensamos que le puede servir a ${fin(e)}`,
    herramientas: ["iva", "comparador", "tasas"], iva: ["harina", "refresco", "cafe"],
  }),
  farmacia: (e) => ({
    asunto: `${e}: ¿el protector solar lleva IVA? (sí, 16 %)`,
    intro: `Le escribimos desde El Renglón. En una farmacia conviven productos exentos y gravados, y hicimos un sitio gratuito para distinguirlos sin dudas. Pensamos que le puede servir a ${fin(e)}`,
    herramientas: ["iva", "comparador_farmacia", "tasas"], iva: ["acetaminofen", "protector", "panales"],
  }),
  importador: (e) => ({
    asunto: `${e}: código arancelario y tasa BCV aplicable en segundos`,
    intro: `Le escribimos desde El Renglón, un sitio gratuito con el Arancel de Aduanas vigente (Decreto 4.944 y sus reformas de 2025), el IVA y la tasa oficial del BCV. Pensamos que le puede ahorrar tiempo a ${fin(e)}`,
    herramientas: ["iva_arancel", "tasas", "api"],
  }),
  contador: (e) => ({
    asunto: `${e}: los vencimientos del SENIAT de sus clientes, en un solo lugar`,
    intro: "Le escribimos desde El Renglón. Llevar a mano el calendario tributario de muchos RIF es un riesgo, y por eso hicimos un sitio gratuito que lo calcula con el calendario oficial de 2026.",
    herramientas: ["deberes", "iva", "tasas"],
  }),
  desarrollador: (e) => ({
    asunto: `${e}: API gratuita de IVA, tasa BCV y arancel`,
    intro: `Le escribimos desde El Renglón. Si su software factura o calcula precios en Venezuela, nuestra API gratuita le ahorra mantener las tablas de IVA, tasas y arancel. Pensamos que le puede servir a ${fin(e)}`,
    herramientas: ["api", "apikey", "iva"],
  }),
  especial: (e, c, rif) => ({
    asunto: c.deberes?.[0] ? `${e}: su próximo deber con el SENIAT vence el ${fechaCorta(c.deberes[0].fecha_limite)}` : `${e}: los deberes con el SENIAT de su RIF, en un solo lugar`,
    intro: c.deberes?.length
      ? `Le escribimos desde El Renglón. Como contribuyente especial, ${e} tiene un calendario exigente. Con su RIF ${rif ?? ""} calculamos sus próximos vencimientos según el calendario oficial de 2026 (Providencia SNAT/2025/000091):`
      : `Le escribimos desde El Renglón. Como contribuyente especial, ${e} tiene un calendario exigente, y por eso hicimos un sitio gratuito que calcula sus vencimientos según el calendario oficial de 2026.`,
    herramientas: ["iva", "tasas"],
  }),
  consumidor: (_e, c) => ({
    // El dato concreto en el asunto: el producto con más diferencia entre cadenas
    asunto: c.precios?.[0] ? `${c.precios[0].producto.split(" ").slice(0, 3).join(" ")}: ${Math.round(100 * (1 - c.precios[0].minimo / c.precios[0].maximo))} % más barato en ${c.precios[0].tienda} que en otra cadena`
      : "¿Dónde está más barato hoy? Mismo producto, distinto precio",
    intro: "Le escribimos desde El Renglón, un sitio gratuito que compara el precio del mismo producto en las principales cadenas del país. Hoy encontramos estas diferencias:",
    herramientas: ["comparador", "tasas", "iva"],
  }),
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const enlace = (ruta: string, sector: Sector, params: Record<string, string> = {}) => {
  const [camino, ancla] = ruta.split("#");
  const u = new URL(camino || "/", SITIO_URL);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  u.searchParams.set("utm_source", "correo"); u.searchParams.set("utm_campaign", sector);
  return u.toString() + (ancla ? `#${ancla}` : "");
};
const bs = (v: string | number) => Number(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (f: string) => f.slice(0, 10).split("-").reverse().join("/");

// Datos de ejemplo para la vista previa y las pruebas del panel (el RIF tiene dígito verificador válido)
export const RIF_EJEMPLO = "J-12345678-4";
export function datosEjemplo(sector: Sector): DatosCorreo {
  return sector === "consumidor" ? { empresa: "María", contacto: null, sector, token: "prueba" }
    : { empresa: "Empresa de Ejemplo, C.A.", contacto: null, sector, token: "prueba", rif: sector === "especial" ? RIF_EJEMPLO : null };
}

export function urlBaja(token: string): string { return `${SITIO_URL}/baja?t=${token}`; }

const ESTILO = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222222;";
const CELDA = "padding:7px 10px;border-bottom:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.4;color:#222222;text-align:left;vertical-align:top;";
const CABEZA = CELDA.replace("color:#222222;", "color:#666666;font-weight:bold;font-size:12px;");
// Etiquetas de alícuota con los colores del sitio (texto, sin imágenes)
const ETIQUETA: Record<Alicuota, [string, string, string]> = { exento: ["Exento", "#e7f5ec", "#1e7a3d"], "16": ["16 %", "#fdeee0", "#a8530b"] };
const etiqueta = (a: Alicuota) => { const [t, fondo, color] = ETIQUETA[a]; return `<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:${fondo};color:${color};font-weight:bold;font-size:13px;white-space:nowrap;">${t}</span>`; };
const tabla = (cabeza: string[], filas: string[][]) =>
  `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:0 0 16px;width:100%;max-width:560px;">
<tr>${cabeza.map((c) => `<th style="${CABEZA}">${c}</th>`).join("")}</tr>
${filas.map((f) => `<tr>${f.map((c) => `<td style="${CELDA}">${c}</td>`).join("")}</tr>`).join("\n")}</table>`;

export function armarCorreo(d: DatosCorreo, tipo: TipoCorreo, c: Contexto): Correo {
  const empresa = d.empresa.trim(), contacto = d.contacto?.trim() || null, rif = d.rif ?? null;
  const g = GUIONES[d.sector](empresa, c, rif);
  const baja = urlBaja(d.token);
  const persona = d.sector === "consumidor";
  const saludo = contacto ? `Hola, ${contacto}:` : persona ? `Hola, ${empresa}:` : `Hola, equipo de ${empresa}:`;
  const asunto = tipo === "inicial" ? g.asunto : persona ? "¿Pudo ver dónde está más barato?" : `${empresa}: ¿pudo ver El Renglón?`;
  const lineaTasa = c.tasa ? `Por cierto, hoy el BCV publicó Bs. ${bs(c.tasa.usd)} por dólar y Bs. ${bs(c.tasa.eur)} por euro (fecha valor ${fechaCorta(c.tasa.fecha_valor)}).` : null;
  const herramientas = (tipo === "inicial" ? g.herramientas : g.herramientas.slice(0, 2)).map((h) => HERRAMIENTAS[h]);

  // ── Bloque de datos reales (solo en el primer correo) ──
  let bloqueHtml = "", bloqueTexto: string[] = [];
  if (tipo === "inicial" && g.iva?.length) {
    const ej = g.iva.map((k) => EJEMPLOS_IVA[k]);
    bloqueHtml = `${p("Algunos ejemplos de nuestro clasificador:")}${tabla(["Producto", "IVA", "Base legal"],
      ej.map(([n, a, b]) => [esc(n), etiqueta(a), `<span style="color:#666666;">${esc(b)}</span>`]))}`;
    bloqueTexto = ["Algunos ejemplos de nuestro clasificador:", ...ej.map(([n, a, b]) => `- ${n}: ${a === "exento" ? "exento" : "16 %"} (${b})`), ""];
  } else if (tipo === "inicial" && d.sector === "especial" && c.deberes?.length) {
    bloqueHtml = `${tabla(["Vence", "Deber", "Período"], c.deberes.map((x) => [`<strong>${fechaCorta(x.fecha_limite)}</strong>`, esc(x.nombre), esc(x.periodo ? x.periodo.split(" al ").map(fechaCorta).join(" al ") : "—")]))}
${p(`<a href="${esc(enlace("/#deberes", d.sector, { rif: rif ?? "", tipo: "ESPECIAL" }))}" style="color:#1a56b0;font-weight:bold;">Ver todos sus deberes y agregarlos a su calendario</a>, con aviso 3 días antes de cada vencimiento.`)}`;
    bloqueTexto = [...c.deberes.map((x) => `- ${fechaCorta(x.fecha_limite)}: ${x.nombre}${x.periodo ? ` (período ${x.periodo.split(" al ").map(fechaCorta).join(" al ")})` : ""}`), "",
      `Ver todos sus deberes: ${enlace("/#deberes", d.sector, { rif: rif ?? "", tipo: "ESPECIAL" })}`, ""];
  } else if (tipo === "inicial" && persona && c.precios?.length) {
    bloqueHtml = `${tabla(["Producto", "Más barato hoy", "En otra cadena"], c.precios.map((x) => [
      `<a href="${esc(enlace("/#comparador", d.sector, { comparar: x.consulta }))}" style="color:#1a56b0;">${esc(x.producto)}</a>`,
      `<strong>Bs. ${bs(x.minimo)}</strong><br><span style="color:#666666;font-size:13px;">en ${esc(x.tienda)}</span>`,
      `<span style="color:#a8530b;">hasta Bs. ${bs(x.maximo)}</span><br><span style="color:#666666;font-size:13px;">${Math.round(100 * (1 - x.minimo / x.maximo))} % más caro</span>`]))}
${p("Toque un producto para ver la comparación completa, o busque el suyo.", "color:#666666;font-size:14px;")}`;
    bloqueTexto = [...c.precios.map((x) => `- ${x.producto}: Bs. ${bs(x.minimo)} en ${x.tienda} (hasta Bs. ${bs(x.maximo)} en otra cadena)`), ""];
  }

  const parrafos: string[] = tipo === "inicial"
    ? [g.intro, bloqueHtml || !persona ? "Le dejamos los enlaces directos para que lo pruebe:" : "Le dejamos los enlaces directos:"]
    : [persona ? "Le escribimos hace unos días para presentarle El Renglón: compara el precio del mismo producto en las principales cadenas del país, gratis." : "Le escribimos hace unos días para presentarle El Renglón: el IVA con su base legal, la tasa oficial del BCV y los deberes con el SENIAT, gratis y en un solo lugar.",
      "Por si no tuvo tiempo de verlo, estos son los enlaces directos:"];
  const cierre = tipo === "inicial"
    ? "Es gratis y no hace falta registrarse. Si tiene alguna pregunta, basta con responder a este correo."
    : "Si no es el momento, no se preocupe: este es nuestro último mensaje.";
  const pieBaja = "Si prefiere no recibir más correos nuestros, responda con la palabra «baja» o use este enlace:";

  // ── Texto plano ──
  const texto = [
    saludo, "", parrafos[0], "", ...bloqueTexto, parrafos[1], "",
    ...herramientas.flatMap(([t, ruta, x]) => [`- ${t}: ${x}.`, `  ${enlace(ruta, d.sector)}`]), "",
    ...(lineaTasa ? [lineaTasa, ""] : []),
    cierre, "", "Saludos,", "El Renglón", SITIO_URL, "", "--", `© ${new Date().getFullYear()} El Renglón · Todos los derechos reservados`, `${pieBaja} ${baja}`,
  ].join("\n");

  // ── HTML de carta ──
  const lista = `<ul style="margin:0 0 16px;padding-left:22px;${ESTILO}">${herramientas.map(([t, ruta, x]) =>
    `<li style="margin:0 0 8px;"><a href="${esc(enlace(ruta, d.sector))}" style="color:#1a56b0;font-weight:bold;">${esc(t)}</a>: ${esc(x)}.</li>`).join("")}</ul>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:#ffffff;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"><tr><td align="center" style="padding:16px 12px;">
<div style="max-width:600px;margin:0 auto;text-align:left;">
${p(esc(saludo))}
${p(esc(parrafos[0]))}
${bloqueHtml}
${p(esc(parrafos[1]))}
${lista}
${lineaTasa ? p(esc(lineaTasa)) : ""}
${p(esc(cierre))}
${p(`Saludos,<br>El Renglón<br><a href="${esc(enlace("/", d.sector))}" style="color:#1a56b0;">elrenglonve.org</a>`)}
<div style="margin:24px 0 0;padding:18px 20px;background:#0E2440;border-radius:8px;text-align:center;font-family:Arial,Helvetica,sans-serif;">
  <p style="margin:0 0 6px;font-size:15px;font-weight:bold;color:#ffffff;">El Renglón</p>
  <p style="margin:0 0 10px;font-size:13px;line-height:1.5;color:#c9d3e3;">Información fiscal de Venezuela · <a href="${esc(enlace("/", d.sector))}" style="color:#F2B632;text-decoration:none;">elrenglonve.org</a></p>
  <p style="margin:0 0 10px;font-size:12px;color:#c9d3e3;">© ${new Date().getFullYear()} El Renglón · Todos los derechos reservados</p>
  <p style="margin:0;font-size:11px;line-height:1.5;color:#9aa8bf;">${esc(pieBaja)} <a href="${esc(baja)}" style="color:#9aa8bf;">no recibir más correos</a>.</p>
</div>
</div>
</td></tr></table>
</body></html>`;

  return { asunto, html, texto, urlBaja: baja };
}

function p(html: string, extra = "") { return `<p style="margin:0 0 14px;${ESTILO}${extra}">${html}</p>`; }
