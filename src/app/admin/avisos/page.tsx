// Avisos push (docs/24): suscripciones por tema, historial de envíos, RIF seguidos (solo superadministrador) y
// envío manual de novedades
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { avisosConfigurados } from "../../../modules/avisos/envio.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { EndpointPropio } from "../../../ui/admin/PruebaAviso.tsx";
import { fechaHora } from "../../../ui/formato.ts";
import { accionEnviarNovedad, accionPrueba } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Avisos push" };
export const dynamic = "force-dynamic";

const TEMAS = { tasa: "Tasa BCV", noticias: "Noticias", deberes: "Deberes", novedades: "Novedades", bienvenida: "Bienvenida" } as const;
const ORIGEN = { automatico: "automático", panel: "panel", prueba: "prueba" } as const;
const SERVICIO = `CASE WHEN endpoint LIKE 'https://fcm.googleapis.com/%' THEN 'Chrome, Edge, Android'
  WHEN endpoint LIKE 'https://updates.push.services.mozilla.com/%' THEN 'Firefox'
  WHEN endpoint LIKE '%.push.apple.com/%' THEN 'Safari (Apple)' WHEN endpoint LIKE '%.notify.windows.com/%' THEN 'Windows' ELSE 'Otro' END`;

export default async function Avisos() {
  const u = await requerirSeccion("avisos");
  const envia = puede(u.rol, "avisos.enviar");
  const verRif = u.rol === "super";
  const [[k], porTema, servicios, envios, rifs] = await Promise.all([
    consulta<{ total: number; d7: number; rifs: number; envios30: number }>(
      `SELECT (SELECT count(*)::int FROM avisos.suscripcion) AS total,
              (SELECT count(*)::int FROM avisos.suscripcion WHERE creada_en > now() - interval '7 days') AS d7,
              (SELECT count(DISTINCT rif)::int FROM avisos.suscripcion_rif) AS rifs,
              (SELECT count(*)::int FROM avisos.envio WHERE creado_en > now() - interval '30 days' AND origen <> 'prueba' AND tema <> 'bienvenida') AS envios30`),
    consulta<{ tema: string; n: number }>("SELECT t AS tema, count(*)::int AS n FROM avisos.suscripcion, unnest(temas) t GROUP BY t"),
    consulta<{ servicio: string; n: number }>(`SELECT ${SERVICIO} AS servicio, count(*)::int AS n FROM avisos.suscripcion GROUP BY 1 ORDER BY 2 DESC`),
    consulta<{ id: number; tema: keyof typeof TEMAS; titulo: string; cuerpo: string | null; origen: keyof typeof ORIGEN; creado_por: string | null; creado_en: string; destinatarios: number; entregados: number; fallidos: number }>(
      `SELECT id::int, tema, titulo, cuerpo, origen, creado_por, creado_en::text, destinatarios, entregados, fallidos
         FROM avisos.envio WHERE tema <> 'bienvenida' ORDER BY creado_en DESC LIMIT 30`),
    verRif ? consulta<{ rif: string; tipo: string; dispositivos: number; desde: string }>(
      `SELECT r.rif, min(r.tipo) AS tipo, count(*)::int AS dispositivos, min(s.creada_en)::text AS desde
         FROM avisos.suscripcion_rif r JOIN avisos.suscripcion s ON s.id = r.suscripcion_id GROUP BY r.rif ORDER BY 3 DESC, 1 LIMIT 50`) : Promise.resolve([]),
  ]);
  const n = (t: string) => porTema.find((x) => x.tema === t)?.n ?? 0;
  const configurado = avisosConfigurados();

  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Avisos push</h1><span className={s.subtitulo}>Notificaciones del navegador: tasa BCV al publicarse · noticias a las 8, 13 y 19 h · deberes 3 días antes y el día · novedades desde aquí</span></div>
      </div>
      {!configurado && <div className={s.soloLectura}>Faltan las claves VAPID (VAPID_PUBLICO y VAPID_PRIVADO) en el servidor: la campana no se ofrece y no se envía nada.</div>}
      {!envia && <div className={s.soloLectura}>Modo solo lectura: puedes consultar los avisos, pero no enviarlos.</div>}

      <div className={s.kpis}>
        <div className={s.kpi}><span>Dispositivos suscritos</span><span className={s.kpiValor}>{k.total}</span><span className={`${s.kpiNota} t-apagado`}>{k.d7} nuevos en 7 días</span></div>
        <div className={s.kpi}><span>Por tema</span>
          <span style={{ display: "grid", gridTemplateColumns: "auto auto", gap: "4px 14px", justifyContent: "start", fontSize: 14, color: "var(--texto-2)", marginTop: 4 }}>
            {(["tasa", "noticias", "deberes", "novedades"] as const).map((t) => <span key={t}>{TEMAS[t]} <strong className="mono" style={{ color: "var(--tinta)" }}>{n(t)}</strong></span>)}
          </span>
        </div>
        <div className={s.kpi}><span>RIF seguidos</span><span className={s.kpiValor}>{k.rifs}</span><span className={`${s.kpiNota} t-apagado`}>para avisos de vencimiento</span></div>
        <div className={s.kpi}><span>Envíos en 30 días</span><span className={s.kpiValor}>{k.envios30}</span><span className={`${s.kpiNota} t-apagado`}>{servicios.map((x) => `${x.servicio} ${x.n}`).join(" · ") || "sin suscripciones"}</span></div>
      </div>

      {envia && configurado && (
        <div className={s.rejilla2}>
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Enviar novedad</strong><span className={s.apagado}>a los {n("novedades")} dispositivos que siguen las novedades</span></div>
            <div className={s.panelCuerpo}>
              <FormAccion accion={accionEnviarNovedad} boton="Enviar a todos" confirmar={`¿Enviar este aviso a ${n("novedades")} dispositivos? No se puede deshacer.`}>
                <label className={s.etiquetaChica}><span>Título</span><input className={s.campoChico} name="titulo" required minLength={3} maxLength={120} placeholder="Nuevo: comparador de precios" /></label>
                <label className={s.etiquetaChica}><span>Texto <span className={s.apagado}>(opcional, hasta 400)</span></span><textarea className={s.campoChico} name="cuerpo" maxLength={400} rows={3} placeholder="Compara el precio de un producto en 16 cadenas…" /></label>
                <label className={s.etiquetaChica}><span>Enlace del sitio</span><input className={`${s.campoChico} mono`} name="url" defaultValue="/" maxLength={300} pattern="/.*" placeholder="/#comparador" /></label>
              </FormAccion>
            </div>
          </div>
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Probar en este navegador</strong></div>
            <div className={s.panelCuerpo}>
              <p className={s.apagado} style={{ fontSize: 14, lineHeight: 1.5 }}>Envía un aviso solo a este navegador. Primero activa los avisos con la campana de la cabecera del sitio.</p>
              <FormAccion accion={accionPrueba} boton="Enviar prueba" estiloBoton="secundario" limpiar={false}>
                <EndpointPropio />
                <input type="hidden" name="titulo" value="Prueba de El Renglón" />
                <input type="hidden" name="cuerpo" value="Si ves esto, los avisos funcionan en este navegador." />
                <input type="hidden" name="url" value="/admin/avisos" />
              </FormAccion>
            </div>
          </div>
        </div>
      )}

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Envíos recientes</strong><span className={s.apagado}>Los avisos de bienvenida no se listan</span></div>
        {envios.length === 0 ? <div className={s.vacio}>Todavía no se ha enviado ningún aviso.</div> : (
          <table className={s.tabla} style={{ minWidth: 860 }}>
            <thead><tr><th>Fecha</th><th>Tema</th><th>Aviso</th><th>Origen</th><th>Destinatarios</th><th>Entregados</th></tr></thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id}>
                  <td className={s.apagado} style={{ whiteSpace: "nowrap" }}>{fechaHora(e.creado_en)}</td>
                  <td>{TEMAS[e.tema]}</td>
                  <td style={{ maxWidth: 380 }}><span className={s.celdaNombre}><strong>{e.titulo}</strong>{e.cuerpo && <span>{e.cuerpo}</span>}</span></td>
                  <td className={s.apagado}>{ORIGEN[e.origen]}{e.creado_por ? ` · ${e.creado_por}` : ""}</td>
                  <td className="mono">{e.destinatarios}</td>
                  <td>{e.fallidos ? <span className="punto t-adicional">{e.entregados} · {e.fallidos} con error</span> : <span className="mono">{e.entregados}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {verRif && (
        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}><strong>RIF seguidos · {k.rifs}</strong><span className={s.apagado}>Datos personales: solo los ve el superadministrador</span></div>
          {rifs.length === 0 ? <div className={s.vacio}>Nadie sigue un RIF todavía.</div> : (
            <table className={s.tabla} style={{ minWidth: 560 }}>
              <thead><tr><th>RIF</th><th>Tipo</th><th>Dispositivos</th><th>Desde</th></tr></thead>
              <tbody>
                {rifs.map((r) => (
                  <tr key={r.rif}>
                    <td className="mono">{r.rif}</td>
                    <td className={s.apagado}>{r.tipo === "ESPECIAL" ? "especial" : "ordinario"}</td>
                    <td className="mono">{r.dispositivos}</td>
                    <td className={s.apagado}>{fechaHora(r.desde)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
