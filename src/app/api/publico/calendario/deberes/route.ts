// "Mis deberes tributarios" sin API key (herramienta de la portada): próximos deberes de un RIF según el tipo de
// contribuyente y sus condiciones. Límite por IP; el RIF no se guarda.
import { endpoint } from "../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { hoyCaracas, requerido } from "../../../../../core/validacion.ts";
import { misDeberes } from "../../../../../modules/calendario/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint(null, async (req, url) => {
  limitarPorIp(req.headers, "calendario-publico", 30);
  const p = url.searchParams;
  const rif = requerido(p.get("rif"), "rif").trim();
  if (rif.length > 20) throw new ErrorApi(400, "rif_invalido", "El RIF es demasiado largo");
  const condiciones = (p.get("condiciones") ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z_]{3,40}$/.test(c)).slice(0, 10);
  return misDeberes(rif, requerido(p.get("tipo"), "tipo"), condiciones, hoyCaracas(), 30);
});
