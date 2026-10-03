// Bandeja (docs/27): mensajes del botón de contacto del sitio y correos recibidos en ventas@ y soporte@ (Spacemail,
// solo lectura). Solo superadministrador: son datos personales.
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { BUZONES, buzonConfigurado, leer, listar, type Buzon } from "../../../modules/contacto/buzon.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { fechaHora } from "../../../ui/formato.ts";
import { accionMarcarMensaje } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Bandeja" };
export const dynamic = "force-dynamic";

const ESTADOS = { nuevo: ["Nuevo", "t-reducida"], atendido: ["Atendido", "t-exento"], spam: ["Spam", "t-apagado"] } as const;
type Pestana = "mensajes" | Buzon;

const responder = (correo: string, asunto: string) => `mailto:${correo}?subject=${encodeURIComponent(asunto.startsWith("Re:") ? asunto : `Re: ${asunto}`)}`;

export default async function Bandeja({ searchParams }: { searchParams: Promise<{ b?: string; uid?: string; estado?: string }> }) {
  await requerirSeccion("bandeja");
  const q = await searchParams;
  const pestana: Pestana = q.b === "ventas" || q.b === "soporte" ? q.b : "mensajes";
  const filtro = q.estado && q.estado in ESTADOS ? q.estado : null;

  const [[k], revision, respuestas] = await Promise.all([
    consulta<{ nuevos: number; total: number; novedades: number }>(
      "SELECT count(*) FILTER (WHERE estado = 'nuevo')::int AS nuevos, count(*)::int AS total, count(*) FILTER (WHERE novedades)::int AS novedades FROM contacto.mensaje"),
    consulta<{ revisado_en: string | null }>("SELECT revisado_en::text FROM contacto.cursor_buzon WHERE buzon = 'ventas'"),
    consulta<{ ocurrido_en: string; correo: string; estado: string }>(
      "SELECT ocurrido_en::text, detalle->>'correo' AS correo, detalle->>'estado' AS estado FROM core.auditoria WHERE accion = 'prospeccion.respuesta' ORDER BY ocurrido_en DESC LIMIT 10"),
  ]);

  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Bandeja</h1><span className={s.subtitulo}>Mensajes del botón de contacto del sitio y correos recibidos en ventas@ y soporte@. Los correos se leen sin marcarlos como leídos.</span></div>
      </div>

      <div className={s.kpis}>
        <div className={s.kpi}><span>Mensajes nuevos</span><span className={s.kpiValor}>{k.nuevos}</span><span className={`${s.kpiNota} t-apagado`}>{k.total} en total</span></div>
        <div className={s.kpi}><span>Quieren novedades</span><span className={s.kpiValor}>{k.novedades}</span><span className={`${s.kpiNota} t-apagado`}>quedan en Prospección con consentimiento</span></div>
        <div className={s.kpi}><span>Respuestas a la prospección</span><span className={s.kpiValor}>{respuestas.length}</span>
          <span className={`${s.kpiNota} t-apagado`}>{revision[0]?.revisado_en ? `ventas@ revisado ${fechaHora(revision[0].revisado_en)}` : "ventas@ aún no revisado"}</span></div>
      </div>

      <nav className={s.pestanas} aria-label="Bandeja">
        <Link href="?b=mensajes" aria-current={pestana === "mensajes"}>Mensajes del sitio{k.nuevos ? ` · ${k.nuevos}` : ""}</Link>
        <Link href="?b=ventas" aria-current={pestana === "ventas"}>{BUZONES.ventas}</Link>
        <Link href="?b=soporte" aria-current={pestana === "soporte"}>{BUZONES.soporte}</Link>
      </nav>

      {pestana === "mensajes" ? <Mensajes filtro={filtro} /> : q.uid ? <Correo b={pestana} uid={Number(q.uid)} /> : <Correos b={pestana} />}

      {pestana === "ventas" && respuestas.length > 0 && (
        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}><strong>Respuestas detectadas</strong><span className={s.apagado}>actualizan el estado del prospecto: «baja» lo da de baja; el resto, «respondió»</span></div>
          <table className={s.tabla} style={{ minWidth: 560 }}>
            <thead><tr><th>Fecha</th><th>Correo</th><th>Resultado</th></tr></thead>
            <tbody>{respuestas.map((r, i) => <tr key={i}><td className={s.apagado}>{fechaHora(r.ocurrido_en)}</td><td className="mono" style={{ fontSize: 13 }}>{r.correo}</td><td>{r.estado}</td></tr>)}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

async function Mensajes({ filtro }: { filtro: string | null }) {
  const filas = await consulta<{ id: number; correo: string; nombre: string | null; mensaje: string; pagina: string | null; novedades: boolean; estado: keyof typeof ESTADOS; notificado: boolean; creado_en: string; atendido_por: string | null }>(
    `SELECT id::int, correo, nombre, mensaje, pagina, novedades, estado, notificado, creado_en::text, atendido_por FROM contacto.mensaje
      WHERE ($1::text IS NULL OR estado = $1) ORDER BY (estado = 'nuevo') DESC, creado_en DESC LIMIT 100`, [filtro]);
  return (
    <div className={s.tablaMarco}>
      <div className={s.panelCabeza}><strong>Mensajes del botón de contacto</strong>
        <span className={s.apagado}>{filtro ? <Link href="?b=mensajes">todos</Link> : <strong>todos</strong>}
          {(Object.keys(ESTADOS) as (keyof typeof ESTADOS)[]).map((e) => <span key={e}> · {e === filtro ? <strong>{ESTADOS[e][0]}</strong> : <Link href={`?b=mensajes&estado=${e}`}>{ESTADOS[e][0]}</Link>}</span>)}</span></div>
      {filas.length === 0 ? <div className={s.vacio}>Todavía no hay mensajes. Llegan desde el botón redondo, abajo a la derecha del sitio.</div> : (
        <table className={s.tabla} style={{ minWidth: 900 }}>
          <thead><tr><th>Fecha</th><th>De</th><th>Mensaje</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {filas.map((m) => (
              <tr key={m.id}>
                <td className={s.apagado} style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>{fechaHora(m.creado_en)}</td>
                <td style={{ verticalAlign: "top", maxWidth: 220 }}><span className={s.celdaNombre}><strong>{m.nombre ?? "—"}</strong><span className="mono">{m.correo}</span>
                  {m.novedades && <span className="t-exento">quiere novedades</span>}</span></td>
                <td style={{ maxWidth: 420, whiteSpace: "pre-wrap", verticalAlign: "top" }}>{m.mensaje}<br /><span className={s.apagado} style={{ fontSize: 12 }}>desde {m.pagina ?? "—"}{m.notificado ? " · avisado a soporte@" : ""}</span></td>
                <td style={{ verticalAlign: "top" }}><span className={`punto ${ESTADOS[m.estado][1]}`}>{ESTADOS[m.estado][0]}</span>{m.atendido_por && <><br /><span className={s.apagado} style={{ fontSize: 12 }}>{m.atendido_por}</span></>}</td>
                <td style={{ whiteSpace: "nowrap", verticalAlign: "top" }}>
                  <a className={s.botonTexto} href={responder(m.correo, `Su mensaje a El Renglón`)}>Responder</a>
                  {m.estado !== "atendido" && <FormAccion accion={accionMarcarMensaje} boton="Atendido" estiloBoton="texto" className=""><input type="hidden" name="id" value={m.id} /><input type="hidden" name="estado" value="atendido" /></FormAccion>}
                  {m.estado === "nuevo" && <FormAccion accion={accionMarcarMensaje} boton="Spam" estiloBoton="peligro" className=""><input type="hidden" name="id" value={m.id} /><input type="hidden" name="estado" value="spam" /></FormAccion>}
                  {m.estado !== "nuevo" && <FormAccion accion={accionMarcarMensaje} boton="Volver a nuevo" estiloBoton="texto" className=""><input type="hidden" name="id" value={m.id} /><input type="hidden" name="estado" value="nuevo" /></FormAccion>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function Correos({ b }: { b: Buzon }) {
  if (!buzonConfigurado(b)) return <div className={s.soloLectura}>Falta la contraseña de {BUZONES[b]} en el servidor ({b === "soporte" ? "CORREO_SOPORTE_CLAVE" : "CORREO_SMTP_CLAVE"} en el .env).</div>;
  let r: Awaited<ReturnType<typeof listar>>;
  try { r = await listar(b, 50); } catch (e) { return <div className={s.soloLectura}>No se pudo leer {BUZONES[b]}: {(e as Error).message}</div>; }
  return (
    <div className={s.tablaMarco}>
      <div className={s.panelCabeza}><strong>{BUZONES[b]} · {r.total} correos</strong><span className={s.apagado}>los 50 más recientes de la bandeja de entrada</span></div>
      {r.correos.length === 0 ? <div className={s.vacio}>La bandeja de entrada está vacía.</div> : (
        <table className={s.tabla} style={{ minWidth: 760 }}>
          <thead><tr><th>Fecha</th><th>De</th><th>Asunto</th></tr></thead>
          <tbody>
            {r.correos.map((c) => (
              <tr key={c.uid}>
                <td className={s.apagado} style={{ whiteSpace: "nowrap" }}>{fechaHora(c.fecha)}</td>
                <td style={{ maxWidth: 240 }}><span className={s.celdaNombre}><strong style={{ fontWeight: c.leido ? 500 : 700 }}>{c.nombre ?? c.de}</strong>{c.nombre && <span className="mono">{c.de}</span>}</span></td>
                <td><Link href={`?b=${b}&uid=${c.uid}`} style={{ fontWeight: c.leido ? 400 : 700 }}>{c.asunto}</Link>{c.adjuntos && <span className={s.apagado}> · adjunto</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

async function Correo({ b, uid }: { b: Buzon; uid: number }) {
  if (!buzonConfigurado(b)) return <Correos b={b} />;
  let m: Awaited<ReturnType<typeof leer>>;
  try { m = await leer(b, uid); } catch (e) { return <div className={s.soloLectura}>No se pudo leer el correo: {(e as Error).message}</div>; }
  if (!m) return <div className={s.soloLectura}>Ese correo ya no está en la bandeja. <Link href={`?b=${b}`}>Volver</Link></div>;
  const a = (m.responderA || m.de).match(/[^\s<>"]+@[^\s<>"]+/)?.[0] ?? "";
  return (
    <div className={s.tablaMarco}>
      <div className={s.panelCabeza}><strong>{m.asunto}</strong><span className={s.apagado}><Link href={`?b=${b}`}>← volver a {BUZONES[b]}</Link></span></div>
      <div className={s.panelCuerpo}>
        <p style={{ fontSize: 14, margin: 0, lineHeight: 1.6 }}><span className={s.apagado}>De:</span> {m.de}<br /><span className={s.apagado}>Para:</span> {m.para}<br />
          <span className={s.apagado}>Fecha:</span> {fechaHora(m.fecha)}{m.adjuntos.length > 0 && <><br /><span className={s.apagado}>Adjuntos:</span> {m.adjuntos.join(", ")} <span className={s.apagado}>(ábrelos en Spacemail)</span></>}</p>
        {a && <p style={{ margin: "10px 0" }}><a className="boton boton-chico boton-secundario" href={responder(a, m.asunto)}>Responder a {a}</a></p>}
        <div style={{ whiteSpace: "pre-wrap", fontSize: 14, lineHeight: 1.55, background: "var(--papel-claro)", border: "1px solid var(--linea)", borderRadius: 8, padding: 14, maxHeight: 640, overflow: "auto" }}>{m.texto}</div>
      </div>
    </div>
  );
}
