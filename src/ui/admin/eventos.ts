// Descripción legible de los eventos de core.auditoria y su categoría (colores del diseño: Admin.dc.html, ACC_COL)
export type Categoria = "acceso" | "iva" | "bcv" | "arancel" | "calendario" | "noticias";

export const CATEGORIAS: Record<Categoria, { titulo: string; clase: string }> = {
  acceso: { titulo: "Acceso", clase: "t-general" },
  iva: { titulo: "IVA", clase: "t-exento" },
  bcv: { titulo: "BCV", clase: "t-condicionado" },
  arancel: { titulo: "Arancel", clase: "t-reducida" },
  calendario: { titulo: "Calendario", clase: "t-adicional" },
  noticias: { titulo: "Noticiero", clase: "t-apagado" },
};

export function categoria(accion: string): Categoria {
  const m = accion.split(".")[0];
  if (m === "bcv" || m === "iva" || m === "arancel" || m === "calendario" || m === "noticias") return m;
  return "acceso";
}

const lista = (v: unknown) => (Array.isArray(v) ? v.join(", ") : "");

export function describir(accion: string, d: Record<string, unknown>): string {
  const t = (k: string) => (d[k] === undefined || d[k] === null ? "" : String(d[k]));
  switch (accion) {
    case "api_key.crear": return `rgl_${t("prefijo")} · ${t("nombre")} · ${lista(d.permisos)}`;
    case "api_key.revocar": return `rgl_${t("prefijo")}${d.nombre ? ` · ${t("nombre")}` : ""}`;
    case "solicitud_api_key.crear": return `${t("nombre")}${d.organizacion ? ` · ${t("organizacion")}` : ""} · ${lista(d.permisos)}`;
    case "solicitud_api_key.aprobar": return `${t("nombre")} → rgl_${t("prefijo")}`;
    case "solicitud_api_key.rechazar": return `${t("nombre")}${d.motivo ? ` · ${t("motivo")}` : ""}`;
    case "usuario.crear": case "usuario.invitar": return `${t("correo")} · ${t("rol")}`;
    case "usuario.rol": return `${t("correo")}: ${t("antes")} → ${t("despues")}`;
    case "usuario.desactivar": case "usuario.activar": case "usuario.restablecer": case "usuario.2fa.reiniciar": case "usuario.desbloquear": return t("correo");
    case "usuario.editar": {
      const c = (d.cambios ?? {}) as Record<string, [string, string]>;
      return `${t("correo")}: ${Object.entries(c).map(([k, [a, b]]) => `${k} ${a} → ${b}`).join(" · ")}`;
    }
    case "usuario.sesiones.cerrar": return `${t("correo")} · ${t("sesiones")} ${d.sesiones === 1 ? "sesión cerrada" : "sesiones cerradas"}`;
    case "usuario.eliminar": return `${t("correo")} (${t("nombre")})`;
    case "usuario.clave": return d.temporal ? "Cambió la contraseña temporal" : "Cambió su contraseña";
    case "usuario.2fa.activar": return "Activó la verificación en dos pasos";
    case "usuario.2fa.desactivar": return "Desactivó la verificación en dos pasos";
    case "sesion.inicio": return d.mantener ? "Inició sesión (mantener sesión)" : "Inició sesión";
    case "sesion.cierre": return "Cerró sesión";
    case "sesion.fallida": return `Intento fallido (${t("motivo")})${d.intentos ? ` · ${t("intentos")} seguidos` : ""}`;
    case "bcv.registrada": return `Portada BCV: registrada la fecha valor ${t("fecha_valor")}`;
    case "bcv.sin_cambios": return `Portada BCV: sin_cambios para fecha valor ${t("fecha_valor")}`;
    case "bcv.discrepancia": return `Fecha valor ${t("fecha_valor")}: difiere del registro; no se sobrescribe, queda para revisión`;
    case "bcv.lectura_fallida": return `No se pudo leer la portada: ${t("error").slice(0, 120)}`;
    case "iva.catalogo.cargar": return `Catálogo ${t("version")} · ${t("reglas")} reglas`;
    case "iva.regla.editar": return `${t("regla")} v${t("antes")} → v${t("despues")} · ${t("motivo")}`;
    case "iva.consulta.revisar": return `${t("cantidad")} consultas marcadas como revisadas`;
    case "arancel.sinonimos.cargar": return `Diccionario ${t("version")} · ${t("grupos")} grupos`;
    case "arancel.sinonimo.crear": return `«${lista(d.terminos)}» → ${lista(d.prefijos)} · prioridad ${t("prioridad")}`;
    case "arancel.sinonimo.eliminar": return `Grupo «${t("grupo")}»`;
    case "calendario.inhabil.crear": return `${t("fecha")} ${t("descripcion")} · ${t("tipo")}`;
    case "calendario.inhabil.eliminar": return `${t("fecha")} ${t("descripcion")}`;
    case "noticias.leer": return `Lectura manual (${t("fuente")}): ${t("nuevos")} nuevos, ${t("actualizados")} actualizados${Number(d.errores) ? ` · ${t("errores")} con error` : ""}`;
    case "noticias.fuente.pausar": return `Pausó ${t("nombre")}`;
    case "noticias.fuente.activar": return `Reactivó ${t("nombre")}`;
    case "noticias.titular.ocultar": return `Ocultó «${t("titulo")}» (${t("fuente")})`;
    case "noticias.titular.mostrar": return `Volvió a mostrar «${t("titulo")}» (${t("fuente")})`;
    default: return Object.entries(d).slice(0, 4).map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`).join(" · ");
  }
}
