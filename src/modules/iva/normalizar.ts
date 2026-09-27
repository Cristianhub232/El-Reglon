// Normalización de texto para el matcher: minúsculas, sin acentos (la ñ queda como n), solo letras y dígitos.
// Los patrones del catálogo se escriben sobre este texto normalizado.
export function normalizar(texto: string): string {
  return texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
}

// Peso neto en gramos a partir del nombre ("140 g", "1,5 kg", "170gr", "500 ml" no cuenta). Null si no aparece.
export function pesoEnGramos(texto: string): number | null {
  const t = texto.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const m = /(\d+(?:[.,]\d+)?)\s*(kg|kilos?|kilogramos?|g|gr|grs|gramos?)\b/.exec(t);
  if (!m) return null;
  const n = Number(m[1].replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return /^k/.test(m[2]) ? n * 1000 : n;
}
