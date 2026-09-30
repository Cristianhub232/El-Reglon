// Catálogo legal de IVA (resources/Admin.dc.html · CATÁLOGO IVA): reglas por artículo, edición con Gaceta y motivo,
// casos de referencia antes de guardar e historial de versiones.
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { hoyCaracas } from "../../../core/validacion.ts";
import { alicuotaVigente, catalogo, invalidarCatalogo, type CatalogoIva } from "../../../modules/iva/catalogo.ts";
import type { ReglaCatalogo } from "../../../modules/iva/motor.ts";
import { normalizar } from "../../../modules/iva/normalizar.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { citaCorta, claseCategoria, etiquetaTasa, fechaHora } from "../../../ui/formato.ts";
import { accionEditarRegla } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";
import c from "../../../ui/admin/catalogo.module.css";

export const metadata = { title: "Catálogo legal IVA" };

const ARTICULOS = ["16", "18", "19", "61", "64"];
const articulos = (r: ReglaCatalogo) => new Set(r.opciones.flatMap((o) => o.base_legal).map((b) => /^LIVA-(\d+)/.exec(b)?.[1]).filter(Boolean) as string[]);

function Chip({ r, cat }: { r: ReglaCatalogo; cat: CatalogoIva }) {
  const categorias = [...new Set(r.opciones.map((o) => o.categoria))];
  if (categorias.length > 1) return <span className="punto punto-mono t-condicionado">Multiopción</span>;
  const k = categorias[0];
  const total = cat.categorias.get(k)?.componentes.reduce((sum, x) => sum + Number(alicuotaVigente(cat, x, hoyCaracas())?.porcentaje ?? 0), 0);
  return <span className={`punto punto-mono t-${claseCategoria(k)}`}>{etiquetaTasa(k, total === undefined ? null : String(total))}</span>;
}

export default async function Catalogo({ searchParams }: { searchParams: Promise<{ regla?: string; art?: string; q?: string }> }) {
  const u = await requerirSeccion("catalogo");
  const edita = puede(u.rol, "catalogo.editar");
  const { regla: rid, art, q } = await searchParams;
  invalidarCatalogo();
  const cat = await catalogo();
  const [[casos], [ediciones], [noEncontrados]] = await Promise.all([
    consulta<{ n: string }>("SELECT count(*) AS n FROM iva.caso_prueba"),
    consulta<{ n: string }>(`SELECT count(*) AS n FROM (SELECT DISTINCT ON (regla_id) origen FROM iva.regla_historial ORDER BY regla_id, version DESC) x WHERE origen = 'panel'`),
    consulta<{ n: string }>("SELECT count(DISTINCT coalesce(texto_normalizado, array_to_string(codigos, ','))) AS n FROM iva.articulo_no_encontrado WHERE NOT revisado"),
  ]);
  const nq = q ? normalizar(q) : "";
  const lista = cat.reglas.filter((r) => (!art || articulos(r).has(art)) && (!nq || normalizar(`${r.id} ${r.nombre}`).includes(nq)));
  const sel = cat.reglas.find((r) => r.id === rid) ?? lista[0] ?? cat.reglas[0];
  const historial = await consulta<{ version: number; ocurrido_en: string; actor: string; origen: string; gaceta: string | null; motivo: string }>(
    "SELECT version, ocurrido_en::text, actor, origen, gaceta, motivo FROM iva.regla_historial WHERE regla_id = $1 ORDER BY version DESC LIMIT 6", [sel.id]);
  const version = historial[0]?.version ?? 1;
  const enlace = (p: Record<string, string | undefined>) => {
    const sp = new URLSearchParams(Object.entries({ art, q, ...p }).filter(([, v]) => v) as [string, string][]);
    return `/admin/catalogo${sp.size ? `?${sp}` : ""}`;
  };
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Catálogo legal de IVA</h1>
          <span className={s.subtitulo}>{cat.reglas.length} reglas · {casos.n} casos de referencia · versión {cat.version}</span></div>
        <Link href="/admin/catalogo/no-encontrados" className="boton boton-secundario boton-chico">Artículos no encontrados · {noEncontrados.n}</Link>
        {cat.estado === "validado" ? <span className="punto t-exento" style={{ fontSize: 14, fontWeight: 600 }}>Validado por el asesor</span>
          : <span className="punto t-condicionado" style={{ fontSize: 14, fontWeight: 600 }}>Pendiente de validación por el asesor</span>}
      </div>
      {!edita && <div className={s.soloLectura}>Modo solo lectura: puedes consultar el catálogo, pero no editarlo.</div>}
      {Number(ediciones.n) > 0 && (
        <div className={s.soloLectura}>{ediciones.n} {Number(ediciones.n) === 1 ? "regla editada" : "reglas editadas"} en el panel y no exportadas al archivo del catálogo. Expórtalas con <span className="mono">node scripts/iva-exportar-catalogo.ts</span> antes de recargar el catálogo.</div>
      )}
      <div className={c.rejilla}>
        <div className={s.panel}>
          <div className={c.filtros}>
            <nav className={s.pestanas} aria-label="Filtrar por artículo" style={{ borderBottom: 0 }}>
              <Link href={enlace({ art: undefined, regla: undefined })} aria-current={!art}>Todas · {cat.reglas.length}</Link>
              {ARTICULOS.map((a) => <Link key={a} href={enlace({ art: a, regla: undefined })} aria-current={art === a}>art. {a}</Link>)}
            </nav>
            <form action="/admin/catalogo" className={c.filtro}>
              {art && <input type="hidden" name="art" value={art} />}
              <input className={s.campoChico} name="q" defaultValue={q} placeholder="Filtrar por nombre o id" aria-label="Filtrar reglas" />
            </form>
          </div>
          <div className={c.lista}>
            {lista.length === 0 && <div className={s.vacio}>Ninguna regla coincide.</div>}
            {lista.map((r) => (
              <Link key={r.id} href={enlace({ regla: r.id })} className={`${c.item} ${r.id === sel.id ? c.itemActivo : ""}`} aria-current={r.id === sel.id ? "true" : undefined}>
                <span className={c.itemId}>{r.id}{r.zona_gris ? " · zona gris" : ""}</span>
                <span className={c.itemChip}><Chip r={r} cat={cat} /></span>
                <span className={c.itemNombre}>{r.nombre}</span>
              </Link>
            ))}
          </div>
        </div>

        <div className={s.panel}>
          <div className={s.panelCabeza}>
            <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
              <span className={c.itemId}>{sel.id} · v{version} · {sel.tipo === "BIEN" ? "bien" : "servicio"}</span>
              <strong style={{ font: "600 20px var(--serif)", color: "var(--tinta)" }}>{sel.nombre}</strong>
            </div>
            <Chip r={sel} cat={cat} />
          </div>
          <div className={s.panelCuerpo}>
            <div className={c.opciones}>
              <span className={c.subtitulo}>Opciones fiscales</span>
              {sel.opciones.map((o, i) => (
                <div key={i} className={c.opcion}>
                  <span className={`punto punto-mono t-${claseCategoria(o.categoria)}`}>{cat.categorias.get(o.categoria)?.denominacion}</span>
                  <span>{o.condicion ?? "Sin condición"}</span>
                  <span className="mono" style={{ fontSize: 13, color: "var(--azul)" }}>{o.base_legal.map((b) => { const bl = cat.base_legal.get(b); return bl ? citaCorta(bl) : b; }).join(" · ")}</span>
                  <span className={s.apagado}>Renglón Forma 30: {cat.categorias.get(o.categoria)?.concepto_nacional}</span>
                </div>
              ))}
            </div>
            <FormAccion accion={accionEditarRegla} boton={`Guardar como v${version + 1}`} limpiar={false}
              extra={edita ? <button type="reset" className={s.botonTexto}>Descartar</button> : undefined}>
              <input type="hidden" name="regla" value={sel.id} />
              <fieldset disabled={!edita} className={c.campos}>
                <label className={s.etiquetaChica}><span>Expresiones de inclusión <span className={s.apagado}>(una por línea)</span></span>
                  <textarea className={`${s.campoChico} ${s.campoMono}`} name="incluir" rows={Math.min(6, Math.max(2, sel.patrones_incluir.length + 1))} defaultValue={sel.patrones_incluir.join("\n")} spellCheck={false} /></label>
                <label className={s.etiquetaChica}><span>Expresiones de exclusión</span>
                  <textarea className={`${s.campoChico} ${s.campoMono}`} name="excluir" rows={Math.min(6, Math.max(2, sel.patrones_excluir.length + 1))} defaultValue={sel.patrones_excluir.join("\n")} spellCheck={false} /></label>
                <label className={s.etiquetaChica}><span>Deben coincidir todas <span className={s.apagado}>(opcional)</span></span>
                  <textarea className={`${s.campoChico} ${s.campoMono}`} name="todos" rows={2} defaultValue={sel.patrones_todos.join("\n")} spellCheck={false} /></label>
                <div className={s.formularioFila}>
                  <label className={s.etiquetaChica}><span>Prioridad (1–100)</span><input className={`${s.campoChico} ${s.campoMono}`} type="number" name="prioridad" min={1} max={100} defaultValue={sel.prioridad} /></label>
                  <label className={s.etiquetaChica}><span>Nota</span><input className={s.campoChico} name="nota" defaultValue={sel.nota ?? ""} /></label>
                </div>
                {edita && <>
                  <label className={s.etiquetaChica}><span>Gaceta Oficial <span className={s.obligatorio}>*</span></span>
                    <input className={s.campoChico} name="gaceta" placeholder="Número y fecha de la Gaceta que respalda el cambio" required /></label>
                  <label className={s.etiquetaChica}><span>Motivo del cambio <span className={s.obligatorio}>*</span></span>
                    <textarea className={s.campoChico} name="motivo" rows={2} placeholder="Queda registrado en la auditoría" required /></label>
                  <span className={s.apagado}>Antes de guardar se ejecutan los {casos.n} casos de referencia con la regla modificada: si alguno falla, el cambio no se guarda.</span>
                </>}
              </fieldset>
            </FormAccion>
          </div>
          <div className={c.historial}>
            <span className={c.subtitulo}>Historial de versiones</span>
            {historial.length === 0 && <span className={s.apagado}>Sin historial.</span>}
            {historial.map((h) => (
              <div key={h.version} className={c.version}>
                <span className="mono" style={{ fontWeight: 600, color: "var(--tinta)" }}>v{h.version}</span>
                <span className="mono" style={{ color: "var(--texto-4)" }}>{fechaHora(h.ocurrido_en).slice(0, 10)}</span>
                <span><strong>{h.actor}</strong> · {h.motivo}{h.gaceta ? ` · ${h.gaceta}` : ""}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
