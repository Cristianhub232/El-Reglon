"use client";
// Pulso oficial (portada): carrusel con las últimas publicaciones del SENIAT, el BCV y el SAREN. Avanza solo cada
// 8 s (salvo con movimiento reducido, o mientras el cursor o el foco están dentro) y se maneja con botones y flechas.
import { useEffect, useState, type KeyboardEvent } from "react";
import type { PublicacionPulso } from "../../modules/pulso/consultas.ts";
import { fechaHora } from "../formato.ts";
import s from "./pulso.module.css";

const ORIGEN = { instagram: "Instagram", rss: "Sitio web", bcv_prensa: "Nota de prensa" } as const;

function cuando(p: PublicacionPulso) {
  const f = fechaHora(p.publicado_en);
  return f.endsWith(" 00:00") ? f.slice(0, 10) : f.replace(" ", " · ");
}

export function PulsoOficial({ publicaciones }: { publicaciones: PublicacionPulso[] }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const n = publicaciones.length;
  const p = publicaciones[i];
  useEffect(() => {
    if (pausa || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), 8000);
    return () => clearTimeout(t);
  }, [i, pausa, n]);
  const ir = (d: number) => setI((x) => (x + d + n) % n);
  const teclado = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
  };
  const perfil = p.metodo === "instagram" && p.usuario ? `https://www.instagram.com/${p.usuario}/` : p.sitio;
  return (
    <section className={s.pulso} aria-roledescription="carrusel" aria-label="Pulso oficial: últimas publicaciones de los entes"
      onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)} onFocus={() => setPausa(true)} onBlur={() => setPausa(false)} onKeyDown={teclado}>
      <div className={s.barra}>
        <span className={s.barraTitulo}><strong>Pulso oficial</strong><span>{p.ente} · {i + 1} de {n}</span></span>
        {n > 1 && (
          <span className={s.controles}>
            <span className={s.puntos} role="tablist" aria-label="Publicaciones">
              {publicaciones.map((x, k) => (
                <button key={x.id} type="button" role="tab" aria-selected={k === i} aria-label={`${k + 1} de ${n}: ${x.ente}`} className={s.punto} onClick={() => setI(k)} />
              ))}
            </span>
            <button type="button" className={s.flecha} onClick={() => ir(-1)} aria-label="Publicación anterior">‹</button>
            <button type="button" className={s.flecha} onClick={() => ir(1)} aria-label="Publicación siguiente">›</button>
          </span>
        )}
      </div>
      {publicaciones.map((x, k) => (
        <div key={x.id} className={`${s.fondo} ${k === i ? s.fondoActivo : ""}`} aria-hidden="true">
          {x.con_imagen
            // imagen guardada en la base y servida por /api/publico/pulso (las de Instagram caducan)
            ? <img src={`/api/publico/pulso/imagen/${x.id}`} alt="" loading={k === 0 ? "eager" : "lazy"} decoding="async" />
            : <span className={s.lamina}><span>{x.ente}</span></span>}
        </div>
      ))}
      <article className={s.tarjeta} aria-live={pausa ? "polite" : "off"} aria-roledescription="publicación" aria-label={`${i + 1} de ${n}`}>
        <div className={s.autor}>
          <span className={s.avatar} aria-hidden="true">{p.ente.slice(0, 2)}</span>
          <span><strong>{p.ente}</strong><span>{ORIGEN[p.metodo]} · {cuando(p)}</span></span>
        </div>
        <h2 className={s.titulo}>{p.titulo}</h2>
        <div className={s.enlaces}>
          <a href={p.url} target="_blank" rel="noopener noreferrer">{p.metodo === "instagram" ? "Ver publicación" : "Ver fuente"}</a>
          <a href={perfil} target="_blank" rel="noopener noreferrer">{p.metodo === "instagram" ? "Ver en Instagram" : `Sitio del ${p.ente}`}</a>
        </div>
      </article>
    </section>
  );
}
