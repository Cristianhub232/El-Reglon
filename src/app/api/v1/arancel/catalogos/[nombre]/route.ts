import { endpoint } from "../../../../../../core/ruta.ts";
import { catalogo } from "../../../../../../modules/arancel/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint<{ params: Promise<{ nombre: string }> }>("arancel", async (_req, _url, ctx) => catalogo((await ctx.params).nombre));
