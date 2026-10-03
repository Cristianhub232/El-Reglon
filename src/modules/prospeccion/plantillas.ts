// Plantillas de la prospección comercial (docs/26): un primer correo por sector y un único seguimiento.
// Diseño de carta, con poco HTML y sin imágenes salvo el logo: los correos muy gráficos suelen ir a Promociones o a
// Spam. Todo dato del prospecto se escapa. Cada correo lleva la baja visible y en las cabeceras List-Unsubscribe.
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

interface Guion { asunto: string; titular: string; intro: string; puntos: [string, string][]; boton: [string, string]; extra?: [string, string] }

const GUIONES: Record<Sector, (empresa: string) => Guion> = {
  general: (e) => ({
    asunto: `${e}: IVA, tasa BCV y deberes del SENIAT en un solo lugar`,
    titular: "Menos tiempo buscando normas. Más tiempo para su negocio.",
    intro: "El Renglón reúne, gratis y con su base legal, lo que todo negocio venezolano consulta a diario:",
    puntos: [
      ["¿Lleva IVA?", "Escriba el nombre o el código de barras de un producto y vea si es exento, 8 %, 16 % o 31 %, con el artículo de la ley."],
      ["Tasa oficial del BCV", "La del día, su historial y un conversor de bolívares, dólares y euros."],
      ["Deberes con el SENIAT", "Sus próximos vencimientos según su RIF, con aviso 3 días antes."],
    ],
    boton: ["Probar El Renglón gratis", "/"],
  }),
  comercio: (e) => ({
    asunto: `${e}: ¿qué productos llevan IVA y cuáles no?`,
    titular: "¿Exento, 8 % o 16 %? Respóndalo en segundos.",
    intro: "En el mostrador no hay tiempo para leer la Ley del IVA. El Renglón lo resuelve por usted:",
    puntos: [
      ["Clasificador de IVA", "Por nombre o código de barras: le dice cómo tributa el producto y en qué artículo de la ley se basa."],
      ["Comparador de precios", "El precio del mismo producto en 12 cadenas venezolanas, para fijar el suyo con datos."],
      ["Tasa BCV del día", "Para convertir precios sin salir de la página."],
    ],
    boton: ["Clasificar un producto ahora", "/#herramientas"],
  }),
  farmacia: (e) => ({
    asunto: `${e}: el IVA de cada medicamento, con su base legal`,
    titular: "Medicinas exentas, insumos al 16 %: sin dudas en la factura.",
    intro: "En una farmacia conviven productos exentos y gravados. El Renglón le ayuda a distinguirlos:",
    puntos: [
      ["Clasificador de IVA", "Medicamentos, insumos médicos, higiene y cosméticos: cómo tributa cada uno y por qué."],
      ["Comparador de precios", "Compare con Farmatodo, Locatel, Farmacias SAAS y otras cadenas."],
      ["Tasa BCV del día", "Siempre a mano para actualizar precios."],
    ],
    boton: ["Probar el clasificador gratis", "/#herramientas"],
  }),
  importador: (e) => ({
    asunto: `${e}: código arancelario y tasa BCV aplicable en segundos`,
    titular: "Del nombre del producto al código arancelario.",
    intro: "Clasificar mercancía y calcular con la tasa correcta lleva tiempo. El Renglón lo agiliza:",
    puntos: [
      ["Detección arancelaria", "Escriba el nombre comercial y obtenga la subpartida del Arancel (Decreto 4.944 y sus reformas de 2025)."],
      ["IVA en la importación", "Alícuota aplicable y base legal, incluidas las exoneraciones vigentes."],
      ["Tasa aplicable del BCV", "La que corresponde a la fecha de la operación, con su historial."],
    ],
    boton: ["Buscar un código arancelario", "/#herramientas"],
  }),
  contador: (e) => ({
    asunto: `${e}: los vencimientos del SENIAT de sus clientes, en un solo lugar`,
    titular: "Ningún cliente con una declaración vencida.",
    intro: "Llevar el calendario tributario de muchos RIF a mano es un riesgo. El Renglón lo hace por usted:",
    puntos: [
      ["Deberes por RIF", "Contribuyentes especiales y ordinarios: próximos vencimientos según el calendario oficial de 2026."],
      ["Avisos antes del vencimiento", "3 días antes y el mismo día, en el navegador o en su calendario."],
      ["IVA con base legal", "Cómo tributa cada bien o servicio, con el artículo de la ley para respaldar su criterio."],
    ],
    boton: ["Consultar los deberes de un RIF", "/#herramientas"],
  }),
  desarrollador: (e) => ({
    asunto: `${e}: API gratuita de IVA, tasa BCV y arancel`,
    titular: "Datos fiscales venezolanos, listos para su sistema.",
    intro: "Si su software factura o calcula precios en Venezuela, El Renglón le ahorra mantener esas tablas:",
    puntos: [
      ["API REST documentada", "Clasificación de IVA, tasas del BCV, arancel, calendario tributario, RIF y comparador de precios."],
      ["Siempre actualizada", "Tasas leídas del BCV tres veces al día y normas verificadas contra la Gaceta Oficial."],
      ["API key gratuita", "Con documentación interactiva (Swagger) para probar cada consulta."],
    ],
    boton: ["Ver la documentación de la API", "/docs"],
    extra: ["Pedir una API key gratuita", "/solicitar-api-key"],
  }),
};

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
const enlace = (ruta: string, sector: Sector, tipo: TipoCorreo) => {
  const u = new URL(ruta, SITIO_URL);
  u.searchParams.set("utm_source", "correo"); u.searchParams.set("utm_medium", "prospeccion"); u.searchParams.set("utm_campaign", `${sector}-${tipo}`);
  return u.toString();
};
const bs = (v: string) => Number(v).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fechaCorta = (f: string) => f.split("-").reverse().join("/");

export function urlBaja(token: string): string { return `${SITIO_URL}/baja?t=${token}`; }

// Paleta de la marca (globals.css): Tinta Caracas, Azul Renglón, Amarillo Araguaney, Papel
const C = { tinta: "#0E2440", azul: "#1F4E8C", amarillo: "#F2B632", papel: "#F6F3EA", linea: "#DDD7C8", texto: "#1C2330", texto2: "#3A4250", apagado: "#5A6170" };
const FUENTE = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";

export function armarCorreo(d: DatosCorreo, tipo: TipoCorreo, tasa: Tasa | null): Correo {
  const empresa = d.empresa.trim(), contacto = d.contacto?.trim() || null;
  const g = GUIONES[d.sector](empresa);
  const baja = urlBaja(d.token);
  const saludo = contacto ? `Hola, ${contacto}:` : `Hola, equipo de ${empresa}:`;
  const asunto = tipo === "inicial" ? g.asunto : `${empresa}: ¿pudo ver El Renglón?`;
  const lineaTasa = tasa ? `Hoy, el BCV: Bs. ${bs(tasa.usd)} por dólar y Bs. ${bs(tasa.eur)} por euro (fecha valor ${fechaCorta(tasa.fecha_valor)}).` : null;
  const pie = `Le escribimos porque creemos que El Renglón puede serle útil a ${empresa}.`;

  // ── Texto plano (lo leen algunos clientes de correo y los filtros de spam) ──
  const texto = (tipo === "inicial" ? [
    saludo, "", g.titular, "", g.intro, "",
    ...g.puntos.map(([t, x]) => `• ${t}: ${x}`), "",
    ...(lineaTasa ? [lineaTasa, ""] : []),
    `${g.boton[0]}: ${enlace(g.boton[1], d.sector, tipo)}`,
    ...(g.extra ? [`${g.extra[0]}: ${enlace(g.extra[1], d.sector, tipo)}`] : []), "",
    "No hace falta registrarse. Si tiene preguntas, responda a este correo.",
  ] : [
    saludo, "",
    "Le escribimos hace unos días para presentarle El Renglón: IVA con base legal, tasa oficial del BCV y deberes con el SENIAT, gratis y en un solo lugar.", "",
    ...(lineaTasa ? [lineaTasa, ""] : []),
    `Puede probarlo sin registrarse: ${enlace(g.boton[1], d.sector, tipo)}`, "",
    "Si no es el momento, no se preocupe: este es nuestro último mensaje.",
  ]).concat(["", "El Renglón · Información fiscal de Venezuela", SITIO_URL, "", pie, `Si no desea recibir más correos: ${baja}`]).join("\n");

  // ── HTML ──
  const p = (html: string, estilo = "") => `<p style="margin:0 0 16px;${FUENTE}font-size:15px;line-height:1.6;color:${C.texto};${estilo}">${html}</p>`;
  const boton = (t: string, ruta: string) => `<a href="${esc(enlace(ruta, d.sector, tipo))}" style="display:inline-block;background:${C.azul};color:#ffffff;${FUENTE}font-size:15px;font-weight:600;text-decoration:none;padding:12px 22px;border-radius:6px;">${esc(t)}</a>`;
  const cuerpo = tipo === "inicial" ? [
    p(esc(saludo)),
    `<h1 style="margin:0 0 12px;${FUENTE}font-size:22px;line-height:1.3;color:${C.tinta};font-weight:700;">${esc(g.titular)}</h1>`,
    p(esc(g.intro)),
    `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:0 0 20px;">${g.puntos.map(([t, x]) =>
      `<tr><td width="6" style="background:${C.amarillo};border-radius:3px;">&nbsp;</td><td style="padding:8px 0 8px 14px;${FUENTE}font-size:15px;line-height:1.5;color:${C.texto2};"><strong style="color:${C.tinta};">${esc(t)}.</strong> ${esc(x)}</td></tr><tr><td colspan="2" height="8" style="font-size:0;line-height:0;">&nbsp;</td></tr>`).join("")}</table>`,
    lineaTasa ? `<div style="margin:0 0 22px;padding:12px 16px;background:${C.papel};border:1px solid ${C.linea};border-radius:6px;${FUENTE}font-size:14px;line-height:1.5;color:${C.texto2};">${esc(lineaTasa)}</div>` : "",
    `<div style="margin:0 0 12px;">${boton(...g.boton)}</div>`,
    g.extra ? p(`<a href="${esc(enlace(g.extra[1], d.sector, tipo))}" style="color:${C.azul};">${esc(g.extra[0])}</a>`, "font-size:14px;") : "",
    p("No hace falta registrarse. Si tiene preguntas, responda a este correo.", `color:${C.apagado};font-size:14px;margin-top:8px;`),
  ] : [
    p(esc(saludo)),
    p("Le escribimos hace unos días para presentarle <strong>El Renglón</strong>: IVA con base legal, tasa oficial del BCV y deberes con el SENIAT, gratis y en un solo lugar."),
    lineaTasa ? p(esc(lineaTasa), `color:${C.texto2};`) : "",
    `<div style="margin:0 0 16px;">${boton("Probar sin registrarse", g.boton[1])}</div>`,
    p("Si no es el momento, no se preocupe: este es nuestro último mensaje.", `color:${C.apagado};font-size:14px;`),
  ];

  const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(asunto)}</title></head>
<body style="margin:0;padding:0;background:${C.papel};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(tipo === "inicial" ? g.titular : "Un último mensaje sobre El Renglón")}</div>
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${C.papel};"><tr><td align="center" style="padding:28px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:580px;background:#ffffff;border:1px solid ${C.linea};border-radius:10px;">
<tr><td style="padding:22px 28px;border-bottom:3px solid ${C.amarillo};">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
    <td style="padding-right:10px;"><img src="${SITIO_URL}/iconos/apple-touch-icon.png" width="36" height="36" alt="" style="display:block;border-radius:8px;"></td>
    <td style="${FUENTE}font-size:19px;font-weight:700;color:${C.tinta};">El Renglón</td>
  </tr></table>
</td></tr>
<tr><td style="padding:26px 28px 14px;">${cuerpo.join("\n")}</td></tr>
<tr><td style="padding:16px 28px 22px;border-top:1px solid ${C.linea};${FUENTE}font-size:12px;line-height:1.6;color:${C.apagado};">
  <strong style="color:${C.tinta};">El Renglón</strong> · Información fiscal de Venezuela · <a href="${SITIO_URL}" style="color:${C.azul};">elrenglonve.org</a><br>
  ${esc(pie)} Si no desea recibir más correos, <a href="${esc(baja)}" style="color:${C.apagado};">dese de baja aquí</a> y no le escribiremos más.
</td></tr>
</table></td></tr></table>
</body></html>`;

  return { asunto, html, texto, urlBaja: baja };
}
