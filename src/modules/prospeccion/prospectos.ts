// Prospectos de la prospección comercial (docs/26): alta, importación CSV, estados y bajas.
// Toda dirección dada de baja queda en prospeccion.baja: no se puede volver a cargar ni recibe más correos.
import { consulta } from "../../core/db.ts";
import { SECTORES, type Sector } from "./plantillas.ts";

export const ESTADOS = {
  pendiente: "Pendiente", contactado: "Contactado", seguimiento: "Seguimiento enviado", respondio: "Respondió",
  descartado: "Descartado", baja: "Dio de baja", rebote: "Rebotó",
} as const;
export type EstadoProspecto = keyof typeof ESTADOS;

export interface NuevoProspecto { empresa: string; contacto?: string | null; correo: string; sector: string; origen: string; notas?: string | null }
type Validado = { ok: true; p: Required<NuevoProspecto> & { sector: Sector } } | { ok: false; error: string };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

// Acepta la clave ("farmacia") o el nombre ("Farmacias"); vacío = general
export function sector(v: string): Sector | null {
  const s = sinTildes(v);
  if (!s) return "general";
  for (const [k, nombre] of Object.entries(SECTORES)) if (s === k || s === sinTildes(nombre) || sinTildes(nombre).startsWith(s)) return k as Sector;
  return null;
}

export function validar(n: NuevoProspecto): Validado {
  const empresa = n.empresa.trim(), correo = n.correo.trim().toLowerCase(), origen = n.origen.trim();
  const contacto = n.contacto?.trim() || null, notas = n.notas?.trim() || null, sec = sector(n.sector);
  if (empresa.length < 2 || empresa.length > 160) return { ok: false, error: "La empresa debe tener entre 2 y 160 caracteres" };
  if (!CORREO.test(correo) || correo.length > 254) return { ok: false, error: `Correo no válido: ${n.correo}` };
  if (!sec) return { ok: false, error: `Sector desconocido: ${n.sector}` };
  if (origen.length < 2 || origen.length > 200) return { ok: false, error: "Indique de dónde salió el contacto (p. ej. «web de la empresa»)" };
  if (contacto && contacto.length > 120) return { ok: false, error: "El nombre del contacto es demasiado largo" };
  if (notas && notas.length > 1000) return { ok: false, error: "Las notas no pueden superar 1.000 caracteres" };
  return { ok: true, p: { empresa, correo, origen, contacto, notas, sector: sec } };
}

export type Alta = "agregado" | "duplicado" | "en_baja";
export async function crear(n: NuevoProspecto, creadoPor: string): Promise<Alta | { error: string }> {
  const v = validar(n);
  if (!v.ok) return { error: v.error };
  const [b] = await consulta("SELECT 1 FROM prospeccion.baja WHERE correo = $1", [v.p.correo]);
  if (b) return "en_baja";
  const r = await consulta(
    `INSERT INTO prospeccion.prospecto (empresa, contacto, correo, sector, origen, notas, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT ((lower(correo))) DO NOTHING RETURNING id`,
    [v.p.empresa, v.p.contacto, v.p.correo, v.p.sector, v.p.origen, v.p.notas, creadoPor]);
  return r.length ? "agregado" : "duplicado";
}

// CSV (separado por ; o ,): empresa, contacto, correo, sector, origen. La primera línea puede ser el encabezado.
export async function importar(csv: string, creadoPor: string) {
  const lineas = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length > 500) return { error: "Como máximo 500 líneas por importación" } as const;
  if (lineas[0] && /correo/i.test(lineas[0])) lineas.shift();
  const r = { agregados: 0, duplicados: 0, en_baja: 0, errores: [] as string[] };
  for (const [i, l] of lineas.entries()) {
    const sep = l.includes(";") ? ";" : ",";
    const [empresa = "", contacto = "", correo = "", sec = "", origen = ""] = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const a = await crear({ empresa, contacto, correo, sector: sec, origen }, creadoPor);
    if (typeof a === "object") { if (r.errores.length < 20) r.errores.push(`Línea ${i + 1}: ${a.error}`); continue; }
    if (a === "agregado") r.agregados++; else if (a === "duplicado") r.duplicados++; else r.en_baja++;
  }
  return r;
}

// Cambios manuales desde el panel. "baja" también agrega el correo a la lista de supresión.
export async function cambiarEstado(id: number, estado: "respondio" | "descartado" | "baja" | "pendiente") {
  const [p] = await consulta<{ correo: string; empresa: string; estado: string }>(
    "UPDATE prospeccion.prospecto SET estado = $2, actualizado_en = now() WHERE id = $1 RETURNING correo, empresa, estado", [id, estado]);
  if (p && estado === "baja") await consulta("INSERT INTO prospeccion.baja (correo, origen) VALUES (lower($1), 'panel') ON CONFLICT (correo) DO NOTHING", [p.correo]);
  return p ?? null;
}

// Baja con el enlace del correo (página /baja) o en un clic (List-Unsubscribe-Post)
export const tokenValido = (t: string) => /^[0-9a-f]{32}$/.test(t);
export async function bajaPorToken(token: string, origen: "enlace" | "un_clic"): Promise<boolean> {
  if (!tokenValido(token)) return false;
  const [p] = await consulta<{ correo: string }>(
    "UPDATE prospeccion.prospecto SET estado = 'baja', actualizado_en = now() WHERE token = $1 RETURNING correo", [token]);
  if (!p) return false;
  await consulta("INSERT INTO prospeccion.baja (correo, origen) VALUES (lower($1), $2) ON CONFLICT (correo) DO NOTHING", [p.correo, origen]);
  return true;
}

export interface Ajustes { activo: boolean; limite_diario: number; hora_inicio: number; hora_fin: number; dias_seguimiento: number }
export async function guardarAjustes(a: Ajustes, por: string) {
  if (!Number.isInteger(a.limite_diario) || a.limite_diario < 1 || a.limite_diario > 30) return { error: "El límite diario debe estar entre 1 y 30" };
  if (a.hora_inicio < 7 || a.hora_fin > 20 || a.hora_fin <= a.hora_inicio) return { error: "Horario no válido (entre las 7 y las 20 h)" };
  if (a.dias_seguimiento < 3 || a.dias_seguimiento > 30) return { error: "El seguimiento debe ser entre 3 y 30 días después" };
  await consulta(
    `UPDATE prospeccion.ajuste SET activo = $1, limite_diario = $2, hora_inicio = $3, hora_fin = $4, dias_seguimiento = $5,
            actualizado_por = $6, actualizado_en = now()`,
    [a.activo, a.limite_diario, a.hora_inicio, a.hora_fin, a.dias_seguimiento, por]);
  return { ok: true };
}
