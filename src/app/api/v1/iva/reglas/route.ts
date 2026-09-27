import { endpoint } from "../../../../../core/ruta.ts";
import { reglas } from "../../../../../modules/iva/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("iva", async (_req, url) => reglas(url.searchParams.get("q")?.trim().slice(0, 200) || null, url.searchParams.get("tipo")));
