// Lectores del noticiero: RSS (WordPress), API REST de WordPress y WorldNewsAPI. Todo lo que llega de los medios
// es texto no confiable: se quitan las etiquetas HTML, se decodifican las entidades y solo se aceptan enlaces del
// dominio de la fuente e imágenes https. La interfaz nunca inserta HTML de terceros.
export interface Fuente { id: string; nombre: string; sitio: string; metodo: "rss" | "wordpress" | "worldnews"; url_lectura: string | null }
export interface Entrada { url: string; titulo: string; resumen: string | null; imagen: string | null; autor: string | null; categoria: string | null; publicado_en: Date }

const AGENTE = "ElRenglon/0.1 (+https://elrenglonve.org; noticiero)";
const MAX_BYTES = 4 * 1024 * 1024;
const ANTIGUEDAD_MAX = 7 * 86_400_000;       // no se guardan titulares de más de una semana

export async function descargar(url: string, opciones: { cabeceras?: Record<string, string>; maxBytes?: number; espera?: number } = {}) {
  const res = await fetch(url, {
    headers: { "User-Agent": AGENTE, Accept: "application/rss+xml, application/xml, application/json, text/html;q=0.8", ...opciones.cabeceras },
    redirect: "follow", signal: AbortSignal.timeout(opciones.espera ?? 20_000),
  });
  const max = opciones.maxBytes ?? MAX_BYTES;
  const partes: Uint8Array[] = [];
  let total = 0;
  const lector = res.body?.getReader();
  while (lector) {
    const { done, value } = await lector.read();
    if (done) break;
    partes.push(value); total += value.length;
    if (total >= max) { await lector.cancel(); break; }   // páginas enormes: basta con el principio
  }
  return { estado: res.status, cabeceras: res.headers, texto: Buffer.concat(partes).toString("utf8").slice(0, max) };
}

// ── Texto ────────────────────────────────────────────────────────────────────────────────────────────
const NOMBRADAS: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", hellip: "…", laquo: "«", raquo: "»", ldquo: "“", rdquo: "”",
  lsquo: "‘", rsquo: "’", ndash: "–", mdash: "—", iquest: "¿", iexcl: "¡", ntilde: "ñ", Ntilde: "Ñ", uuml: "ü", Uuml: "Ü", deg: "°", euro: "€",
};
for (const v of "aeiouAEIOU") NOMBRADAS[`${v}acute`] = `${v}\u0301`.normalize("NFC");

export function decodificar(s: string): string {
  return s.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return n > 0 && n < 0x110000 ? String.fromCodePoint(n) : "";
    }
    return NOMBRADAS[e] ?? m;
  });
}

// HTML → texto plano de una línea
export function textoPlano(html: string): string {
  return decodificar(html
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<p>\s*(La entrada|The post)\b[\s\S]*?<\/p>/gi, " ")    // pie automático de WordPress
    .replace(/<[^>]+>/g, " "))
    .replace(/\[(…|\.\.\.)\]/g, "…")
    .replace(/\s+/g, " ").trim();
}

export function recortar(s: string | null, max: number): string | null {
  if (!s) return null;
  if (s.length <= max) return s;
  const corte = s.slice(0, max - 1);
  return corte.slice(0, Math.max(corte.lastIndexOf(" "), max * 0.6)).replace(/[\s,;:.–—-]+$/, "") + "…";
}

const sinWww = (h: string) => h.toLowerCase().replace(/^www\./, "");

// El enlace debe ser http(s) y del dominio de la fuente (o un subdominio). Se quitan los parámetros de campaña.
export function enlaceDeFuente(url: string, sitio: string): string | null {
  try {
    const u = new URL(url.trim());
    const base = sinWww(new URL(sitio).hostname), host = sinWww(u.hostname);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    if (host !== base && !host.endsWith(`.${base}`)) return null;
    u.hash = "";
    for (const k of [...u.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(k)) u.searchParams.delete(k);
    return u.href;
  } catch { return null; }
}

export function imagenSegura(url: string | null | undefined, base?: string): string | null {
  if (!url || url.startsWith("data:")) return null;
  try {
    const u = new URL(decodificar(url.trim()), base);          // algunos feeds usan rutas relativas (/wp-content/…)
    if (u.protocol === "http:") u.protocol = "https:";          // sin contenido mixto en la portada
    return u.protocol === "https:" && u.href.length <= 1000 ? u.href : null;
  } catch { return null; }
}

function fecha(valor: string | null | undefined): Date | null {
  if (!valor) return null;
  const t = Date.parse(valor);
  if (Number.isNaN(t)) return null;
  const ahora = Date.now();
  if (t < ahora - ANTIGUEDAD_MAX) return null;
  return new Date(Math.min(t, ahora));               // una fecha futura (reloj mal puesto) se toma como "ahora"
}

function entrada(f: Fuente, e: { url?: string; titulo?: string; resumen?: string | null; imagen?: string | null | (string | null)[]; autor?: string | null; categoria?: string | null; fecha?: string | null }): Entrada | null {
  const url = e.url ? enlaceDeFuente(decodificar(e.url), f.sitio) : null;
  const titulo = recortar(textoPlano(e.titulo ?? ""), 400);
  const publicado_en = fecha(e.fecha);
  if (!url || !titulo || !publicado_en) return null;
  const resumen = recortar(textoPlano(e.resumen ?? ""), 600);
  const imagen = (Array.isArray(e.imagen) ? e.imagen : [e.imagen]).map((i) => imagenSegura(i, f.sitio)).find(Boolean) ?? null;
  return { url, titulo, resumen: resumen && resumen !== titulo ? resumen : null, imagen,
    autor: recortar(textoPlano(e.autor ?? ""), 120), categoria: recortar(textoPlano(e.categoria ?? ""), 60), publicado_en };
}

// ── RSS ──────────────────────────────────────────────────────────────────────────────────────────────
const sinCdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
function etiqueta(xml: string, nombre: string): string | null {
  const m = new RegExp(`<${nombre}\\b[^>]*>([\\s\\S]*?)</${nombre}>`, "i").exec(xml);
  if (!m) return null;
  const v = m[1].trim();
  return v.startsWith("<![CDATA[") ? sinCdata(v) : decodificar(v);   // sin CDATA, el XML trae el HTML escapado
}
function atributo(xml: string, nombre: string, attr: string, filtro?: RegExp): string | null {
  for (const m of xml.matchAll(new RegExp(`<${nombre}\\b([^>]*)>`, "gi"))) {
    if (filtro && !filtro.test(m[1])) continue;
    const a = new RegExp(`\\b${attr}\\s*=\\s*["']([^"']+)["']`, "i").exec(m[1]);
    if (a) return a[1];
  }
  return null;
}
const primeraImagen = (html: string | null) => (html ? /<img\b[^>]*?\bsrc\s*=\s*["']([^"']+)["']/i.exec(html)?.[1] ?? null : null);

export function parsearRss(xml: string, f: Fuente): Entrada[] {
  const salida: Entrada[] = [];
  for (const [item] of xml.matchAll(/<item\b[\s\S]*?<\/item>/gi)) {
    const descripcion = etiqueta(item, "description"), contenido = etiqueta(item, "content:encoded");
    const e = entrada(f, {
      url: etiqueta(item, "link") ?? undefined, titulo: etiqueta(item, "title") ?? undefined,
      resumen: descripcion ?? (contenido ? contenido.slice(0, 3000) : null),
      imagen: [atributo(item, "media:content", "url", /medium\s*=\s*["']image|type\s*=\s*["']image|\.(jpe?g|png|webp)/i),
        atributo(item, "media:thumbnail", "url"), atributo(item, "enclosure", "url", /type\s*=\s*["']image/i),
        primeraImagen(descripcion), primeraImagen(contenido)],
      autor: etiqueta(item, "dc:creator"), categoria: etiqueta(item, "category"), fecha: etiqueta(item, "pubDate") ?? etiqueta(item, "dc:date"),
    });
    if (e) salida.push(e);
  }
  return salida;
}

// ── API REST de WordPress (sitios sin RSS) ───────────────────────────────────────────────────────────
interface PostWp { link?: string; date_gmt?: string; title?: { rendered?: string }; excerpt?: { rendered?: string }; jetpack_featured_media_url?: string }
export function urlWordpress(base: string) {
  return `${base}?per_page=20&_fields=link,date_gmt,title,excerpt,jetpack_featured_media_url`;
}
export function parsearWordpress(json: unknown, f: Fuente): Entrada[] {
  if (!Array.isArray(json)) throw new Error("La API de WordPress no devolvió una lista");
  return (json as PostWp[]).map((p) => entrada(f, {
    url: p.link, titulo: p.title?.rendered, resumen: p.excerpt?.rendered, imagen: p.jetpack_featured_media_url || null,
    fecha: p.date_gmt ? `${p.date_gmt}Z` : null,
  })).filter((e): e is Entrada => e !== null);
}

// ── WorldNewsAPI (https://worldnewsapi.com/docs/search-news) ─────────────────────────────────────────
// Una sola consulta por lectura para todas las fuentes "worldnews" (máximo 10 por consulta). Cada consulta
// cuesta ~1 punto más 0,01 por resultado; el plan gratuito da 50 puntos al día.
interface NoticiaWn { url?: string; title?: string; summary?: string; text?: string; image?: string; author?: string; category?: string; publish_date?: string }
export async function leerWorldNews(fuentes: Fuente[], clave: string): Promise<{ porFuente: Map<string, Entrada[]>; cuotaRestante: number | null }> {
  const desde = new Date(Date.now() - 2 * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  const q = new URLSearchParams({ "news-sources": fuentes.slice(0, 10).map((f) => f.sitio).join(","), sort: "publish-time",
    "sort-direction": "DESC", number: "20", "earliest-publish-date": desde });
  const r = await descargar(`https://api.worldnewsapi.com/search-news?${q}`, { cabeceras: { "x-api-key": clave, Accept: "application/json" }, espera: 30_000 });
  const cuota = r.cabeceras.get("x-api-quota-left");
  let d: { news?: NoticiaWn[]; message?: string };
  try { d = JSON.parse(r.texto); } catch { throw new Error(`WorldNewsAPI respondió HTTP ${r.estado} sin JSON`); }
  if (r.estado !== 200) throw new Error(`WorldNewsAPI HTTP ${r.estado}: ${d.message ?? "error"}`);
  const porFuente = new Map<string, Entrada[]>(fuentes.map((f) => [f.id, []]));
  for (const n of d.news ?? []) {
    for (const f of fuentes) {
      const e = entrada(f, { url: n.url, titulo: n.title, resumen: n.summary ?? n.text?.slice(0, 1200), imagen: n.image, autor: n.author,
        categoria: n.category, fecha: n.publish_date ? `${n.publish_date.replace(" ", "T")}Z` : null });
      if (e) { porFuente.get(f.id)!.push(e); break; }
    }
  }
  return { porFuente, cuotaRestante: cuota === null ? null : Number(cuota) };
}

// Imagen de respaldo: la etiqueta og:image del artículo (solo para titulares nuevos que no traen imagen)
export async function imagenDelArticulo(url: string): Promise<string | null> {
  try {
    const r = await descargar(url, { maxBytes: 300_000, espera: 10_000, cabeceras: { Accept: "text/html" } });
    if (r.estado !== 200) return null;
    const m = /<meta\b[^>]*(?:property|name)\s*=\s*["'](?:og:image|twitter:image)["'][^>]*>/i.exec(r.texto);
    return m ? imagenSegura(/\bcontent\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1]) : null;
  } catch { return null; }
}

export async function leerFuente(f: Fuente): Promise<Entrada[]> {
  if (!f.url_lectura) throw new Error("La fuente no tiene dirección de lectura");
  const r = await descargar(f.metodo === "wordpress" ? urlWordpress(f.url_lectura) : f.url_lectura);
  if (r.estado !== 200) throw new Error(`HTTP ${r.estado}`);
  if (f.metodo === "wordpress") {
    try { return parsearWordpress(JSON.parse(r.texto), f); } catch (e) { throw new Error(`Respuesta de WordPress no válida: ${(e as Error).message}`); }
  }
  if (!/<(rss|feed|rdf:RDF)\b/i.test(r.texto.slice(0, 2000))) throw new Error("La respuesta no es un RSS (¿protección antibots o cambio de dirección?)");
  return parsearRss(r.texto, f);
}
