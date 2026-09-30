"use client";
// Formulario de inicio de sesión (resources/Login.dc.html): correo, contraseña, código de 6 dígitos y "mantener sesión"
import { useActionState, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";
import { accionIngresar, type EstadoIngreso } from "./acciones.ts";
import s from "./ingreso.module.css";

function CodigoVerificacion({ resaltar }: { resaltar: boolean }) {
  const [digitos, setDigitos] = useState<string[]>(Array(6).fill(""));
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const poner = (i: number, v: string) => {
    const d = v.replace(/\D/g, "");
    if (d.length > 1) { pegar(d, i); return; }
    const n = [...digitos]; n[i] = d; setDigitos(n);
    if (d && i < 5) refs.current[i + 1]?.focus();
  };
  const pegar = (texto: string, desde = 0) => {
    const d = texto.replace(/\D/g, "").slice(0, 6 - desde).split("");
    const n = [...digitos]; d.forEach((x, k) => { n[desde + k] = x; }); setDigitos(n);
    refs.current[Math.min(desde + d.length, 5)]?.focus();
  };
  const tecla = (i: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Backspace" && !digitos[i] && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowLeft" && i > 0) refs.current[i - 1]?.focus();
    if (e.key === "ArrowRight" && i < 5) refs.current[i + 1]?.focus();
  };
  return (
    <fieldset className={s.codigo}>
      <legend className={s.codigoEtiqueta}>Código de verificación <span>App autenticadora</span></legend>
      <input type="hidden" name="codigo" value={digitos.join("")} />
      <div className={s.codigoCasillas}>
        {digitos.map((d, i) => (
          <span key={i} style={{ display: "contents" }}>
            {i === 3 && <span className={s.codigoGuion} aria-hidden="true" />}
            <input ref={(el) => { refs.current[i] = el; }} className={`${s.casilla} ${resaltar && !d ? s.casillaFoco : ""}`}
              inputMode="numeric" autoComplete={i === 0 ? "one-time-code" : "off"} maxLength={6} value={d} aria-label={`Dígito ${i + 1} de 6`}
              onChange={(e) => poner(i, e.target.value)} onKeyDown={(e) => tecla(i, e)}
              onPaste={(e: ClipboardEvent<HTMLInputElement>) => { e.preventDefault(); pegar(e.clipboardData.getData("text"), i); }} />
          </span>
        ))}
      </div>
      <span className={s.codigoAyuda}>Solo si activaste la verificación en dos pasos (obligatoria para administradores).</span>
    </fieldset>
  );
}

export function FormularioIngreso({ siguiente }: { siguiente: string | null }) {
  const [estado, accion, enviando] = useActionState<EstadoIngreso, FormData>(accionIngresar, { error: null, pideCodigo: false, correo: "" });
  return (
    <form action={accion} className={s.formulario} noValidate>
      {siguiente && <input type="hidden" name="siguiente" value={siguiente} />}
      <label className="etiqueta">
        <span>Correo electrónico</span>
        <input className="campo" type="email" name="correo" placeholder="nombre@empresa.com.ve" autoComplete="username" required defaultValue={estado.correo} />
      </label>
      <label className="etiqueta">
        <span className={s.claveEtiqueta}>Contraseña <a href="#soporte" title="Pídele a un administrador del sistema que la restablezca">¿La olvidaste?</a></span>
        <input className="campo" type="password" name="clave" autoComplete="current-password" required />
      </label>
      <CodigoVerificacion resaltar={estado.pideCodigo} />
      <label className={s.mantener}><input type="checkbox" name="mantener" />Mantener la sesión en este equipo</label>
      {estado.error && <p className={s.error} role="alert">{estado.error}</p>}
      <button type="submit" className={`boton boton-primario ${s.entrar}`} disabled={enviando}>{enviando ? "Verificando…" : "Entrar al panel"}</button>
    </form>
  );
}
