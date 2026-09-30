// Búsqueda del panel: reglas de IVA (por nombre o por lo que clasificaría el motor), RIF, código arancelario y API keys
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirUsuario } from "../../../core/auth/dal.ts";
import { puedeVer } from "../../../core/auth/roles.ts";
import { catalogo } from "../../../modules/iva/catalogo.ts";
import { reglasPorTexto } from "../../../modules/iva/motor.ts";
import { normalizar } from "../../../modules/iva/normalizar.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Búsqueda" };

export default async function Buscar({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const u = await requerirUsuario();
  const q = ((await searchParams).q ?? "").trim().slice(0, 120);
  const nq = normalizar(q), dig = q.replace(/[\s.-]/g, "");
  const secciones: { titulo: string; items: { texto: string; detalle?: string; href?: string }[] }[] = [];
  if (q) {
    if (puedeVer(u.rol, "catalogo")) {
      const c = await catalogo();
      const porTexto = new Set(reglasPorTexto(c.motor, q));
      const reglas = c.reglas.filter((r) => porTexto.has(r.id) || normalizar(`${r.id} ${r.nombre}`).includes(nq)).slice(0, 15);
      secciones.push({ titulo: "Reglas del catálogo de IVA", items: reglas.map((r) => ({ texto: `${r.id} · ${r.nombre}`,
        detalle: porTexto.has(r.id) ? "El clasificador elegiría esta regla para el texto buscado" : undefined, href: `/admin/catalogo?regla=${r.id}` })) });
    }
    if (/^[VEJPGC]\d{9}$/i.test(dig)) {
      const [r] = await consulta<{ valido: boolean; rif_formateado: string; tipo_persona: string; terminal: number; mensaje: string }>("SELECT * FROM rif.validar($1)", [q]);
      secciones.push({ titulo: "RIF", items: [{ texto: `${r.rif_formateado} · ${r.mensaje}`, detalle: r.valido ? `${r.tipo_persona} · terminal ${r.terminal}` : undefined }] });
    }
    if (/^\d{4,10}$/.test(dig)) {
      const cod = await consulta<{ codigo_formateado: string; ruta: string; es_terminal: boolean }>(
        "SELECT codigo_formateado, ruta, es_terminal FROM arancel.v_subpartida_ruta WHERE codigo LIKE $1 || '%' ORDER BY length(codigo), codigo LIMIT 8", [dig]);
      secciones.push({ titulo: "Arancel de Aduanas", items: cod.map((x) => ({ texto: x.codigo_formateado, detalle: `${x.ruta.slice(0, 160)}${x.es_terminal ? " · declarable" : ""}`,
        href: puedeVer(u.rol, "arancel") ? `/admin/arancel?q=${dig.slice(0, 6)}` : undefined })) });
    }
    if (puedeVer(u.rol, "apikeys") && /^(rgl_)?[0-9a-f]{4,8}$/i.test(q)) {
      const keys = await consulta<{ prefijo: string; nombre: string; activa: boolean }>(
        "SELECT prefijo, nombre, activa FROM core.api_key WHERE prefijo LIKE $1 || '%' AND ($2 OR usuario_id = $3) LIMIT 10", [q.replace(/^rgl_/i, "").toLowerCase(), u.rol !== "dev", u.id]);
      secciones.push({ titulo: "API keys", items: keys.map((k) => ({ texto: `rgl_${k.prefijo} · ${k.nombre}`, detalle: k.activa ? "activa" : "revocada", href: "/admin/api-keys" })) });
    }
  }
  const vacio = secciones.every((x) => x.items.length === 0);
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}><div><h1>Búsqueda</h1><span className={s.subtitulo}>{q ? `Resultados para «${q}»` : "Escribe una regla, un RIF, un código arancelario o el prefijo de una API key"}</span></div></div>
      <form action="/admin/buscar"><input className={s.campoChico} name="q" defaultValue={q} autoFocus placeholder="Buscar regla, RIF, prefijo…" style={{ maxWidth: 480 }} /></form>
      {q && vacio && <div className={s.soloLectura}>Sin resultados.</div>}
      {secciones.filter((x) => x.items.length).map((x) => (
        <div key={x.titulo} className={s.panel}>
          <div className={s.panelCabeza}><strong>{x.titulo}</strong></div>
          {x.items.map((it, i) => (
            <div key={i} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr)", gap: 4 }}>
              {it.href ? <Link href={it.href} style={{ fontWeight: 600 }}>{it.texto}</Link> : <strong style={{ color: "var(--tinta)" }}>{it.texto}</strong>}
              {it.detalle && <span className={s.apagado} style={{ fontSize: 14 }}>{it.detalle}</span>}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
