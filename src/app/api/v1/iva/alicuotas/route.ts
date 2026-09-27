import { endpoint } from "../../../../../core/ruta.ts";
import { fecha, hoyCaracas } from "../../../../../core/validacion.ts";
import { alicuotas } from "../../../../../modules/iva/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("iva", async (_req, url) => alicuotas(fecha(url.searchParams.get("fecha"), "fecha", hoyCaracas())));
