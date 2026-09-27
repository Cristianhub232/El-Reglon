import { endpoint } from "../../../../../core/ruta.ts";
import { entero } from "../../../../../core/validacion.ts";
import { diasInhabiles } from "../../../../../modules/calendario/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("calendario", async (_req, url) => diasInhabiles(entero(url.searchParams.get("anio"), "anio", 2000, 2100, 2026)));
