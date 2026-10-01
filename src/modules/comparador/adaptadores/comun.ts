// Utilidades de los lectores: descarga con límite de tiempo y tamaño, precios en formato venezolano y texto sin HTML
import { decodificar, textoPlano } from "../../noticias/lectores.ts";

export { decodificar, textoPlano };

export async function pagina(url: string, agente: string, init: RequestInit = {}): Promise<string> {
  const r = await fetch(url, { ...init, headers: { "User-Agent": agente, Accept: "text/html,application/json", ...init.headers }, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const texto = await r.text();
  if (texto.length > 6_000_000) throw new Error("Respuesta demasiado grande");
  return texto;
}

// "1.234,56", "1,25", "$ 2,50", "# 1,77" → "1234.56". Con punto como único separador ("129.98") se toma como decimal.
export function precioEs(texto: string): string | null {
  const t = texto.replace(/[^\d.,]/g, "");
  if (!t) return null;
  const n = t.includes(",") ? Number(t.replace(/\./g, "").replace(",", ".")) : Number(t);
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null;
}

export const absoluta = (url: string, base: string) => { try { const u = new URL(decodificar(url), base); return u.protocol === "https:" || u.protocol === "http:" ? u.href.replace(/^http:/, "https:") : null; } catch { return null; } };

// Solo enlaces del dominio de la tienda
export function deLaTienda(url: string | null, sitio: string): string | null {
  if (!url) return null;
  try { const a = new URL(url), b = new URL(sitio); return a.hostname.replace(/^www\./, "") === b.hostname.replace(/^www\./, "") ? a.href : null; } catch { return null; }
}
