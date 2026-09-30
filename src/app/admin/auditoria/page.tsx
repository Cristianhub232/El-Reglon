// Auditoría (resources/Admin.dc.html · AUDITORÍA): quién, cuándo, qué y el detalle; filtros, búsqueda y CSV
import Link from "next/link";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { eventos, POR_PAGINA } from "../../../modules/admin/auditoria.ts";
import { CATEGORIAS, categoria, describir, type Categoria } from "../../../ui/admin/eventos.ts";
import { entero, fechaHora } from "../../../ui/formato.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Auditoría" };

export default async function Auditoria({ searchParams }: { searchParams: Promise<{ cat?: string; q?: string; pagina?: string }> }) {
  await requerirSeccion("auditoria");
  const sp = await searchParams;
  const cat = sp.cat && sp.cat in CATEGORIAS ? (sp.cat as Categoria) : null;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const pagina = Math.max(1, Number(sp.pagina) || 1);
  const { filas, total } = await eventos(cat, q, pagina);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (p: Record<string, string | number | null>) => {
    const u = new URLSearchParams(Object.entries({ cat, q: q || null, ...p }).filter(([k, v]) => v !== null && v !== "" && !(k === "pagina" && Number(v) === 1)).map(([k, v]) => [k, String(v)]));
    return `/admin/auditoria${u.size ? `?${u}` : ""}`;
  };
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Auditoría</h1><span className={s.subtitulo}>core.auditoria · quién, cuándo, qué y el detalle del cambio · {entero(total)} eventos</span></div>
        <a href={`/admin/auditoria/csv?${new URLSearchParams(Object.entries({ cat: cat ?? "", q }).filter(([, v]) => v))}`} className="boton boton-secundario boton-chico">Exportar CSV</a>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
        <nav className={s.pestanas} aria-label="Filtrar por categoría" style={{ flex: 1 }}>
          <Link href={enlace({ cat: null, pagina: null })} aria-current={!cat}>Todo</Link>
          {(Object.keys(CATEGORIAS) as Categoria[]).map((c) => <Link key={c} href={enlace({ cat: c, pagina: null })} aria-current={cat === c}>{CATEGORIAS[c].titulo}</Link>)}
        </nav>
        <form action="/admin/auditoria">
          {cat && <input type="hidden" name="cat" value={cat} />}
          <input className={s.campoChico} name="q" defaultValue={q} placeholder="Buscar actor, acción o detalle" aria-label="Buscar en la auditoría" style={{ width: 260 }} />
        </form>
      </div>
      <div className={s.tablaMarco}>
        <table className={s.tabla} style={{ minWidth: 820 }}>
          <thead><tr><th style={{ width: 150 }}>Fecha</th><th style={{ width: 190 }}>Actor</th><th style={{ width: 210 }}>Acción</th><th>Detalle</th></tr></thead>
          <tbody>
            {filas.length === 0 && <tr><td colSpan={4} className={s.apagado}>Sin eventos para este filtro.</td></tr>}
            {filas.map((a) => (
              <tr key={a.id}>
                <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(a.ocurrido_en)}</td>
                <td style={{ color: "var(--tinta)", fontWeight: 600, wordBreak: "break-word" }}>{a.actor}</td>
                <td><span className={`punto ${CATEGORIAS[categoria(a.accion)].clase}`}>{a.accion}</span></td>
                <td style={{ color: "var(--texto-2)" }}>{describir(a.accion, a.detalle)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {paginas > 1 && (
        <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "flex-end", fontSize: 14 }}>
          {pagina > 1 && <Link href={enlace({ pagina: pagina - 1 })}>‹ Anterior</Link>}
          <span className={s.apagado}>Página {pagina} de {paginas}</span>
          {pagina < paginas && <Link href={enlace({ pagina: pagina + 1 })}>Siguiente ›</Link>}
        </div>
      )}
    </div>
  );
}
