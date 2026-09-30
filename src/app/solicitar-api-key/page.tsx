import Link from "next/link";
import { Cabecera, PiePagina } from "../../ui/sitio/Cabecera.tsx";
import { FormularioSolicitud } from "./Formulario.tsx";

export const metadata = { title: "Solicitar API key", description: "API key gratuita para integrar la clasificación de IVA, las tasas BCV, el arancel, el calendario tributario y la validación del RIF." };

export default function SolicitarApiKey() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Cabecera />
      <main style={{ flex: 1, padding: "64px var(--margen)", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 48, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 20, maxWidth: 560 }}>
          <span className="sobretitulo">Para desarrolladores</span>
          <h1 style={{ font: "700 clamp(36px, 4vw, 52px)/1.05 var(--serif)" }}>Solicita tu API key gratuita</h1>
          <p style={{ fontSize: 17, color: "var(--texto-2)" }}>Una sola key para todos los módulos que elijas: clasificación de IVA, tasas oficiales del BCV, arancel de aduanas, calendario tributario y validación del RIF.</p>
          <ul style={{ margin: 0, paddingLeft: 20, display: "flex", flexDirection: "column", gap: 8, color: "var(--texto-2)" }}>
            <li>Respuestas con base legal y montos como texto decimal exacto.</li>
            <li>Límite de consultas por minuto según el uso.</li>
            <li>Documentación Swagger en <Link href="/docs" className="mono">/docs</Link>.</li>
          </ul>
          <p style={{ fontSize: 14, color: "var(--texto-3)" }}>¿Solo quieres consultar? Usa las <Link href="/#herramientas">herramientas gratis</Link> sin registrarte.</p>
        </div>
        <FormularioSolicitud />
      </main>
      <PiePagina />
    </div>
  );
}
