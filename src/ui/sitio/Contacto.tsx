"use client";
// Botón flotante de contacto (docs/27): burbuja abajo a la derecha que abre una ventana para escribirnos. El mensaje
// llega a la base y a soporte@; se le responde al correo que deja el usuario. No se muestra en el panel ni al ingresar.
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import s from "./contacto.module.css";

type Estado = { tipo: "editando" } | { tipo: "enviando" } | { tipo: "listo"; correo: string } | { tipo: "error"; mensaje: string };

export function BotonContacto() {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  const [estado, setEstado] = useState<Estado>({ tipo: "editando" });
  const primerCampo = useRef<HTMLInputElement>(null);

  useEffect(() => { if (abierto) primerCampo.current?.focus(); }, [abierto]);
  useEffect(() => {
    if (!abierto) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("keydown", esc);
    return () => document.removeEventListener("keydown", esc);
  }, [abierto]);

  if (ruta.startsWith("/admin") || ruta.startsWith("/ingresar")) return null;

  async function enviar(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const correo = String(f.get("correo") ?? "").trim();
    setEstado({ tipo: "enviando" });
    try {
      const r = await fetch("/api/publico/contacto", { method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ correo, nombre: f.get("nombre"), mensaje: f.get("mensaje"), novedades: f.get("novedades") === "on",
          sitio_web: f.get("sitio_web"), pagina: location.pathname + location.hash }) });
      const d = await r.json().catch(() => null);
      if (!r.ok) throw new Error(d?.error?.mensaje ?? "No se pudo enviar. Intente de nuevo.");
      setEstado({ tipo: "listo", correo });
    } catch (err) { setEstado({ tipo: "error", mensaje: (err as Error).message }); }
  }

  return (
    <>
      {abierto && (
        <div className={s.ventana} role="dialog" aria-modal="false" aria-labelledby="contacto-titulo">
          <div className={s.cabeza}>
            <span className={s.avatar}><img src="/iconos/icono.svg" alt="" /><span className={s.enLinea} /></span>
            <div><strong id="contacto-titulo">El Renglón</strong><small>Respondemos en horas hábiles</small></div>
            <button type="button" className={s.cerrar} onClick={() => setAbierto(false)} aria-label="Cerrar">×</button>
          </div>
          <div className={s.cuerpo}>
            {estado.tipo === "listo" ? (
              <div className={s.listo} role="status">
                <strong>¡Mensaje recibido!</strong>
                Le responderemos a <b>{estado.correo}</b>. Revise también su carpeta de correo no deseado.
                <div style={{ marginTop: 14 }}><button type="button" className={s.enviar} style={{ width: "100%" }} onClick={() => setEstado({ tipo: "editando" })}>Escribir otro mensaje</button></div>
              </div>
            ) : (<>
              <div className={s.globo}><strong>El Renglón</strong>¡Hola! 👋 ¿En qué podemos ayudarle? Escríbanos y le respondemos a su correo.</div>
              <form className={s.formulario} onSubmit={enviar}>
                <label>Su correo electrónico<input ref={primerCampo} type="email" name="correo" required maxLength={254} autoComplete="email" placeholder="usted@correo.com" /></label>
                <label>Nombre <span style={{ fontWeight: 400 }}>(opcional)</span><input type="text" name="nombre" maxLength={120} autoComplete="name" /></label>
                <label>Mensaje<textarea name="mensaje" required minLength={3} maxLength={2000} placeholder="Escriba su consulta…" /></label>
                <label className={s.casilla}><input type="checkbox" name="novedades" /> Quiero recibir novedades de El Renglón por correo (puede darse de baja cuando quiera)</label>
                <div className={s.trampa} aria-hidden="true"><label>Sitio web<input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" /></label></div>
                {estado.tipo === "error" && <p className={s.error} role="alert">{estado.mensaje}</p>}
                <button type="submit" className={s.enviar} disabled={estado.tipo === "enviando"}>
                  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true"><path d="M3 11.5 21 3l-8.5 18-2.2-7.3L3 11.5Z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
                  {estado.tipo === "enviando" ? "Enviando…" : "Enviar mensaje"}
                </button>
                <p className={s.nota}>Guardamos su mensaje y su correo solo para responderle. <a href="/privacidad#contacto">Privacidad</a></p>
              </form>
            </>)}
          </div>
        </div>
      )}
      <button type="button" className={s.burbuja} onClick={() => setAbierto(!abierto)} aria-expanded={abierto} aria-label={abierto ? "Cerrar el chat de contacto" : "Escríbanos"}>
        {abierto
          ? <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          : <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3h11A2.5 2.5 0 0 1 20 5.5v8a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4h0A2.5 2.5 0 0 1 4 13.5v-8Z" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /><path d="M8.5 8.5h7M8.5 11.5h4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" /></svg>}
        {!abierto && <span className={s.punto} aria-hidden="true" />}
      </button>
    </>
  );
}
