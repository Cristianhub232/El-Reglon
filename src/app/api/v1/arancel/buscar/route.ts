import { endpoint } from "../../../../../core/ruta.ts";
import { entero, requerido } from "../../../../../core/validacion.ts";
import { buscar } from "../../../../../modules/arancel/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("arancel", async (_req, url) => {
  const p = url.searchParams;
  return buscar(requerido(p.get("q"), "q"), p.get("solo_declarables") !== "false", entero(p.get("limite"), "limite", 1, 100, 20));
});
