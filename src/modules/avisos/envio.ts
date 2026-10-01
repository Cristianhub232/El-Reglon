// Envío de avisos push (docs/24) con web-push (VAPID + cifrado aes128gcm del protocolo Web Push).
// Las suscripciones vencidas (404/410) se borran; cada aviso automático lleva una clave para no repetirse.
import webpush from "web-push";
import { consulta } from "../../core/db.ts";

export type Tema = "tasa" | "noticias" | "deberes" | "novedades";
export const TEMAS: Tema[] = ["tasa", "noticias", "deberes", "novedades"];
export interface Aviso { titulo: string; cuerpo: string; url: string; etiqueta?: string }
export interface Destino { id: number; endpoint: string; p256dh: string; auth: string }

// Solo servicios de push de los navegadores: impide que una "suscripción" haga que el servidor llame a otra dirección
const SERVICIOS = /^https:\/\/(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|web\.push\.apple\.com|[a-z0-9-]+\.push\.apple\.com|[a-z0-9.-]+\.notify\.windows\.com)\//;
export const servicioValido = (endpoint: string) => SERVICIOS.test(endpoint) && endpoint.length <= 1000;

let listo = false;
export function avisosConfigurados(): boolean {
  const pub = process.env.VAPID_PUBLICO ?? "", priv = process.env.VAPID_PRIVADO ?? "";
  if (!pub || !priv) return false;
  if (!listo) { webpush.setVapidDetails(process.env.VAPID_CONTACTO || "mailto:soporte@elrenglonve.org", pub, priv); listo = true; }
  return true;
}

// Envía a cada destino (de a 10); devuelve cuántos se entregaron y cuántos fallaron. "borrarVencidas" en false (aviso de
// bienvenida): FCM a veces responde 410 a una suscripción recién creada; no se borra por eso, lo hará el siguiente aviso.
export async function enviar(destinos: Destino[], aviso: Aviso, ttlSegundos = 6 * 3600, borrarVencidas = true): Promise<{ entregados: number; fallidos: number }> {
  if (!avisosConfigurados() || !destinos.length) return { entregados: 0, fallidos: 0 };
  const carga = JSON.stringify({ titulo: aviso.titulo.slice(0, 120), cuerpo: aviso.cuerpo.slice(0, 400), url: aviso.url, etiqueta: aviso.etiqueta });
  let entregados = 0, fallidos = 0;
  for (let i = 0; i < destinos.length; i += 10) {
    await Promise.all(destinos.slice(i, i + 10).map(async (d) => {
      try {
        await webpush.sendNotification({ endpoint: d.endpoint, keys: { p256dh: d.p256dh, auth: d.auth } }, carga, { TTL: ttlSegundos, urgency: "normal", timeout: 15_000 });
        entregados++;
        await consulta("UPDATE avisos.suscripcion SET ultimo_envio = now(), fallos = 0 WHERE id = $1", [d.id]);
      } catch (e) {
        fallidos++;
        const { statusCode: estado, body } = e as { statusCode?: number; body?: string };
        console.warn(`[avisos] envío fallido (${estado ?? (e as Error).message}) a ${new URL(d.endpoint).host}: ${String(body ?? "").slice(0, 200)}`);
        // 404/410: la suscripción ya no existe (la persona quitó el permiso o desinstaló); 20 fallos seguidos, también
        if (!borrarVencidas) return;
        if (estado === 404 || estado === 410) await consulta("DELETE FROM avisos.suscripcion WHERE id = $1", [d.id]);
        else await consulta("UPDATE avisos.suscripcion SET fallos = fallos + 1 WHERE id = $1", [d.id])
          .then(() => consulta("DELETE FROM avisos.suscripcion WHERE id = $1 AND fallos >= 20", [d.id]));
      }
    }));
  }
  return { entregados, fallidos };
}

// Aviso a todos los suscritos a un tema. Con "clave", no se envía dos veces (devuelve null si ya se envió).
export async function difundir(tema: Tema, aviso: Aviso, o: { clave?: string; origen: "automatico" | "panel"; creadoPor?: string }) {
  const [e] = await consulta<{ id: string }>(
    `INSERT INTO avisos.envio (tema, clave, titulo, cuerpo, url, origen, creado_por) VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (clave) DO NOTHING RETURNING id`,
    [tema, o.clave ?? null, aviso.titulo.slice(0, 120), aviso.cuerpo.slice(0, 400), aviso.url, o.origen, o.creadoPor ?? null]);
  if (!e) return null;
  const destinos = await consulta<Destino>("SELECT id::int, endpoint, p256dh, auth FROM avisos.suscripcion WHERE temas @> ARRAY[$1]", [tema]);
  const r = await enviar(destinos, aviso);
  await consulta("UPDATE avisos.envio SET destinatarios = $2, entregados = $3, fallidos = $4 WHERE id = $1", [e.id, destinos.length, r.entregados, r.fallidos]);
  return { destinatarios: destinos.length, ...r };
}

export async function registrarEnvioSuelto(tema: string, aviso: Aviso, origen: "automatico" | "panel" | "prueba", r: { destinatarios: number; entregados: number; fallidos: number }, creadoPor?: string) {
  await consulta(`INSERT INTO avisos.envio (tema, titulo, cuerpo, url, origen, creado_por, destinatarios, entregados, fallidos) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
    [tema, aviso.titulo.slice(0, 120), aviso.cuerpo.slice(0, 400), aviso.url, origen, creadoPor ?? null, r.destinatarios, r.entregados, r.fallidos]);
}
