// Arancel de Aduanas (resources/Admin.dc.html · ARANCEL): versiones, sinónimos comerciales y observaciones de la fuente
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { normalizar } from "../../../modules/iva/normalizar.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { diaMes } from "../../../ui/formato.ts";
import { accionAgregarSinonimo, accionEliminarSinonimo } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Arancel" };

const formatear = (p: string) => p.length <= 4 ? p : [p.slice(0, 4), p.slice(4, 6), p.slice(6, 8), p.slice(8, 10)].filter(Boolean).join(".");

export default async function Arancel({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requerirSeccion("arancel");
  const edita = puede(u.rol, "arancel.editar");
  const q = (await searchParams).q?.trim() ?? "";
  const nq = normalizar(q), dq = q.replace(/\D/g, "");
  const [versiones, grupos, [obs], observaciones, [det]] = await Promise.all([
    consulta<{ instrumento: string; gaceta: string; fecha_publicacion: string }>("SELECT instrumento, gaceta, fecha_publicacion FROM arancel.version ORDER BY fecha_publicacion"),
    consulta<{ id: number; grupo: string; terminos: string[]; prefijos: string[]; prioridad: number; origen: string; creado_por: string | null; descripcion: string | null }>(
      `SELECT s.id, s.grupo, s.terminos, s.prefijos, s.prioridad, s.origen, s.creado_por,
              (SELECT initcap(lower(p.descripcion)) FROM arancel.partida p WHERE p.codigo = left(s.prefijos[1], 4)) AS descripcion
         FROM arancel.sinonimo s
        WHERE $1 = '' OR s.grupo ILIKE '%' || $1 || '%' OR EXISTS (SELECT 1 FROM unnest(s.terminos) t WHERE t LIKE '%' || $2 || '%')
           OR ($3 <> '' AND EXISTS (SELECT 1 FROM unnest(s.prefijos) p WHERE p LIKE $3 || '%'))
        ORDER BY s.origen DESC, s.grupo LIMIT 200`, [q, nq, dq]),
    consulta<{ n: string }>("SELECT count(*) AS n FROM arancel.observacion_fuente"),
    consulta<{ codigo: string; tipo: string; detalle: string }>("SELECT codigo, tipo, detalle FROM arancel.observacion_fuente ORDER BY codigo LIMIT 30"),
    consulta<{ n: string; nd: string }>("SELECT count(*) AS n, count(*) FILTER (WHERE estado = 'no_determinado' AND NOT revisada) AS nd FROM arancel.deteccion"),
  ]);
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Arancel de Aduanas</h1><span className={s.subtitulo}>Decreto 4.944 con reformas 2025 · semilla propia extraída de la Gaceta Oficial</span></div>
      </div>
      {!edita && <div className={s.soloLectura}>Modo solo lectura: puedes consultar el arancel y los sinónimos, pero no editarlos.</div>}
      <div className={s.kpis}>
        {versiones.map((v, i) => (
          <div key={v.instrumento} className={s.kpi}>
            <strong style={{ font: "600 17px var(--serif)", color: "var(--tinta)" }}>{i === 0 ? v.instrumento : `Reforma ${v.instrumento.replace("Decreto N° ", "")}`}</strong>
            <span className={s.apagado}>{v.gaceta} · {diaMes(v.fecha_publicacion)} de {v.fecha_publicacion.slice(0, 4)}{i === versiones.length - 1 ? " · vigente" : ""}</span>
          </div>
        ))}
      </div>
      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}>
            <strong>Sinónimos comerciales</strong>
            <form action="/admin/arancel" style={{ display: "flex", gap: 8 }}>
              <input className={s.campoChico} name="q" defaultValue={q} placeholder="Término, grupo o prefijo" aria-label="Buscar sinónimos" style={{ width: 220, padding: "7px 10px" }} />
            </form>
          </div>
          <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
            <table className={s.tabla}>
              <thead><tr><th>Grupo y términos</th><th>Prefijos</th><th>Partida</th><th>Prior.</th></tr></thead>
              <tbody>
                {grupos.length === 0 && <tr><td colSpan={4} className={s.apagado}>Ningún grupo coincide.</td></tr>}
                {grupos.map((g) => (
                  <tr key={g.id}>
                    <td><span className={s.celdaNombre}><strong>{g.grupo}</strong><span>{g.terminos.slice(0, 5).join(", ")}{g.terminos.length > 5 ? ` y ${g.terminos.length - 5} más` : ""}</span>
                      {g.origen === "panel" && <span className="t-condicionado">agregado por {g.creado_por} · sin exportar</span>}</span></td>
                    <td className="mono" style={{ fontSize: 13, color: "var(--azul)" }}>{g.prefijos.map((p) => <span key={p} style={{ display: "block" }}>{formatear(p)}</span>)}</td>
                    <td style={{ fontSize: 13, color: "var(--texto-2)" }}>{g.descripcion?.slice(0, 70)}{(g.descripcion?.length ?? 0) > 70 ? "…" : ""}</td>
                    <td className="mono" style={{ color: "var(--texto-3)" }}>
                      {g.prioridad}
                      {edita && g.origen === "panel" && (
                        <FormAccion accion={accionEliminarSinonimo} boton="Quitar" estiloBoton="peligro" className="" confirmar={`¿Quitar el grupo «${g.grupo}»?`}>
                          <input type="hidden" name="id" value={g.id} />
                        </FormAccion>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {edita && (
            <div className={s.panel}>
              <div className={s.panelCabeza}><strong>Agregar sinónimo</strong></div>
              <div className={s.panelCuerpo}>
                <FormAccion accion={accionAgregarSinonimo} boton="Agregar grupo">
                  <label className={s.etiquetaChica}><span>Grupo</span><input className={s.campoChico} name="grupo" placeholder="máquina de coser" required /></label>
                  <label className={s.etiquetaChica}><span>Términos comerciales <span className={s.apagado}>(separados por coma)</span></span>
                    <input className={s.campoChico} name="terminos" placeholder="maquina de coser, maquina de costura" required /></label>
                  <div className={s.formularioFila}>
                    <label className={s.etiquetaChica}><span>Prefijos arancelarios</span><input className={`${s.campoChico} ${s.campoMono}`} name="prefijos" placeholder="8452.10, 8452.21" required /></label>
                    <label className={s.etiquetaChica}><span>Prioridad</span><input className={`${s.campoChico} ${s.campoMono}`} name="prioridad" type="number" min={1} max={100} defaultValue={55} /></label>
                  </div>
                  <label className={s.etiquetaChica}><span>Excluir si aparece <span className={s.apagado}>(opcional)</span></span><input className={s.campoChico} name="excluir" placeholder="repuesto, aguja" /></label>
                  <span className={s.apagado}>Antes de guardar se ejecutan los casos de referencia de la detección con el grupo nuevo.</span>
                </FormAccion>
              </div>
            </div>
          )}
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Detección</strong></div>
            <div className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span>Detecciones registradas</span><span className="mono">{det.n}</span></div>
            <div className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span>No determinadas, para curaduría del diccionario</span><span className="mono t-adicional">{det.nd}</span></div>
          </div>
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Observaciones de la fuente</strong><span className={s.apagado}>{obs.n} en total</span></div>
            <div style={{ maxHeight: "40vh", overflowY: "auto" }}>
              {observaciones.map((o, i) => (
                <div key={i} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 6 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}><span className="mono" style={{ fontSize: 13, color: "var(--tinta)" }}>{formatear(o.codigo)}</span><span className="t-condicionado" style={{ fontSize: 13, fontWeight: 600 }}>{o.tipo}</span></div>
                  <span style={{ fontSize: 14, color: "var(--texto-2)" }}>{o.detalle}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
