// Aritmética decimal exacta para montos (BigInt escalado a 10^8). Redondeo final a 2 decimales, mitad hacia arriba.
const ESCALA = 8;
const F = 10n ** BigInt(ESCALA);

export function aDecimal(v: string | number): bigint {
  const s = typeof v === "number" ? v.toFixed(ESCALA) : v.trim();
  const m = /^(-?)(\d+)(?:\.(\d+))?$/.exec(s);
  if (!m) throw new Error(`Número inválido: ${v}`);
  const frac = (m[3] ?? "").padEnd(ESCALA + 1, "0");
  let r = BigInt(m[2]) * F + BigInt(frac.slice(0, ESCALA));
  if (Number(frac[ESCALA]) >= 5) r += 1n;
  return m[1] ? -r : r;
}

function dividirRedondeando(a: bigint, b: bigint): bigint {
  const neg = (a < 0n) !== (b < 0n);
  const [x, y] = [a < 0n ? -a : a, b < 0n ? -b : b];
  const q = (2n * x + y) / (2n * y);
  return neg ? -q : q;
}

export const mul = (a: bigint, b: bigint): bigint => dividirRedondeando(a * b, F);
export const div = (a: bigint, b: bigint): bigint => dividirRedondeando(a * F, b);
export const porcentaje = (a: bigint, pct: bigint): bigint => dividirRedondeando(a * pct, 100n * F);

// Texto con `decimales` decimales (redondeo mitad hacia arriba)
export function texto(a: bigint, decimales = 2): string {
  const f = 10n ** BigInt(ESCALA - decimales);
  const r = dividirRedondeando(a, f);
  const neg = r < 0n;
  const abs = (neg ? -r : r).toString().padStart(decimales + 1, "0");
  const ent = abs.slice(0, abs.length - decimales);
  return `${neg ? "-" : ""}${ent}${decimales ? "." + abs.slice(-decimales) : ""}`;
}

export const aNumero = (a: bigint): number => Number(texto(a, 6));
