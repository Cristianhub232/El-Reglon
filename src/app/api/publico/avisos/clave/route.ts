// Clave pública VAPID para suscribirse a los avisos push (docs/24). Sin claves configuradas, los avisos no se ofrecen.
import { ErrorApi } from "../../../../../core/http.ts";
import { endpoint } from "../../../../../core/ruta.ts";
import { avisosConfigurados } from "../../../../../modules/avisos/envio.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint(null, async () => {
  if (!avisosConfigurados()) throw new ErrorApi(404, "avisos_no_disponibles", "Los avisos no están disponibles en este momento");
  return { clave: process.env.VAPID_PUBLICO };
});
