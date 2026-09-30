// Contraseñas del panel: scrypt (node:crypto) con sal aleatoria. Formato: scrypt$N$r$p$sal$hash (base64url).
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";

const N = 32_768, R = 8, P = 1, LARGO = 64;

function derivar(clave: string, sal: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((ok, mal) => scrypt(clave.normalize("NFKC"), sal, LARGO, { N: n, r, p, maxmem: 128 * n * r * 2 },
    (e, k) => (e ? mal(e) : ok(k))));
}

export async function hashClave(clave: string): Promise<string> {
  const sal = randomBytes(16);
  const k = await derivar(clave, sal, N, R, P);
  return `scrypt$${N}$${R}$${P}$${sal.toString("base64url")}$${k.toString("base64url")}`;
}

export async function verificarClave(clave: string, guardado: string): Promise<boolean> {
  const [alg, n, r, p, sal, hash] = guardado.split("$");
  if (alg !== "scrypt" || !sal || !hash) return false;
  const esperado = Buffer.from(hash, "base64url");
  const k = await derivar(clave, Buffer.from(sal, "base64url"), Number(n), Number(r), Number(p));
  return k.length === esperado.length && timingSafeEqual(k, esperado);
}

// Para comparar en tiempo parecido aunque el correo no exista (no revela qué cuentas existen)
export const HASH_SENUELO = "scrypt$32768$8$1$c2VudWVsby1zZW51ZWxv$" + "A".repeat(86);

export function problemaClave(clave: string): string | null {
  if (clave.length < 12) return "La contraseña debe tener al menos 12 caracteres";
  if (clave.length > 200) return "La contraseña es demasiado larga";
  if (/^(.)\1+$/.test(clave)) return "La contraseña no puede repetir un solo carácter";
  return null;
}

// Contraseña temporal legible (sin 0/O/1/l) para entregar al invitar a un usuario
export function claveTemporal(): string {
  const abc = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const b = randomBytes(18);
  return Array.from(b, (x) => abc[x % abc.length]).join("").replace(/(.{6})(?=.)/g, "$1-");
}
