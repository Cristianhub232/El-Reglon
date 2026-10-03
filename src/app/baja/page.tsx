// Baja de los correos de El Renglón (prospección, docs/26). Abrir la página no da de baja: los filtros de correo de
// muchas empresas abren los enlaces para revisarlos. La baja en un clic de Gmail y Yahoo va por la API (List-Unsubscribe-Post).
import { Cabecera, PiePagina } from "../../ui/sitio/Cabecera.tsx";
import { tokenValido } from "../../modules/prospeccion/prospectos.ts";
import { Confirmar } from "./Confirmar.tsx";

export const dynamic = "force-dynamic";
export const metadata = { title: "Dejar de recibir correos", robots: { index: false } };

export default async function Baja({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const t = String((await searchParams).t ?? "");
  const prueba = t === "prueba";
  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column" }}>
      <Cabecera />
      <main style={{ flex: 1, padding: "80px var(--margen)", display: "flex", flexDirection: "column", gap: 18, maxWidth: 720 }}>
        <span className="sobretitulo">Correos de El Renglón</span>
        <h1 style={{ font: "700 40px/1.1 var(--serif)" }}>Dejar de recibir correos</h1>
        {prueba ? <p style={{ fontSize: 18, color: "var(--texto-2)" }}>Este enlace viene de un correo de prueba enviado desde el panel: no hay nada que dar de baja.</p>
          : tokenValido(t) ? (<>
            <p style={{ fontSize: 18, color: "var(--texto-2)" }}>Si confirma, no le enviaremos más correos a esta dirección.</p>
            <Confirmar token={t} />
          </>) : <p style={{ fontSize: 18, color: "var(--texto-2)" }}>Este enlace no es válido. Si quiere dejar de recibir correos, responda al mensaje con la palabra «baja».</p>}
      </main>
      <PiePagina />
    </div>
  );
}
