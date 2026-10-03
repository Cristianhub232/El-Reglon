"use client";
// Botón de confirmación de la baja: muestra el resultado sin recargar la página
import { useActionState } from "react";
import { accionBaja } from "./acciones.ts";

export function Confirmar({ token }: { token: string }) {
  const [estado, ejecutar, enviando] = useActionState(accionBaja, {});
  if (estado.hecho) return <p style={{ fontSize: 18, color: "var(--texto-2)" }} role="status"><strong>Listo.</strong> No le volveremos a escribir. Gracias por avisarnos.</p>;
  return (
    <form action={ejecutar} style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <input type="hidden" name="t" value={token} />
      <button type="submit" className="boton boton-primario" disabled={enviando}>{enviando ? "Procesando…" : "Sí, no quiero recibir más correos"}</button>
      {estado.error && <p role="alert" style={{ color: "var(--rojo, #B8352B)" }}>{estado.error}</p>}
    </form>
  );
}
