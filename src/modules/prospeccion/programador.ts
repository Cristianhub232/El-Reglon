// Ciclo de la prospección (docs/26), cada 5 minutos desde noticias-programador. Envía como mucho UN correo por ciclo y
// solo si: está activa, es de lunes a viernes dentro del horario (hora de Caracas), no se llegó al límite del día y ya
// pasó la espera aleatoria desde el envío anterior. Así los correos se reparten a lo largo del día, nunca en ráfaga.
// Un seguimiento como máximo, a los N días del primer correo; quien está en prospeccion.baja nunca recibe nada.
// Las personas naturales no entran aquí: solo reciben correos cuando un administrador pulsa «Enviar ahora».
import { consulta, pool } from "../../core/db.ts";
import { correoConfigurado, enviarCorreo } from "./envio.ts";
import type { Sector } from "./plantillas.ts";

interface Estado {
  activo: boolean; limite_diario: number; dias_seguimiento: number; dia: number; hora: number; hora_inicio: number; hora_fin: number;
  enviados_hoy: number; listo: boolean; nuevo_dia: boolean; segundos_restantes: number;
}
interface Candidato { id: number; empresa: string; contacto: string | null; correo: string; sector: Sector; token: string; rif: string | null; tipo: "inicial" | "seguimiento" }

export interface Paso { enviado?: { correo: string; tipo: string; ok: boolean; error?: string }; motivo?: string }

async function esperar(segundos: number) {
  await consulta("UPDATE prospeccion.ajuste SET proximo_envio = now() + make_interval(secs => $1)", [Math.round(segundos)]);
}

async function unPaso(): Promise<Paso> {
  const [a] = await consulta<Estado>(`
    WITH t AS (SELECT now() AT TIME ZONE 'America/Caracas' AS local)
    SELECT a.activo, a.limite_diario, a.dias_seguimiento, a.hora_inicio, a.hora_fin,
           extract(isodow FROM t.local)::int AS dia, extract(hour FROM t.local)::int AS hora,
           (SELECT count(*)::int FROM prospeccion.envio WHERE tipo IN ('inicial', 'seguimiento') AND resultado = 'enviado'
              AND (enviado_en AT TIME ZONE 'America/Caracas')::date = t.local::date) AS enviados_hoy,
           (a.proximo_envio IS NULL OR a.proximo_envio <= now()) AS listo,
           (a.proximo_envio IS NULL OR a.proximo_envio < (date_trunc('day', t.local) + make_interval(hours => a.hora_inicio)) AT TIME ZONE 'America/Caracas') AS nuevo_dia,
           extract(epoch FROM (date_trunc('day', t.local) + make_interval(hours => a.hora_fin)) AT TIME ZONE 'America/Caracas' - now())::int AS segundos_restantes
      FROM prospeccion.ajuste a, t`);
  if (!a?.activo) return { motivo: "pausada" };
  if (a.dia > 5 || a.hora < a.hora_inicio || a.hora >= a.hora_fin) return { motivo: "fuera_de_horario" };
  if (a.enviados_hoy >= a.limite_diario) return { motivo: "limite_del_dia" };
  // Primer ciclo del día: el primer correo no sale a la hora en punto, sino entre 0 y 40 minutos después
  if (a.nuevo_dia) { await esperar(Math.random() * 2400); return { motivo: "inicio_del_dia" }; }
  if (!a.listo) return { motivo: "esperando" };

  const [p] = await consulta<Candidato>(`
    SELECT p.id::int, p.empresa, p.contacto, p.correo, p.sector, p.token, p.rif,
           CASE WHEN p.estado = 'contactado' THEN 'seguimiento' ELSE 'inicial' END AS tipo
      FROM prospeccion.prospecto p
     WHERE NOT EXISTS (SELECT 1 FROM prospeccion.baja b WHERE b.correo = lower(p.correo))
       AND p.sector <> 'consumidor'          -- personas naturales: nunca automático; solo «Enviar ahora» de un administrador
       AND (p.estado = 'pendiente'
            OR (p.estado = 'contactado' AND p.envios = 1 AND p.ultimo_envio < now() - make_interval(days => $1)))
     ORDER BY (p.estado = 'contactado') DESC, coalesce(p.ultimo_envio, p.creado_en), p.id
     LIMIT 1`, [a.dias_seguimiento]);
  if (!p) return { motivo: "sin_prospectos" };

  const r = await enviar(p, "programador");
  // Espera hasta el próximo: el tiempo que queda de horario repartido entre los correos que faltan, ±40 %
  const faltan = Math.max(1, a.limite_diario - a.enviados_hoy - (r.ok ? 1 : 0));
  await esperar(Math.max(600, (a.segundos_restantes / faltan) * (0.6 + Math.random() * 0.8)));
  return { enviado: { correo: p.correo, tipo: p.tipo, ok: r.ok, error: r.error } };
}

// Envía el correo que le toca a un prospecto y actualiza su estado (lo usan el programador y «Enviar ahora»)
async function enviar(p: Candidato, creadoPor: string) {
  const r = await enviarCorreo(p.correo, p, p.tipo, { prospectoId: p.id, creadoPor });
  if (r.ok) {
    await consulta(`UPDATE prospeccion.prospecto SET estado = $2, envios = envios + 1, ultimo_envio = now(), actualizado_en = now() WHERE id = $1`,
      [p.id, p.tipo === "inicial" ? "contactado" : "seguimiento"]);
  } else if (r.permanente) {
    await consulta("UPDATE prospeccion.prospecto SET estado = 'rebote', actualizado_en = now() WHERE id = $1", [p.id]);
  }
  return r;
}

// «Enviar ahora» desde el panel: el primer correo a un pendiente, o el seguimiento a un contactado. Respeta las bajas,
// el consentimiento y el límite diario (cuenta como un envío más), aunque la prospección esté en pausa o fuera de horario.
export async function enviarAProspecto(id: number, creadoPor: string): Promise<{ ok: true; tipo: string; asunto: string } | { error: string }> {
  if (!correoConfigurado()) return { error: "Falta CORREO_SMTP_CLAVE en el servidor" };
  const [p] = await consulta<Candidato & { estado: string; consentimiento: boolean; en_baja: boolean; enviados_hoy: number; limite: number }>(`
    SELECT p.id::int, p.empresa, p.contacto, p.correo, p.sector, p.token, p.rif, p.estado, p.consentimiento,
           CASE WHEN p.estado = 'contactado' THEN 'seguimiento' ELSE 'inicial' END AS tipo,
           EXISTS (SELECT 1 FROM prospeccion.baja b WHERE b.correo = lower(p.correo)) AS en_baja,
           (SELECT count(*)::int FROM prospeccion.envio WHERE tipo IN ('inicial', 'seguimiento') AND resultado = 'enviado'
              AND (enviado_en AT TIME ZONE 'America/Caracas')::date = (now() AT TIME ZONE 'America/Caracas')::date) AS enviados_hoy,
           (SELECT limite_diario FROM prospeccion.ajuste) AS limite
      FROM prospeccion.prospecto p WHERE p.id = $1`, [id]);
  if (!p) return { error: "El prospecto ya no existe" };
  if (p.en_baja || p.estado === "baja") return { error: "Se dio de baja: no se le puede escribir" };
  if (p.estado !== "pendiente" && p.estado !== "contactado") return { error: `No se envía: está como «${p.estado}» (ya recibió el seguimiento, respondió o se descartó)` };
  if (p.sector === "consumidor" && !p.consentimiento) return { error: "Persona natural sin consentimiento" };
  if (p.enviados_hoy >= p.limite) return { error: `Ya se enviaron ${p.enviados_hoy} de ${p.limite} correos hoy: es el límite diario` };
  const r = await enviar(p, creadoPor);
  return r.ok ? { ok: true, tipo: p.tipo, asunto: r.asunto } : { error: `No se pudo enviar: ${r.error}` };
}

// Un solo ciclo a la vez aunque haya dos procesos (cerrojo de PostgreSQL en una conexión propia)
export async function cicloProspeccion(): Promise<Paso> {
  if (!correoConfigurado()) return { motivo: "sin_configurar" };
  const c = await pool().connect();
  try {
    const { rows: [{ ok }] } = await c.query<{ ok: boolean }>("SELECT pg_try_advisory_lock(hashtext('prospeccion')) AS ok");
    if (!ok) return { motivo: "ocupado" };
    try { return await unPaso(); } finally { await c.query("SELECT pg_advisory_unlock(hashtext('prospeccion'))"); }
  } finally { c.release(); }
}
