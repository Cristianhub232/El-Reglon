// Registro de tiendas del comparador (datos/comparador/tiendas.json): lo leen la app, los servicios de cada tienda
// y la configuración de PM2 (comparador/ecosystem.config.cjs)
import registro from "../../../datos/comparador/tiendas.json" with { type: "json" };

export type Plataforma = "vtex";
export type Moneda = "VES" | "USD";
export type Rubro = "supermercado" | "farmacia" | "electronica" | "hogar";
export interface Tienda { id: string; nombre: string; sitio: string; plataforma: Plataforma; moneda: Moneda; rubros: Rubro[]; puerto: number }

export const TIENDAS = registro.tiendas as Tienda[];
export const tienda = (id: string) => TIENDAS.find((t) => t.id === id);
