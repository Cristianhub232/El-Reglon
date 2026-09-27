import { endpoint } from "../../../../../core/ruta.ts";
import { secciones } from "../../../../../modules/arancel/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("arancel", async () => secciones());
