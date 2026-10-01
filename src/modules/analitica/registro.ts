// Analítica del sitio público (docs/23): visitas (cookie propia "renglon_visitante") y RIF consultados.
// Datos personales: IP completa y RIF. Solo los ve el superadministrador; se borran a los 12 meses (analitica.purgar).
import { randomUUID } from "node:crypto";
import { consulta } from "../../core/db.ts";

export const COOKIE_VISITANTE = "renglon_visitante";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export const visitanteValido = (v: string | null | undefined) => (v && UUID.test(v) ? v : null);
export const nuevoVisitante = () => randomUUID();

// Lee la cookie del visitante de una petición (sin depender de next/headers)
export function visitanteDe(req: Request): string | null {
  const m = /(?:^|;\s*)renglon_visitante=([^;]+)/.exec(req.headers.get("cookie") ?? "");
  return visitanteValido(m?.[1]);
}

export const esRobot = (agente: string) => /bot|crawl|spider|slurp|headless|lighthouse|preview|fetch|curl|wget|python|node|axios|monitor/i.test(agente);

export function describirAgente(agente: string) {
  const a = agente;
  const navegador = /Edg\//.test(a) ? "Edge" : /OPR\/|Opera/.test(a) ? "Opera" : /SamsungBrowser/.test(a) ? "Samsung Internet"
    : /Firefox\//.test(a) ? "Firefox" : /Chrome\//.test(a) ? "Chrome" : /Safari\//.test(a) ? "Safari" : "otro";
  const sistema = /Android/.test(a) ? "Android" : /iPhone|iPad|iPod/.test(a) ? "iOS" : /Windows/.test(a) ? "Windows"
    : /Mac OS X|Macintosh/.test(a) ? "macOS" : /CrOS/.test(a) ? "ChromeOS" : /Linux/.test(a) ? "Linux" : "otro";
  const dispositivo = /iPad|Tablet/.test(a) || (/Android/.test(a) && !/Mobile/.test(a)) ? "tableta"
    : /Mobi|iPhone|Android/.test(a) ? "teléfono" : sistema === "otro" ? "otro" : "computadora";
  return { navegador, sistema, dispositivo };
}

// Origen y ruta, sin parámetros (pueden traer datos de quien llega)
export function limpiarReferente(r: string | null | undefined): string | null {
  if (!r) return null;
  try { const u = new URL(r); return /^https?:$/.test(u.protocol) ? `${u.host}${u.pathname}`.slice(0, 300) : null; } catch { return null; }
}

export async function registrarVisita(v: { visitante: string; ruta: string; referente: string | null; ip: string | null; agente: string; idioma: string | null; pantalla: string | null }) {
  const d = describirAgente(v.agente);
  await consulta(
    `WITH s AS (INSERT INTO analitica.visitante (id, visitas) VALUES ($1, 1)
                ON CONFLICT (id) DO UPDATE SET ultima_visita = now(), visitas = analitica.visitante.visitas + 1 RETURNING id)
     INSERT INTO analitica.visita (visitante_id, ruta, referente, ip, navegador, sistema, dispositivo, idioma, pantalla, agente)
     SELECT id, $2, $3, $4::inet, $5, $6, $7, $8, $9, $10 FROM s`,
    [v.visitante, v.ruta.slice(0, 300), v.referente, v.ip, d.navegador, d.sistema, d.dispositivo, v.idioma?.slice(0, 20) ?? null,
      v.pantalla?.slice(0, 20) ?? null, v.agente.slice(0, 400)]);
}

// RIF en formato canónico "J-12345678-9" (también los de dígito verificador incorrecto, marcados como no válidos)
export function rifCanonico(rif: string): string | null {
  const m = /^([VEJPGC])(\d{8})(\d)$/.exec(rif.toUpperCase().replace(/[^A-Z0-9]/g, ""));
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export async function registrarRif(r: { rif: string; valido: boolean; origen: "web" | "api"; herramienta: "deberes" | "calendario" | "rif"; tipo?: string | null;
  condiciones?: string[]; visitante?: string | null; apiKeyId?: number | null; ip?: string | null }) {
  const rif = rifCanonico(r.rif);
  if (!rif) return;
  // El visitante puede no existir aún si la cookie se acaba de crear: se registra igual, sin él
  await consulta(
    `INSERT INTO analitica.rif_consultado (rif, valido, origen, herramienta, tipo, condiciones, visitante_id, api_key_id, ip)
     VALUES ($1, $2, $3, $4, $5, $6, (SELECT id FROM analitica.visitante WHERE id = $7::uuid), $8, $9::inet)`,
    [rif, r.valido, r.origen, r.herramienta, r.tipo?.toUpperCase() ?? null, r.condiciones ?? [], r.visitante ?? null, r.apiKeyId ?? null, r.ip ?? null]);
}
