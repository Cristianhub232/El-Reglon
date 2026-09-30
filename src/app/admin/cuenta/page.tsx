// Mi cuenta: contraseña (obligatorio cambiar la temporal) y verificación en dos pasos
import QRCode from "qrcode";
import { consulta } from "../../../core/db.ts";
import { requerirUsuario } from "../../../core/auth/dal.ts";
import { ROLES } from "../../../core/auth/roles.ts";
import { descifrarSecreto, uriOtpauth } from "../../../core/auth/totp.ts";
import { FormAccion } from "../../../ui/admin/FormAccion.tsx";
import { accionCambiarClave, accionConfirmarTotp, accionDesactivarTotp, accionEditarPerfil, accionIniciarTotp } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Mi cuenta" };

export default async function Cuenta() {
  const u = await requerirUsuario({ permitirClaveTemporal: true });
  const [d] = await consulta<{ totp_secreto: string | null; totp_activo: boolean }>("SELECT totp_secreto, totp_activo FROM core.usuario WHERE id = $1", [u.id]);
  let qr: { svg: string; secreto: string } | null = null;
  let errorSecreto: string | null = null;
  if (d.totp_secreto && !d.totp_activo) {
    try {
      const secreto = descifrarSecreto(d.totp_secreto);
      qr = { svg: await QRCode.toString(uriOtpauth(secreto, u.correo), { type: "svg", margin: 1, color: { dark: "#0E2440", light: "#FFFFFF" } }), secreto };
    } catch (e) { errorSecreto = (e as Error).message; }
  }
  const tieneClaveSistema = (process.env.APP_SECRETO ?? "").length >= 32;
  return (
    <div className={s.seccion}>
      <div className={s.encabezado}>
        <div><h1>Mi cuenta</h1><span className={s.subtitulo}>{u.nombre} · {u.correo} · {ROLES[u.rol].nombre}</span></div>
      </div>
      {u.debe_cambiar_clave && (
        <div className={`${s.mensaje} ${s.mensajeError}`}>Tu contraseña es temporal. Cámbiala para usar el panel.</div>
      )}
      {u.rol === "super" && !d.totp_activo && !u.debe_cambiar_clave && (
        <div className={s.soloLectura}>La verificación en dos pasos es obligatoria para los superadministradores. Actívala abajo.</div>
      )}
      <div className={s.rejilla2}>
        {!u.debe_cambiar_clave && (
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Mis datos</strong></div>
            <div className={s.panelCuerpo}>
              <FormAccion accion={accionEditarPerfil} boton="Guardar" limpiar={false}>
                <label className={s.etiquetaChica}><span>Nombre</span><input className={s.campoChico} name="nombre" defaultValue={u.nombre} required maxLength={120} /></label>
                <label className={s.etiquetaChica}><span>Correo</span><input className={s.campoChico} value={u.correo} readOnly disabled /></label>
                <span className={s.apagado}>El correo y el rol solo los cambia un superadministrador en «Usuarios y roles».</span>
              </FormAccion>
            </div>
          </div>
        )}
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Contraseña</strong></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionCambiarClave} boton="Cambiar contraseña">
              <label className={s.etiquetaChica}><span>{u.debe_cambiar_clave ? "Contraseña temporal" : "Contraseña actual"}</span>
                <input className={s.campoChico} type="password" name="actual" autoComplete="current-password" required /></label>
              <label className={s.etiquetaChica}><span>Nueva contraseña</span>
                <input className={s.campoChico} type="password" name="nueva" autoComplete="new-password" minLength={12} required /></label>
              <label className={s.etiquetaChica}><span>Repite la nueva contraseña</span>
                <input className={s.campoChico} type="password" name="repetir" autoComplete="new-password" minLength={12} required /></label>
              <span className={s.apagado}>Al menos 12 caracteres. Una frase de varias palabras es más fácil de recordar y más segura.</span>
            </FormAccion>
          </div>
        </div>

        {!u.debe_cambiar_clave && (
          <div className={s.panel}>
            <div className={s.panelCabeza}>
              <strong>Verificación en dos pasos</strong>
              {d.totp_activo ? <span className="punto t-exento">Activa</span> : <span className="punto t-adicional">Inactiva</span>}
            </div>
            <div className={s.panelCuerpo}>
              {!tieneClaveSistema && <p className={`${s.mensaje} ${s.mensajeError}`}>El servidor no tiene configurado APP_SECRETO: la verificación en dos pasos no está disponible.</p>}
              {d.totp_activo ? (
                <FormAccion accion={accionDesactivarTotp} boton="Desactivar" estiloBoton="secundario" confirmar="¿Desactivar la verificación en dos pasos?">
                  <p style={{ fontSize: 14, color: "var(--texto-2)" }}>Al iniciar sesión te pedimos el código de tu app autenticadora. Para desactivarla, escribe un código vigente.</p>
                  <label className={s.etiquetaChica}><span>Código de 6 dígitos</span><input className={`${s.campoChico} ${s.campoMono}`} name="codigo" inputMode="numeric" maxLength={6} required /></label>
                </FormAccion>
              ) : qr ? (
                <>
                  <p style={{ fontSize: 14, color: "var(--texto-2)" }}>1. Escanea este código con tu app autenticadora (Google Authenticator, Microsoft Authenticator, 2FAS…).</p>
                  <div style={{ width: 200, height: 200 }} dangerouslySetInnerHTML={{ __html: qr.svg }} aria-label="Código QR para la app autenticadora" role="img" />
                  <span className={s.apagado}>¿No puedes escanear? Escribe esta clave: <span className="mono" style={{ color: "var(--tinta)", wordBreak: "break-all" }}>{qr.secreto.replace(/(.{4})/g, "$1 ").trim()}</span></span>
                  <FormAccion accion={accionConfirmarTotp} boton="Activar">
                    <label className={s.etiquetaChica}><span>2. Escribe el código que muestra la app</span>
                      <input className={`${s.campoChico} ${s.campoMono}`} name="codigo" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required /></label>
                  </FormAccion>
                </>
              ) : (
                <form action={accionIniciarTotp} className={s.formulario}>
                  <p style={{ fontSize: 14, color: "var(--texto-2)" }}>Protege tu cuenta con un código de 6 dígitos de una app autenticadora, además de la contraseña.</p>
                  {errorSecreto && <p className={`${s.mensaje} ${s.mensajeError}`}>{errorSecreto}</p>}
                  <div className={s.acciones}><button type="submit" className="boton boton-primario boton-chico" disabled={!tieneClaveSistema}>Configurar</button></div>
                </form>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
