"use client";
// Registro de visitas del sitio público y aviso de cookies (docs/23). El panel y el inicio de sesión no se registran.
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import s from "./analitica.module.css";

const privada = (ruta: string) => ruta.startsWith("/admin") || ruta.startsWith("/ingresar");

export function RegistroVisita() {
  const ruta = usePathname();
  const primera = useRef(true);
  useEffect(() => {
    if (!ruta || privada(ruta)) return;
    const cuerpo = JSON.stringify({
      ruta, idioma: navigator.language, pantalla: `${screen.width}x${screen.height}`,
      // De dónde llegó: solo en la primera página (las siguientes son navegación interna)
      referente: primera.current && document.referrer && !document.referrer.startsWith(location.origin) ? document.referrer : null,
    });
    primera.current = false;
    void fetch("/api/publico/visita", { method: "POST", body: cuerpo, keepalive: true, credentials: "same-origin",
      headers: { "Content-Type": "application/json" } }).catch(() => {});
  }, [ruta]);
  return null;
}

const CLAVE = "aviso.cookies";

export function AvisoCookies() {
  const ruta = usePathname();
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    try { setVisible(localStorage.getItem(CLAVE) !== "1"); } catch { setVisible(true); }
  }, []);
  if (!visible || !ruta || privada(ruta)) return null;
  const cerrar = () => { try { localStorage.setItem(CLAVE, "1"); } catch { /* sin almacenamiento */ } setVisible(false); };
  return (
    <div className={s.aviso} role="region" aria-label="Aviso de cookies">
      <p>Usamos una cookie propia para contar las visitas y registramos los RIF consultados en nuestras herramientas, para mejorar el servicio. <Link href="/privacidad">Ver privacidad</Link></p>
      <button type="button" onClick={cerrar}>Entendido</button>
    </div>
  );
}
