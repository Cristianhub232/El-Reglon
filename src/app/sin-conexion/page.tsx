// Página que el service worker muestra cuando no hay conexión y la página pedida no está guardada
import { Cabecera, PiePagina } from "../../ui/sitio/Cabecera.tsx";

export const metadata = { title: "Sin conexión" };

export default function SinConexion() {
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Cabecera />
      <main style={{ flex: 1, padding: "80px var(--margen)", display: "flex", flexDirection: "column", gap: 16, maxWidth: 720 }}>
        <span className="sobretitulo">Sin conexión</span>
        <h1 style={{ font: "700 40px/1.1 var(--serif)" }}>No hay conexión a internet</h1>
        <p style={{ fontSize: 17, color: "var(--texto-2)" }}>
          El Renglón necesita conexión para consultar las tasas del BCV, clasificar productos y leer el calendario tributario,
          porque siempre responde con los datos oficiales vigentes. Vuelve a intentarlo cuando tengas señal.
        </p>
        <div><a href="/" className="boton boton-primario">Reintentar</a></div>
      </main>
      <PiePagina />
    </div>
  );
}
