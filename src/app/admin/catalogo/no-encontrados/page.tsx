// Artículos que el clasificador de IVA no encontró: qué se consultó, cuántas veces y desde dónde (curaduría del catálogo)
import Link from "next/link";
import { consulta } from "../../../../core/db.ts";
import { requerirSeccion } from "../../../../core/auth/dal.ts";
import { puede } from "../../../../core/auth/roles.ts";
import { FormAccion } from "../../../../ui/admin/FormAccion.tsx";
import { entero, fechaHora, haceCuanto } from "../../../../ui/formato.ts";
import { accionMarcarRevisado } from "./acciones.ts";
import s from "../../../../ui/admin/admin.module.css";

export const metadata = { title: "Artículos no encontrados" };

interface Grupo { clave: string; ejemplo: string; codigos: string; veces: string; ultima: string; web: string; api: string; claves_api: string[]; revisado: boolean; regla: string | null; nota: string | null }
interface Consulta { consultado_en: string; texto: string | null; codigos: string[]; tipos_codigo: string[]; codigo_arancelario: string | null; producto_off: string | null;
  operacion: string; canal: string; api_key: string | null; ip: string | null; ubicacion: string | null; agente: string | null }

export default async function NoEncontrados({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const u = await requerirSeccion("catalogo");
  const edita = puede(u.rol, "catalogo.editar");
  const verRevisados = (await searchParams).ver === "revisados";
  const [grupos, recientes, [tot]] = await Promise.all([
    consulta<Grupo & Record<string, unknown>>(
      `SELECT coalesce(n.texto_normalizado, array_to_string(n.codigos, ',')) AS clave, min(coalesce(n.texto, array_to_string(n.codigos, ', '))) AS ejemplo,
              (array_agg(array_to_string(n.codigos, ', ') ORDER BY n.consultado_en DESC))[1] AS codigos, count(*) AS veces, max(n.consultado_en)::text AS ultima,
              count(*) FILTER (WHERE n.canal = 'web') AS web, count(*) FILTER (WHERE n.canal = 'api') AS api,
              array_remove(array_agg(DISTINCT 'rgl_' || k.prefijo), NULL) AS claves_api,
              bool_and(n.revisado) AS revisado, max(n.regla_asignada) AS regla, max(n.nota) AS nota
         FROM iva.articulo_no_encontrado n LEFT JOIN core.api_key k ON k.id = n.api_key_id
        WHERE n.revisado = $1 GROUP BY 1 ORDER BY count(*) DESC, max(n.consultado_en) DESC LIMIT 200`, [verRevisados]),
    consulta<Consulta & Record<string, unknown>>(
      `SELECT n.consultado_en::text, n.texto, n.codigos, n.tipos_codigo, n.codigo_arancelario, n.producto_off, n.operacion, n.canal,
              CASE WHEN k.id IS NULL THEN NULL ELSE 'rgl_' || k.prefijo || ' · ' || k.nombre END AS api_key, host(n.ip) AS ip, n.ubicacion, n.agente
         FROM iva.articulo_no_encontrado n LEFT JOIN core.api_key k ON k.id = n.api_key_id ORDER BY n.consultado_en DESC LIMIT 30`),
    consulta<{ total: string; pendientes: string; hoy: string }>(
      `SELECT count(*) AS total, count(*) FILTER (WHERE NOT revisado) AS pendientes,
              count(*) FILTER (WHERE consultado_en >= (now() AT TIME ZONE 'America/Caracas')::date AT TIME ZONE 'America/Caracas') AS hoy
         FROM iva.articulo_no_encontrado`),
  ]);
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Artículos no encontrados</h1>
          <span className={s.subtitulo}>Consultas que el clasificador de IVA no pudo determinar: qué se buscó y desde dónde · {entero(tot.pendientes)} pendientes de {entero(tot.total)} · {entero(tot.hoy)} hoy</span></div>
        <Link href="/admin/catalogo" className="boton boton-secundario boton-chico">Volver al catálogo</Link>
      </div>
      {!edita && <div className={s.soloLectura}>Modo solo lectura: puedes consultar, pero no marcar como revisado.</div>}
      <nav className={s.pestanas} aria-label="Estado">
        <Link href="/admin/catalogo/no-encontrados" aria-current={!verRevisados}>Pendientes</Link>
        <Link href="/admin/catalogo/no-encontrados?ver=revisados" aria-current={verRevisados}>Revisados</Link>
      </nav>
      <div className={s.tablaMarco}>
        <table className={s.tabla} style={{ minWidth: 900 }}>
          <thead><tr><th>Artículo consultado</th><th>Veces</th><th>Desde</th><th>Última consulta</th><th>{verRevisados ? "Regla asignada" : "Curaduría"}</th></tr></thead>
          <tbody>
            {grupos.length === 0 && <tr><td colSpan={5} className={s.apagado}>{verRevisados ? "Nada revisado todavía." : "No hay artículos pendientes: el clasificador encontró todo lo consultado."}</td></tr>}
            {grupos.map((g) => (
              <tr key={g.clave}>
                <td><span className={s.celdaNombre}><strong>{g.ejemplo}</strong>{g.codigos && g.ejemplo !== g.codigos && <span className="mono">{g.codigos}</span>}</span></td>
                <td className="mono" style={{ color: "var(--tinta)", fontWeight: 600 }}>{entero(g.veces)}</td>
                <td style={{ fontSize: 13, color: "var(--texto-2)" }}>
                  {Number(g.web) > 0 && <span style={{ display: "block" }}>Sitio web · {g.web}</span>}
                  {Number(g.api) > 0 && <span style={{ display: "block" }}>API · {g.api}{g.claves_api.length ? ` (${g.claves_api.slice(0, 3).join(", ")})` : ""}</span>}
                </td>
                <td className={s.apagado} title={fechaHora(g.ultima)}>{haceCuanto(g.ultima)}</td>
                <td>
                  {verRevisados ? <span style={{ fontSize: 13 }}>{g.regla ? <Link href={`/admin/catalogo?regla=${g.regla}`}>{g.regla}</Link> : "—"}{g.nota ? ` · ${g.nota}` : ""}</span>
                    : edita ? (
                      <FormAccion accion={accionMarcarRevisado} boton="Marcar revisado" estiloBoton="secundario" className="">
                        <input type="hidden" name="clave" value={g.clave} />
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 6 }}>
                          <input className={`${s.campoChico} ${s.campoMono}`} name="regla" placeholder="Regla (opcional)" style={{ width: 150, padding: "6px 8px" }} aria-label="Regla asignada" />
                          <input className={s.campoChico} name="nota" placeholder="Nota" style={{ width: 160, padding: "6px 8px" }} aria-label="Nota" />
                        </div>
                      </FormAccion>
                    ) : <span className={s.apagado}>Pendiente</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Últimas consultas no encontradas</strong><span className={s.apagado}>Detalle de origen</span></div>
        <table className={s.tabla} style={{ minWidth: 980 }}>
          <thead><tr><th>Fecha</th><th>Consultado</th><th>Operación</th><th>Canal</th><th>IP</th><th>Ubicación</th><th>Cliente</th></tr></thead>
          <tbody>
            {recientes.length === 0 && <tr><td colSpan={7} className={s.apagado}>Sin registros.</td></tr>}
            {recientes.map((r, i) => (
              <tr key={i}>
                <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(r.consultado_en)}</td>
                <td><span className={s.celdaNombre}><strong>{r.texto ?? "—"}</strong>
                  {r.codigos.length > 0 && <span className="mono">{r.codigos.map((c, k) => `${c} (${r.tipos_codigo[k] ?? "?"})`).join(", ")}</span>}
                  {r.codigo_arancelario && <span className="mono">arancel {r.codigo_arancelario}</span>}
                  {r.producto_off && <span>Open Food Facts: {r.producto_off}</span>}</span></td>
                <td style={{ fontSize: 13 }}>{r.operacion === "importacion" ? "importación" : "nacional"}</td>
                <td style={{ fontSize: 13 }}>{r.canal === "web" ? "Sitio web" : `API${r.api_key ? ` · ${r.api_key}` : ""}`}</td>
                <td className={s.monoChico}>{r.ip ?? "—"}</td>
                <td style={{ fontSize: 13 }}>{r.ubicacion ?? "—"}</td>
                <td className={s.apagado} title={r.agente ?? undefined} style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.agente ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <span className="aviso-legal">La IP se registra solo cuando la aplicación está detrás del proxy (TRUST_PROXY=1), como en producción. Se usa para saber desde dónde se consulta y detectar abusos; no se publica.</span>
    </div>
  );
}
