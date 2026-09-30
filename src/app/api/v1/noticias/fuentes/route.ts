import { endpoint } from "../../../../../core/ruta.ts";
import { fuentes } from "../../../../../modules/noticias/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("noticias", async () => ({ fuentes: await fuentes() }));
