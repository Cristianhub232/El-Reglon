"use client";
import { useActionState } from "react";
import { accionSolicitar, type EstadoSolicitud } from "./acciones.ts";

const MODULOS: [string, string][] = [["iva", "IVA"], ["bcv", "BCV"], ["arancel", "Arancel"], ["calendario", "Calendario"], ["rif", "RIF"], ["noticias", "Noticias"]];

export function FormularioSolicitud() {
  const [estado, accion, enviando] = useActionState<EstadoSolicitud, FormData>(accionSolicitar, {});
  if (estado.ok) {
    return (
      <div className="tarjeta" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 8 }} role="status">
        <strong style={{ font: "600 22px var(--serif)", color: "var(--tinta)" }}>Solicitud recibida</strong>
        <p style={{ color: "var(--texto-2)" }}>Un administrador la revisará y te enviará la API key al correo que indicaste. La key se entrega una sola vez: guárdala en un lugar seguro.</p>
      </div>
    );
  }
  return (
    <form action={accion} className="tarjeta" style={{ padding: 24, display: "flex", flexDirection: "column", gap: 18 }}>
      <label className="etiqueta"><span>Nombre y apellido</span><input className="campo" name="nombre" autoComplete="name" required maxLength={120} /></label>
      <label className="etiqueta"><span>Correo electrónico</span><input className="campo" type="email" name="correo" autoComplete="email" placeholder="nombre@empresa.com.ve" required /></label>
      <label className="etiqueta"><span>Empresa u organización <span style={{ fontWeight: 400, color: "var(--texto-3)" }}>(opcional)</span></span><input className="campo" name="organizacion" autoComplete="organization" maxLength={160} /></label>
      <label className="etiqueta"><span>¿Para qué usarás la API?</span><textarea className="campo" name="uso" rows={3} required maxLength={1000} placeholder="Ej.: clasificar el IVA de los productos de nuestro punto de venta" /></label>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <legend style={{ fontSize: 14, fontWeight: 600, color: "var(--tinta)", padding: 0, marginBottom: 8 }}>Módulos que necesitas</legend>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "8px 18px", fontSize: 15 }}>
          {MODULOS.map(([v, t]) => <label key={v} style={{ display: "flex", gap: 6, alignItems: "center" }}><input type="checkbox" name="permisos" value={v} defaultChecked={v === "iva"} style={{ accentColor: "var(--tinta)", width: 18, height: 18 }} />{t}</label>)}
        </div>
      </fieldset>
      <input type="text" name="sitio_web" tabIndex={-1} autoComplete="off" aria-hidden="true" style={{ position: "absolute", left: -9999, width: 1, height: 1 }} />
      {estado.error && <p role="alert" style={{ fontSize: 14, color: "var(--adicional-texto)", background: "var(--adicional-fondo)", padding: "10px 12px", borderRadius: 8 }}>{estado.error}</p>}
      <button type="submit" className="boton boton-acento" disabled={enviando}>{enviando ? "Enviando…" : "Solicitar API key gratis"}</button>
      <span className="aviso-legal">Usamos tu correo solo para enviarte la API key y avisos del servicio. La API es gratuita y tiene un límite de consultas por minuto.</span>
    </form>
  );
}
