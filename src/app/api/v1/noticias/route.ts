import { endpoint } from "../../../../core/ruta.ts";
import { consultaApi } from "../../../../modules/noticias/consultas.ts";

export const dynamic = "force-dynamic";
// ?limite=20&pagina=1&fuente=elpitazo&q=texto&desde=AAAA-MM-DD → titulares más recientes primero
export const GET = endpoint("noticias", async (_req, url) => consultaApi(url.searchParams));
