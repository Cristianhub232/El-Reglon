// Visitas y RIF consultados (docs/23). Datos personales (IP completa, RIF): solo el superadministrador.
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { entero, fechaHora } from "../../../ui/formato.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Visitas y RIF" };

const PERIODOS = [[7, "7 días"], [30, "30 días"], [90, "90 días"], [365, "12 meses"]] as const;

export default async function Visitas({ searchParams }: { searchParams: Promise<{ dias?: string }> }) {
  await requerirSeccion("visitas");
  const pedido = Number((await searchParams).dias);
  const dias = PERIODOS.some(([d]) => d === pedido) ? pedido : 30;
  const p = [dias];
  const [[k], porDia, paginas, referentes, dispositivos, navegadores, recientes, rifTop, rifRecientes] = await Promise.all([
    consulta<{ visitantes: string; visitas: string; nuevos: string; rif_unicos: string; rif_consultas: string }>(
      `SELECT (SELECT count(DISTINCT visitante_id) FROM analitica.visita WHERE ocurrida_en > now() - make_interval(days => $1)) AS visitantes,
              (SELECT count(*) FROM analitica.visita WHERE ocurrida_en > now() - make_interval(days => $1)) AS visitas,
              (SELECT count(*) FROM analitica.visitante WHERE primera_visita > now() - make_interval(days => $1)) AS nuevos,
              (SELECT count(DISTINCT rif) FROM analitica.rif_consultado WHERE ocurrida_en > now() - make_interval(days => $1)) AS rif_unicos,
              (SELECT count(*) FROM analitica.rif_consultado WHERE ocurrida_en > now() - make_interval(days => $1)) AS rif_consultas`, p),
    consulta<{ dia: string; visitantes: number; visitas: number }>(
      `SELECT d::date::text AS dia, count(DISTINCT v.visitante_id)::int AS visitantes, count(v.id)::int AS visitas
         FROM generate_series((now() AT TIME ZONE 'America/Caracas')::date - ($1 - 1), (now() AT TIME ZONE 'America/Caracas')::date, '1 day') d
         LEFT JOIN analitica.visita v ON (v.ocurrida_en AT TIME ZONE 'America/Caracas')::date = d::date
        GROUP BY d ORDER BY d`, [Math.min(dias, 90)]),
    consulta<{ ruta: string; visitas: number; visitantes: number }>(
      `SELECT ruta, count(*)::int AS visitas, count(DISTINCT visitante_id)::int AS visitantes FROM analitica.visita
        WHERE ocurrida_en > now() - make_interval(days => $1) GROUP BY ruta ORDER BY 2 DESC LIMIT 10`, p),
    consulta<{ origen: string; visitas: number }>(
      `SELECT split_part(referente, '/', 1) AS origen, count(*)::int AS visitas FROM analitica.visita
        WHERE ocurrida_en > now() - make_interval(days => $1) AND referente IS NOT NULL GROUP BY 1 ORDER BY 2 DESC LIMIT 10`, p),
    consulta<{ dispositivo: string; visitantes: number }>(
      `SELECT dispositivo, count(DISTINCT visitante_id)::int AS visitantes FROM analitica.visita
        WHERE ocurrida_en > now() - make_interval(days => $1) GROUP BY 1 ORDER BY 2 DESC`, p),
    consulta<{ navegador: string; sistema: string; visitantes: number }>(
      `SELECT navegador, sistema, count(DISTINCT visitante_id)::int AS visitantes FROM analitica.visita
        WHERE ocurrida_en > now() - make_interval(days => $1) GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 8`, p),
    consulta<{ ocurrida_en: string; ip: string | null; ruta: string; navegador: string; sistema: string; dispositivo: string; visitante: string; total: number; referente: string | null }>(
      `SELECT v.ocurrida_en::text, host(v.ip) AS ip, v.ruta, v.navegador, v.sistema, v.dispositivo, left(v.visitante_id::text, 8) AS visitante,
              s.visitas AS total, v.referente
         FROM analitica.visita v JOIN analitica.visitante s ON s.id = v.visitante_id ORDER BY v.ocurrida_en DESC LIMIT 30`),
    consulta<{ rif: string; veces: number; valido: boolean; tipos: string | null; ultima: string }>(
      `SELECT rif, count(*)::int AS veces, bool_or(valido) AS valido, string_agg(DISTINCT tipo, ', ') AS tipos, max(ocurrida_en)::text AS ultima
         FROM analitica.rif_consultado WHERE ocurrida_en > now() - make_interval(days => $1) GROUP BY rif ORDER BY 2 DESC, 5 DESC LIMIT 15`, p),
    consulta<{ ocurrida_en: string; rif: string; valido: boolean; origen: string; herramienta: string; tipo: string | null; condiciones: string[]; ip: string | null }>(
      `SELECT ocurrida_en::text, rif, valido, origen, herramienta, tipo, condiciones, host(ip) AS ip FROM analitica.rif_consultado ORDER BY ocurrida_en DESC LIMIT 30`),
  ]);
  const visitantes = Number(k.visitantes), nuevos = Number(k.nuevos);
  const maximo = Math.max(1, ...porDia.map((d) => d.visitantes));
  const ANCHO = 100 / Math.max(1, porDia.length);
  const HERRAMIENTA: Record<string, string> = { deberes: "Mis deberes (web)", calendario: "Calendario (API)", rif: "Validar RIF (API)" };
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Visitas y RIF consultados</h1><span className={s.subtitulo}>Sitio público · cookie propia de visitante · datos personales: solo superadministrador · se borran a los 12 meses</span></div>
        <span style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {PERIODOS.map(([d, t]) => <Link key={d} href={`/admin/visitas?dias=${d}`} className={`boton boton-chico ${d === dias ? "boton-primario" : "boton-secundario"}`}>{t}</Link>)}
        </span>
      </div>

      <div className={s.kpis}>
        <div className={s.kpi}><span>Visitantes</span><span className={s.kpiValor}>{entero(visitantes)}</span><span className={`${s.kpiNota} t-apagado`}>navegadores distintos</span></div>
        <div className={s.kpi}><span>Páginas vistas</span><span className={s.kpiValor}>{entero(k.visitas)}</span><span className={`${s.kpiNota} t-apagado`}>{visitantes ? `${(Number(k.visitas) / visitantes).toFixed(1).replace(".", ",")} por visitante` : "—"}</span></div>
        <div className={s.kpi}><span>Visitantes nuevos</span><span className={s.kpiValor}>{entero(nuevos)}</span><span className={`${s.kpiNota} t-apagado`}>{visitantes ? `${Math.max(0, visitantes - nuevos)} volvieron` : "—"}</span></div>
        <div className={s.kpi}><span>RIF consultados</span><span className={s.kpiValor}>{entero(k.rif_unicos)}</span><span className={`${s.kpiNota} t-apagado`}>{entero(k.rif_consultas)} consultas</span></div>
      </div>

      <div className={s.panel}>
        <div className={s.panelCabeza}><strong>Visitantes por día</strong><span className={s.apagado}>Últimos {Math.min(dias, 90)} días · pase el cursor sobre una barra</span></div>
        <div className={s.panelCuerpo}>
          <svg viewBox="0 0 100 40" preserveAspectRatio="none" style={{ width: "100%", height: 160, display: "block" }} role="img"
            aria-label={`Visitantes por día: máximo ${maximo}`}>
            <line x1="0" x2="100" y1="40" y2="40" stroke="var(--linea)" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />
            {porDia.map((d, i) => {
              const alto = (d.visitantes / maximo) * 38;
              return (
                <rect key={d.dia} x={i * ANCHO + ANCHO * 0.12} width={ANCHO * 0.76} y={40 - alto} height={Math.max(alto, d.visitantes ? 0.6 : 0)} fill="var(--azul)" rx="0.4">
                  <title>{`${d.dia.slice(8, 10)}/${d.dia.slice(5, 7)}: ${d.visitantes} visitantes · ${d.visitas} páginas`}</title>
                </rect>
              );
            })}
          </svg>
          <span className={s.apagado} style={{ display: "flex", justifyContent: "space-between" }}>
            <span>{porDia[0] ? `${porDia[0].dia.slice(8, 10)}/${porDia[0].dia.slice(5, 7)}` : ""}</span><span>máx. {maximo} visitantes/día</span>
            <span>{porDia.at(-1) ? `${porDia.at(-1)!.dia.slice(8, 10)}/${porDia.at(-1)!.dia.slice(5, 7)}` : ""}</span>
          </span>
        </div>
      </div>

      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Páginas más vistas</strong></div>
          {paginas.length === 0 && <div className={s.vacio}>Sin visitas en el período.</div>}
          {paginas.map((x) => (
            <div key={x.ruta} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
              <span className="mono" style={{ fontSize: 13 }}>{x.ruta}</span><span className={s.apagado}>{x.visitantes} visitantes</span><span className="mono">{x.visitas}</span>
            </div>
          ))}
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>De dónde llegan</strong><span className={s.apagado}>Sin contar las visitas directas</span></div>
          {referentes.length === 0 && <div className={s.vacio}>Todas las visitas fueron directas.</div>}
          {referentes.map((x) => (
            <div key={x.origen} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span>{x.origen}</span><span className="mono">{x.visitas}</span></div>
          ))}
        </div>
      </div>

      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Dispositivos</strong></div>
          {dispositivos.map((x) => (
            <div key={x.dispositivo} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span>{x.dispositivo}</span><span className="mono">{x.visitantes}</span></div>
          ))}
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Navegadores</strong></div>
          {navegadores.map((x) => (
            <div key={`${x.navegador}-${x.sistema}`} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span>{x.navegador} · {x.sistema}</span><span className="mono">{x.visitantes}</span></div>
          ))}
        </div>
      </div>

      <div className={s.rejilla2}>
        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}><strong>RIF más consultados</strong></div>
          <table className={s.tabla} style={{ minWidth: 520 }}>
            <thead><tr><th>RIF</th><th>Veces</th><th>Tipo</th><th>Última</th></tr></thead>
            <tbody>
              {rifTop.length === 0 && <tr><td colSpan={4} className={s.apagado}>Sin consultas en el período.</td></tr>}
              {rifTop.map((x) => (
                <tr key={x.rif}>
                  <td className="mono" style={{ color: "var(--tinta)", fontWeight: 600 }}>{x.rif}{!x.valido && <span className="punto t-adicional" style={{ marginLeft: 8 }}>no válido</span>}</td>
                  <td className="mono">{x.veces}</td><td className={s.apagado}>{x.tipos ?? "—"}</td>
                  <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(x.ultima)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}><strong>RIF consultados recientemente</strong></div>
          <table className={s.tabla} style={{ minWidth: 560 }}>
            <thead><tr><th>Fecha</th><th>RIF</th><th>Herramienta</th><th>IP</th></tr></thead>
            <tbody>
              {rifRecientes.length === 0 && <tr><td colSpan={4} className={s.apagado}>Sin consultas todavía.</td></tr>}
              {rifRecientes.map((x, i) => (
                <tr key={i}>
                  <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(x.ocurrida_en)}</td>
                  <td className="mono" style={{ color: "var(--tinta)" }}>{x.rif}{!x.valido && <span className="punto t-adicional" style={{ marginLeft: 6 }}>no válido</span>}</td>
                  <td className={s.apagado}>{HERRAMIENTA[x.herramienta] ?? x.herramienta}{x.tipo ? ` · ${x.tipo.toLowerCase()}` : ""}{x.condiciones.length ? ` · ${x.condiciones.length} cond.` : ""}</td>
                  <td className="mono" style={{ fontSize: 12 }}>{x.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Visitas recientes</strong><span className={s.apagado}>Visitante = primeros 8 caracteres de su cookie</span></div>
        <table className={s.tabla} style={{ minWidth: 900 }}>
          <thead><tr><th>Fecha</th><th>IP</th><th>Página</th><th>Llegó desde</th><th>Navegador · sistema · dispositivo</th><th>Visitante</th></tr></thead>
          <tbody>
            {recientes.length === 0 && <tr><td colSpan={6} className={s.apagado}>Sin visitas todavía.</td></tr>}
            {recientes.map((x, i) => (
              <tr key={i}>
                <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(x.ocurrida_en)}</td>
                <td className="mono" style={{ fontSize: 12 }}>{x.ip ?? "—"}</td>
                <td className="mono" style={{ fontSize: 12, color: "var(--tinta)" }}>{x.ruta}</td>
                <td className={s.apagado} style={{ wordBreak: "break-all" }}>{x.referente ?? "directo"}</td>
                <td className={s.apagado}>{x.navegador} · {x.sistema} · {x.dispositivo}</td>
                <td className="mono" style={{ fontSize: 12 }}>{x.visitante} <span className={s.apagado}>({x.total} {x.total === 1 ? "visita" : "visitas"})</span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
