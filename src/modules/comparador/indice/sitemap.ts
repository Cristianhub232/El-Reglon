// Sitemap (índice o lista de URLs), recursivo. Solo las URL que cumplen el patrón de página de producto de la tienda.
import { decodificar } from "../adaptadores/comun.ts";

export async function urlsDeSitemap(url: string, agente: string, patron: RegExp, profundidad = 0): Promise<string[]> {
  const r = await fetch(url, { headers: { "User-Agent": agente, Accept: "application/xml,text/xml" }, signal: AbortSignal.timeout(60_000) });
  if (!r.ok) throw new Error(`Sitemap: HTTP ${r.status}`);
  const xml = await r.text();
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decodificar(m[1]));
  if (/<sitemapindex\b/.test(xml)) {
    if (profundidad > 2) return [];
    const salida: string[] = [];
    for (const l of locs) salida.push(...await urlsDeSitemap(l, agente, patron, profundidad + 1));
    return salida;
  }
  return [...new Set(locs.filter((l) => l.startsWith("https://") && patron.test(l)))];
}
