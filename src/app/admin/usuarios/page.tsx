// Usuarios y roles (resources/Admin.dc.html · USUARIOS), solo superadministrador: lista con búsqueda y filtros,
// alta de usuarios y matriz de permisos. Cada usuario tiene su ficha en /admin/usuarios/[id].
import Link from "next/link";
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { MATRIZ, ROLES, type Rol } from "../../../core/auth/roles.ts";
import { EstadoUsuario } from "../../../ui/admin/EstadoUsuario.tsx";
import { FormAccion, ZonaSecretos } from "../../../ui/admin/FormAccion.tsx";
import { fechaHora, haceCuanto } from "../../../ui/formato.ts";
import { accionInvitar } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "Usuarios y roles" };

const celda = (t: string) => <span className={`punto ${t === "Sí" ? "t-exento" : t === "—" ? "t-apagado" : "t-condicionado"}`}>{t}</span>;
const ESTADOS = { activos: "Activos", inactivos: "Desactivados", bloqueados: "Bloqueados", temporal: "Con contraseña temporal", sin2fa: "Sin 2FA" } as const;
type Estado = keyof typeof ESTADOS;

interface Fila { id: number; nombre: string; correo: string; rol: Rol; totp_activo: boolean; activo: boolean; ultimo_acceso: string | null; creado_en: string;
  debe_cambiar_clave: boolean; bloqueado: boolean; sesiones: string }

export default async function Usuarios({ searchParams }: { searchParams: Promise<{ q?: string; rol?: string; estado?: string }> }) {
  await requerirSeccion("usuarios");
  const sp = await searchParams;
  const q = (sp.q ?? "").trim().slice(0, 100);
  const rol = sp.rol && sp.rol in ROLES ? (sp.rol as Rol) : null;
  const estado = sp.estado && sp.estado in ESTADOS ? (sp.estado as Estado) : null;
  const filtroEstado: Record<Estado, string> = {
    activos: "u.activo", inactivos: "NOT u.activo", bloqueados: "coalesce(u.bloqueado_hasta > now(), false)",
    temporal: "u.debe_cambiar_clave", sin2fa: "NOT u.totp_activo",
  };
  const [usuarios, [k]] = await Promise.all([
    consulta<Fila & Record<string, unknown>>(
      `SELECT u.id, u.nombre, u.correo, u.rol, u.totp_activo, u.activo, u.ultimo_acceso::text, u.creado_en::text, u.debe_cambiar_clave,
              coalesce(u.bloqueado_hasta > now(), false) AS bloqueado,
              (SELECT count(*) FROM core.sesion x WHERE x.usuario_id = u.id AND x.expira_en > now()) AS sesiones
         FROM core.usuario u
        WHERE ($1 = '' OR u.nombre ILIKE '%' || $1 || '%' OR u.correo ILIKE '%' || $1 || '%')
          AND ($2::text IS NULL OR u.rol = $2) AND ${estado ? filtroEstado[estado] : "true"}
        ORDER BY u.activo DESC, u.rol, u.nombre`, [q, rol]),
    consulta<{ activos: string; inactivos: string; con2fa: string; bloqueados: string }>(
      `SELECT count(*) FILTER (WHERE activo) AS activos, count(*) FILTER (WHERE NOT activo) AS inactivos,
              count(*) FILTER (WHERE activo AND totp_activo) AS con2fa, count(*) FILTER (WHERE bloqueado_hasta > now()) AS bloqueados FROM core.usuario`),
  ]);
  const hayFiltro = q || rol || estado;
  return (
    <div className={s.seccion}>
      <ZonaSecretos>
        <div className={s.encabezado}>
          <div><h1>Usuarios y roles</h1><span className={s.subtitulo}>Acceso al panel de administración · verificación en dos pasos obligatoria para superadministradores</span></div>
          <a href="#nuevo" className="boton boton-primario boton-chico">Nuevo usuario</a>
        </div>
        <div className={s.kpis}>
          <div className={s.kpi}><span>Usuarios activos</span><span className={s.kpiValor}>{k.activos}</span><span className={`${s.kpiNota} t-apagado`}>con acceso al panel</span></div>
          <div className={s.kpi}><span>Con verificación en dos pasos</span><span className={s.kpiValor}>{k.con2fa}</span><span className={`${s.kpiNota} ${Number(k.con2fa) < Number(k.activos) ? "t-condicionado" : "t-exento"}`}>de {k.activos} activos</span></div>
          <div className={s.kpi}><span>Bloqueados</span><span className={s.kpiValor}>{k.bloqueados}</span><span className={`${s.kpiNota} t-apagado`}>por intentos fallidos</span></div>
          <div className={s.kpi}><span>Desactivados</span><span className={s.kpiValor}>{k.inactivos}</span><span className={`${s.kpiNota} t-apagado`}>sin acceso</span></div>
        </div>

        <form action="/admin/usuarios" className={s.panel} style={{ padding: "14px 16px", display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label className={s.etiquetaChica} style={{ flex: "1 1 240px" }}><span>Buscar</span><input className={s.campoChico} name="q" defaultValue={q} placeholder="Nombre o correo" /></label>
          <label className={s.etiquetaChica} style={{ flex: "0 1 200px" }}><span>Rol</span>
            <select className={s.campoChico} name="rol" defaultValue={rol ?? ""}><option value="">Todos</option>{(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r].nombre}</option>)}</select></label>
          <label className={s.etiquetaChica} style={{ flex: "0 1 220px" }}><span>Estado</span>
            <select className={s.campoChico} name="estado" defaultValue={estado ?? ""}><option value="">Todos</option>{(Object.keys(ESTADOS) as Estado[]).map((e) => <option key={e} value={e}>{ESTADOS[e]}</option>)}</select></label>
          <button type="submit" className="boton boton-secundario boton-chico">Filtrar</button>
          {hayFiltro && <Link href="/admin/usuarios" className={s.botonTexto}>Quitar filtros</Link>}
        </form>

        <div className={s.tablaMarco}>
          <table className={s.tabla} style={{ minWidth: 980 }}>
            <thead><tr><th>Nombre</th><th>Rol</th><th>Estado</th><th>2FA</th><th>Sesiones</th><th>Último acceso</th><th></th></tr></thead>
            <tbody>
              {usuarios.length === 0 && <tr><td colSpan={7} className={s.apagado}>Ningún usuario coincide con el filtro.</td></tr>}
              {usuarios.map((x) => (
                <tr key={x.id} style={{ opacity: x.activo ? 1 : 0.6 }}>
                  <td><Link href={`/admin/usuarios/${x.id}`} style={{ display: "flex", alignItems: "center", gap: 10, color: "inherit" }}>
                    <span className={s.avatar} style={{ width: 30, height: 30, fontSize: 12, background: "var(--linea-suave)" }}>{x.nombre.split(/\s+/).slice(0, 2).map((p) => p[0]?.toUpperCase()).join("")}</span>
                    <span className={s.celdaNombre}><strong>{x.nombre}</strong><span>{x.correo}</span></span>
                  </Link></td>
                  <td><span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, fontWeight: 600, color: "var(--tinta)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: ROLES[x.rol].color }} />{ROLES[x.rol].corto}</span></td>
                  <td><EstadoUsuario u={x} /></td>
                  <td className="mono" style={{ fontSize: 12, fontWeight: 500, color: x.totp_activo ? "var(--exento)" : "var(--rojo)" }}>{x.totp_activo ? "Sí" : "No"}</td>
                  <td className="mono" style={{ color: "var(--texto-2)" }}>{x.sesiones}</td>
                  <td className={s.apagado} title={x.ultimo_acceso ? fechaHora(x.ultimo_acceso) : undefined}>{haceCuanto(x.ultimo_acceso)}</td>
                  <td><Link href={`/admin/usuarios/${x.id}`} style={{ fontSize: 14, fontWeight: 600 }}>Ver y editar</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={s.panel} id="nuevo" style={{ scrollMarginTop: 80 }}>
          <div className={s.panelCabeza}><strong>Nuevo usuario</strong><span className={s.apagado}>Recibe una contraseña temporal que deberá cambiar al entrar</span></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionInvitar} boton="Crear usuario">
              <div className={s.formularioFila}>
                <label className={s.etiquetaChica}><span>Nombre <span className={s.obligatorio}>*</span></span><input className={s.campoChico} name="nombre" required maxLength={120} autoComplete="off" /></label>
                <label className={s.etiquetaChica}><span>Correo <span className={s.obligatorio}>*</span></span><input className={s.campoChico} name="correo" type="email" required autoComplete="off" /></label>
                <label className={s.etiquetaChica}><span>Rol</span>
                  <select className={s.campoChico} name="rol" defaultValue="super">{(Object.keys(ROLES) as Rol[]).map((r) => <option key={r} value={r}>{ROLES[r].nombre} · {ROLES[r].descripcion}</option>)}</select></label>
              </div>
            </FormAccion>
          </div>
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
