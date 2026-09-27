import { endpoint } from "../../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../../core/http.ts";
import { codigo } from "../../../../../../modules/iva/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint<{ params: Promise<{ codigo: string }> }>("iva", async (_req, _url, ctx) => {
  const c = decodeURIComponent((await ctx.params).codigo);
  if (!c.trim() || c.length > 64) throw new ErrorApi(400, "codigo_invalido", "El código debe tener entre 1 y 64 caracteres");
  return codigo(c);
});
