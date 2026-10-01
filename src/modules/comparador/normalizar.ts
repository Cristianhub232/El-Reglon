// Normalización de nombres de producto para emparejar ofertas de distintas tiendas (sin dependencias: corre también
// en el navegador). "PAN HARINA MAIZ BLANCO 1KG" y "Harina de maíz blanco P.A.N. 1 kg" → mismas palabras y presentación.

const VACIAS = new Set(["de", "del", "la", "el", "los", "las", "y", "e", "en", "con", "para", "por", "x", "tipo", "a", "al", "un", "una"]);

// Unidad → [unidad base, factor]
const UNIDADES: Record<string, [string, number]> = {
  kg: ["g", 1000], kilo: ["g", 1000], kilos: ["g", 1000], kgs: ["g", 1000], k: ["g", 1000],
  g: ["g", 1], gr: ["g", 1], grs: ["g", 1], gramos: ["g", 1], mg: ["mg", 1], mcg: ["mcg", 1],
  l: ["ml", 1000], lt: ["ml", 1000], lts: ["ml", 1000], litro: ["ml", 1000], litros: ["ml", 1000],
  ml: ["ml", 1], cc: ["ml", 1], oz: ["oz", 1],
  un: ["un", 1], und: ["un", 1], unid: ["un", 1], unidades: ["un", 1], u: ["un", 1], pzas: ["un", 1], piezas: ["un", 1],
  // Comprimidos, tabletas y cápsulas cuentan como unidades: "x10", "10 tabletas" y "10 comp" son la misma caja
  comp: ["un", 1], comprimidos: ["un", 1], tab: ["un", 1], tabs: ["un", 1], tabletas: ["un", 1],
  caps: ["un", 1], capsulas: ["un", 1], sobres: ["sobre", 1], sobre: ["sobre", 1],
  pulgadas: ["pulg", 1], pulg: ["pulg", 1], '"': ["pulg", 1],
};
const PRESENTACION = new RegExp(String.raw`(?<![a-z0-9-])(\d+(?:[.,]\d+)?)\s*(${Object.keys(UNIDADES).sort((a, b) => b.length - a.length).map((u) => u.replace(/"/, '\\"')).join("|")})(?![a-z])`, "g");

export const sinAcentos = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function basico(s: string): string {
  return sinAcentos(s.toLowerCase())
    .replace(/(\d)\s*x\s*(\d)/g, "$1 x $2")
    .replace(/\b([a-z])\.(?=[a-z]\.)/g, "$1")      // P.A.N. → pan
    .replace(/\b([a-z])\.(?![a-z])/g, "$1")
    .replace(/[^a-z0-9.,"\s]/g, " ")
    .replace(/\s+/g, " ").trim();
}

export interface Presentacion { valor: number; unidad: string }

// Presentaciones del nombre en unidades base: "1KG" → 1000 g; "10mg 30 comprimidos" → 10 mg y 30 comp
export function presentaciones(nombre: string): Presentacion[] {
  const t = basico(nombre), salida: Presentacion[] = [];
  const agregar = (valor: number, unidad: string) => {
    if (valor > 0 && !salida.some((p) => p.unidad === unidad)) salida.push({ valor, unidad });
  };
  for (const m of t.matchAll(PRESENTACION)) {
    const [base, factor] = UNIDADES[m[2]];
    agregar(Math.round(Number(m[1].replace(",", ".")) * factor * 1000) / 1000, base);
  }
  // "x10", "x 30" sin unidad: cantidad de unidades del empaque
  for (const m of t.matchAll(/\bx\s*(\d{1,4})(?![\d.,]|\s*(?:kg|g|gr|mg|ml|l|lt|cc|oz)\b)/g)) agregar(Number(m[1]), "un");
  return salida;
}

export const clavePresentacion = (p: Presentacion[]) => p.map((x) => `${x.valor}${x.unidad}`).sort().join("+");

export function textoPresentacion(p: Presentacion[]): string {
  return p.map(({ valor, unidad }) =>
    unidad === "g" && valor >= 1000 ? `${valor / 1000} kg` : unidad === "ml" && valor >= 1000 ? `${valor / 1000} L` : `${valor} ${unidad}`).join(" · ");
}

// Palabras significativas (sin vacías ni presentación); singular sencillo para que "galletas" = "galleta"
export function palabras(nombre: string): string[] {
  const t = basico(nombre).replace(PRESENTACION, " ");
  return [...new Set(t.split(/[\s.,"]+/).filter((w) => w.length > 1 && !VACIAS.has(w) && !/^\d+$/.test(w))
    .map((w) => (w.length > 4 && w.endsWith("es") && !w.endsWith("ses") ? w.slice(0, -2) : w.length > 3 && w.endsWith("s") ? w.slice(0, -1) : w)))];
}

// EAN/UPC válido (dígito verificador GS1). Los códigos internos de la tienda (p. ej. "D0006035") no sirven.
export function ean(codigo: string | null | undefined): string | null {
  const c = (codigo ?? "").trim();
  if (!/^\d{8}$|^\d{12,14}$/.test(c)) return null;
  const d = c.padStart(14, "0");
  const suma = [...d.slice(0, 13)].reduce((a, x, i) => a + Number(x) * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (suma % 10)) % 10 === Number(d[13]) ? d.replace(/^0+(?=\d{13}$)/, "") : null;
}
