"use client";
// Formulario con acción de servidor: muestra el resultado (error u ok) y deshabilita el botón mientras envía.
// Las acciones reciben (estadoAnterior, FormData) y devuelven { error } u { ok, token? }.
import { createContext, useActionState, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import s from "./admin.module.css";

// Zona estable de la página donde se muestra un token o contraseña temporal recién generados. Sin ella, si la acción
// hace desaparecer el formulario (p. ej. la solicitud aprobada deja la lista), el secreto se perdería al refrescar.
const ZonaCtx = createContext<((v: { titulo: string; valor: string }) => void) | null>(null);

export function ZonaSecretos({ children }: { children: ReactNode }) {
  const [secreto, setSecreto] = useState<{ titulo: string; valor: string } | null>(null);
  const router = useRouter();
  // Las acciones que entregan un secreto no refrescan la página; se refresca al confirmar que se guardó
  return (
    <ZonaCtx.Provider value={setSecreto}>
      {secreto && <Secreto titulo={secreto.titulo} valor={secreto.valor} alCerrar={() => { setSecreto(null); router.refresh(); }} />}
      {children}
    </ZonaCtx.Provider>
  );
}

export interface EstadoAccion { error?: string; ok?: string; token?: string; clave?: string }
type Accion = (prev: EstadoAccion, form: FormData) => Promise<EstadoAccion>;

export function FormAccion({ accion, children, boton, estiloBoton = "primario", confirmar, limpiar = true, className, extra }: {
  accion: Accion; children?: ReactNode; boton: string; estiloBoton?: "primario" | "peligro" | "secundario" | "texto";
  confirmar?: string; limpiar?: boolean; className?: string; extra?: ReactNode;
}) {
  const [estado, ejecutar, enviando] = useActionState<EstadoAccion, FormData>(accion, {});
  const ref = useRef<HTMLFormElement>(null);
  const zona = useContext(ZonaCtx);
  const secreto = estado.token ?? estado.clave;
  useEffect(() => { if (estado.ok && limpiar) ref.current?.reset(); }, [estado, limpiar]);
  useEffect(() => { if (secreto && zona) { zona({ titulo: estado.ok ?? "", valor: secreto }); window.scrollTo({ top: 0, behavior: "smooth" }); } }, [secreto, zona, estado.ok]);
  const clase = estiloBoton === "peligro" ? "boton-peligro" : estiloBoton === "texto" ? s.botonTexto
    : `boton boton-chico ${estiloBoton === "secundario" ? "boton-secundario" : "boton-primario"}`;
  return (
    <form ref={ref} action={ejecutar} className={className ?? s.formulario}
      onSubmit={(e) => { if (confirmar && !window.confirm(confirmar)) e.preventDefault(); }}>
      {children}
      {estado.error && <p className={`${s.mensaje} ${s.mensajeError}`} role="alert">{estado.error}</p>}
      {estado.ok && !estado.token && !estado.clave && <p className={`${s.mensaje} ${s.mensajeOk}`} role="status">{estado.ok}</p>}
      {secreto && !zona && <Secreto titulo={estado.ok ?? ""} valor={secreto} />}
      <div className={s.acciones}>{extra}<button type="submit" className={clase} disabled={enviando}>{enviando ? "Procesando…" : boton}</button></div>
    </form>
  );
}

// Token o contraseña temporal: se muestra una única vez, con botón para copiar
export function Secreto({ titulo, valor, alCerrar }: { titulo: string; valor: string; alCerrar?: () => void }) {
  return (
    <div className="tarjeta" style={{ padding: "18px 20px", display: "flex", flexDirection: "column", gap: 12, borderColor: "var(--amarillo)" }} role="status">
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
        <strong style={{ fontSize: 15, color: "var(--tinta)" }}>{titulo}</strong>
        {alCerrar && <button type="button" className={s.enlaceBoton} onClick={() => { if (window.confirm("¿Ya guardaste el valor? No se volverá a mostrar.")) alCerrar(); }}>Ya lo guardé</button>}
      </div>
      <div className={s.token}>
        <span>{valor}</span>
        <button type="button" className="boton boton-primario boton-chico" onClick={(e) => {
          void navigator.clipboard?.writeText(valor);
          (e.currentTarget as HTMLButtonElement).textContent = "Copiado";
        }}>Copiar</button>
      </div>
    </div>
  );
}
