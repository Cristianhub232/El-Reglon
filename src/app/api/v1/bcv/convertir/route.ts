import { endpoint } from "../../../../../core/ruta.ts";
import { decimal, fecha, hoyCaracas, moneda } from "../../../../../core/validacion.ts";
import { convertir } from "../../../../../modules/bcv/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("bcv", async (_req, url) => {
  const p = url.searchParams;
  return convertir(decimal(p.get("monto"), "monto"), moneda(p.get("de"), "de"), moneda(p.get("a"), "a", "VES"), fecha(p.get("fecha"), "fecha", hoyCaracas()));
});
