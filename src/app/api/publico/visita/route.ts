// Registro de visitas del sitio público (docs/23): el navegador avisa cada página vista. Si no tiene la cookie de
// visitante, se le asigna una (identificador aleatorio, 1 año). No cuenta robots ni el panel de administración.
import { cookies } from "next/headers";
import { ipCliente, permitir } from "../../../../core/limite-ip.ts";
import { COOKIE_VISITANTE, esRobot, limpiarReferente, nuevoVisitante, registrarVisita, visitanteValido } from "../../../../modules/analitica/registro.ts";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sinContenido = () => new Response(null, { status: 204, headers: { "Cache-Control": "no-store" } });
  const ip = ipCliente(req.headers);
  const agente = req.headers.get("user-agent") ?? "";
  if (esRobot(agente) || !permitir(`visita:${ip ?? "*"}`, ip ? 120 : 2400)) return sinContenido();
  let d: { ruta?: unknown; referente?: unknown; idioma?: unknown; pantalla?: unknown };
  try { const t = await req.text(); if (t.length > 2048) return sinContenido(); d = JSON.parse(t); } catch { return sinContenido(); }
  const ruta = typeof d.ruta === "string" && d.ruta.startsWith("/") ? d.ruta.split("?")[0].split("#")[0] : null;
  if (!ruta || ruta.startsWith("/admin") || ruta.startsWith("/api") || ruta.startsWith("/ingresar")) return sinContenido();
  const almacen = await cookies();
  let visitante = visitanteValido(almacen.get(COOKIE_VISITANTE)?.value);
  if (!visitante) {
    visitante = nuevoVisitante();
    almacen.set(COOKIE_VISITANTE, visitante, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 365 * 86_400,
      secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SEGURA !== "0" });
  }
  await registrarVisita({ visitante, ruta, referente: limpiarReferente(typeof d.referente === "string" ? d.referente : null), ip, agente,
    idioma: typeof d.idioma === "string" ? d.idioma : null, pantalla: typeof d.pantalla === "string" && /^\d{2,5}x\d{2,5}$/.test(d.pantalla) ? d.pantalla : null })
    .catch((e) => console.error("[el-renglon] visita:", (e as Error).message));
  return sinContenido();
}
