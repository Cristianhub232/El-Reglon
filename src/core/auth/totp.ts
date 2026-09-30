// Verificación en dos pasos con app autenticadora: TOTP (RFC 6238, HMAC-SHA1, 6 dígitos, 30 s).
// El secreto se guarda cifrado con AES-256-GCM; la clave sale de APP_SECRETO (variable de entorno).
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32(b: Buffer): string {
  let bits = 0, valor = 0, s = "";
  for (const x of b) { valor = (valor << 8) | x; bits += 8; while (bits >= 5) { s += B32[(valor >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) s += B32[(valor << (5 - bits)) & 31];
  return s;
}

export function desdeBase32(s: string): Buffer {
  const limpio = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, valor = 0; const out: number[] = [];
  for (const c of limpio) { valor = (valor << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { out.push((valor >>> (bits - 8)) & 255); bits -= 8; } }
  return Buffer.from(out);
}

export const nuevoSecreto = () => base32(randomBytes(20));

export function codigoTotp(secreto: string, momento = Date.now(), paso = 0): string {
  const contador = Math.floor(momento / 30_000) + paso;
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(contador));
  const h = createHmac("sha1", desdeBase32(secreto)).update(buf).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1_000_000).padStart(6, "0");
}

// Acepta el código del intervalo actual y el de ±1 (relojes desfasados hasta 30 s)
export function verificarTotp(secreto: string, codigo: string, momento = Date.now()): boolean {
  const c = codigo.replace(/\D/g, "");
  if (c.length !== 6) return false;
  return [-1, 0, 1].some((p) => timingSafeEqual(Buffer.from(codigoTotp(secreto, momento, p)), Buffer.from(c)));
}

export function uriOtpauth(secreto: string, correo: string): string {
  const etiqueta = encodeURIComponent(`El Renglón:${correo}`);
  return `otpauth://totp/${etiqueta}?secret=${secreto}&issuer=${encodeURIComponent("El Renglón")}&algorithm=SHA1&digits=6&period=30`;
}

function clave(): Buffer {
  const s = process.env.APP_SECRETO ?? "";
  if (s.length < 32) throw new Error("Defina APP_SECRETO (al menos 32 caracteres aleatorios) para usar la verificación en dos pasos");
  return createHash("sha256").update(`totp:${s}`).digest();
}

export function cifrarSecreto(secreto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", clave(), iv);
  const datos = Buffer.concat([c.update(secreto, "utf8"), c.final()]);
  return `v1.${iv.toString("base64url")}.${c.getAuthTag().toString("base64url")}.${datos.toString("base64url")}`;
}

export function descifrarSecreto(guardado: string): string {
  const [v, iv, tag, datos] = guardado.split(".");
  if (v !== "v1") throw new Error("Formato de secreto desconocido");
  const d = createDecipheriv("aes-256-gcm", clave(), Buffer.from(iv, "base64url"));
  d.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([d.update(Buffer.from(datos, "base64url")), d.final()]).toString("utf8");
}
