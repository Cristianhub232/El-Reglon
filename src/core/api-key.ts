// Formato del token: rgl_<prefijo de 8 hex>_<secreto base64url>. En la base solo se guarda su SHA-256.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const PERMISOS = ["iva", "bcv", "arancel", "calendario", "rif", "noticias", "admin"] as const;
export type Permiso = (typeof PERMISOS)[number];

export function generarToken(): { token: string; prefijo: string; hash: string } {
  const prefijo = randomBytes(4).toString("hex");
  const token = `rgl_${prefijo}_${randomBytes(32).toString("base64url")}`;
  return { token, prefijo, hash: sha256(token) };
}

export function sha256(texto: string): string {
  return createHash("sha256").update(texto).digest("hex");
}

export function prefijoDe(token: string): string | null {
  const m = /^rgl_([0-9a-f]{8})_[A-Za-z0-9_-]{43}$/.exec(token);
  return m ? m[1] : null;
}

export function hashIguales(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && timingSafeEqual(x, y);
}
