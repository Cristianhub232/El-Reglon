import { endpoint } from "../../../../../core/ruta.ts";
import { fecha, hoyCaracas, moneda } from "../../../../../core/validacion.ts";
import { tasaAplicable } from "../../../../../modules/bcv/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("bcv", async (_req, url) =>
  tasaAplicable(fecha(url.searchParams.get("fecha"), "fecha", hoyCaracas()), moneda(url.searchParams.get("moneda"), "moneda", "USD")));
