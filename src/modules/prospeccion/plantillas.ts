// Plantillas de la prospección comercial (docs/26): un primer correo por sector y un único seguimiento.
// Estilo de carta, como lo escribiría una persona: sin logo, sin botones ni cajas de color y con enlaces de texto
// directos a cada herramienta. Así Gmail lo deja en Principal; el aspecto de boletín lo manda a Promociones.
// Todo dato del prospecto se escapa. La baja va al final, en una línea discreta.
import { SITIO_URL } from "../../core/sitio.ts";

export const SECTORES = {
  general: "General",
  comercio: "Comercio y bodegas",
  farmacia: "Farmacias",
  importador: "Importadores",
  contador: "Contadores",
  desarrollador: "Desarrolladores y software",
} as const;
export type Sector = keyof typeof SECTORES;
export type TipoCorreo = "inicial" | "seguimiento";

export interface DatosCorreo { empresa: string; contacto: string | null; sector: Sector; token: string }
export interface Tasa { usd: string; eur: string; fecha_valor: string }
export interface Correo { asunto: string; html: string; texto: string; urlBaja: string }

// Herramientas del sitio a las que enlaza el correo: [texto del enlace, ruta, para qué sirve]
const HERRAMIENTAS = {
  iva: ["Clasificador de IVA", "/#herramientas", "escriba un producto o su código de barras y vea si es exento, 8 %, 16 % o 31 %, con el artículo de la ley"],
  iva_arancel: ["Clasificador de IVA", "/#herramientas", "acepta también el código arancelario: alícuota en la importación y base legal"],
  comparador: ["Comparador de precios", "/#comparador", "el precio del mismo producto en 12 cadenas del país"],
  comparador_farmacia: ["Comparador de precios", "/#comparador", "compare con Farmatodo, Locatel, Farmacias SAAS y otras cadenas"],
  deberes: ["Mis deberes tributarios", "/#deberes", "los próximos vencimientos con el SENIAT según el RIF, especiales u ordinarios"],
  tasas: ["Tasa oficial del BCV", "/#tasas", "la del día, su historial y un conversor de bolívares, dólares y euros"],
  api: ["Documentación de la API", "/docs", "IVA, tasas del BCV, arancel, calendario tributario y RIF para su sistema"],
  apikey: ["API key gratuita", "/solicitar-api-key", "para empezar a integrar hoy mismo"],
} as const;
type Herramienta = keyof typeof HERRAMIENTAS;

// Cierra la oración sin duplicar el punto de «C.A.» o «S.A.»
const fin = (e: string) => (e.endsWith(".") ? e : `${e}.`);

interface Guion { asunto: string; intro: string; herramientas: Herramienta[] }
const GUIONES: Record<Sector, (empresa: string) => Guion> = {
  general: (e) => ({
    asunto: `${e}: IVA, tasa BCV y deberes del SENIAT en un solo lugar`,
    intro: `Le escribimos desde El Renglón, un sitio gratuito con la información fiscal que un negocio venezolano consulta a diario. Pensamos que le puede ahorrar tiempo a ${fin(e)}`,
    herramientas: ["iva", "tasas", "deberes", "comparador"],
  }),
  comercio: (e) => ({
    asunto: `${e}: ¿qué productos llevan IVA y cuáles no?`,
    intro: `Le escribimos desde El Renglón. En el mostrador no hay tiempo para leer la Ley del IVA, y por eso hicimos un sitio gratuito que lo resuelve en segundos. Pensamos que le puede servir a ${fin(e)}`,
    herramientas: ["iva", "comparador", "tasas"],
  }),
  farmacia: (e) => ({
    asunto: `${e}: el IVA de cada medicamento, con su base legal`,
    intro: `Le escribimos desde El Renglón. En una farmacia conviven productos exentos y gravados, y hicimos un sitio gratuito para distinguirlos sin dudas. Pensamos que le puede servir a ${fin(e)}`,
    herramientas: ["iva", "comparador_farmacia", "tasas"],
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
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const enlace = (ruta: string, sector: Sector) => {
  const [camino, ancla] = ruta.split("#");
  const u = new URL(camino || "/", SITIO_URL);
  u.searchParams.set("utm_source", "correo"); u.searchParams.set("utm_campaign", sector);
  return u.toString() + (ancla ? `#${ancla}` : "");
};
const bs = (v: string) => Number(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (f: string) => f.split("-").reverse().join("/");

export function urlBaja(token: string): string { return `${SITIO_URL}/baja?t=${token}`; }

const ESTILO = "font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.55;color:#222222;";

export function armarCorreo(d: DatosCorreo, tipo: TipoCorreo, tasa: Tasa | null): Correo {
  const empresa = d.empresa.trim(), contacto = d.contacto?.trim() || null;
  const g = GUIONES[d.sector](empresa);
  const baja = urlBaja(d.token);
  const saludo = contacto ? `Hola, ${contacto}:` : `Hola, equipo de ${empresa}:`;
  const asunto = tipo === "inicial" ? g.asunto : `${empresa}: ¿pudo ver El Renglón?`;
  const lineaTasa = tasa ? `Por cierto, hoy el BCV publicó Bs. ${bs(tasa.usd)} por dólar y Bs. ${bs(tasa.eur)} por euro (fecha valor ${fechaCorta(tasa.fecha_valor)}).` : null;
  const herramientas = (tipo === "inicial" ? g.herramientas : g.herramientas.slice(0, 2)).map((h) => HERRAMIENTAS[h]);
  const parrafos: string[] = tipo === "inicial"
    ? [g.intro, "Le dejamos los enlaces directos para que lo pruebe:"]
    : ["Le escribimos hace unos días para presentarle El Renglón: el IVA con su base legal, la tasa oficial del BCV y los deberes con el SENIAT, gratis y en un solo lugar.", "Por si no tuvo tiempo de verlo, estos son los enlaces directos:"];
  const cierre = tipo === "inicial"
    ? "Es gratis y no hace falta registrarse. Si tiene alguna pregunta, basta con responder a este correo."
    : "Si no es el momento, no se preocupe: este es nuestro último mensaje.";
  const pieBaja = "Si prefiere no recibir más correos nuestros, responda con la palabra «baja» o use este enlace:";

  // ── Texto plano ──
  const texto = [
    saludo, "", parrafos[0], "", parrafos[1], "",
    ...herramientas.flatMap(([t, ruta, x]) => [`- ${t}: ${x}.`, `  ${enlace(ruta, d.sector)}`]), "",
    ...(lineaTasa ? [lineaTasa, ""] : []),
    cierre, "", "Saludos,", "El Renglón", SITIO_URL, "", "--", `${pieBaja} ${baja}`,
  ].join("\n");

  // ── HTML de carta: párrafos y enlaces de texto, sin imágenes ni colores de marca ──
  const p = (html: string, extra = "") => `<p style="margin:0 0 14px;${ESTILO}${extra}">${html}</p>`;
  const lista = `<ul style="margin:0 0 16px;padding-left:22px;${ESTILO}">${herramientas.map(([t, ruta, x]) =>
    `<li style="margin:0 0 8px;"><a href="${esc(enlace(ruta, d.sector))}" style="color:#1a56b0;font-weight:bold;">${esc(t)}</a>: ${esc(x)}.</li>`).join("")}</ul>`;
  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:16px;background:#ffffff;">
<div style="max-width:600px;">
${p(esc(saludo))}
${p(esc(parrafos[0]))}
${p(esc(parrafos[1]))}
${lista}
${lineaTasa ? p(esc(lineaTasa)) : ""}
${p(esc(cierre))}
${p(`Saludos,<br>El Renglón<br><a href="${esc(enlace("/", d.sector))}" style="color:#1a56b0;">elrenglonve.org</a>`)}
<p style="margin:22px 0 0;padding-top:10px;border-top:1px solid #e5e5e5;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#777777;">${esc(pieBaja)} <a href="${esc(baja)}" style="color:#777777;">no recibir más correos</a>.</p>
</div>
</body></html>`;

  return { asunto, html, texto, urlBaja: baja };
}
