// Baja de los avisos push de este dispositivo
import { ErrorApi } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { endpoint } from "../../../../../core/ruta.ts";
import { darDeBaja } from "../../../../../modules/avisos/suscripciones.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint(null, async (req) => {
  limitarPorIp(req.headers, "avisos", 20);
  const b = await req.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof b?.endpoint !== "string" || b.endpoint.length > 1000) throw new ErrorApi(400, "endpoint_invalido", "Falta el endpoint de la suscripción");
  return darDeBaja(b.endpoint);
});
