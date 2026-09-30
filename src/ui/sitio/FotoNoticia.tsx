"use client";
// Foto de un titular, servida por el propio medio. Si no hay foto o el medio no la entrega (enlace roto o
// protección contra enlaces directos), se muestra una lámina con el nombre del medio.
import { useState } from "react";
import s from "./portada.module.css";

export function FotoNoticia({ src, medio, chica }: { src: string | null; medio: string; chica?: boolean }) {
  const [fallo, setFallo] = useState(false);
  if (!src || fallo) {
    return (
      <div className={`${s.lamina} ${chica ? s.laminaChica : ""}`} aria-hidden="true">
        <span className={s.laminaMedio}>{medio}</span>
      </div>
    );
  }
  // <img> directo: imágenes de terceros sin pasar por el optimizador de Next (evita que el servidor las descargue)
  return <img className={chica ? s.fotoNoticiaChica : s.fotoNoticia} src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFallo(true)} />;
}
