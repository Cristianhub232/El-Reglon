import { endpoint } from "../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../core/http.ts";
import { ipCliente } from "../../../../../core/limite-ip.ts";
import { clasificarSolicitud } from "../../../../../modules/iva/clasificador.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint("iva", async (req, _url, _ctx, sesion) => {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ErrorApi(415, "tipo_contenido", "Envíe el cuerpo como JSON (Content-Type: application/json)");
  }
  const texto = await req.text();
  if (texto.length > 16_384) throw new ErrorApi(413, "cuerpo_grande", "El cuerpo no puede superar 16 KB");
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(texto); } catch { throw new ErrorApi(400, "json_invalido", "El cuerpo no es un JSON válido"); }
  return clasificarSolicitud(cuerpo, sesion.api_key_id, { canal: "api", ip: ipCliente(req.headers), agente: req.headers.get("user-agent") });
});
