// Marco del panel (resources/Admin.dc.html): barra lateral por rol, cabecera con búsqueda, tasa BCV, notificaciones y salida
import type { ReactNode } from "react";
import Link from "next/link";
import { consulta } from "../../core/db.ts";
import { requerirUsuario } from "../../core/auth/dal.ts";
import { GRUPOS, ROLES, SECCIONES, puede, puedeVer } from "../../core/auth/roles.ts";
import { Logo } from "../../ui/Logo.tsx";
import { Lateral, Migas, Notificaciones, type Notificacion } from "../../ui/admin/Marco.tsx";
import { fechaCorta, haceCuanto, numero } from "../../ui/formato.ts";
import { accionSalir } from "./acciones.ts";
import s from "../../ui/admin/admin.module.css";

export const metadata = { title: { default: "Administración", template: "%s · Administración · El Renglón" }, robots: { index: false } };
export const dynamic = "force-dynamic";

interface Evento { ocurrido_en: string; actor: string; accion: string; detalle: Record<string, unknown> }

function aNotificacion(e: Evento, vistas: string): Notificacion | null {
  const d = e.detalle, fv = typeof d.fecha_valor === "string" ? fechaCorta(d.fecha_valor) : "";
  const base = { cuando: haceCuanto(e.ocurrido_en), nueva: e.ocurrido_en > vistas };
  switch (e.accion) {
    case "bcv.registrada": return { ...base, color: "#F2B632", texto: `El BCV publicó la tasa con fecha valor ${fv}.` };
    case "bcv.discrepancia": return { ...base, color: "#D9453A", texto: `La portada del BCV difiere del registro del ${fv}: no se sobrescribe y queda para revisión.` };
    case "bcv.lectura_fallida": return { ...base, color: "#D9453A", texto: `No se pudo leer la portada del BCV (${String(d.error ?? "").slice(0, 80)}).` };
    case "solicitud_api_key.crear": return { ...base, color: "#6B9BE0", texto: `Nueva solicitud de API key: ${d.nombre}${d.organizacion ? ` · ${d.organizacion}` : ""}.` };
    case "iva.catalogo.cargar": return { ...base, color: "#2E7D5B", texto: `Catálogo de IVA ${d.version} cargado (${d.reglas} reglas).` };
    case "arancel.sinonimos.cargar": return { ...base, color: "#1F4E8C", texto: `Diccionario de la detección arancelaria ${d.version} cargado.` };
    default: return null;
  }
}

export default async function LayoutAdmin({ children }: { children: ReactNode }) {
  const u = await requerirUsuario({ permitirClaveTemporal: true });
  const acciones = ["bcv.registrada", "bcv.discrepancia", "bcv.lectura_fallida", "iva.catalogo.cargar", "arancel.sinonimos.cargar",
    ...(puede(u.rol, "apikeys.gestionar") ? ["solicitud_api_key.crear"] : [])];
  const [eventos, [tasa]] = await Promise.all([
    consulta<Evento & Record<string, unknown>>("SELECT ocurrido_en::text, actor, accion, detalle FROM core.auditoria WHERE accion = ANY ($1) ORDER BY ocurrido_en DESC LIMIT 8", [acciones]),
    consulta<{ venta_bs: string; fecha_valor: string }>("SELECT venta_bs, fecha_valor FROM bcv.tasa WHERE moneda = 'USD' ORDER BY fecha_valor DESC LIMIT 1"),
  ]);
  const vistas = new Date(u.notificaciones_vistas_en).toISOString();
  const notificaciones = eventos.map((e) => aNotificacion({ ...e, ocurrido_en: new Date(e.ocurrido_en).toISOString() }, vistas)).filter((n): n is Notificacion => !!n);
  const grupos = GRUPOS.map(([t, secs]) => [t, secs.filter((x) => puedeVer(u.rol, x)).map((x) => SECCIONES[x])] as [string, { titulo: string; ruta: string }[]])
    .filter(([, items]) => items.length);
  const iniciales = u.nombre.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join("");

  return (
    <div className={s.marco}>
      <Lateral
        grupos={u.debe_cambiar_clave ? [] : grupos}
        cabeza={<Link href="/" className={s.lateralMarca}><span className={s.lateralLogo}><Logo tipo="horizontal" variante="claro" fondo="#FFFFFF" /></span><span>Administración</span></Link>}
        pie={<Link href="/admin/cuenta" className={s.usuario}><span className={s.avatar}>{iniciales}</span><span><span className={s.usuarioNombre}>{u.nombre}</span><span className={s.usuarioRol}>{ROLES[u.rol].nombre}</span></span></Link>}
      />
      <div className={s.columna}>
        <header className={s.cabecera}>
          <Migas items={Object.values(SECCIONES)} />
          <div className={s.cabeceraDerecha}>
            {!u.debe_cambiar_clave && (
              <form action="/admin/buscar" className={s.buscar} role="search">
                <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="#676D79" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="#676D79" strokeWidth="1.6" strokeLinecap="round" /></svg>
                <input name="q" placeholder="Buscar regla, RIF, prefijo…" aria-label="Buscar regla, RIF o prefijo arancelario" />
              </form>
            )}
            {tasa && <span className={s.tasa}><span>BCV</span><span>USD {numero(tasa.venta_bs, 4)}</span><span>{fechaCorta(tasa.fecha_valor)}</span></span>}
            {!u.debe_cambiar_clave && <Notificaciones lista={notificaciones} puedeAuditoria={puedeVer(u.rol, "auditoria")} />}
            <form action={accionSalir}>
              <button type="submit" className={s.salir}>
                <svg width="15" height="15" viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2.5H3.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><path d="M10 5l3 3-3 3M13 8H6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                <span className={s.salirTexto}>Cerrar sesión</span>
              </button>
            </form>
          </div>
        </header>
        <main className={s.principal}>{children}</main>
      </div>
    </div>
  );
}
