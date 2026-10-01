// Alta o cambio de una suscripción a los avisos push: temas y RIF seguidos (docs/24). Límite por IP.
import { after } from "next/server";
import { ErrorApi } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { endpoint } from "../../../../../core/ruta.ts";
import { visitanteDe } from "../../../../../modules/analitica/registro.ts";
import { guardarSuscripcion } from "../../../../../modules/avisos/suscripciones.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint(null, async (req) => {
  limitarPorIp(req.headers, "avisos", 20);
  const texto = await req.text();
  if (texto.length > 8_192) throw new ErrorApi(413, "cuerpo_grande", "El cuerpo no puede superar 8 KB");
  let b: Record<string, unknown>;
  try { b = JSON.parse(texto); } catch { throw new ErrorApi(400, "json_invalido", "El cuerpo no es un JSON válido"); }
  return guardarSuscripcion(b, { visitante: visitanteDe(req), agente: req.headers.get("user-agent") ?? "", despues: after });
});
