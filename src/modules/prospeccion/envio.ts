// Envío de los correos de prospección (docs/26) por SMTP (buzón ventas@ de Spacemail), con remitente "El Renglón".
// Sin cabeceras List-Unsubscribe: son la señal más clara de boletín y llevan el correo a Promociones. Gmail y Yahoo
// solo las exigen a quien envía más de 5.000 correos al día; aquí son 30 como mucho. La baja va en el texto del correo
// (página /baja). Si algún día el volumen crece, la baja en un clic ya existe: POST /api/publico/prospeccion/baja?t=…
import nodemailer, { type Transporter } from "nodemailer";
import { consulta } from "../../core/db.ts";
import { deberesDe, preciosDelDia } from "./datos.ts";
import { armarCorreo, type Contexto, type DatosCorreo, type Tasa, type TipoCorreo } from "./plantillas.ts";

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

// Datos reales del correo según el sector: tasa del día siempre; deberes del RIF (especiales); precios (personas)
export async function contextoPara(d: DatosCorreo): Promise<Contexto> {
  const [tasa, deberes, precios] = await Promise.all([
    tasaDelDia(),
    d.sector === "especial" && d.rif ? deberesDe(d.rif) : Promise.resolve(null),
    d.sector === "consumidor" ? preciosDelDia() : Promise.resolve(null),
  ]);
  return { tasa, deberes, precios };
}

export interface Resultado { ok: boolean; error?: string; permanente?: boolean; messageId?: string; asunto: string }

// Envía un correo y lo registra en prospeccion.envio. "permanente" = el servidor rechazó la dirección (5xx).
export async function enviarCorreo(para: string, d: DatosCorreo, tipo: TipoCorreo | "prueba",
  opciones: { prospectoId?: number | null; creadoPor: string; contexto?: Contexto }): Promise<Resultado> {
  const c = armarCorreo(d, tipo === "prueba" ? "inicial" : tipo, opciones.contexto ?? await contextoPara(d));
  let r: Resultado;
  try {
    const info = await smtp().sendMail({
      from: { name: "El Renglón", address: USUARIO() }, to: para, subject: c.asunto, text: c.texto, html: c.html,
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
