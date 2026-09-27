import { endpoint } from "../../../../../core/ruta.ts";
import { baseLegal } from "../../../../../modules/iva/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("iva", async () => baseLegal());
