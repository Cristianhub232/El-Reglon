// Mensajes del botón flotante del sitio (docs/27): se guardan, se avisa a soporte@ por correo (con «Responder a» el
// correo del usuario) y, si marcó «Quiero recibir novedades», queda como persona natural CON consentimiento en la
// prospección. Sin cuenta: el correo lo escribe el usuario.
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";
import { correoConfigurado, enviarAviso } from "../prospeccion/envio.ts";
import { crear } from "../prospeccion/prospectos.ts";

const CORREO = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
export const SOPORTE = () => process.env.CORREO_SOPORTE || "soporte@elrenglonve.org";

export interface Entrada { correo: string; nombre: string | null; mensaje: string; pagina: string | null; novedades: boolean }

export function validar(b: unknown): Entrada {
  const x = (b ?? {}) as Record<string, unknown>;
  const correo = String(x.correo ?? "").trim().toLowerCase(), nombre = String(x.nombre ?? "").trim() || null;
  const mensaje = String(x.mensaje ?? "").trim(), pagina = String(x.pagina ?? "").trim().slice(0, 300) || null;
  if (!CORREO.test(correo) || correo.length > 254) throw new ErrorApi(400, "correo_invalido", "Escriba un correo electrónico válido para poder responderle");
  if (mensaje.length < 3) throw new ErrorApi(400, "mensaje_vacio", "Escriba su consulta");
  if (mensaje.length > 2000) throw new ErrorApi(400, "mensaje_largo", "El mensaje no puede superar 2.000 caracteres");
  if (nombre && nombre.length > 120) throw new ErrorApi(400, "nombre_largo", "El nombre es demasiado largo");
  return { correo, nombre, mensaje, pagina, novedades: x.novedades === true };
}

export async function recibir(e: Entrada, origen: { ip: string | null; agente: string | null; visitante: string | null }) {
  // Como mucho 5 mensajes por hora desde un mismo correo (además del límite por IP de la ruta)
  const [{ n }] = await consulta<{ n: number }>("SELECT count(*)::int AS n FROM contacto.mensaje WHERE correo = $1 AND creado_en > now() - interval '1 hour'", [e.correo]);
  if (n >= 5) throw new ErrorApi(429, "demasiados_mensajes", "Ya recibimos varios mensajes suyos; le responderemos pronto");
  const visitante = origen.visitante && /^[0-9a-f-]{36}$/i.test(origen.visitante) ? origen.visitante : null;
  const [m] = await consulta<{ id: number }>(
    `INSERT INTO contacto.mensaje (correo, nombre, mensaje, pagina, novedades, ip, agente, visitante_id)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id::int`,
    [e.correo, e.nombre, e.mensaje, e.pagina, e.novedades, origen.ip, origen.agente?.slice(0, 400) ?? null, visitante]);
  if (e.novedades) {
    const fecha = new Date().toLocaleDateString("es-VE", { timeZone: "America/Caracas" });
    await crear({ empresa: e.nombre || e.correo.split("@")[0], correo: e.correo, sector: "consumidor", consentimiento: true,
      origen: `Botón de contacto del sitio: marcó «Quiero recibir novedades» (${fecha}, mensaje #${m.id})` }, "sitio").catch(() => {});
  }
  // El aviso a soporte@ no hace esperar al usuario
  void notificar(m.id, e).catch((x) => console.error("[el-renglon] contacto: aviso a soporte", (x as Error).message));
  return { recibido: true };
}

// Dominios reservados para pruebas (RFC 2606): nunca reciben correo; no se avisa a soporte@ (lo usan las pruebas)
export const esDePrueba = (correo: string) => /@(example\.(com|org|net)|[^@]+\.(test|invalid|example))$/i.test(correo);

async function notificar(id: number, e: Entrada) {
  if (!correoConfigurado() || esDePrueba(e.correo)) return;
  const texto = [`Nuevo mensaje desde el botón de contacto de elrenglonve.org (#${id}):`, "",
    `De: ${e.nombre ? `${e.nombre} <${e.correo}>` : e.correo}`, `Página: ${e.pagina ?? "—"}`,
    `Novedades: ${e.novedades ? "sí, quiere recibirlas (quedó en Prospección con consentimiento)" : "no"}`, "", e.mensaje, "",
    "Para contestarle, use «Responder»: va directo a su correo.", "Panel: https://elrenglonve.org/admin/bandeja"].join("\n");
  const ok = await enviarAviso({ para: SOPORTE(), responderA: e.correo, asunto: `Contacto web: ${e.mensaje.replace(/\s+/g, " ").slice(0, 60)}`, texto });
  if (ok) await consulta("UPDATE contacto.mensaje SET notificado = true WHERE id = $1", [id]);
}

export async function marcar(id: number, estado: "atendido" | "spam" | "nuevo", por: string) {
  const [m] = await consulta<{ correo: string }>(
    "UPDATE contacto.mensaje SET estado = $2, atendido_por = $3, atendido_en = CASE WHEN $2 = 'nuevo' THEN NULL ELSE now() END WHERE id = $1 RETURNING correo",
    [id, estado, por]);
  return m ?? null;
}
