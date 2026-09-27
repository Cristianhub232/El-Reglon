import { endpoint } from "../../../../../core/ruta.ts";
import { requerido } from "../../../../../core/validacion.ts";
import { validar } from "../../../../../modules/rif/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("rif", async (_req, url) => validar(requerido(url.searchParams.get("rif"), "rif")));
