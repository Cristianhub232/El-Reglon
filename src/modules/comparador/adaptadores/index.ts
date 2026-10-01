// Lector según la plataforma de la tienda. Para sumar una plataforma: un archivo en esta carpeta y una línea aquí.
import type { Tienda } from "../tiendas.ts";
import type { OfertaTienda } from "./tipos.ts";
import { buscarVtex } from "./vtex.ts";

export const AGENTE = "ElRenglon/0.1 (+https://elrenglonve.org; comparador de precios)";

export function buscarEnTienda(t: Tienda, consulta: string, limite = 24): Promise<OfertaTienda[]> {
  switch (t.plataforma) {
    case "vtex": return buscarVtex(t, consulta, limite, AGENTE);
  }
}
