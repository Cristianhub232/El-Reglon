"use client";
// Partes interactivas del marco del panel: navegación lateral (activa según la ruta; cajón en móvil), migas y notificaciones
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { accionNotificacionesLeidas } from "../../app/admin/acciones.ts";
import s from "./admin.module.css";

export interface ItemNav { titulo: string; ruta: string }
export interface Notificacion { texto: string; cuando: string; color: string; nueva: boolean }

const activo = (ruta: string, actual: string) => ruta === "/admin" ? actual === "/admin" : actual.startsWith(ruta);

export function Lateral({ grupos, cabeza, pie }: { grupos: [string, ItemNav[]][]; cabeza: ReactNode; pie: ReactNode }) {
  const ruta = usePathname();
  const [abierto, setAbierto] = useState(false);
  useEffect(() => setAbierto(false), [ruta]);
  return (
    <>
      <button type="button" className={s.menuMovil} aria-label="Abrir menú" aria-expanded={abierto} onClick={() => setAbierto(!abierto)}
        style={{ position: "fixed", left: 16, top: 12, zIndex: 31 }}>
        <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" stroke="#0E2440" strokeWidth="1.7" strokeLinecap="round" /></svg>
      </button>
      <aside className={`${s.lateral} ${abierto ? s.lateralAbierto : ""}`}>
        {cabeza}
        <nav className={s.nav} aria-label="Secciones del panel">
          {grupos.map(([titulo, items]) => (
            <div key={titulo} className={s.grupo}>
              <span className={s.grupoTitulo}>{titulo}</span>
              {items.map((it) => (
                <Link key={it.ruta} href={it.ruta} className={`${s.enlace} ${activo(it.ruta, ruta) ? s.enlaceActivo : ""}`}
                  aria-current={activo(it.ruta, ruta) ? "page" : undefined}>{it.titulo}</Link>
              ))}
            </div>
          ))}
        </nav>
        {pie}
      </aside>
    </>
  );
}

export function Migas({ items }: { items: ItemNav[] }) {
  const ruta = usePathname();
  const actual = ruta === "/admin/cuenta" ? { titulo: "Mi cuenta" } : ruta === "/admin/buscar" ? { titulo: "Búsqueda" }
    : [...items].sort((a, b) => b.ruta.length - a.ruta.length).find((i) => activo(i.ruta, ruta));
  return <div className={s.migas} style={{ paddingLeft: "var(--espacio-menu, 0)" }}><span>Administración</span><span>/</span><strong>{actual?.titulo ?? "Resumen"}</strong></div>;
}

export function Notificaciones({ lista, puedeAuditoria }: { lista: Notificacion[]; puedeAuditoria: boolean }) {
  const [abierto, setAbierto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const nuevas = lista.filter((n) => n.nueva).length;
  useEffect(() => {
    if (!abierto) return;
    const fuera = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAbierto(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setAbierto(false); };
    document.addEventListener("mousedown", fuera); document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", fuera); document.removeEventListener("keydown", esc); };
  }, [abierto]);
  return (
    <div className={s.notif} ref={ref}>
      <button type="button" className={s.notifBoton} aria-label={`Notificaciones${nuevas ? `: ${nuevas} nuevas` : ""}`} aria-expanded={abierto} onClick={() => setAbierto(!abierto)}>
        <svg width="18" height="18" viewBox="0 0 20 20" aria-hidden="true"><path d="M10 2.5a5 5 0 0 0-5 5v3.2L3.5 14h13L15 10.7V7.5a5 5 0 0 0-5-5z" fill="none" stroke="#0E2440" strokeWidth="1.6" strokeLinejoin="round" /><path d="M8 16.5a2 2 0 0 0 4 0" fill="none" stroke="#0E2440" strokeWidth="1.6" strokeLinecap="round" /></svg>
        {nuevas > 0 && <span className={s.notifContador}>{nuevas > 9 ? "9+" : nuevas}</span>}
      </button>
      {abierto && (
        <div className={s.notifPanel} role="dialog" aria-label="Notificaciones">
          <div className={s.notifCabeza}>
            <strong>Notificaciones</strong>
            {nuevas > 0 && <form action={accionNotificacionesLeidas}><button type="submit" className={s.enlaceBoton}>Marcar como leídas</button></form>}
          </div>
          {lista.length === 0 && <div className={s.notifVacia}>No hay novedades.</div>}
          {lista.map((n, i) => (
            <div key={i} className={s.notifItem}>
              <span style={{ background: n.color, opacity: n.nueva ? 1 : 0.35 }} />
              <span><span className={s.notifTexto}>{n.texto}</span><span className={s.notifCuando}>{n.cuando}</span></span>
            </div>
          ))}
          {puedeAuditoria && <Link href="/admin/auditoria" className={s.notifPie} onClick={() => setAbierto(false)}>Ver todo en auditoría</Link>}
        </div>
      )}
    </div>
  );
}
