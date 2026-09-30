// API keys (resources/Admin.dc.html · API KEYS). Super: todas y las solicitudes; dev: las propias; lectura: consulta.
import { consulta } from "../../../core/db.ts";
import { requerirSeccion } from "../../../core/auth/dal.ts";
import { puede } from "../../../core/auth/roles.ts";
import { FormAccion, ZonaSecretos } from "../../../ui/admin/FormAccion.tsx";
import { fechaHora, haceCuanto } from "../../../ui/formato.ts";
import { accionAprobarSolicitud, accionCrearKey, accionRechazarSolicitud, accionRevocarKey } from "./acciones.ts";
import s from "../../../ui/admin/admin.module.css";

export const metadata = { title: "API keys" };

interface Key { id: number; nombre: string; prefijo: string; permisos: string[]; limite_por_minuto: number; activa: boolean; ultimo_uso: string | null; creada_en: string; dueno: string | null; usuario_id: number | null; contacto: string | null; hoy: string }

export default async function ApiKeys() {
  const u = await requerirSeccion("apikeys");
  const todas = u.rol !== "dev";
  const gestiona = puede(u.rol, "apikeys.gestionar");
  const crea = puede(u.rol, "apikeys.propias");
  const [keys, solicitudes] = await Promise.all([
    consulta<Key & Record<string, unknown>>(
      `SELECT k.id, k.nombre, k.prefijo, k.permisos, k.limite_por_minuto, k.activa, k.ultimo_uso::text, k.creada_en::text, us.nombre AS dueno, k.usuario_id, k.contacto,
              coalesce((SELECT sum(consultas) FROM core.uso_diario d WHERE d.api_key_id = k.id AND d.fecha = (now() AT TIME ZONE 'America/Caracas')::date), 0) AS hoy
         FROM core.api_key k LEFT JOIN core.usuario us ON us.id = k.usuario_id
        WHERE $1 OR k.usuario_id = $2 ORDER BY k.activa DESC, k.creada_en DESC LIMIT 500`, [todas, u.id]),
    gestiona ? consulta<{ id: number; creada_en: string; nombre: string; correo: string; organizacion: string | null; uso: string; permisos: string[] }>(
      "SELECT id, creada_en::text, nombre, correo, organizacion, uso, permisos FROM core.solicitud_api_key WHERE estado = 'pendiente' ORDER BY creada_en") : Promise.resolve([]),
  ]);
  const activas = keys.filter((k) => k.activa).length;
  return (
    <div className={s.seccion}>
      <ZonaSecretos>
      <div className={s.encabezado}>
        <div><h1>API keys</h1><span className={s.subtitulo}>Solo se guarda el SHA-256. El token se muestra una única vez. {activas} activas{todas ? "" : " tuyas"}.</span></div>
      </div>
      {!crea && <div className={s.soloLectura}>Modo solo lectura: puedes consultar las API keys, pero no crear ni revocar.</div>}

      {crea && (
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Nueva API key</strong></div>
          <div className={s.panelCuerpo}>
            <FormAccion accion={accionCrearKey} boton="Crear API key">
              <div className={s.formularioFila}>
                <label className={s.etiquetaChica}><span>Nombre <span className={s.obligatorio}>*</span></span>
                  <input className={s.campoChico} name="nombre" placeholder="Tienda en línea, POS de la sucursal…" required minLength={3} maxLength={120} /></label>
                <label className={s.etiquetaChica}><span>Contacto</span>
                  <input className={s.campoChico} name="contacto" placeholder="Responsable técnico (opcional)" maxLength={200} /></label>
                <label className={s.etiquetaChica}><span>Límite por minuto</span>
                  <input className={`${s.campoChico} ${s.campoMono}`} name="limite" type="number" min={1} max={gestiona ? 10000 : 120} defaultValue={60} /></label>
              </div>
              <div className={s.etiquetaChica}><span>Módulos permitidos <span className={s.obligatorio}>*</span></span>
                <div className={s.casillas}>
                  {["iva", "bcv", "arancel", "calendario", "rif", "noticias"].map((m) => (
                    <label key={m}><input type="checkbox" name="permisos" value={m} defaultChecked={m === "iva" || m === "bcv"} /><span className="mono">{m}</span></label>
                  ))}
                </div>
              </div>
            </FormAccion>
          </div>
        </div>
      )}

      {gestiona && solicitudes.length > 0 && (
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Solicitudes pendientes</strong><span className="punto t-condicionado">{solicitudes.length} por atender</span></div>
          {solicitudes.map((q) => (
            <div key={q.id} className={s.fila} style={{ gridTemplateColumns: "minmax(0,1.4fr) minmax(0,1.6fr) auto", alignItems: "start" }}>
              <span className={s.celdaNombre}><strong>{q.organizacion ?? q.nombre}</strong><span>{q.nombre} · {q.correo} · {haceCuanto(q.creada_en)}</span></span>
              <span style={{ fontSize: 14, color: "var(--texto-2)" }}>{q.uso}<br /><span className={s.monoChico}>{q.permisos.join(", ")}</span></span>
              <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 200 }}>
                <FormAccion accion={accionAprobarSolicitud} boton="Aprobar" limpiar={false}>
                  <input type="hidden" name="id" value={q.id} />
                  <label className={s.etiquetaChica}><span>Límite/min</span><input className={`${s.campoChico} ${s.campoMono}`} name="limite" type="number" min={1} max={10000} defaultValue={60} /></label>
                </FormAccion>
                <FormAccion accion={accionRechazarSolicitud} boton="Rechazar" estiloBoton="peligro" confirmar="¿Rechazar esta solicitud?">
                  <input type="hidden" name="id" value={q.id} />
                </FormAccion>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={s.tablaMarco}>
        <table className={s.tabla} style={{ minWidth: 860 }}>
          <thead><tr><th>Nombre</th><th>Prefijo</th><th>Permisos</th><th>Límite/min</th><th>Hoy</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            {keys.length === 0 && <tr><td colSpan={8} className={s.apagado}>Todavía no hay API keys.</td></tr>}
            {keys.map((k) => (
              <tr key={k.id}>
                <td><span className={s.celdaNombre}><strong>{k.nombre}</strong><span>{k.dueno ?? k.contacto ?? "CLI"}</span></span></td>
                <td className={s.monoChico}>rgl_{k.prefijo}</td>
                <td className={s.monoChico}>{k.permisos.join(", ")}</td>
                <td className="mono" style={{ color: "var(--texto-2)" }}>{k.limite_por_minuto}</td>
                <td className="mono" style={{ color: "var(--texto-2)" }}>{Number(k.hoy)}</td>
                <td className={s.apagado} title={k.ultimo_uso ? fechaHora(k.ultimo_uso) : undefined}>{haceCuanto(k.ultimo_uso)}</td>
                <td>{k.activa ? <span className="punto t-exento">activa</span> : <span className="punto t-adicional">revocada</span>}</td>
                <td>{k.activa && crea && (gestiona || k.usuario_id === u.id) && (
                  <FormAccion accion={accionRevocarKey} boton="Revocar" estiloBoton="peligro" confirmar={`¿Revocar rgl_${k.prefijo}? Las aplicaciones que la usan dejarán de funcionar.`} className="">
                    <input type="hidden" name="id" value={k.id} />
                  </FormAccion>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      </ZonaSecretos>
    </div>
  );
}
