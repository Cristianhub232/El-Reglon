// Noticiero: estado de las fuentes, lecturas horarias (noticias-programador), titulares recientes y moderación
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { fechaHora, haceCuanto } from "../../../ui/formato.ts";
import { accionActivarFuente, accionLeerAhora, accionOcultarTitular } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Noticiero" };

const METODOS = { rss: "RSS", wordpress: "API de WordPress", worldnews: "WorldNewsAPI" } as const;

interface Fuente { id: string; nombre: string; sitio: string; metodo: keyof typeof METODOS; activa: boolean; ultima_lectura: string | null;
  ultimo_exito: string | null; ultimo_error: string | null; errores_seguidos: number; h24: number; total: number; con_imagen: number }

export default async function Noticiero({ searchParams }: { searchParams: Promise<{ fuente?: string; ocultos?: string }> }) {
  const u = await requerirSeccion("noticias");
  const gestiona = puede(u.rol, "noticias.gestionar");
  const sp = await searchParams;
  const filtro = sp.fuente && /^[a-z0-9-]{1,40}$/.test(sp.fuente) ? sp.fuente : null;
  const ocultos = sp.ocultos === "1";
  const [fuentes, lecturas, titulares, [k]] = await Promise.all([
    consulta<Fuente & Record<string, unknown>>(
      `SELECT f.id, f.nombre, f.sitio, f.metodo, f.activa, f.ultima_lectura::text, f.ultimo_exito::text, f.ultimo_error, f.errores_seguidos,
              count(a.id) FILTER (WHERE a.publicado_en > now() - interval '24 hours' AND a.visible)::int AS h24,
              count(a.id)::int AS total, count(a.imagen)::int AS con_imagen
         FROM noticias.fuente f LEFT JOIN noticias.articulo a ON a.fuente_id = f.id GROUP BY f.id ORDER BY f.orden`),
    consulta<{ id: number; origen: string; iniciada: string; terminada: string | null; nuevos: number; actualizados: number; errores: number; cuota: number | null }>(
      `SELECT id::int, origen, iniciada::text, terminada::text, nuevos, actualizados, errores, (detalle->>'cuota_worldnews')::numeric::float AS cuota
         FROM noticias.lectura ORDER BY iniciada DESC LIMIT 12`),
    consulta<{ id: number; fuente: string; titulo: string; url: string; publicado_en: string; visible: boolean; ocultado_por: string | null; imagen: boolean }>(
      `SELECT a.id::int, f.nombre AS fuente, a.titulo, a.url, a.publicado_en::text, a.visible, a.ocultado_por, a.imagen IS NOT NULL AS imagen
         FROM noticias.articulo a JOIN noticias.fuente f ON f.id = a.fuente_id
        WHERE ($1::text IS NULL OR a.fuente_id = $1) AND ($2 = false OR NOT a.visible)
        ORDER BY a.publicado_en DESC LIMIT 40`, [filtro, ocultos]),
    consulta<{ h24: string; ocultos: string; ultima: string | null; cuota: number | null }>(
      `SELECT (SELECT count(*) FROM noticias.articulo WHERE visible AND publicado_en > now() - interval '24 hours') AS h24,
              (SELECT count(*) FROM noticias.articulo WHERE NOT visible) AS ocultos,
              (SELECT max(terminada)::text FROM noticias.lectura) AS ultima,
              (SELECT (detalle->>'cuota_worldnews')::numeric::float FROM noticias.lectura WHERE detalle->>'cuota_worldnews' IS NOT NULL ORDER BY iniciada DESC LIMIT 1) AS cuota`),
  ]);
  const conError = fuentes.filter((f) => f.activa && f.ultimo_error);
  const enlace = (c: Record<string, string | null>) => {
    const p = new URLSearchParams(Object.entries({ fuente: filtro, ocultos: ocultos ? "1" : null, ...c }).filter(([, v]) => v) as [string, string][]);
    return `/admin/noticias${p.size ? `?${p}` : ""}`;
  };
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Noticiero</h1><span className={s.subtitulo}>Titulares de medios venezolanos · se leen cada hora (noticias-programador) · <Link href="/noticias">ver página pública</Link></span></div>
        {gestiona && <FormAccion accion={accionLeerAhora} boton="Leer ahora" className="">{null}</FormAccion>}
      </div>
      {!gestiona && <div className={s.soloLectura}>Modo solo lectura: puedes consultar el noticiero, pero no moderarlo.</div>}

      <div className={s.kpis}>
        <div className={s.kpi}><span>Titulares en 24 horas</span><span className={s.kpiValor}>{k.h24}</span><span className={`${s.kpiNota} t-apagado`}>visibles en la portada y la API</span></div>
        <div className={s.kpi}><span>Última lectura</span><span className={s.kpiValor} style={{ fontSize: 26 }}>{haceCuanto(k.ultima)}</span><span className={`${s.kpiNota} t-apagado`}>{k.ultima ? fechaHora(k.ultima) : "todavía no se ha leído"}</span></div>
        <div className={s.kpi}><span>Fuentes con error</span><span className={s.kpiValor}>{conError.length}</span><span className={`${s.kpiNota} ${conError.length ? "t-adicional" : "t-exento"}`}>{conError.length ? conError.map((f) => f.nombre).join(", ") : "todas responden"}</span></div>
        <div className={s.kpi}><span>Cuota de WorldNewsAPI</span><span className={s.kpiValor}>{k.cuota === null ? "—" : Math.floor(k.cuota)}</span><span className={`${s.kpiNota} t-apagado`}>puntos restantes hoy (de 50)</span></div>
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Fuentes · {fuentes.length}</strong><span className={s.apagado}>Solo se aceptan enlaces del dominio de cada medio</span></div>
        <table className={s.tabla} style={{ minWidth: 980 }}>
          <thead><tr><th>Medio</th><th>Lectura</th><th>Estado</th><th>Último éxito</th><th>24 h</th><th>Con imagen</th>{gestiona && <th></th>}</tr></thead>
          <tbody>
            {fuentes.map((f) => (
              <tr key={f.id} style={{ opacity: f.activa ? 1 : 0.6 }}>
                <td><span className={s.celdaNombre}><strong><Link href={enlace({ fuente: f.id })} style={{ color: "inherit" }}>{f.nombre}</Link></strong><span>{f.sitio.replace("https://", "")}</span></span></td>
                <td className={s.apagado}>{METODOS[f.metodo]}</td>
                <td style={{ maxWidth: 320 }}>
                  {!f.activa ? <span className="punto t-apagado">pausada</span>
                    : f.ultimo_error ? <span className="punto t-adicional" style={{ whiteSpace: "normal", alignItems: "baseline" }} title={f.ultimo_error}>error{f.errores_seguidos > 1 ? ` (${f.errores_seguidos} seguidos)` : ""}: {f.ultimo_error.replace(/\. Please read .*$/, "").slice(0, 90)}</span>
                    : f.ultimo_exito ? <span className="punto t-exento">responde</span> : <span className="punto t-apagado">sin leer</span>}
                </td>
                <td className={s.apagado} title={f.ultimo_exito ? fechaHora(f.ultimo_exito) : undefined}>{haceCuanto(f.ultimo_exito)}</td>
                <td className="mono">{f.h24}</td>
                <td className="mono" style={{ color: "var(--texto-3)" }}>{f.total ? `${Math.round((f.con_imagen / f.total) * 100)} %` : "—"}</td>
                {gestiona && (
                  <td><span style={{ display: "flex", gap: 12, justifyContent: "flex-end", alignItems: "center" }}>
                    {f.activa && <FormAccion accion={accionLeerAhora} boton="Leer" estiloBoton="texto" className=""><input type="hidden" name="fuente" value={f.id} /></FormAccion>}
                    <FormAccion accion={accionActivarFuente} boton={f.activa ? "Pausar" : "Reactivar"} estiloBoton={f.activa ? "peligro" : "texto"} className=""
                      confirmar={f.activa ? `¿Pausar ${f.nombre}? Sus titulares dejan de mostrarse y no se vuelve a leer hasta reactivarla.` : undefined}>
                      <input type="hidden" name="fuente" value={f.id} />
                    </FormAccion>
                  </span></td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={s.rejilla2}>
        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}>
            <strong>Titulares recientes{filtro ? ` · ${fuentes.find((f) => f.id === filtro)?.nombre ?? filtro}` : ""}{ocultos ? " · ocultos" : ""}</strong>
            <span style={{ display: "flex", gap: 12, fontSize: 14 }}>
              {(filtro || ocultos) && <Link href="/admin/noticias">Todos</Link>}
              {!ocultos && <Link href={enlace({ ocultos: "1" })}>Ocultos ({k.ocultos})</Link>}
            </span>
          </div>
          {titulares.length === 0 && <div className={s.vacio}>{ocultos ? "No hay titulares ocultos." : "Todavía no hay titulares."}</div>}
          {titulares.map((t) => (
            <div key={t.id} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto", opacity: t.visible ? 1 : 0.6 }}>
              <span className={s.celdaNombre}>
                <a href={t.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--tinta)", fontWeight: 600, fontSize: 14 }}>{t.titulo}</a>
                <span>{t.fuente} · {haceCuanto(t.publicado_en)}{t.imagen ? "" : " · sin imagen"}{!t.visible && t.ocultado_por ? ` · oculto por ${t.ocultado_por}` : ""}</span>
              </span>
              {gestiona ? (
                <FormAccion accion={accionOcultarTitular} boton={t.visible ? "Ocultar" : "Mostrar"} estiloBoton={t.visible ? "peligro" : "texto"} className="">
                  <input type="hidden" name="id" value={t.id} />
                </FormAccion>
              ) : <span />}
            </div>
          ))}
        </div>

        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Lecturas recientes</strong></div>
          {lecturas.length === 0 && <div className={s.vacio}>Sin lecturas todavía.</div>}
          {lecturas.map((l) => (
            <div key={l.id} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span className={s.celdaNombre}>
                <strong style={{ fontWeight: 500, fontSize: 13, color: "var(--texto-2)" }}>{fechaHora(l.iniciada)} · {l.origen.startsWith("panel:") ? `panel (${l.origen.slice(6)})` : l.origen}</strong>
                <span>{l.terminada ? `${l.nuevos} nuevos · ${l.actualizados} actualizados${l.cuota !== null ? ` · cuota ${Math.floor(l.cuota)}` : ""}` : "sin terminar"}</span>
              </span>
              {l.errores ? <span className="punto t-adicional">{l.errores} con error</span> : l.terminada ? <span className="punto t-exento">sin errores</span> : <span />}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
