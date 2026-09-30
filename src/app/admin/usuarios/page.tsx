// Usuarios y roles (resources/Admin.dc.html · USUARIOS), solo superadministrador
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { MATRIZ, ROLES, type Rol } from "../../../core/auth/roles.ts";
import { FormAccion, ZonaSecretos } from "../../../ui/admin/FormAccion.tsx";
import { fechaHora, haceCuanto } from "../../../ui/formato.ts";
import { accionActivar, accionCambiarRol, accionInvitar, accionRestablecer } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Usuarios y roles" };

const celda = (t: string) => <span className={`punto ${t === "Sí" ? "t-exento" : t === "—" ? "t-apagado" : "t-condicionado"}`}>{t}</span>;

export default async function Usuarios() {
  const u = await requerirSeccion("usuarios");
  const usuarios = await consulta<{ id: number; nombre: string; correo: string; rol: Rol; totp_activo: boolean; activo: boolean; ultimo_acceso: string | null; debe_cambiar_clave: boolean }>(
    "SELECT id, nombre, correo, rol, totp_activo, activo, ultimo_acceso::text, debe_cambiar_clave FROM core.usuario ORDER BY activo DESC, rol, nombre");
  const activos = usuarios.filter((x) => x.activo).length;
  return (
    <div className={s.seccion}>
      <ZonaSecretos>
        <div className={s.encabezado}>
          <div><h1>Usuarios y roles</h1><span className={s.subtitulo}>{activos} {activos === 1 ? "usuario activo" : "usuarios activos"} · verificación en dos pasos obligatoria para administradores</span></div>
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Invitar usuario</strong></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionInvitar} boton="Invitar usuario">
              <div className={s.formularioFila}>
                <label className={s.etiquetaChica}><span>Nombre <span className={s.obligatorio}>*</span></span><input className={s.campoChico} name="nombre" required maxLength={120} /></label>
                <label className={s.etiquetaChica}><span>Correo <span className={s.obligatorio}>*</span></span><input className={s.campoChico} name="correo" type="email" required /></label>
                <label className={s.etiquetaChica}><span>Rol</span>
                  <select className={s.campoChico} name="rol" defaultValue="lectura">{(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r].nombre}</option>)}</select></label>
              </div>
            </FormAccion>
          </div>
        </div>
        <div className={s.tablaMarco}>
          <table className={s.tabla} style={{ minWidth: 980 }}>
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>2FA</th><th>Último acceso</th><th>Acciones</th></tr></thead>
            <tbody>
              {usuarios.map((x) => (
                <tr key={x.id} style={{ opacity: x.activo ? 1 : 0.55 }}>
                  <td><span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className={s.avatar} style={{ width: 28, height: 28, fontSize: 12, background: "var(--linea-suave)" }}>{x.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]).join("")}</span>
                    <span className={s.celdaNombre}><strong>{x.nombre}</strong>{!x.activo ? <span>desactivado</span> : x.debe_cambiar_clave ? <span>con contraseña temporal</span> : null}</span>
                  </span></td>
                  <td style={{ color: "var(--texto-2)" }}>{x.correo}</td>
                  <td>
                    <FormAccion accion={accionCambiarRol} boton="Guardar" estiloBoton="texto" limpiar={false} className="">
                      <input type="hidden" name="id" value={x.id} />
                      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: ROLES[x.rol].color, flex: "none" }} />
                        <select className={s.campoChico} name="rol" defaultValue={x.rol} style={{ padding: "6px 8px", width: "auto" }} aria-label={`Rol de ${x.nombre}`}>
                          {(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r].corto}</option>)}
                        </select>
                      </span>
                    </FormAccion>
                  </td>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 500, color: x.totp_activo ? "var(--exento)" : "var(--rojo)" }}>{x.totp_activo ? "Sí" : "No"}</td>
                  <td className={s.apagado} title={x.ultimo_acceso ? fechaHora(x.ultimo_acceso) : undefined}>{haceCuanto(x.ultimo_acceso)}</td>
                  <td>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4, alignItems: "flex-start" }}>
                      <FormAccion accion={accionRestablecer} boton="Restablecer contraseña" estiloBoton="texto" className="" confirmar={`¿Generar una contraseña temporal para ${x.correo}? Se cerrarán sus sesiones.`}>
                        <input type="hidden" name="id" value={x.id} />
                      </FormAccion>
                      {x.totp_activo && (
                        <FormAccion accion={accionRestablecer} boton="Restablecer contraseña y 2FA" estiloBoton="texto" className="" confirmar={`¿Reiniciar la contraseña y la verificación en dos pasos de ${x.correo}?`}>
                          <input type="hidden" name="id" value={x.id} /><input type="hidden" name="con2fa" value="1" />
                        </FormAccion>
                      )}
                      {x.id !== u.id && (
                        <FormAccion accion={accionActivar} boton={x.activo ? "Desactivar" : "Activar"} estiloBoton={x.activo ? "peligro" : "texto"} className=""
                          confirmar={x.activo ? `¿Desactivar a ${x.correo}? Se cerrarán sus sesiones.` : undefined}>
                          <input type="hidden" name="id" value={x.id} />
                        </FormAccion>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}><strong>Matriz de permisos</strong></div>
          <table className={s.tabla} style={{ minWidth: 760 }}>
            <thead><tr><th></th>{(Object.keys(ROLES) as Rol[]).map((r) => <th key={r} style={{ color: "var(--tinta)", fontWeight: 700 }}>{ROLES[r].corto}</th>)}</tr></thead>
            <tbody>{MATRIZ.map(([p, v]) => <tr key={p}><td>{p}</td>{v.map((c, i) => <td key={i}>{celda(c)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </ZonaSecretos>
    </div>
  );
}
