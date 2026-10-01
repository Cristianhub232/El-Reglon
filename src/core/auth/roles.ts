// Roles y matriz de permisos del panel (resources/Admin.dc.html, "Matriz de permisos")
export type Rol = "super" | "curador" | "dev" | "lectura";
export type Seccion = "resumen" | "apikeys" | "usuarios" | "catalogo" | "arancel" | "calendario" | "noticias" | "comparador" | "auditoria";

export const ROLES: Record<Rol, { nombre: string; corto: string; color: string; descripcion: string }> = {
  super: { nombre: "Superadministrador", corto: "Superadministrador", color: "#F2B632", descripcion: "Acceso total al sistema" },
  curador: { nombre: "Curador / asesor tributario", corto: "Curador / asesor", color: "#6B9BE0", descripcion: "Catálogos IVA y arancel" },
  dev: { nombre: "Desarrollador", corto: "Desarrollador", color: "#D9453A", descripcion: "Sus propias API keys" },
  lectura: { nombre: "Solo lectura", corto: "Solo lectura", color: "#5A6170", descripcion: "Consulta y reportes" },
};

export const SECCIONES: Record<Seccion, { titulo: string; ruta: string }> = {
  resumen: { titulo: "Resumen", ruta: "/admin" },
  apikeys: { titulo: "API keys", ruta: "/admin/api-keys" },
  usuarios: { titulo: "Usuarios y roles", ruta: "/admin/usuarios" },
  catalogo: { titulo: "Catálogo legal IVA", ruta: "/admin/catalogo" },
  arancel: { titulo: "Arancel", ruta: "/admin/arancel" },
  calendario: { titulo: "Calendario", ruta: "/admin/calendario" },
  noticias: { titulo: "Noticiero", ruta: "/admin/noticias" },
  comparador: { titulo: "Comparador de precios", ruta: "/admin/comparador" },
  auditoria: { titulo: "Auditoría", ruta: "/admin/auditoria" },
};

export const GRUPOS: [string, Seccion[]][] = [
  ["General", ["resumen"]], ["Acceso", ["apikeys", "usuarios"]],
  ["Catálogos", ["catalogo", "arancel", "calendario"]], ["Contenido", ["noticias", "comparador"]], ["Control", ["auditoria"]],
];

const VE: Record<Rol, Seccion[]> = {
  super: ["resumen", "apikeys", "usuarios", "catalogo", "arancel", "calendario", "noticias", "comparador", "auditoria"],
  curador: ["resumen", "catalogo", "arancel", "calendario", "noticias", "comparador", "auditoria"],
  dev: ["resumen", "apikeys"],
  lectura: ["resumen", "apikeys", "catalogo", "arancel", "calendario", "noticias", "comparador", "auditoria"],
};
export const puedeVer = (rol: Rol, s: Seccion) => VE[rol].includes(s);

export type Permiso = "apikeys.gestionar" | "apikeys.propias" | "usuarios.gestionar" | "catalogo.editar" | "arancel.editar" | "calendario.editar" | "noticias.gestionar" | "comparador.gestionar";
const PUEDE: Record<Permiso, Rol[]> = {
  "apikeys.gestionar": ["super"],             // cualquier API key y las solicitudes
  "apikeys.propias": ["super", "dev"],        // crear y revocar las propias
  "usuarios.gestionar": ["super"],
  "catalogo.editar": ["super", "curador"],
  "arancel.editar": ["super", "curador"],
  "calendario.editar": ["super", "curador"],
  "noticias.gestionar": ["super", "curador"],        // leer ahora, activar fuentes, ocultar titulares
  "comparador.gestionar": ["super", "curador"],      // pausar o reactivar tiendas del comparador
};
export const puede = (rol: Rol, p: Permiso) => PUEDE[p].includes(rol);

// Tabla que se muestra en "Usuarios y roles" (fiel a la implementación de arriba)
export const MATRIZ: [string, [string, string, string, string]][] = [
  ["Ver resumen y métricas", ["Sí", "Sí", "Propias", "Sí"]],
  ["Crear y revocar API keys", ["Sí", "—", "Propias", "—"]],
  ["Gestionar usuarios y roles", ["Sí", "—", "—", "—"]],
  ["Editar catálogo legal IVA", ["Sí", "Sí", "—", "Lectura"]],
  ["Editar arancel y sinónimos", ["Sí", "Sí", "—", "Lectura"]],
  ["Editar calendario", ["Sí", "Sí", "—", "Lectura"]],
  ["Gestionar noticiero", ["Sí", "Sí", "—", "Lectura"]],
  ["Gestionar comparador de precios", ["Sí", "Sí", "—", "Lectura"]],
  ["Ver auditoría", ["Sí", "Sí", "—", "Sí"]],
];
