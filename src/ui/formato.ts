// Formato local (guía de marca, "Voz"): Bs. 1.234,56 · DD/MM/AAAA · hora de Caracas. Puro: sirve en servidor y cliente.
const ZONA = "America/Caracas";

export function numero(v: string | number, decimales = 2): string {
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("es-VE", { minimumFractionDigits: decimales, maximumFractionDigits: decimales }).format(n);
}

// Monto escrito a la venezolana: "1.234,56", "1234,56", "1234.56" o "1.000" (miles)
export function leerMonto(t: string): number {
  const x = t.trim().replace(/\s/g, "");
  if (x.includes(",")) return Number(x.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(x)) return Number(x.replace(/\./g, ""));
  return Number(x);
}

export const entero = (v: string | number) => new Intl.NumberFormat("es-VE", { maximumFractionDigits: 0 }).format(Number(v));

// Fechas de PostgreSQL ("AAAA-MM-DD") se interpretan como fechas civiles, sin zona horaria
const civil = (f: string) => { const [a, m, d] = f.slice(0, 10).split("-").map(Number); return new Date(Date.UTC(a, m - 1, d, 12)); };

export const fecha = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}/${f.slice(0, 4)}`;
export const fechaCorta = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
export const diaSemana = (f: string) => new Intl.DateTimeFormat("es-VE", { weekday: "long", timeZone: "UTC" }).format(civil(f));
export const fechaLarga = (f: string) => {
  const t = new Intl.DateTimeFormat("es-VE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(civil(f));
  return (t.charAt(0).toUpperCase() + t.slice(1)).replace(",", "");
};
export const diaMes = (f: string) => new Intl.DateTimeFormat("es-VE", { day: "numeric", month: "long", timeZone: "UTC" }).format(civil(f));

// Momentos (timestamptz) en hora de Caracas
export const hora = (m: string | Date) => new Intl.DateTimeFormat("es-VE", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: ZONA }).format(new Date(m));
export const fechaHora = (m: string | Date) => {
  const d = new Date(m);
  const p = new Intl.DateTimeFormat("es-VE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: ZONA }).formatToParts(d);
  const v = (t: string) => p.find((x) => x.type === t)?.value ?? "";
  return `${v("day")}/${v("month")}/${v("year")} ${hora(d)}`;
};
export function haceCuanto(m: string | Date | null, ahora = Date.now()): string {
  if (!m) return "nunca";
  const s = Math.round((ahora - new Date(m).getTime()) / 1000);
  if (s < 60) return "ahora";
  if (s < 3600) return `hace ${Math.round(s / 60)} min`;
  if (s < 86_400) return `hace ${Math.round(s / 3600)} h`;
  if (s < 2 * 86_400) return `ayer ${hora(m)}`;
  return fechaHora(m).slice(0, 10);
}

// ---------------------------------------------------------------- IVA
export type ClaseAlicuota = "exento" | "reducida" | "general" | "adicional" | "condicionado";

export function claseCategoria(categoria: string): ClaseAlicuota {
  if (categoria === "ALICUOTA_REDUCIDA") return "reducida";
  if (categoria === "ALICUOTA_GENERAL") return "general";
  if (categoria === "ALICUOTA_GENERAL_MAS_ADICIONAL") return "adicional";
  return "exento";   // EXENTO, EXONERADO, NO_SUJETO
}

export function etiquetaTasa(categoria: string, alicuotaTotal?: string | null): string {
  if (categoria === "EXENTO") return "Exento";
  if (categoria === "EXONERADO") return "Exonerado";
  if (categoria === "NO_SUJETO") return "No sujeto";
  return alicuotaTotal ? `${numero(alicuotaTotal, Number(alicuotaTotal) % 1 ? 2 : 0)} %` : "—";
}

export interface CitaLegal { id: string; norma: string | null; articulo: string | null; numeral: string | null; literal: string | null }

// "Ley IVA art. 18, num. 1, lit. c" · "Decreto 5.196 art. 1"
export function citaCorta(b: CitaLegal): string {
  const partes = (a: string | null) => [a && a !== "—" ? `art. ${a}` : null, b.numeral ? `num. ${b.numeral}` : null, b.literal ? `lit. ${b.literal}` : null]
    .filter(Boolean).join(", ");
  if (b.id.startsWith("LIVA")) return `Ley IVA ${partes(b.articulo)}`;
  const dec = /Decreto N° ([\d.]+)/.exec(b.norma ?? "");
  if (dec) return `Decreto ${dec[1]}${b.articulo && b.articulo !== "—" ? ` ${partes(b.articulo)}` : ""}`;
  return b.id;
}
