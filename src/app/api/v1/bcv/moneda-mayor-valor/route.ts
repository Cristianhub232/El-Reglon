import { endpoint } from "../../../../../core/ruta.ts";
import { fecha, hoyCaracas } from "../../../../../core/validacion.ts";
import { monedaMayorValor } from "../../../../../modules/bcv/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("bcv", async (_req, url) => monedaMayorValor(fecha(url.searchParams.get("fecha"), "fecha", hoyCaracas())));
