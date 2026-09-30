// Titulares del noticiero (portada y /noticias). Enlazan al medio original en una pestaña nueva.
import type { Titular } from "../../modules/noticias/consultas.ts";
import { haceCuanto } from "../formato.ts";
import { FotoNoticia } from "./FotoNoticia.tsx";
import s from "./portada.module.css";

const Meta = ({ t }: { t: Titular }) => (
  <span className={s.meta}>
    <span className={s.metaCategoria}>{t.fuente_nombre}</span>
    <span className={s.metaFuente}>{[t.categoria, haceCuanto(t.publicado_en)].filter(Boolean).join(" · ")}</span>
  </span>
);

export function TitularPrincipal({ t }: { t: Titular }) {
  return (
    <a href={t.url} target="_blank" rel="noopener noreferrer" className={`${s.principal} ${s.enlaceNoticia}`}>
      <FotoNoticia src={t.imagen} medio={t.fuente_nombre} />
      <Meta t={t} />
      <h3 className={s.tituloPrincipal}>{t.titulo}</h3>
      {t.resumen && <p className={s.textoPrincipal}>{t.resumen}</p>}
    </a>
  );
}

export function TitularItem({ t }: { t: Titular }) {
  return (
    <a href={t.url} target="_blank" rel="noopener noreferrer" className={`${s.item} ${s.enlaceNoticia}`}>
      <FotoNoticia src={t.imagen} medio={t.fuente_nombre} chica />
      <span className={s.itemTexto}>
        <Meta t={t} />
        <span className={s.tituloItem}>{t.titulo}</span>
      </span>
    </a>
  );
}
