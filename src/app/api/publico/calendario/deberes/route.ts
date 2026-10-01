// "Mis deberes tributarios" sin API key (herramienta de la portada): próximos deberes de un RIF según el tipo de
// contribuyente y sus condiciones. Límite por IP. El RIF consultado se registra (analitica.rif_consultado, docs/23).
import { endpoint } from "../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { hoyCaracas, requerido } from "../../../../../core/validacion.ts";
import { misDeberes } from "../../../../../modules/calendario/consultas.ts";
import { registrarRif, visitanteDe } from "../../../../../modules/analitica/registro.ts";
import { ipCliente } from "../../../../../core/limite-ip.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint(null, async (req, url) => {
  limitarPorIp(req.headers, "calendario-publico", 30);
  const p = url.searchParams;
  const rif = requerido(p.get("rif"), "rif").trim();
  if (rif.length > 20) throw new ErrorApi(400, "rif_invalido", "El RIF es demasiado largo");
  const condiciones = (p.get("condiciones") ?? "").split(",").map((c) => c.trim().toUpperCase()).filter((c) => /^[A-Z_]{3,40}$/.test(c)).slice(0, 10);
  const tipo = requerido(p.get("tipo"), "tipo");
  const registro = { rif, origen: "web" as const, herramienta: "deberes" as const, tipo, condiciones, visitante: visitanteDe(req), ip: ipCliente(req.headers) };
  try {
    const r = await misDeberes(rif, tipo, condiciones, hoyCaracas(), 30);
    void registrarRif({ ...registro, rif: r.rif ?? rif, valido: true }).catch(() => {});
    return r;
  } catch (e) {
    if (e instanceof ErrorApi && e.codigo === "rif_invalido") void registrarRif({ ...registro, valido: false }).catch(() => {});
    throw e;
  }
});
