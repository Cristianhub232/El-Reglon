import { endpoint } from "../../../../../core/ruta.ts";
import { monedas } from "../../../../../modules/bcv/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("bcv", async () => monedas());
