// Botón flotante de contacto (docs/27): el mensaje se guarda y se avisa a soporte@. Límite por IP y campo trampa.
import { cookies } from "next/headers";
import { limitarPorIp, ipCliente } from "../../../../core/limite-ip.ts";
import { endpoint } from "../../../../core/ruta.ts";
import { recibir, validar } from "../../../../modules/contacto/mensajes.ts";
import { COOKIE_VISITANTE } from "../../../../modules/analitica/registro.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint(null, async (req) => {
  limitarPorIp(req.headers, "contacto", 5);
  const b = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (b && String(b.sitio_web ?? "")) return { recibido: true };          // campo trampa: solo lo llenan los robots
  const e = validar(b);
  const visitante = (await cookies()).get(COOKIE_VISITANTE)?.value ?? null;
  return recibir(e, { ip: ipCliente(req.headers), agente: req.headers.get("user-agent"), visitante });
});
