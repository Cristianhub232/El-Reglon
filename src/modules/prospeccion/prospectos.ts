// Prospectos de la prospección comercial (docs/26): alta, importación CSV, estados y bajas.
// Toda dirección dada de baja queda en prospeccion.baja: no se puede volver a cargar ni recibe más correos.
import { consulta } from "../../core/db.ts";
import { SECTORES, type Sector } from "./plantillas.ts";

export const ESTADOS = {
  pendiente: "Pendiente", contactado: "Contactado", seguimiento: "Seguimiento enviado", respondio: "Respondió",
  descartado: "Descartado", baja: "Dio de baja", rebote: "Rebotó",
} as const;
export type EstadoProspecto = keyof typeof ESTADOS;

export interface NuevoProspecto { empresa: string; contacto?: string | null; correo: string; sector: string; origen: string; notas?: string | null;
  rif?: string | null; consentimiento?: boolean }
type Validado = { ok: true; p: Required<NuevoProspecto> & { sector: Sector } } | { ok: false; error: string };

const sinTildes = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const ALIAS: Record<string, Sector> = { "contribuyente especial": "especial", especiales: "especial", persona: "consumidor",
  "persona natural": "consumidor", "personas naturales": "consumidor", personas: "consumidor" };
// Acepta la clave ("farmacia"), el nombre ("Farmacias") o un alias ("persona natural"); vacío = general
export function sector(v: string): Sector | null {
  const s = sinTildes(v);
  if (!s) return "general";
  if (ALIAS[s]) return ALIAS[s];
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
  const rif = n.rif?.trim().toUpperCase() || null, consentimiento = Boolean(n.consentimiento);
  if (sec === "especial" && !rif) return { ok: false, error: "Para un contribuyente especial indique su RIF: el correo muestra sus próximos deberes" };
  if (sec === "consumidor" && !consentimiento) return { ok: false, error: "A una persona natural solo se le escribe si aceptó recibir correos: indíquelo y explique cómo en «origen»" };
  return { ok: true, p: { empresa, correo, origen, contacto, notas, sector: sec, rif, consentimiento } };
}

export type Alta = "agregado" | "duplicado" | "en_baja";
export async function crear(n: NuevoProspecto, creadoPor: string): Promise<Alta | { error: string }> {
  const v = validar(n);
  if (!v.ok) return { error: v.error };
  // RIF con el dígito verificador oficial (rif.validar); se guarda con guiones: J-12345678-9
  let rif: string | null = null;
  if (v.p.rif) {
    const [x] = await consulta<{ valido: boolean; rif_formateado: string | null; mensaje: string }>("SELECT valido, rif_formateado, mensaje FROM rif.validar($1)", [v.p.rif]);
    if (!x?.valido) return { error: `RIF no válido (${v.p.rif}): ${x?.mensaje ?? ""}` };
    rif = x.rif_formateado;
  }
  const [b] = await consulta("SELECT 1 FROM prospeccion.baja WHERE correo = $1", [v.p.correo]);
  if (b) return "en_baja";
  const r = await consulta(
    `INSERT INTO prospeccion.prospecto (empresa, contacto, correo, sector, origen, notas, rif, consentimiento, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT ((lower(correo))) DO NOTHING RETURNING id`,
    [v.p.empresa, v.p.contacto, v.p.correo, v.p.sector, v.p.origen, v.p.notas, rif, v.p.consentimiento, creadoPor]);
  return r.length ? "agregado" : "duplicado";
}

// CSV (separado por ; o ,): empresa, contacto, correo, sector, origen, rif, consentimiento (sí/no). Las dos últimas
// columnas son opcionales salvo para contribuyentes especiales (RIF) y personas naturales (consentimiento). La primera
// línea puede ser el encabezado.
export async function importar(csv: string, creadoPor: string) {
  const lineas = csv.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lineas.length > 500) return { error: "Como máximo 500 líneas por importación" } as const;
  if (lineas[0] && /correo/i.test(lineas[0])) lineas.shift();
  const r = { agregados: 0, duplicados: 0, en_baja: 0, errores: [] as string[] };
  for (const [i, l] of lineas.entries()) {
    const sep = l.includes(";") ? ";" : ",";
    const [empresa = "", contacto = "", correo = "", sec = "", origen = "", rif = "", acepto = ""] = l.split(sep).map((x) => x.trim().replace(/^"|"$/g, ""));
    const a = await crear({ empresa, contacto, correo, sector: sec, origen, rif, consentimiento: /^(s[ií]|si|yes|1|true|x)$/i.test(acepto) }, creadoPor);
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

// ── Búsqueda en el panel ──────────────────────────────────────────────────────────────────────────────

// Razón social en formato título con las siglas societarias normalizadas: «INVERSIONES X C A» → «Inversiones X C.A.».
// Un asunto en mayúsculas sostenidas parece un grito (y es señal de spam).
const MENORES = new Set(["de", "del", "la", "las", "los", "el", "y", "e", "en", "para", "por", "a"]);
export function nombrePropio(s: string): string {
  let t = s.trim().toUpperCase().replace(/\s+/g, " ");
  t = t.replace(/\bS\s*\.?\s*R\s*\.?\s*L\b\.?/g, "S.R.L.").replace(/\b([CS])\s*\.?\s*A\b\.?/g, "$1.A.").replace(/\s+,/g, ",");
  return t.split(" ").map((w, i) => {
    if (/^[A-Z](\.[A-Z])+\.?,?$/.test(w)) return w;
    const lw = w.toLowerCase();
    return i > 0 && MENORES.has(lw) ? lw : lw.charAt(0).toUpperCase() + lw.slice(1);
  }).join(" ");
}

const comodines = (q: string) => `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
export const POR_PAGINA = 50;

export interface FilaProspecto { id: number; empresa: string; contacto: string | null; correo: string; sector: Sector; origen: string; rif: string | null;
  estado: EstadoProspecto; envios: number; ultimo_envio: string | null }

// Prospectos por texto (empresa, contacto, correo o RIF), estado y sector. Los pendientes salen en orden de envío.
export async function listar(f: { q?: string | null; estado?: string | null; sector?: string | null; pagina?: number }) {
  const q = f.q?.trim() || null, pagina = Math.max(1, f.pagina ?? 1);
  const donde = `WHERE ($1::text IS NULL OR estado = $1) AND ($2::text IS NULL OR sector = $2)
    AND ($3::text IS NULL OR empresa ILIKE $3 OR correo ILIKE $3 OR coalesce(rif, '') ILIKE $3 OR coalesce(contacto, '') ILIKE $3
         OR replace(coalesce(rif, ''), '-', '') ILIKE replace($3, '-', ''))`;
  const params = [f.estado || null, f.sector || null, q ? comodines(q) : null];
  const [[{ total }], filas] = await Promise.all([
    consulta<{ total: number }>(`SELECT count(*)::int AS total FROM prospeccion.prospecto ${donde}`, params),
    consulta<FilaProspecto>(`SELECT id::int, empresa, contacto, correo, sector, origen, rif, estado, envios, ultimo_envio::text
       FROM prospeccion.prospecto ${donde}
      ORDER BY (estado = 'pendiente') DESC, CASE WHEN estado = 'pendiente' THEN extract(epoch FROM creado_en) ELSE -extract(epoch FROM actualizado_en) END, id
      LIMIT ${POR_PAGINA} OFFSET $4`, [...params, (pagina - 1) * POR_PAGINA]),
  ]);
  return { total, pagina, paginas: Math.max(1, Math.ceil(total / POR_PAGINA)), filas };
}

// Directorio de contribuyentes (docs/25): empresas con correo, si son especiales o importadoras y si ya son prospectos
export interface FilaDirectorio { rif: string; razon_social: string; correo: string | null; especial: boolean; puesto: number | null;
  importador: boolean; software: boolean; prospecto_estado: EstadoProspecto | null; sugerido: Sector }
export async function buscarDirectorio(q: string): Promise<FilaDirectorio[] | null> {
  const [{ hay }] = await consulta<{ hay: boolean }>("SELECT to_regclass('directorio.contribuyente') IS NOT NULL AS hay");
  if (!hay) return null;
  const texto = q.trim();
  if (texto.length < 3) return [];
  const filas = await consulta<Omit<FilaDirectorio, "sugerido">>(`
    SELECT c.rif, c.razon_social, lower(coalesce(nullif(c.correo, ''), d.correo)) AS correo, coalesce(p.especial, false) AS especial, p.puesto,
           i.rif IS NOT NULL AS importador, EXISTS (SELECT 1 FROM directorio.software s WHERE s.rif = c.rif) AS software,
           (SELECT pr.estado FROM prospeccion.prospecto pr WHERE pr.rif = c.rif OR lower(pr.correo) = lower(coalesce(nullif(c.correo, ''), d.correo)) LIMIT 1) AS prospecto_estado
      FROM directorio.contribuyente c
      LEFT JOIN LATERAL (SELECT x.correo FROM directorio.direccion x WHERE x.rif = c.rif AND x.correo IS NOT NULL ORDER BY x.id LIMIT 1) d ON true
      LEFT JOIN directorio.pagador p ON p.rif = c.rif
      LEFT JOIN directorio.importador i ON i.rif = c.rif
     WHERE c.razon_social ILIKE $1 OR replace(c.rif, '-', '') ILIKE replace($1, '-', '')
     ORDER BY similarity(c.razon_social, $2) DESC, p.puesto NULLS LAST
     LIMIT 20`, [comodines(texto), texto]);
  return filas.map((f) => ({ ...f, sugerido: f.especial ? "especial" : f.software ? "desarrollador" : f.importador ? "importador" : "general" }));
}

// Alta desde el directorio: el correo y el nombre se toman de la base, nunca del formulario
export async function agregarDesdeDirectorio(rif: string, sec: string, creadoPor: string) {
  const [c] = await consulta<{ razon_social: string; correo: string | null; puesto: number | null }>(`
    SELECT c.razon_social, lower(coalesce(nullif(c.correo, ''),
           (SELECT x.correo FROM directorio.direccion x WHERE x.rif = c.rif AND x.correo IS NOT NULL ORDER BY x.id LIMIT 1))) AS correo,
           (SELECT p.puesto FROM directorio.pagador p WHERE p.rif = c.rif) AS puesto
      FROM directorio.contribuyente c WHERE c.rif = $1`, [rif]);
  if (!c) return { error: "Ese RIF no está en el directorio" } as const;
  if (!c.correo) return { error: "Esa empresa no tiene correo en el directorio" } as const;
  if (/^[VEP]-/.test(rif) && sec !== "consumidor") return { error: "Es una persona natural: solo se le escribe con su consentimiento (cárguela como «Personas naturales»)" } as const;
  const empresa = nombrePropio(c.razon_social);
  const r = await crear({ empresa, correo: c.correo, sector: sec, rif, origen: `Directorio de contribuyentes (docs/25)${c.puesto ? `; «Mejores pagadores», puesto ${c.puesto}` : ""}` }, creadoPor);
  return typeof r === "object" ? r : { alta: r, empresa, correo: c.correo };
}
