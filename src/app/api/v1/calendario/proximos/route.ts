import { endpoint } from "../../../../../core/ruta.ts";
import { entero, fecha, hoyCaracas, requerido } from "../../../../../core/validacion.ts";
import { proximos } from "../../../../../modules/calendario/consultas.ts";

export const dynamic = "force-dynamic";
// ?rif=J-00002961-0&tipo=ESPECIAL|ORDINARIO[&condiciones=A,B][&desde=AAAA-MM-DD][&limite=10]
export const GET = endpoint("calendario", async (_req, url) => {
  const p = url.searchParams;
  const condiciones = (p.get("condiciones") ?? "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  return proximos(requerido(p.get("rif"), "rif"), requerido(p.get("tipo"), "tipo"), condiciones,
    fecha(p.get("desde"), "desde", hoyCaracas()), entero(p.get("limite"), "limite", 1, 100, 10));
});
