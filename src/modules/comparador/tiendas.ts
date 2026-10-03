// Registro de tiendas del comparador (datos/comparador/tiendas.json): lo leen la app, los servicios de cada tienda
// y la configuración de PM2 (comparador/ecosystem.config.cjs)
import registro from "../../../datos/comparador/tiendas.json" with { type: "json" };

export type Plataforma = "vtex" | "woocommerce" | "alacena" | "magento" | "shopify" | "woostore" | "kromi" | "medusa" | "arigato" | "instaleap" | "farmatodo" | "plansuarez" | "gama" | "farmahorro" | "epa";
export type Moneda = "VES" | "USD";
export type Rubro = "supermercado" | "farmacia" | "electronica" | "hogar";
export interface Sede { clave: string; nombre: string; ciudad?: string; estado?: string }
export interface Tienda {
  id: string; nombre: string; sitio: string; plataforma: Plataforma; moneda: Moneda; rubros: Rubro[]; puerto: number;
  sucursales?: Sede[]; predeterminada?: string;          // catálogo por sede (p. ej. Central Madeirense)
  ubicacion?: { ciudad: string; estado: string };        // tiendas de una sola ciudad
  api?: string;                                          // dirección de su API cuando no es la del sitio
  modelo_sku?: boolean;                                  // WooCommerce: el SKU es el modelo con prefijo de marca ("LG-LM22SGPK")
  nombre_vtex?: "titulo";                                // VTEX: usar el título del producto en vez de su nombre corto
  // Tiendas por índice: su robots.txt prohíbe la búsqueda pero permite las páginas de producto de su sitemap
  // slug: la URL lleva el nombre del producto; cookie: se envía al leer cada página (p. ej. la sede, "store=t6")
  indice?: { sitemap: string; patron: string; pausa_ms: number; slug?: boolean; cookie?: string };
}

export const TIENDAS = registro.tiendas as Tienda[];
export const tienda = (id: string) => TIENDAS.find((t) => t.id === id);

// Sede a consultar: la pedida si existe en el registro; si no, la predeterminada (o ninguna: tienda sin sedes)
export function sedeDe(t: Tienda, pedida?: string | null): Sede | null {
  if (!t.sucursales?.length) return null;
  return t.sucursales.find((s) => s.clave === pedida) ?? t.sucursales.find((s) => s.clave === t.predeterminada) ?? t.sucursales[0];
}
