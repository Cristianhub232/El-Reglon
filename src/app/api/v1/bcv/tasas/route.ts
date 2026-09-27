import { endpoint } from "../../../../../core/ruta.ts";
import { fecha, moneda } from "../../../../../core/validacion.ts";
import { historico, tasasPorFecha } from "../../../../../modules/bcv/consultas.ts";
import { ErrorApi } from "../../../../../core/http.ts";

export const dynamic = "force-dynamic";
// ?fecha=AAAA-MM-DD[&moneda=USD]  → publicación de esa fecha valor
// ?desde=&hasta=&moneda=USD        → histórico
export const GET = endpoint("bcv", async (_req, url) => {
  const p = url.searchParams;
  if (p.get("fecha")) return tasasPorFecha(fecha(p.get("fecha"), "fecha"), p.get("moneda") ? moneda(p.get("moneda"), "moneda") : null);
  if (p.get("desde") || p.get("hasta")) {
    return historico(fecha(p.get("desde"), "desde"), fecha(p.get("hasta"), "hasta"), moneda(p.get("moneda"), "moneda", "USD"));
  }
  throw new ErrorApi(400, "parametro_requerido", "Indique 'fecha' o el rango 'desde' y 'hasta'. Para la tasa vigente use /api/v1/bcv/tasas/actual");
});
