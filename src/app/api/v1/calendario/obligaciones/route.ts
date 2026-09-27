import { endpoint } from "../../../../../core/ruta.ts";
import { obligaciones } from "../../../../../modules/calendario/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("calendario", async () => obligaciones());
