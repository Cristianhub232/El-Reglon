import { endpoint } from "../../../../../core/ruta.ts";
import { entero, fecha, hoyCaracas, requerido } from "../../../../../core/validacion.ts";
import { proximos } from "../../../../../modules/calendario/consultas.ts";
import { registrarRif } from "../../../../../modules/analitica/registro.ts";
import { ipCliente } from "../../../../../core/limite-ip.ts";
import { ErrorApi } from "../../../../../core/http.ts";

export const dynamic = "force-dynamic";
// ?rif=J-00002961-0&tipo=ESPECIAL|ORDINARIO[&condiciones=A,B][&desde=AAAA-MM-DD][&limite=10]
export const GET = endpoint("calendario", async (req, url, _c, sesion) => {
  const p = url.searchParams;
  const condiciones = (p.get("condiciones") ?? "").split(",").map((c) => c.trim().toUpperCase()).filter(Boolean);
  const rif = requerido(p.get("rif"), "rif"), tipo = requerido(p.get("tipo"), "tipo");
  const registro = { rif, origen: "api" as const, herramienta: "calendario" as const, tipo, condiciones, apiKeyId: sesion.api_key_id, ip: ipCliente(req.headers) };
  try {
    const r = await proximos(rif, tipo, condiciones, fecha(p.get("desde"), "desde", hoyCaracas()), entero(p.get("limite"), "limite", 1, 100, 10));
    void registrarRif({ ...registro, rif: r.rif ?? rif, valido: true }).catch(() => {});
    return r;
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === "rif_invalido") void registrarRif({ ...registro, valido: false }).catch(() => {});
    throw e;
  }
});
