// Comparador de precios: estado de cada tienda (servicio bajo PM2 y última respuesta), qué se busca y qué no se encuentra
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { credencialInterna } from "../../../modules/comparador/servicio.ts";
import { TIENDAS } from "../../../modules/comparador/tiendas.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { entero, fechaHora, haceCuanto } from "../../../ui/formato.ts";
import { accionActivarTienda } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Comparador de precios" };

const PLATAFORMAS: Record<string, string> = { vtex: "VTEX (API de catálogo)", woocommerce: "WooCommerce (página de búsqueda)", alacena: "Página de búsqueda", magento: "Magento (API GraphQL)",
  shopify: "Shopify (búsqueda pública)", woostore: "WooCommerce (API de tienda)", kromi: "Búsqueda de su página",
  farmatodo: "Índice por sitemap", plansuarez: "Índice por sitemap", gama: "Índice por sitemap (API de producto)" };

async function salud(puerto: number): Promise<{ ok: boolean; cache?: number; en_curso?: number }> {
  try {
    const credencial = credencialInterna();
    const r = await fetch(`http://${process.env.COMPARADOR_HOST ?? "127.0.0.1"}:${puerto}/salud`, {
      headers: credencial ? { "x-comparador": credencial } : {}, signal: AbortSignal.timeout(2_000), cache: "no-store" });
    return r.ok ? { ok: true, ...(await r.json()) } : { ok: false };
  } catch { return { ok: false }; }
}

export default async function ComparadorAdmin() {
  const u = await requerirSeccion("comparador");
  const gestiona = puede(u.rol, "comparador.gestionar");
  const [estado, [k], masBuscadas, sinResultados, recientes, servicios, indices] = await Promise.all([
    consulta<{ id: string; activa: boolean; ultima_respuesta: string | null; ultimo_error: string | null; ultimo_error_en: string | null; errores_seguidos: number; productos: number; con_ean: number }>(
      `SELECT t.id, t.activa, t.ultima_respuesta::text, t.ultimo_error, t.ultimo_error_en::text, t.errores_seguidos,
              (SELECT count(*)::int FROM comparador.producto p JOIN comparador.sucursal su ON su.id = p.sucursal_id WHERE su.tienda_id = t.id) AS productos,
              (SELECT count(*)::int FROM comparador.producto p JOIN comparador.sucursal su ON su.id = p.sucursal_id WHERE su.tienda_id = t.id AND p.ean IS NOT NULL) AS con_ean
         FROM comparador.tienda t`).catch(() => []),
    consulta<{ hoy: string; semana: string; productos: string; precios: string; sin: string }>(
      `SELECT (SELECT count(*) FROM comparador.busqueda WHERE realizada_en >= current_date) AS hoy,
              (SELECT count(*) FROM comparador.busqueda WHERE realizada_en > now() - interval '7 days') AS semana,
              (SELECT count(*) FROM comparador.producto) AS productos, (SELECT count(*) FROM comparador.precio) AS precios,
              (SELECT count(*) FROM comparador.busqueda WHERE realizada_en > now() - interval '7 days' AND grupos = 0) AS sin`),
    consulta<{ termino: string; veces: number; grupos: number }>(
      `SELECT lower(termino) AS termino, count(*)::int AS veces, round(avg(grupos))::int AS grupos FROM comparador.busqueda
        WHERE realizada_en > now() - interval '7 days' GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`),
    consulta<{ termino: string; veces: number }>(
      `SELECT lower(termino) AS termino, count(*)::int AS veces FROM comparador.busqueda
        WHERE realizada_en > now() - interval '30 days' AND grupos = 0 GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 12`),
    consulta<{ termino: string; origen: string; ofertas: number; grupos: number; tiendas_ok: number; tiendas_error: number; duracion_ms: number; realizada_en: string }>(
      "SELECT termino, origen, ofertas, grupos, tiendas_ok, tiendas_error, duracion_ms, realizada_en::text FROM comparador.busqueda ORDER BY realizada_en DESC LIMIT 15"),
    Promise.all(TIENDAS.map((t) => salud(t.puerto))),
    consulta<{ tienda_id: string; urls: number; leidas: number; dia: number; pausa_ms: number; sitemap: string | null; espera: string | null; errores_seguidos: number; ultimo_error: string | null; robots: number }>(
      `SELECT e.tienda_id, e.urls, e.pausa_ms, e.sitemap_leido_en::text AS sitemap, e.en_espera_hasta::text AS espera, e.errores_seguidos, e.ultimo_error,
              (SELECT count(*)::int FROM comparador.indice_url u WHERE u.tienda_id = e.tienda_id AND u.en_sitemap AND u.estado = 'ok') AS leidas,
              (SELECT count(*)::int FROM comparador.indice_url u WHERE u.tienda_id = e.tienda_id AND u.en_sitemap AND u.ultimo_ok > now() - interval '1 day') AS dia,
              (SELECT count(*)::int FROM comparador.indice_url u WHERE u.tienda_id = e.tienda_id AND u.estado = 'robots') AS robots
         FROM comparador.indice_estado e`).catch(() => []),
  ]);
  const indicePor = new Map(indices.map((x) => [x.tienda_id, x]));
  const porId = new Map(estado.map((e) => [e.id, e]));
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Comparador de precios</h1><span className={s.subtitulo}>Un servicio por tienda bajo PM2 (contenedor «comparador») · búsqueda en vivo · <a href="/#comparador">ver en la portada</a></span></div>
      </div>
      {!gestiona && <div className={s.soloLectura}>Modo solo lectura: puedes consultar el comparador, pero no pausar tiendas.</div>}

      <div className={s.kpis}>
        <div className={s.kpi}><span>Búsquedas hoy</span><span className={s.kpiValor}>{entero(k?.hoy ?? 0)}</span><span className={`${s.kpiNota} t-apagado`}>{entero(k?.semana ?? 0)} en 7 días</span></div>
        <div className={s.kpi}><span>Productos registrados</span><span className={s.kpiValor}>{entero(k?.productos ?? 0)}</span><span className={`${s.kpiNota} t-apagado`}>los que devolvieron las búsquedas</span></div>
        <div className={s.kpi}><span>Precios en el historial</span><span className={s.kpiValor}>{entero(k?.precios ?? 0)}</span><span className={`${s.kpiNota} t-apagado`}>uno por cambio o por día</span></div>
        <div className={s.kpi}><span>Búsquedas sin resultado</span><span className={s.kpiValor}>{entero(k?.sin ?? 0)}</span><span className={`${s.kpiNota} t-apagado`}>en 7 días</span></div>
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Tiendas · {TIENDAS.length}</strong><span className={s.apagado}>Registro en datos/comparador/tiendas.json</span></div>
        <table className={s.tabla} style={{ minWidth: 980 }}>
          <thead><tr><th>Tienda</th><th>Plataforma</th><th>Servicio</th><th>Última respuesta</th><th>Productos</th>{gestiona && <th></th>}</tr></thead>
          <tbody>
            {TIENDAS.map((t, i) => {
              const e = porId.get(t.id), sv = servicios[i], activa = e?.activa ?? true;
              const errorReciente = e?.ultimo_error && (!e.ultima_respuesta || (e.ultimo_error_en ?? "") > e.ultima_respuesta);
              return (
                <tr key={t.id} style={{ opacity: activa ? 1 : 0.6 }}>
                  <td><span className={s.celdaNombre}><strong>{t.nombre}</strong><span>{t.sitio.replace("https://", "")} · {t.rubros.join(", ")} · publica en {t.moneda === "VES" ? "Bs." : "US$"}{t.sucursales?.length ? ` · ${t.sucursales.length} sedes` : ""}{t.ubicacion ? ` · ${t.ubicacion.ciudad}` : ""}</span></span></td>
                  <td className={s.apagado}>{PLATAFORMAS[t.plataforma] ?? t.plataforma}</td>
                  <td style={{ maxWidth: 300 }}>
                    {!sv.ok ? <span className="punto t-adicional">sin respuesta (pm2 · puerto {t.puerto})</span>
                      : !activa ? <span className="punto t-apagado">pausada</span>
                      : errorReciente ? <span className="punto t-condicionado" style={{ whiteSpace: "normal" }} title={e!.ultimo_error!}>la tienda falló: {e!.ultimo_error!.slice(0, 80)}</span>
                      : <span className="punto t-exento">en línea{sv.cache ? ` · ${sv.cache} en caché` : ""}</span>}
                  </td>
                  <td className={s.apagado} title={e?.ultima_respuesta ? fechaHora(e.ultima_respuesta) : undefined}>{haceCuanto(e?.ultima_respuesta ?? null)}</td>
                  <td className="mono">{t.indice && (() => {
                    const x = indicePor.get(t.id);
                    if (!x) return <span className={s.apagado} style={{ display: "block", fontFamily: "var(--sans)" }}>índice: empezando…</span>;
                    const vuelta = x.urls && x.pausa_ms ? (x.urls * x.pausa_ms) / 3_600_000 : null;
                    return <span className={s.apagado} style={{ display: "block", fontFamily: "var(--sans)" }}>
                      índice: {entero(x.leidas)} de {entero(x.urls)} páginas · {entero(x.dia)} en 24 h{vuelta ? ` · vuelta completa ≈ ${vuelta < 1 ? "< 1" : Math.round(vuelta)} h` : ""}
                      {x.robots ? ` · ${x.robots} vetadas por robots.txt` : ""}{x.espera && Date.parse(x.espera) > Date.now() ? ` · en espera por error (${x.ultimo_error?.slice(0, 60)})` : ""}
                    </span>;
                  })()}
                  {entero(e?.productos ?? 0)}{e?.productos ? <span className={s.apagado}> · {Math.round((e.con_ean / e.productos) * 100)} % con EAN</span> : null}</td>
                  {gestiona && (
                    <td>
                      <FormAccion accion={accionActivarTienda} boton={activa ? "Pausar" : "Reactivar"} estiloBoton={activa ? "peligro" : "texto"} className=""
                        confirmar={activa ? `¿Pausar ${t.nombre}? Deja de consultarse en la portada y en la API.` : undefined}>
                        <input type="hidden" name="tienda" value={t.id} />
                      </FormAccion>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Lo más buscado · 7 días</strong></div>
          {masBuscadas.length === 0 && <div className={s.vacio}>Sin búsquedas todavía.</div>}
          {masBuscadas.map((b) => (
            <div key={b.termino} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto auto" }}>
              <span>{b.termino}</span><span className={s.apagado}>{b.grupos} productos</span><span className="mono">{b.veces}</span>
            </div>
          ))}
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Buscado sin resultado · 30 días</strong><span className={s.apagado}>Qué tiendas o productos faltan</span></div>
          {sinResultados.length === 0 && <div className={s.vacio}>Todas las búsquedas encontraron algo.</div>}
          {sinResultados.map((b) => (
            <div key={b.termino} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}><span>{b.termino}</span><span className="mono">{b.veces}</span></div>
          ))}
        </div>
      </div>

      <div className={s.tablaMarco}>
        <div className={s.panelCabeza}><strong>Búsquedas recientes</strong><span className={s.apagado}>Solo el término: no se guarda quién busca</span></div>
        <table className={s.tabla} style={{ minWidth: 760 }}>
          <thead><tr><th>Fecha</th><th>Término</th><th>Origen</th><th>Productos</th><th>Tiendas</th><th>Tiempo</th></tr></thead>
          <tbody>
            {recientes.length === 0 && <tr><td colSpan={6} className={s.apagado}>Sin búsquedas todavía.</td></tr>}
            {recientes.map((b, i) => (
              <tr key={i}>
                <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(b.realizada_en)}</td>
                <td style={{ fontWeight: 600, color: "var(--tinta)" }}>{b.termino}</td>
                <td className={s.apagado}>{b.origen === "web" ? "portada" : "API"}</td>
                <td className="mono">{b.grupos} <span className={s.apagado}>({b.ofertas} ofertas)</span></td>
                <td>{b.tiendas_error ? <span className="punto t-condicionado">{b.tiendas_ok} de {b.tiendas_ok + b.tiendas_error}</span> : <span className="punto t-exento">{b.tiendas_ok}</span>}</td>
                <td className="mono" style={{ color: "var(--texto-3)" }}>{(b.duracion_ms / 1000).toFixed(1)} s</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
