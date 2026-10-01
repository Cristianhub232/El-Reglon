import { endpoint } from "../../../../../core/ruta.ts";
import { requerido } from "../../../../../core/validacion.ts";
import { validar } from "../../../../../modules/rif/consultas.ts";
import { registrarRif } from "../../../../../modules/analitica/registro.ts";
import { ipCliente } from "../../../../../core/limite-ip.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("rif", async (req, url, _c, sesion) => {
  const rif = requerido(url.searchParams.get("rif"), "rif");
  const r = await validar(rif) as unknown as { valido: boolean; rif_formateado?: string | null };
  // RIF consultado (docs/23): también los no válidos, si tienen forma de RIF
  void registrarRif({ rif: r.rif_formateado ?? rif, valido: r.valido, origen: "api", herramienta: "rif", apiKeyId: sesion.api_key_id, ip: ipCliente(req.headers) }).catch(() => {});
  return r;
});
