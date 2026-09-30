// Lectores del Pulso oficial. Instagram: solo con la API oficial de Meta (Business Discovery), que devuelve las
// publicaciones públicas de cuentas profesionales; nunca se raspa instagram.com. Sitios: RSS o la tabla de notas de
// prensa del BCV. Las descargas usan las raíces de Node más config/ca (el BCV no envía su certificado intermedio).
import { request } from "node:https";
import { rootCertificates } from "node:tls";
import { certificadosExtra } from "../bcv/ingesta.ts";
import { decodificar, enlaceDeFuente, parsearRss, recortar, textoPlano } from "../noticias/lectores.ts";

export interface Cuenta { id: string; ente: string; metodo: "instagram" | "rss" | "bcv_prensa"; usuario: string | null; url_lectura: string | null; sitio: string }
export interface Publicacion { id_externo: string; url: string; titulo: string; texto: string | null; imagen: string | null; publicado_en: Date }

const AGENTE = "ElRenglon/0.1 (+https://elrenglonve.org; pulso oficial)";
export const VERSION_GRAPH = "v23.0";

export function bajar(url: string, opciones: { maxBytes?: number; espera?: number; redirecciones?: number } = {}): Promise<{ estado: number; tipo: string; cuerpo: Buffer }> {
  const max = opciones.maxBytes ?? 4_000_000;
  return new Promise((resolver, rechazar) => {
    const req = request(url, { method: "GET", ca: [...rootCertificates, ...certificadosExtra()], timeout: opciones.espera ?? 20_000,
      headers: { "User-Agent": AGENTE, Accept: "*/*" } }, (res) => {
      const r = opciones.redirecciones ?? 5;
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && r > 0) {
        res.resume();
        const destino = new URL(res.headers.location, url);
        if (destino.protocol !== "https:") { rechazar(new Error("Redirección a una dirección sin https")); return; }
        bajar(destino.href, { ...opciones, redirecciones: r - 1 }).then(resolver, rechazar); return;
      }
      const partes: Buffer[] = []; let total = 0;
      res.on("data", (c: Buffer) => {
        total += c.length;
        if (total > max) { req.destroy(new Error(`La respuesta supera ${Math.round(max / 1e6)} MB`)); return; }
        partes.push(c);
      });
      res.on("end", () => resolver({ estado: res.statusCode ?? 0, tipo: String(res.headers["content-type"] ?? ""), cuerpo: Buffer.concat(partes) }));
    });
    req.on("timeout", () => req.destroy(new Error("Tiempo de espera agotado")));
    req.on("error", rechazar);
    req.end();
  });
}

async function texto(url: string) {
  const r = await bajar(url);
  if (r.estado !== 200) throw new Error(`HTTP ${r.estado}`);
  return r.cuerpo.toString("utf8");
}

// Título de una publicación de Instagram: la primera línea del texto, sin etiquetas ni menciones sueltas al final
export function tituloDeLeyenda(leyenda: string): { titulo: string; texto: string | null } {
  const lineas = leyenda.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const primera = (lineas[0] ?? "").replace(/(\s*[#@][\p{L}\p{N}_.]+)+\s*$/u, "").trim();
  const titulo = recortar(primera || "Publicación", 140)!;
  const resto = lineas.slice(1).join(" ").replace(/(\s*#[\p{L}\p{N}_]+)+\s*$/u, "").trim();
  return { titulo, texto: recortar(resto, 600) };
}

interface MediaIg { id: string; caption?: string; media_type?: string; media_url?: string; thumbnail_url?: string; permalink?: string; timestamp?: string }

export async function leerInstagram(c: Cuenta, credencial: { usuarioId: string; token: string }): Promise<Publicacion[]> {
  if (!c.usuario) throw new Error("Falta el usuario de Instagram");
  const campos = `business_discovery.username(${c.usuario}){username,media.limit(8){id,caption,media_type,media_url,thumbnail_url,permalink,timestamp}}`;
  const url = `https://graph.facebook.com/${VERSION_GRAPH}/${encodeURIComponent(credencial.usuarioId)}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(credencial.token)}`;
  const r = await bajar(url, { espera: 30_000 });
  let d: { business_discovery?: { media?: { data?: MediaIg[] } }; error?: { message?: string; code?: number } };
  try { d = JSON.parse(r.cuerpo.toString("utf8")); } catch { throw new Error(`API de Instagram: HTTP ${r.estado} sin JSON`); }
  if (d.error) throw new Error(`API de Instagram (código ${d.error.code ?? "?"}): ${(d.error.message ?? "error").replace(/access_token=[^&\s]+/g, "access_token=…")}`);
  return (d.business_discovery?.media?.data ?? []).flatMap((m) => {
    const permalink = m.permalink ? enlaceDeFuente(m.permalink, "https://www.instagram.com") : null;
    const t = m.timestamp ? Date.parse(m.timestamp.replace(/([+-]\d{2})(\d{2})$/, "$1:$2")) : NaN;
    if (!permalink || Number.isNaN(t)) return [];
    const { titulo, texto: resto } = tituloDeLeyenda(decodificar(m.caption ?? ""));
    return [{ id_externo: m.id, url: permalink, titulo, texto: resto, imagen: (m.media_type === "VIDEO" ? m.thumbnail_url : m.media_url) ?? null,
      publicado_en: new Date(Math.min(t, Date.now())) }];
  });
}

export async function leerRss(c: Cuenta): Promise<Publicacion[]> {
  const xml = await texto(c.url_lectura!);
  if (!/<(rss|feed)\b/i.test(xml.slice(0, 2000))) throw new Error("La respuesta no es un RSS");
  return parsearRss(xml, { id: c.id, nombre: c.ente, sitio: c.sitio, metodo: "rss", url_lectura: c.url_lectura })
    .filter((e) => !/obituario|condolencia/i.test(`${e.categoria ?? ""} ${e.titulo}`))          // SAREN publica obituarios
    .map((e) => ({ id_externo: e.url, url: e.url, titulo: e.titulo, texto: e.resumen, imagen: e.imagen, publicado_en: e.publicado_en }));
}

// Notas de prensa del BCV: tabla con título, enlace y fecha (Drupal). La imagen es la de la nota (foaf:Image).
export async function leerBcvPrensa(c: Cuenta): Promise<Publicacion[]> {
  const html = await texto(c.url_lectura!);
  const filas = [...html.matchAll(/<td class="views-field views-field-title"\s*>\s*<a href="([^"]+)">([\s\S]*?)<\/a>[\s\S]*?content="(\d{4}-\d{2}-\d{2}T[^"]+)"/g)];
  if (!filas.length) throw new Error("No se encontró la tabla de notas de prensa (¿cambió la página del BCV?)");
  return filas.slice(0, 8).flatMap(([, href, titulo, fecha]) => {
    const url = enlaceDeFuente(new URL(decodificar(href), c.sitio).href, c.sitio);
    const t = Date.parse(fecha);
    const tit = recortar(textoPlano(titulo), 300);
    if (!url || !tit || Number.isNaN(t)) return [];
    return [{ id_externo: url, url: url.replace(/^http:/, "https:"), titulo: tit, texto: null, imagen: null, publicado_en: new Date(Math.min(t, Date.now())) }];
  });
}

// Imagen y resumen de una nota del BCV (solo para las nuevas)
export async function detalleBcv(url: string): Promise<{ imagen: string | null; texto: string | null }> {
  const html = await texto(url);
  const img = /<img[^>]*typeof="foaf:Image"[^>]*src="([^"]+)"/i.exec(html)?.[1] ?? null;
  const cuerpo = /class="field field-name-(?:body|field-parrafo)[\s\S]*?<p>([\s\S]*?)<\/p>/i.exec(html)?.[1] ?? null;
  return { imagen: img ? new URL(img, url).href : null, texto: cuerpo ? recortar(textoPlano(cuerpo), 600) : null };
}
