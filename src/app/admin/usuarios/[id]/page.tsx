// Ficha de un usuario del panel: datos editables, seguridad (contraseña, 2FA, bloqueo), sesiones abiertas, API keys,
// activación o eliminación y su actividad en la auditoría. Solo superadministrador.
import Link from "next/link";
import { notFound } from "next/navigation";
import { consulta } from "../../../../core/db.ts";
import { requerirSeccion } from "../../../../core/auth/dal.ts";
import { ROLES, type Rol } from "../../../../core/auth/roles.ts";
import { EstadoUsuario } from "../../../../ui/admin/EstadoUsuario.tsx";
import { FormAccion, ZonaSecretos } from "../../../../ui/admin/FormAccion.tsx";
import { CATEGORIAS, categoria, describir } from "../../../../ui/admin/eventos.ts";
import { fechaHora, haceCuanto } from "../../../../ui/formato.ts";
import {
  accionActivar, accionCerrarSesiones, accionDesbloquear, accionEditarUsuario, accionEliminar, accionReiniciar2fa, accionRestablecer,
} from "../acciones.ts";
import s from "../../../../ui/admin/admin.module.css";

export const metadata = { title: "Usuario" };

interface Usuario { id: number; nombre: string; correo: string; rol: Rol; totp_activo: boolean; activo: boolean; debe_cambiar_clave: boolean;
  intentos_fallidos: number; bloqueado_hasta: string | null; bloqueado: boolean; creado_en: string; ultimo_acceso: string | null }

export default async function FichaUsuario({ params }: { params: Promise<{ id: string }> }) {
  const yo = await requerirSeccion("usuarios");
  const id = Number((await params).id);
  if (!Number.isInteger(id)) notFound();
  const [[u], sesiones, keys, actividad] = await Promise.all([
    consulta<Usuario & Record<string, unknown>>(
      `SELECT id, nombre, correo, rol, totp_activo, activo, debe_cambiar_clave, intentos_fallidos, bloqueado_hasta::text,
              coalesce(bloqueado_hasta > now(), false) AS bloqueado, creado_en::text, ultimo_acceso::text FROM core.usuario WHERE id = $1`, [id]),
    consulta<{ token_hash: string; creada_en: string; ultimo_uso: string; expira_en: string; agente: string | null }>(
      "SELECT token_hash, creada_en::text, ultimo_uso::text, expira_en::text, agente FROM core.sesion WHERE usuario_id = $1 AND expira_en > now() ORDER BY ultimo_uso DESC", [id]),
    consulta<{ prefijo: string; nombre: string; activa: boolean; permisos: string[] }>(
      "SELECT prefijo, nombre, activa, permisos FROM core.api_key WHERE usuario_id = $1 ORDER BY activa DESC, creada_en DESC", [id]),
    consulta<{ ocurrido_en: string; actor: string; accion: string; detalle: Record<string, unknown> }>(
      `SELECT ocurrido_en::text, actor, accion, detalle FROM core.auditoria
        WHERE actor = (SELECT correo FROM core.usuario WHERE id = $1) OR (accion LIKE 'usuario.%' AND detalle->>'correo' = (SELECT correo FROM core.usuario WHERE id = $1))
        ORDER BY ocurrido_en DESC LIMIT 25`, [id]),
  ]);
  if (!u) notFound();
  const soyYo = u.id === yo.id;
  const oculto = (extra?: Record<string, string>) => (<>
    <input type="hidden" name="id" value={u.id} />
    {Object.entries(extra ?? {}).map(([k, v]) => <input key={k} type="hidden" name={k} value={v} />)}
  </>);
  return (
    <div className={s.seccion}>
      <ZonaSecretos>
        <div className={s.encabezado}>
          <div style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
            <span className={s.avatar} style={{ width: 52, height: 52, fontSize: 18 }}>{u.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}</span>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              <h1>{u.nombre}{soyYo && <span className={s.apagado} style={{ font: "500 15px var(--sans)" }}> · tú</span>}</h1>
              <span className={s.subtitulo}>{u.correo} · {ROLES[u.rol].nombre} · <EstadoUsuario u={u} /></span>
            </div>
          </div>
          <Link href="/admin/usuarios" className="boton boton-secundario boton-chico">Volver a usuarios</Link>
        </div>

        <div className={s.rejilla2}>
          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Datos</strong><span className={s.apagado}>Creado el {fechaHora(u.creado_en).slice(0, 10)} · último acceso {haceCuanto(u.ultimo_acceso)}</span></div>
            <div className={s.panelCuerpo}>
              <FormAccion accion={accionEditarUsuario} boton="Guardar cambios" limpiar={false}>
                {oculto()}
                <label className={s.etiquetaChica}><span>Nombre</span><input key={u.nombre} className={s.campoChico} name="nombre" defaultValue={u.nombre} required maxLength={120} /></label>
                <label className={s.etiquetaChica}><span>Correo</span><input key={u.correo} className={s.campoChico} name="correo" type="email" defaultValue={u.correo} required /></label>
                <label className={s.etiquetaChica}><span>Rol</span>
                  <select key={u.rol} className={s.campoChico} name="rol" defaultValue={u.rol}>{(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r].nombre} · {ROLES[r].descripcion}</option>)}</select></label>
                <span className={s.apagado}>Cambiar el correo o el rol cierra sus sesiones: vuelve a entrar con sus nuevos datos y permisos.</span>
              </FormAccion>
            </div>
          </div>

          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Seguridad</strong></div>
            <div className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span>Contraseña</span>{u.debe_cambiar_clave ? <span className="punto t-condicionado">temporal, pendiente de cambio</span> : <span className="punto t-exento">definida por el usuario</span>}
            </div>
            <div className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span>Verificación en dos pasos</span>{u.totp_activo ? <span className="punto t-exento">activa</span> : <span className="punto t-adicional">inactiva{u.rol === "super" ? " (obligatoria)" : ""}</span>}
            </div>
            <div className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
              <span>Intentos fallidos seguidos</span>{u.bloqueado ? <span className="punto t-adicional">bloqueado hasta las {fechaHora(u.bloqueado_hasta!).slice(11)}</span> : <span className="mono">{u.intentos_fallidos}</span>}
            </div>
            <div className={s.panelCuerpo} style={{ gap: 10 }}>
              {soyYo ? <span className={s.apagado}>Tu contraseña y tu verificación en dos pasos se cambian en <Link href="/admin/cuenta" style={{ fontWeight: 600 }}>Mi cuenta</Link>.</span> : <>
              <FormAccion accion={accionRestablecer} boton="Restablecer contraseña" estiloBoton="secundario" confirmar={`¿Generar una contraseña temporal para ${u.correo}? Se cerrarán sus sesiones.`}>{oculto()}</FormAccion>
              {u.totp_activo && <FormAccion accion={accionReiniciar2fa} boton="Reiniciar verificación en dos pasos" estiloBoton="secundario" confirmar="¿Reiniciar la verificación en dos pasos? Deberá configurarla de nuevo (útil si perdió el teléfono).">{oculto()}</FormAccion>}
              {(u.bloqueado || u.intentos_fallidos > 0) && <FormAccion accion={accionDesbloquear} boton="Desbloquear cuenta" estiloBoton="secundario">{oculto()}</FormAccion>}
              </>}
            </div>
          </div>
        </div>

        <div className={s.rejilla2}>
          <div className={s.panel}>
            <div className={s.panelCabeza}>
              <strong>Sesiones abiertas · {sesiones.length}</strong>
              {sesiones.length > 1 && <FormAccion accion={accionCerrarSesiones} boton="Cerrar todas" estiloBoton="peligro" className="" confirmar="¿Cerrar todas sus sesiones?">{oculto()}</FormAccion>}
            </div>
            {sesiones.length === 0 && <div className={s.vacio}>Sin sesiones abiertas.</div>}
            {sesiones.map((x) => (
              <div key={x.token_hash} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1fr) auto" }}>
                <span className={s.celdaNombre}><strong style={{ fontWeight: 500, fontSize: 13, color: "var(--texto-2)" }}>{x.agente?.slice(0, 90) ?? "Navegador desconocido"}</strong>
                  <span>Inició {fechaHora(x.creada_en)} · último uso {haceCuanto(x.ultimo_uso)} · vence {fechaHora(x.expira_en).slice(0, 10)}</span></span>
                <FormAccion accion={accionCerrarSesiones} boton="Cerrar" estiloBoton="peligro" className="">{oculto({ sesion: x.token_hash })}</FormAccion>
              </div>
            ))}
          </div>

          <div className={s.panel}>
            <div className={s.panelCabeza}><strong>Acceso</strong></div>
            <div className={s.panelCuerpo}>
              {soyYo ? <span className={s.apagado}>No puedes desactivar ni eliminar tu propia cuenta.</span> : (
                <FormAccion accion={accionActivar} boton={u.activo ? "Desactivar usuario" : "Activar usuario"} estiloBoton={u.activo ? "secundario" : "primario"}
                  confirmar={u.activo ? `¿Desactivar a ${u.correo}? Perderá el acceso y se cerrarán sus sesiones.` : undefined}>
                  {oculto()}
                  <span style={{ fontSize: 14, color: "var(--texto-2)" }}>{u.activo ? "Desactivar quita el acceso al panel sin borrar su historial; se puede volver a activar." : "Está desactivado: no puede iniciar sesión."}</span>
                </FormAccion>
              )}
              {!soyYo && !u.activo && (
                <FormAccion accion={accionEliminar} boton="Eliminar definitivamente" estiloBoton="peligro" limpiar={false}>
                  {oculto()}
                  <label className={s.etiquetaChica}><span>Para eliminarlo, escribe su correo</span><input className={s.campoChico} name="confirmar" placeholder={u.correo} autoComplete="off" /></label>
                  <span className={s.apagado}>La auditoría conserva sus acciones; sus API keys quedan sin dueño.</span>
                </FormAccion>
              )}
              <div>
                <span className={s.apagado} style={{ display: "block", marginBottom: 6 }}>API keys de este usuario</span>
                {keys.length === 0 ? <span className={s.apagado}>Ninguna.</span> : keys.map((k) => (
                  <div key={k.prefijo} style={{ fontSize: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <span className="mono">rgl_{k.prefijo}</span><span>{k.nombre}</span><span className={`punto ${k.activa ? "t-exento" : "t-adicional"}`}>{k.activa ? "activa" : "revocada"}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className={s.tablaMarco}>
          <div className={s.panelCabeza}><strong>Actividad</strong><Link href={`/admin/auditoria?q=${encodeURIComponent(u.correo)}`} style={{ fontSize: 14, fontWeight: 600 }}>Ver todo en auditoría</Link></div>
          <table className={s.tabla} style={{ minWidth: 760 }}>
            <thead><tr><th style={{ width: 150 }}>Fecha</th><th style={{ width: 180 }}>Actor</th><th style={{ width: 200 }}>Acción</th><th>Detalle</th></tr></thead>
            <tbody>
              {actividad.length === 0 && <tr><td colSpan={4} className={s.apagado}>Sin actividad registrada.</td></tr>}
              {actividad.map((a, i) => (
                <tr key={i}>
                  <td className={s.monoChico} style={{ color: "var(--texto-3)" }}>{fechaHora(a.ocurrido_en)}</td>
                  <td style={{ fontWeight: 600, color: "var(--tinta)", wordBreak: "break-word" }}>{a.actor}</td>
                  <td><span className={`punto ${CATEGORIAS[categoria(a.accion)].clase}`}>{a.accion}</span></td>
                  <td style={{ color: "var(--texto-2)" }}>{describir(a.accion, a.detalle)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ZonaSecretos>
    </div>
  );
}
