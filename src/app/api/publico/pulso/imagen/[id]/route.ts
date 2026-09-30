// Imagen de una publicación del Pulso oficial, guardada en la base (las URL de Instagram caducan).
// Pública y sin API key: es la misma imagen que ya publicó el ente.
import { imagenPulso } from "../../../../../../modules/pulso/consultas.ts";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id <= 0) return new Response("No encontrada", { status: 404 });
  const f = await imagenPulso(id).catch(() => null);
  if (!f) return new Response("No encontrada", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(f.imagen!), { headers: {
    "Content-Type": f.imagen_tipo!, "Cache-Control": "public, max-age=86400, immutable",
    "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'", "Cross-Origin-Resource-Policy": "same-origin",
  } });
}
