// Prospección comercial por correo (docs/26): ajustes, vista previa de las plantillas, pruebas, prospectos y envíos.
// Solo superadministrador: la lista tiene correos de personas.
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { contextoPara, correoConfigurado } from "../../../modules/prospeccion/envio.ts";
import { armarCorreo, datosEjemplo, SECTORES, type Sector, type TipoCorreo } from "../../../modules/prospeccion/plantillas.ts";
import { ESTADOS, type EstadoProspecto } from "../../../modules/prospeccion/prospectos.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { fechaHora } from "../../../ui/formato.ts";
import { accionAjustes, accionCrear, accionEstado, accionImportar, accionPrueba } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Prospección" };
export const dynamic = "force-dynamic";

const COLOR: Record<EstadoProspecto, string> = {
  pendiente: "t-apagado", contactado: "t-reducida", seguimiento: "t-condicionado", respondio: "t-exento", descartado: "t-apagado", baja: "t-adicional", rebote: "t-adicional",
};

export default async function Prospeccion({ searchParams }: { searchParams: Promise<{ vista?: string; tipo?: string; estado?: string }> }) {
  await requerirSeccion("prospeccion");
  const q = await searchParams;
  const vista: Sector = q.vista && q.vista in SECTORES ? q.vista as Sector : "general";
  const tipo: TipoCorreo = q.tipo === "seguimiento" ? "seguimiento" : "inicial";
  const filtro = q.estado && q.estado in ESTADOS ? q.estado : null;

  const ejemplo = datosEjemplo(vista);
  const [[a], porEstado, prospectos, envios, contexto] = await Promise.all([
    consulta<{ activo: boolean; limite_diario: number; hora_inicio: number; hora_fin: number; dias_seguimiento: number; proximo_envio: string | null; actualizado_por: string | null; enviados_hoy: number; bajas: number }>(
      `SELECT a.*, a.proximo_envio::text,
              (SELECT count(*)::int FROM prospeccion.envio WHERE tipo <> 'prueba' AND resultado = 'enviado'
                 AND (enviado_en AT TIME ZONE 'America/Caracas')::date = (now() AT TIME ZONE 'America/Caracas')::date) AS enviados_hoy,
              (SELECT count(*)::int FROM prospeccion.baja) AS bajas
         FROM prospeccion.ajuste a`),
    consulta<{ estado: EstadoProspecto; n: number }>("SELECT estado, count(*)::int AS n FROM prospeccion.prospecto GROUP BY estado"),
    consulta<{ id: number; empresa: string; contacto: string | null; correo: string; sector: Sector; origen: string; rif: string | null; estado: EstadoProspecto; envios: number; ultimo_envio: string | null }>(
      `SELECT id::int, empresa, contacto, correo, sector, origen, rif, estado, envios, ultimo_envio::text FROM prospeccion.prospecto
        WHERE ($1::text IS NULL OR estado = $1) ORDER BY actualizado_en DESC LIMIT 200`, [filtro]),
    consulta<{ id: number; correo: string; tipo: string; asunto: string; resultado: string; error: string | null; creado_por: string | null; enviado_en: string }>(
      "SELECT id::int, correo, tipo, asunto, resultado, error, creado_por, enviado_en::text FROM prospeccion.envio ORDER BY enviado_en DESC LIMIT 30"),
    contextoPara(ejemplo),
  ]);
  const n = (e: EstadoProspecto) => porEstado.find((x) => x.estado === e)?.n ?? 0;
  const total = porEstado.reduce((t, x) => t + x.n, 0);
  const configurado = correoConfigurado();
  const muestra = armarCorreo(ejemplo, tipo, contexto);
  const horas = Array.from({ length: 14 }, (_, i) => i + 7);

  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Prospección</h1><span className={s.subtitulo}>Correos a empresas para ofrecer El Renglón: pocos por día, de lunes a viernes, con un solo seguimiento y baja en un clic. Remitente «El Renglón».</span></div>
      </div>
      {!configurado && <div className={s.soloLectura}>Falta CORREO_SMTP_CLAVE en el servidor: no se puede enviar nada.</div>}

      <div className={s.kpis}>
        <div className={s.kpi}><span>Estado</span><span className={s.kpiValor}>{a.activo ? "Activa" : "En pausa"}</span>
          <span className={`${s.kpiNota} t-apagado`}>{a.activo && a.proximo_envio ? `próximo envío desde ${fechaHora(a.proximo_envio)}` : "no se envía nada"}</span></div>
        <div className={s.kpi}><span>Enviados hoy</span><span className={s.kpiValor}>{a.enviados_hoy} / {a.limite_diario}</span><span className={`${s.kpiNota} t-apagado`}>de {a.hora_inicio} a {a.hora_fin} h, días hábiles</span></div>
        <div className={s.kpi}><span>Prospectos</span><span className={s.kpiValor}>{total}</span><span className={`${s.kpiNota} t-apagado`}>{n("pendiente")} pendientes · {n("contactado") + n("seguimiento")} contactados</span></div>
        <div className={s.kpi}><span>Respuestas y bajas</span><span className={s.kpiValor}>{n("respondio")}</span><span className={`${s.kpiNota} t-apagado`}>respondieron · {a.bajas} bajas · {n("rebote")} rebotes</span></div>
      </div>

      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Ajustes</strong>{a.actualizado_por && <span className={s.apagado}>por {a.actualizado_por}</span>}</div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionAjustes} boton="Guardar" limpiar={false}
              confirmar={a.activo ? undefined : "Si marcas «Activa», empezarán a salir correos reales a los prospectos pendientes. ¿Continuar?"}>
              <label style={{ display: "flex", gap: 8, alignItems: "center" }}><input type="checkbox" name="activo" defaultChecked={a.activo} /> <strong>Activa</strong> <span className={s.apagado}>(envía correos reales)</span></label>
              <label className={s.etiquetaChica}><span>Correos por día hábil <span className={s.apagado}>(máx. 30; empiece con 5)</span></span>
                <input className={s.campoChico} type="number" name="limite_diario" min={1} max={30} defaultValue={a.limite_diario} required /></label>
              <div className={s.formularioFila}>
                <label className={s.etiquetaChica}><span>Desde (hora de Caracas)</span>
                  <select className={s.campoChico} name="hora_inicio" defaultValue={a.hora_inicio}>{horas.slice(0, 12).map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
                <label className={s.etiquetaChica}><span>Hasta</span>
                  <select className={s.campoChico} name="hora_fin" defaultValue={a.hora_fin}>{horas.slice(1).map((h) => <option key={h} value={h}>{h}:00</option>)}</select></label>
              </div>
              <label className={s.etiquetaChica}><span>Seguimiento a los … días <span className={s.apagado}>(uno solo; luego se detiene)</span></span>
                <input className={s.campoChico} type="number" name="dias_seguimiento" min={3} max={30} defaultValue={a.dias_seguimiento} required /></label>
            </FormAccion>
          </div>
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Enviar una prueba</strong><span className={s.apagado}>no cuenta para el límite</span></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionPrueba} boton="Enviar prueba" estiloBoton="secundario" limpiar={false}>
              <label className={s.etiquetaChica}><span>Plantilla</span>
                <select className={s.campoChico} name="sector" defaultValue={vista}>{Object.entries(SECTORES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <label className={s.etiquetaChica}><span>Enviar a</span><input className={s.campoChico} type="email" name="correo" required placeholder="usted@ejemplo.com" /></label>
            </FormAccion>
          </div>
        </div>
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Vista previa</strong>
          <span className={s.apagado}>{Object.entries(SECTORES).map(([k, t], i) => <span key={k}>{i ? " · " : ""}{k === vista ? <strong>{t}</strong> : <Link href={`?vista=${k}&tipo=${tipo}`}>{t}</Link>}</span>)}
            {" · "}{tipo === "inicial" ? <Link href={`?vista=${vista}&tipo=seguimiento`}>ver el seguimiento</Link> : <Link href={`?vista=${vista}`}>ver el primer correo</Link>}</span></div>
        <div className={s.panelCuerpo}>
          <p style={{ fontSize: 14, margin: "0 0 10px" }}><span className={s.apagado}>Asunto:</span> <strong>{muestra.asunto}</strong></p>
          <iframe title="Vista previa del correo" srcDoc={muestra.html} sandbox="" style={{ width: "100%", height: 720, border: "1px solid var(--linea)", borderRadius: 8, background: "#fff" }} />
        </div>
      </div>

      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Agregar un prospecto</strong></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionCrear} boton="Agregar">
              <label className={s.etiquetaChica}><span>Empresa</span><input className={s.campoChico} name="empresa" required minLength={2} maxLength={160} placeholder="Farmacia Los Andes, C.A." /></label>
              <div className={s.formularioFila}>
                <label className={s.etiquetaChica}><span>Contacto <span className={s.apagado}>(opcional)</span></span><input className={s.campoChico} name="contacto" maxLength={120} placeholder="María Pérez" /></label>
                <label className={s.etiquetaChica}><span>Correo</span><input className={s.campoChico} type="email" name="correo" required placeholder="compras@empresa.com.ve" /></label>
              </div>
              <label className={s.etiquetaChica}><span>Sector</span><select className={s.campoChico} name="sector" defaultValue="general">{Object.entries(SECTORES).map(([k, t]) => <option key={k} value={k}>{t}</option>)}</select></label>
              <label className={s.etiquetaChica}><span>RIF <span className={s.apagado}>(obligatorio para contribuyentes especiales: el correo muestra sus próximos deberes)</span></span><input className={`${s.campoChico} mono`} name="rif" maxLength={14} placeholder="J-12345678-9" /></label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 14 }}><input type="checkbox" name="consentimiento" style={{ marginTop: 3 }} />
                <span>Aceptó recibir correos de El Renglón <span className={s.apagado}>(obligatorio para personas naturales: explique cómo en el origen)</span></span></label>
              <label className={s.etiquetaChica}><span>¿De dónde salió el contacto?</span><input className={s.campoChico} name="origen" required minLength={2} maxLength={200} placeholder="Web de la empresa, sección Contacto" /></label>
              <label className={s.etiquetaChica}><span>Notas <span className={s.apagado}>(opcional)</span></span><textarea className={s.campoChico} name="notas" maxLength={1000} rows={2} /></label>
            </FormAccion>
          </div>
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Importar CSV</strong><span className={s.apagado}>hasta 500 líneas</span></div>
          <div className={s.panelCuerpo}>
            <p className={s.apagado} style={{ fontSize: 14, lineHeight: 1.5, margin: 0 }}>Una línea por contacto, separada por <code>;</code>: empresa; contacto; correo; sector; origen; rif; consentimiento. El RIF es obligatorio para «especial» y el consentimiento («sí») para «persona natural». Los repetidos y los que se dieron de baja se omiten.</p>
            <FormAccion accion={accionImportar} boton="Importar">
              <textarea className={`${s.campoChico} mono`} name="csv" required rows={7} placeholder={"empresa;contacto;correo;sector;origen;rif;consentimiento\nFarmacia Los Andes;María Pérez;compras@losandes.com.ve;farmacia;Web de la empresa;;\nInversiones X, C.A.;;tributos@x.com.ve;especial;Directorio de especiales;J-12345678-4;"} />
            </FormAccion>
          </div>
        </div>
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Prospectos · {total}</strong>
          <span className={s.apagado}>{filtro ? <Link href="?">todos</Link> : <strong>todos</strong>}{(Object.keys(ESTADOS) as EstadoProspecto[]).filter((e) => n(e)).map((e) =>
            <span key={e}> · {e === filtro ? <strong>{ESTADOS[e]} {n(e)}</strong> : <Link href={`?estado=${e}`}>{ESTADOS[e]} {n(e)}</Link>}</span>)}</span></div>
        {prospectos.length === 0 ? <div className={s.vacio}>Todavía no hay prospectos. Agrégalos uno a uno o importa un CSV.</div> : (
          <table className={s.tabla} style={{ minWidth: 980 }}>
            <thead><tr><th>Empresa</th><th>Correo</th><th>Sector</th><th>Estado</th><th>Último envío</th><th></th></tr></thead>
            <tbody>
              {prospectos.map((p) => (
                <tr key={p.id}>
                  <td style={{ maxWidth: 260 }}><span className={s.celdaNombre}><strong>{p.empresa}</strong><span>{p.contacto ? `${p.contacto} · ` : ""}{p.origen}</span></span></td>
                  <td className="mono" style={{ fontSize: 13 }}>{p.correo}{p.rif && <><br /><span className={s.apagado}>{p.rif}</span></>}</td>
                  <td className={s.apagado}>{SECTORES[p.sector]}</td>
                  <td><span className={`punto ${COLOR[p.estado]}`}>{ESTADOS[p.estado]}</span></td>
                  <td className={s.apagado} style={{ whiteSpace: "nowrap" }}>{p.ultimo_envio ? `${fechaHora(p.ultimo_envio)} · ${p.envios}` : "—"}</td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    {(["contactado", "seguimiento"] as EstadoProspecto[]).includes(p.estado) && <FormAccion accion={accionEstado} boton="Respondió" estiloBoton="texto" className=""><input type="hidden" name="id" value={p.id} /><input type="hidden" name="estado" value="respondio" /></FormAccion>}
                    {(["pendiente", "contactado", "seguimiento"] as EstadoProspecto[]).includes(p.estado) && <FormAccion accion={accionEstado} boton="Descartar" estiloBoton="texto" className=""><input type="hidden" name="id" value={p.id} /><input type="hidden" name="estado" value="descartado" /></FormAccion>}
                    {p.estado === "descartado" && <FormAccion accion={accionEstado} boton="Volver a pendiente" estiloBoton="texto" className=""><input type="hidden" name="id" value={p.id} /><input type="hidden" name="estado" value="pendiente" /></FormAccion>}
                    {p.estado !== "baja" && <FormAccion accion={accionEstado} boton="Dar de baja" estiloBoton="peligro" className="" confirmar={`¿Dar de baja ${p.correo}? No se le podrá volver a escribir.`}><input type="hidden" name="id" value={p.id} /><input type="hidden" name="estado" value="baja" /></FormAccion>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Envíos recientes</strong><span className={s.apagado}>Las respuestas llegan a ventas@elrenglonve.org: márcalas aquí con «Respondió»</span></div>
        {envios.length === 0 ? <div className={s.vacio}>Todavía no se ha enviado ningún correo.</div> : (
          <table className={s.tabla} style={{ minWidth: 860 }}>
            <thead><tr><th>Fecha</th><th>Para</th><th>Tipo</th><th>Asunto</th><th>Resultado</th></tr></thead>
            <tbody>
              {envios.map((e) => (
                <tr key={e.id}>
                  <td className={s.apagado} style={{ whiteSpace: "nowrap" }}>{fechaHora(e.enviado_en)}</td>
                  <td className="mono" style={{ fontSize: 13 }}>{e.correo}</td>
                  <td className={s.apagado}>{e.tipo}{e.tipo === "prueba" && e.creado_por ? ` · ${e.creado_por}` : ""}</td>
                  <td style={{ maxWidth: 360 }}>{e.asunto}</td>
                  <td>{e.resultado === "enviado" ? <span className="punto t-exento">enviado</span> : <span className="punto t-adicional" title={e.error ?? ""}>error</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
