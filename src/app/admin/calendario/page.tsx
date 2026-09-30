// Calendario tributario (resources/Admin.dc.html · CALENDARIO): mes con días inhábiles, obligaciones y días del trimestre
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { hoyCaracas } from "../../../core/validacion.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { fecha as fmtFecha } from "../../../ui/formato.ts";
import { accionAgregarInhabil, accionQuitarInhabil } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";
import k from "../../../ui/admin/calendario.module.css";

export const metadata = { title: "Calendario" };

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const iso = (a: number, m: number, d: number) => `${a}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export default async function Calendario({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const u = await requerirSeccion("calendario");
  const edita = puede(u.rol, "calendario.editar");
  const hoy = hoyCaracas();
  const mq = (await searchParams).mes;
  const [a, m] = (mq && /^\d{4}-\d{2}$/.test(mq) ? mq : hoy.slice(0, 7)).split("-").map(Number);
  const dias = new Date(Date.UTC(a, m, 0)).getUTCDate();
  const primero = (new Date(Date.UTC(a, m - 1, 1)).getUTCDay() + 6) % 7;   // 0 = lunes
  const trim = Math.floor((m - 1) / 3);
  const [inhabilesMes, trimestre, vencMes, [obl]] = await Promise.all([
    consulta<{ fecha: string; descripcion: string; tipo: string; origen: string }>(
      "SELECT fecha, descripcion, tipo, origen FROM calendario.dia_inhabil WHERE fecha BETWEEN $1 AND $2 ORDER BY fecha", [iso(a, m, 1), iso(a, m, dias)]),
    consulta<{ fecha: string; descripcion: string; tipo: string; origen: string; base_legal: string; agregado_por: string | null }>(
      `SELECT fecha, descripcion, tipo, origen, base_legal, agregado_por FROM calendario.dia_inhabil
        WHERE fecha BETWEEN $1 AND ($1::date + interval '3 months' - interval '1 day') ORDER BY fecha`, [iso(a, trim * 3 + 1, 1)]),
    consulta<{ dia: number; n: string }>(
      `SELECT extract(day FROM coalesce(v.fecha_prorrogada, v.fecha))::int AS dia, count(DISTINCT v.obligacion) AS n FROM calendario.vencimiento v
        WHERE coalesce(v.fecha_prorrogada, v.fecha) BETWEEN $1 AND $2 GROUP BY 1`, [iso(a, m, 1), iso(a, m, dias)]),
    consulta<{ especiales: string; ordinarios: string; hasta: string }>(
      `SELECT count(*) FILTER (WHERE o.tipo_contribuyente = 'ESPECIAL') AS especiales, count(*) FILTER (WHERE o.tipo_contribuyente = 'ORDINARIO') AS ordinarios,
              (SELECT max(fecha)::text FROM calendario.vencimiento) AS hasta FROM calendario.obligacion o`),
  ]);
  const inh = new Map(inhabilesMes.map((d) => [Number(d.fecha.slice(8, 10)), d]));
  const venc = new Map(vencMes.map((v) => [v.dia, Number(v.n)]));
  const anterior = m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`;
  const siguiente = m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, "0")}`;
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Calendario tributario {a}</h1><span className={s.subtitulo}>Días inhábiles y obligaciones por tipo de contribuyente · COT art. 10</span></div>
      </div>
      {!edita && <div className={s.soloLectura}>Modo solo lectura: puedes consultar el calendario, pero no editarlo.</div>}
      <div className={s.rejilla2}>
        <div className={`${s.panel} ${k.mes}`}>
          <div className={k.mesCabeza}>
            <strong className={s.panelTitulo}>{MESES[m - 1].charAt(0).toUpperCase() + MESES[m - 1].slice(1)} {a}</strong>
            <span className={k.flechas}><Link href={`/admin/calendario?mes=${anterior}`} aria-label="Mes anterior">‹</Link><Link href={`/admin/calendario?mes=${siguiente}`} aria-label="Mes siguiente">›</Link></span>
          </div>
          <div className={k.semana} aria-hidden="true">{["L", "M", "M", "J", "V", "S", "D"].map((d, i) => <span key={i}>{d}</span>)}</div>
          <div className={k.dias}>
            {Array.from({ length: primero }, (_, i) => <span key={`v${i}`} />)}
            {Array.from({ length: dias }, (_, i) => {
              const d = i + 1, dow = (primero + i) % 7, x = inh.get(d);
              const clase = x ? (x.tipo === "NACIONAL" ? k.nacional : k.bancario) : dow >= 5 ? k.finde : k.habil;
              const f = iso(a, m, d);
              return (
                <span key={d} className={`${k.dia} ${clase} ${f === hoy ? k.hoy : ""}`}
                  title={[x ? `${x.descripcion} (${x.tipo === "NACIONAL" ? "nacional" : "bancario"}${x.origen === "panel" ? ", agregado en el panel" : ""})` : "", venc.get(d) ? `${venc.get(d)} obligaciones vencen` : ""].filter(Boolean).join(" · ") || undefined}>
                  {d}{venc.get(d) ? <i className={k.marca} /> : null}
                </span>
              );
            })}
          </div>
          <div className={k.leyenda}>
            <span><i style={{ background: "var(--amarillo)" }} />Nacional</span><span><i style={{ background: "#C3D3EC" }} />Bancario</span>
            <span><i style={{ background: "var(--linea-suave)" }} />Fin de semana</span><span><i className={k.marcaLeyenda} />Vencimientos</span>
          </div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Obligaciones de IVA</strong><span className={s.apagado}>Vencimientos hasta {obl?.hasta ? fmtFecha(obl.hasta) : "—"}</span></div>
            <div className={s.fila} style={{ gridTemplateColumns: "130px minmax(0,1fr)" }}><strong style={{ color: "var(--tinta)" }}>Especiales</strong><span style={{ color: "var(--texto-2)" }}>Según el último dígito del RIF · Providencia SNAT/2025/000091 (GO 43.283) · {obl?.especiales} obligaciones</span></div>
            <div className={s.fila} style={{ gridTemplateColumns: "130px minmax(0,1fr)" }}><strong style={{ color: "var(--tinta)" }}>Ordinarios</strong><span style={{ color: "var(--texto-2)" }}>Período mensual · Reglamento de la Ley de IVA, art. 60 · día 15 o el hábil siguiente</span></div>
          </div>
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Días inhábiles del trimestre</strong></div>
            {trimestre.length === 0 && <div className={s.vacio}>Sin días inhábiles en el trimestre.</div>}
            {trimestre.map((d) => (
              <div key={d.fecha} className={s.fila} style={{ gridTemplateColumns: "92px minmax(0,1fr) 90px auto" }}>
                <span className="mono" style={{ fontSize: 13, color: "var(--tinta)" }}>{fmtFecha(d.fecha)}</span>
                <span title={d.base_legal}>{d.descripcion}{d.origen === "panel" && <span className={s.apagado}> · agregado por {d.agregado_por}</span>}</span>
                <span className={s.apagado}>{d.tipo === "NACIONAL" ? "Nacional" : "Bancario"}</span>
                {edita && d.origen === "panel" ? (
                  <FormAccion accion={accionQuitarInhabil} boton="Quitar" estiloBoton="peligro" className="" confirmar={`¿Quitar el ${fmtFecha(d.fecha)}? Se recalcularán las prórrogas.`}>
                    <input type="hidden" name="fecha" value={d.fecha} />
                  </FormAccion>
                ) : <span />}
              </div>
            ))}
          </div>
        </div>
      </div>
      {edita && (
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Agregar día inhábil</strong><span className={s.apagado}>Días no laborables decretados o feriados bancarios; se recalculan las prórrogas del COT art. 10</span></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionAgregarInhabil} boton="Agregar día inhábil">
              <div className={s.formularioFila}>
                <label className={s.etiquetaChica}><span>Fecha</span><input className={`${s.campoChico} ${s.campoMono}`} type="date" name="fecha" required /></label>
                <label className={s.etiquetaChica}><span>Tipo</span><select className={s.campoChico} name="tipo" defaultValue="NACIONAL"><option value="NACIONAL">Nacional</option><option value="BANCARIO">Bancario</option></select></label>
                <label className={s.etiquetaChica}><span>Descripción</span><input className={s.campoChico} name="descripcion" placeholder="Día no laborable por decreto" required /></label>
                <label className={s.etiquetaChica}><span>Base legal</span><input className={s.campoChico} name="base_legal" placeholder="Decreto N°… (GO N°… del …)" required /></label>
              </div>
            </FormAccion>
          </div>
        </div>
      )}
    </div>
  );
}
