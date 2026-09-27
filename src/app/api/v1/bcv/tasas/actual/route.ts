import { endpoint } from "../../../../../../core/ruta.ts";
import { fecha, hoyCaracas } from "../../../../../../core/validacion.ts";
import { tasasVigentes } from "../../../../../../modules/bcv/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("bcv", async (_req, url) => tasasVigentes(fecha(url.searchParams.get("fecha"), "fecha", hoyCaracas())));
