// Envío de los correos de prospección (docs/26) por SMTP (buzón ventas@ de Spacemail), con remitente "El Renglón".
// Cada correo lleva List-Unsubscribe y List-Unsubscribe-Post (baja en un clic, exigida por Gmail y Yahoo).
import nodemailer, { type Transporter } from "nodemailer";
import { consulta } from "../../core/db.ts";
import { SITIO_URL } from "../../core/sitio.ts";
import { armarCorreo, type DatosCorreo, type Tasa, type TipoCorreo } from "./plantillas.ts";

const USUARIO = () => process.env.CORREO_SMTP_USUARIO || "ventas@elrenglonve.org";
export const correoConfigurado = () => Boolean(process.env.CORREO_SMTP_CLAVE);

let transporte: Transporter | null = null;
function smtp(): Transporter {
  if (!correoConfigurado()) throw new Error("Falta CORREO_SMTP_CLAVE en el entorno");
  if (!transporte) {
    const puerto = Number(process.env.CORREO_SMTP_PUERTO || 465);
    transporte = nodemailer.createTransport({
      host: process.env.CORREO_SMTP_HOST || "mail.spacemail.com", port: puerto, secure: puerto === 465,
      auth: { user: USUARIO(), pass: process.env.CORREO_SMTP_CLAVE },
      connectionTimeout: 20_000, greetingTimeout: 20_000, socketTimeout: 60_000,
    });
  }
  return transporte;
}

// Tasa del día para el dato de la cabecera del correo; si falla, el correo sale sin ella
export async function tasaDelDia(): Promise<Tasa | null> {
  try {
    const f = await consulta<{ moneda: string; venta_bs: string; fecha_valor: string }>(
      `SELECT moneda, venta_bs::text, fecha_valor::text FROM bcv.tasa WHERE moneda IN ('USD','EUR')
         AND fecha_valor = (SELECT max(fecha_valor) FROM bcv.publicacion WHERE fecha_valor <= (now() AT TIME ZONE 'America/Caracas')::date)`);
    const usd = f.find((x) => x.moneda === "USD"), eur = f.find((x) => x.moneda === "EUR");
    return usd && eur ? { usd: usd.venta_bs, eur: eur.venta_bs, fecha_valor: usd.fecha_valor } : null;
  } catch { return null; }
}

export interface Resultado { ok: boolean; error?: string; permanente?: boolean; messageId?: string; asunto: string }

// Envía un correo y lo registra en prospeccion.envio. "permanente" = el servidor rechazó la dirección (5xx).
export async function enviarCorreo(para: string, d: DatosCorreo, tipo: TipoCorreo | "prueba",
  opciones: { prospectoId?: number | null; creadoPor: string; tasa?: Tasa | null }): Promise<Resultado> {
  const c = armarCorreo(d, tipo === "prueba" ? "inicial" : tipo, opciones.tasa === undefined ? await tasaDelDia() : opciones.tasa);
  let r: Resultado;
  try {
    const info = await smtp().sendMail({
      from: { name: "El Renglón", address: USUARIO() }, to: para, subject: c.asunto, text: c.texto, html: c.html,
      headers: {
        "List-Unsubscribe": `<${SITIO_URL}/api/publico/prospeccion/baja?t=${d.token}>, <mailto:${USUARIO()}?subject=baja>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    const rechazado = info.rejected?.length ? String(info.rejected[0]) : null;
    r = rechazado ? { ok: false, error: `Rechazado por el servidor: ${rechazado}`, permanente: true, asunto: c.asunto }
      : { ok: true, messageId: info.messageId, asunto: c.asunto };
  } catch (e) {
    const err = e as Error & { responseCode?: number };
    r = { ok: false, error: err.message.slice(0, 500), permanente: (err.responseCode ?? 0) >= 550 && (err.responseCode ?? 0) < 560, asunto: c.asunto };
  }
  await consulta(
    `INSERT INTO prospeccion.envio (prospecto_id, correo, tipo, sector, asunto, resultado, error, message_id, creado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [opciones.prospectoId ?? null, para, tipo, d.sector, r.asunto, r.ok ? "enviado" : "error", r.error ?? null, r.messageId ?? null, opciones.creadoPor]);
  return r;
}
