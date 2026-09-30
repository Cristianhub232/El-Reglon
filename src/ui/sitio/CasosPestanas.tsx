"use client";
// Pestañas de "Casos de uso": los tres paneles llegan ya renderizados desde el servidor; aquí solo se elige cuál ver
import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import s from "./casos.module.css";

export interface Perfil { id: string; titulo: string; texto: string }

export function CasosPestanas({ perfiles, paneles }: { perfiles: Perfil[]; paneles: ReactNode[] }) {
  const [activo, setActivo] = useState(0);
  const botones = useRef<(HTMLButtonElement | null)[]>([]);
  const teclado = (e: KeyboardEvent, i: number) => {
    const destino = e.key === "ArrowDown" || e.key === "ArrowRight" ? (i + 1) % perfiles.length
      : e.key === "ArrowUp" || e.key === "ArrowLeft" ? (i - 1 + perfiles.length) % perfiles.length
      : e.key === "Home" ? 0 : e.key === "End" ? perfiles.length - 1 : null;
    if (destino === null) return;
    e.preventDefault();
    setActivo(destino);
    botones.current[destino]?.focus();
  };
  return (
    <div className={s.rejilla}>
      <div className={s.lado}>
        <span className="sobretitulo">Casos de uso</span>
        <h2 className={s.titulo}>Lo que obtiene cada perfil</h2>
        <p className={s.lead}>Resultados de los mismos módulos, presentados según quién los usa.</p>
        <div className={s.perfiles} role="tablist" aria-orientation="vertical" aria-label="Perfiles">
          {perfiles.map((p, i) => (
            <button key={p.id} ref={(b) => { botones.current[i] = b; }} type="button" role="tab" id={`caso-${p.id}`} aria-controls={`panel-${p.id}`}
              aria-selected={i === activo} tabIndex={i === activo ? 0 : -1} className={s.perfil} onClick={() => setActivo(i)} onKeyDown={(e) => teclado(e, i)}>
              <span className={s.numero}>{String(i + 1).padStart(2, "0")}</span>
              <span className={s.perfilTexto}><strong>{p.titulo}</strong><span>{p.texto}</span></span>
              <span className={s.flecha} aria-hidden="true">›</span>
            </button>
          ))}
        </div>
      </div>
      {paneles.map((panel, i) => (
        <div key={perfiles[i].id} role="tabpanel" id={`panel-${perfiles[i].id}`} aria-labelledby={`caso-${perfiles[i].id}`} hidden={i !== activo} className={s.panel}>
          {panel}
        </div>
      ))}
    </div>
  );
}
