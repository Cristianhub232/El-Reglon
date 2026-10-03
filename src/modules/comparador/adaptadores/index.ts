// Lector según la plataforma de la tienda. Para sumar una plataforma: un archivo en esta carpeta y una línea aquí.
import { sedeDe, type Tienda } from "../tiendas.ts";
import { buscarAlacena } from "./alacena.ts";
import { buscarArigato } from "./arigato.ts";
import { buscarKromi } from "./kromi.ts";
import { buscarShopify } from "./shopify.ts";
import { buscarWooStore } from "./woostore.ts";
import { buscarInstaleap } from "./instaleap.ts";
import { buscarMagento } from "./magento.ts";
import { buscarMedusa } from "./medusa.ts";
import type { OfertaTienda } from "./tipos.ts";
import { buscarVtex } from "./vtex.ts";
import { buscarWoocommerce } from "./woocommerce.ts";

export const AGENTE = "ElRenglon/0.1 (+https://elrenglonve.org; comparador de precios)";

export function buscarEnTienda(t: Tienda, consulta: string, limite = 24, sucursal?: string | null): Promise<OfertaTienda[]> {
  switch (t.plataforma) {
    case "vtex": return buscarVtex(t, consulta, limite, AGENTE);
    case "woocommerce": return buscarWoocommerce(t, consulta, limite, AGENTE, sedeDe(t, sucursal));
    case "alacena": return buscarAlacena(t, consulta, limite, AGENTE);
    case "magento": return buscarMagento(t, consulta, limite, AGENTE);
    case "shopify": return buscarShopify(t, consulta, limite, AGENTE);
    case "woostore": return buscarWooStore(t, consulta, limite, AGENTE);
    case "kromi": return buscarKromi(t, consulta, limite, AGENTE);
    case "medusa": return buscarMedusa(t, consulta, limite, AGENTE);
    case "arigato": return buscarArigato(t, consulta, limite, AGENTE);
    case "instaleap": return buscarInstaleap(t, consulta, limite, AGENTE);
    // Tiendas por índice: no se consulta su buscador (lo prohíbe su robots.txt); el servicio busca en el índice propio
    case "farmatodo": case "plansuarez": case "gama": case "farmahorro": return Promise.reject(new Error("Tienda por índice: se busca en el índice propio"));
  }
}
