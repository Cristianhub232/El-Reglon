// Temas y RIF de la suscripción de este dispositivo (la identifica su endpoint, que solo conoce el navegador)
import { ErrorApi } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { endpoint } from "../../../../../core/ruta.ts";
import { estadoSuscripcion } from "../../../../../modules/avisos/suscripciones.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint(null, async (req) => {
  limitarPorIp(req.headers, "avisos", 60);
  const b = await req.json().catch(() => null) as { endpoint?: unknown } | null;
  if (typeof b?.endpoint !== "string" || b.endpoint.length > 1000) throw new ErrorApi(400, "endpoint_invalido", "Falta el endpoint de la suscripción");
  return (await estadoSuscripcion(b.endpoint)) ?? { temas: [], rifs: [] };
});
