// Comparador sin API key (buscador de la portada). Respuesta en NDJSON: una línea por evento, en cuanto cada tienda
// responde (inicio, tienda o error, y fin). Límite por IP.
import { ErrorApi, respuestaError } from "../../../../../core/http.ts";
import { limitarPorIp } from "../../../../../core/limite-ip.ts";
import { registrarUso } from "../../../../../core/uso.ts";
import { buscarEnTiendas, registrarBusqueda } from "../../../../../modules/comparador/buscador.ts";
import { agrupar, type Oferta } from "../../../../../modules/comparador/emparejar.ts";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  let q: string;
  try {
    limitarPorIp(req.headers, "comparador-publico", 12);
    q = (new URL(req.url).searchParams.get("q") ?? "").trim().replace(/\s+/g, " ");
    if (q.length < 2 || q.length > 80) throw new ErrorApi(400, "consulta_invalida", "Escriba entre 2 y 80 caracteres");
  } catch (e) {
    const err = e instanceof ErrorApi ? e : new ErrorApi(500, "error_interno", "Error interno");
    registrarUso(null, "comparador", err.estado);
    return respuestaError(err);
  }
  registrarUso(null, "comparador", 200);
  const codificador = new TextEncoder();
  const flujo = new ReadableStream<Uint8Array>({
    async start(c) {
      const ofertas: Oferta[] = [];
      let ok = 0, errores = 0, ms = 0;
      try {
        for await (const ev of buscarEnTiendas(q)) {
          if (ev.tipo === "tienda") { ok++; ofertas.push(...ev.ofertas); }
          if (ev.tipo === "error") errores++;
          if (ev.tipo === "fin") ms = ev.ms;
          c.enqueue(codificador.encode(`${JSON.stringify(ev)}\n`));
        }
      } catch {
        c.enqueue(codificador.encode(`${JSON.stringify({ tipo: "fin", ms: 0, error: "No se pudo completar la búsqueda" })}\n`));
      }
      c.close();
      void registrarBusqueda({ termino: q, origen: "web", ofertas: ofertas.length, grupos: agrupar(ofertas, q).length, ok, errores, ms });
    },
  });
  return new Response(flujo, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store", "X-Accel-Buffering": "no" } });
}
