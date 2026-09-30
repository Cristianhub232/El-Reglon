// Noticiero: todos los titulares recientes de los medios venezolanos, con filtro por medio y búsqueda
import Link from "next/link";
import { fuentes as listarFuentes, titulares, ultimaLectura } from "../../modules/noticias/consultas.ts";
import { Cabecera, PiePagina } from "../../ui/sitio/Cabecera.tsx";
import { TitularItem } from "../../ui/sitio/Titulares.tsx";
import { hora } from "../../ui/formato.ts";
import s from "../../ui/sitio/portada.module.css";

export const dynamic = "force-dynamic";
export const metadata = { title: "Noticias", description: "Titulares de los principales medios venezolanos, actualizados cada hora." };

const POR_PAGINA = 30;

export default async function Noticias({ searchParams }: { searchParams: Promise<{ fuente?: string; q?: string; pagina?: string }> }) {
  const sp = await searchParams;
  const medios = await listarFuentes();
  const fuente = medios.some((m) => m.id === sp.fuente && m.activa) ? sp.fuente! : null;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const pagina = Math.min(Math.max(Number(sp.pagina) || 1, 1), 1000);
  const [{ total, titulares: lista }, leida] = await Promise.all([titulares({ fuente, q, pagina, limite: POR_PAGINA }), ultimaLectura()]);
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (cambios: Record<string, string | number | null>) => {
    const p = new URLSearchParams();
    const v = { fuente, q: q || null, pagina: null as number | null, ...cambios };
    for (const [k, x] of Object.entries(v)) if (x !== null && x !== "" && !(k === "pagina" && x === 1)) p.set(k, String(x));
    const t = p.toString();
    return t ? `/noticias?${t}` : "/noticias";
  };
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Cabecera />
      <main className={`${s.seccion} ${s.noticias}`} style={{ flex: 1 }}>
        <div className={s.noticiasCabeza}>
          <div>
            <span className="sobretitulo">Noticiero</span>
            <h1 className={s.seccionTituloChico}>Noticias de Venezuela</h1>
          </div>
          <span>Titulares de {medios.filter((m) => m.activa).length} medios · se actualiza cada hora{leida ? ` · última lectura a las ${hora(leida)}` : ""}</span>
        </div>
        <nav className={s.chips} aria-label="Filtrar por medio">
          <Link href={enlace({ fuente: null })} className={s.chip} aria-current={!fuente ? "page" : undefined}>Todos</Link>
          {medios.filter((m) => m.activa && (m.titulares_24h > 0 || m.id === fuente)).map((m) => (
            <Link key={m.id} href={enlace({ fuente: m.id })} className={s.chip} aria-current={fuente === m.id ? "page" : undefined}>{m.nombre}</Link>
          ))}
        </nav>
        <form action="/noticias" className={s.buscadorNoticias} role="search">
          {fuente && <input type="hidden" name="fuente" value={fuente} />}
          <input name="q" defaultValue={q} placeholder="Buscar en los titulares" aria-label="Buscar en los titulares" maxLength={100} />
          <button type="submit" className="boton boton-primario boton-chico">Buscar</button>
        </form>
        {lista.length === 0 ? (
          <p style={{ color: "var(--texto-3)" }}>{q || fuente ? "Ningún titular coincide con la búsqueda." : "Todavía no hay titulares: el noticiero se lee cada hora."}</p>
        ) : (
          <div className={s.rejillaNoticias}>{lista.map((t) => <TitularItem key={t.id} t={t} />)}</div>
        )}
        {paginas > 1 && (
          <nav className={s.paginacion} aria-label="Páginas">
            {pagina > 1 ? <Link href={enlace({ pagina: pagina - 1 })}>← Más recientes</Link> : <span />}
            <span>Página {pagina} de {paginas}</span>
            {pagina < paginas ? <Link href={enlace({ pagina: pagina + 1 })}>Anteriores →</Link> : <span />}
          </nav>
        )}
      </main>
      <PiePagina />
    </div>
  );
}
