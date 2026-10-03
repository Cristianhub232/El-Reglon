// Bandeja del panel (docs/27): lectura de los buzones ventas@ y soporte@ de Spacemail por IMAP, SOLO LECTURA
// (EXAMINE: no se marcan como leídos ni se mueven). Además, cada 5 minutos, las respuestas de los prospectos que
// llegan a ventas@ actualizan su estado: «baja» → baja; rebote → rebote; respuesta automática → se ignora; el resto →
// respondió (así no reciben el seguimiento).
import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { consulta } from "../../core/db.ts";

export const BUZONES = { ventas: "ventas@elrenglonve.org", soporte: "soporte@elrenglonve.org" } as const;
export type Buzon = keyof typeof BUZONES;

function cuenta(b: Buzon) {
  return b === "ventas"
    ? { user: process.env.CORREO_SMTP_USUARIO || BUZONES.ventas, pass: process.env.CORREO_SMTP_CLAVE }
    : { user: process.env.CORREO_SOPORTE || BUZONES.soporte, pass: process.env.CORREO_SOPORTE_CLAVE };
}
export const buzonConfigurado = (b: Buzon) => Boolean(cuenta(b).pass);

async function abrir<T>(b: Buzon, fn: (c: ImapFlow) => Promise<T>): Promise<T> {
  const { user, pass } = cuenta(b);
  if (!pass) throw new Error(`Falta la contraseña de ${BUZONES[b]} en el servidor`);
  const c = new ImapFlow({ host: process.env.CORREO_IMAP_HOST || "mail.spacemail.com", port: 993, secure: true, auth: { user, pass }, logger: false,
    socketTimeout: 30_000 });
  await c.connect();
  try {
    await c.mailboxOpen("INBOX", { readOnly: true });
    return await fn(c);
  } finally { await c.logout().catch(() => {}); }
}

export interface Resumen { uid: number; de: string; nombre: string | null; asunto: string; fecha: string; leido: boolean; adjuntos: boolean }

// Los últimos correos del buzón, del más nuevo al más viejo
export async function listar(b: Buzon, limite = 40): Promise<{ total: number; correos: Resumen[] }> {
  return abrir(b, async (c) => {
    const total = typeof c.mailbox === "object" ? c.mailbox.exists : 0;
    if (!total) return { total: 0, correos: [] };
    const correos: Resumen[] = [];
    for await (const m of c.fetch(`${Math.max(1, total - limite + 1)}:*`, { uid: true, envelope: true, flags: true, internalDate: true, bodyStructure: true })) {
      const de = m.envelope?.from?.[0];
      correos.push({ uid: m.uid, de: de?.address ?? "(sin remitente)", nombre: de?.name || null, asunto: m.envelope?.subject || "(sin asunto)",
        fecha: new Date(m.internalDate ?? m.envelope?.date ?? Date.now()).toISOString(), leido: m.flags?.has("\\Seen") ?? false,
        adjuntos: JSON.stringify(m.bodyStructure ?? {}).includes('"disposition":"attachment"') });
    }
    return { total, correos: correos.reverse() };
  });
}

export interface Completo { uid: number; de: string; para: string; responderA: string | null; asunto: string; fecha: string; texto: string; adjuntos: string[] }

// Un correo completo, como texto plano (nunca se muestra su HTML: puede traer rastreadores o scripts)
export async function leer(b: Buzon, uid: number): Promise<Completo | null> {
  return abrir(b, async (c) => {
    const m = await c.fetchOne(String(uid), { uid: true, source: true }, { uid: true });
    if (!m || !m.source) return null;
    const p = await simpleParser(m.source);
    const dir = (x: unknown) => (x && typeof x === "object" && "text" in x ? String((x as { text: string }).text) : "");
    return { uid, de: dir(p.from), para: dir(p.to), responderA: dir(p.replyTo) || null, asunto: p.subject || "(sin asunto)",
      fecha: (p.date ?? new Date()).toISOString(), texto: (p.text || "(sin texto)").slice(0, 50_000), adjuntos: p.attachments.map((a) => a.filename || "adjunto") };
  });
}

// ── Respuestas de los prospectos (ventas@) ────────────────────────────────────────────────────────────

// Solo lo que escribió la persona: se corta en la cita del correo original (que contiene nuestra palabra «baja»)
export function textoPropio(t: string): string {
  const lineas = t.replace(/\r/g, "").split("\n"), propias: string[] = [];
  for (const l of lineas) {
    if (/^\s*>/.test(l) || /^\s*(El|On)\s.+(escribió|wrote)\s*:?\s*$/i.test(l) || /^-{2,}\s*(Original Message|Mensaje original)/i.test(l)
      || /^\s*(De|From):\s.*El Rengl[oó]n/i.test(l) || /^\s*--\s*$/.test(l)) break;
    propias.push(l);
  }
  return propias.join("\n").trim();
}
export const pideBaja = (t: string) => /\b(baja|no me interesa|no deseo|no quiero recibir|elim[ií]n(en|ar)me|elim[ií]nenme|remover|unsubscribe|stop)\b/i.test(t);
const esAutomatica = (h: Map<string, unknown>, asunto: string) =>
  (String(h.get("auto-submitted") ?? "no").toLowerCase() !== "no") || /^(respuesta autom[aá]tica|auto(matic)?[ -]?reply|fuera de (la )?oficina|out of (the )?office)/i.test(asunto);
const esRebote = (de: string, asunto: string) =>
  /^(mailer-daemon|postmaster)@/i.test(de) || /(undeliver|delivery status notification|no se pudo entregar|returned mail|failure notice)/i.test(asunto);

export async function revisarRespuestas(): Promise<{ revisados: number; cambios: { correo: string; estado: string }[] } | null> {
  if (!buzonConfigurado("ventas")) return null;
  return abrir("ventas", async (c) => {
    const caja = c.mailbox && typeof c.mailbox === "object" ? c.mailbox : null;
    if (!caja) return { revisados: 0, cambios: [] };
    const validez = Number(caja.uidValidity);
    const [cur] = await consulta<{ uid_validez: string | null; ultimo_uid: string }>("SELECT uid_validez::text, ultimo_uid::text FROM contacto.cursor_buzon WHERE buzon = 'ventas'");
    // Si el servidor reinició la numeración, se empieza de nuevo sin reprocesar lo viejo
    let desde = cur && Number(cur.uid_validez) === validez ? Number(cur.ultimo_uid) : cur ? Number(caja.uidNext) - 1 : 0;
    const cambios: { correo: string; estado: string }[] = [];
    let revisados = 0, ultimo = desde;
    if (caja.exists && Number(caja.uidNext) - 1 > desde) {
      for await (const m of c.fetch(`${desde + 1}:*`, { uid: true, envelope: true, source: true }, { uid: true })) {
        if (m.uid <= desde || revisados >= 100) continue;
        revisados++; ultimo = Math.max(ultimo, m.uid);
        const p = await simpleParser(m.source!);
        const de = (m.envelope?.from?.[0]?.address ?? "").toLowerCase(), asunto = p.subject ?? "";
        if (esRebote(de, asunto)) {
          const correos = [...new Set((p.text ?? "").toLowerCase().match(/[^\s<>"'()]+@[^\s<>"'()]+\.[a-z]{2,}/g) ?? [])];
          const r = await consulta<{ correo: string }>(
            "UPDATE prospeccion.prospecto SET estado = 'rebote', actualizado_en = now() WHERE lower(correo) = ANY($1) AND estado IN ('contactado', 'seguimiento') RETURNING correo", [correos]);
          r.forEach((x) => cambios.push({ correo: x.correo, estado: "rebote" }));
          continue;
        }
        if (esAutomatica(p.headers, asunto)) continue;
        const propio = textoPropio(p.text ?? "");
        const estado = pideBaja(propio) ? "baja" : "respondio";
        const r = await consulta<{ correo: string }>(
          `UPDATE prospeccion.prospecto SET estado = $2, actualizado_en = now()
            WHERE lower(correo) = $1 AND estado IN ('pendiente', 'contactado', 'seguimiento', 'respondio') AND estado <> $2 RETURNING correo`, [de, estado]);
        if (r.length && estado === "baja") await consulta("INSERT INTO prospeccion.baja (correo, origen) VALUES ($1, 'respuesta') ON CONFLICT (correo) DO NOTHING", [de]);
        r.forEach((x) => cambios.push({ correo: x.correo, estado }));
      }
    }
    await consulta(`INSERT INTO contacto.cursor_buzon (buzon, uid_validez, ultimo_uid, revisado_en) VALUES ('ventas', $1, $2, now())
      ON CONFLICT (buzon) DO UPDATE SET uid_validez = $1, ultimo_uid = $2, revisado_en = now()`, [validez, ultimo]);
    for (const x of cambios) await consulta("INSERT INTO core.auditoria (actor, accion, detalle) VALUES ('buzon', 'prospeccion.respuesta', $1)", [x]);
    return { revisados, cambios };
  });
}
