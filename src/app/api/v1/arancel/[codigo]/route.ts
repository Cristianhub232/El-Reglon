import { endpoint } from "../../../../../core/ruta.ts";
import { detalle } from "../../../../../modules/arancel/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint<{ params: Promise<{ codigo: string }> }>("arancel", async (_req, _url, ctx) =>
  detalle(decodeURIComponent((await ctx.params).codigo)));
