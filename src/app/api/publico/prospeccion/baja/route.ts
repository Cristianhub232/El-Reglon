// Baja en un clic (RFC 8058): Gmail y Yahoo llaman con POST a la dirección de List-Unsubscribe
import { ErrorApi } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { endpoint } from "../../../../../core/ruta.ts";
import { bajaPorToken } from "../../../../../modules/prospeccion/prospectos.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint(null, async (req, url) => {
  limitarPorIp(req.headers, "prospeccion", 20);
  if (!(await bajaPorToken(url.searchParams.get("t") ?? "", "un_clic"))) throw new ErrorApi(404, "enlace_invalido", "El enlace de baja no es válido");
  return { baja: true };
});
