import { endpoint } from "../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../core/http.ts";
import { detectar, validarEntrada } from "../../../../../modules/arancel/deteccion.ts";

export const dynamic = "force-dynamic";

// Versión rápida por texto: GET /api/v1/arancel/detectar?q=teléfono celular&limite=5
export const GET = endpoint("arancel", async (_req, url, _ctx, sesion) =>
  detectar(validarEntrada({ descripcion: url.searchParams.get("q"), limite: url.searchParams.get("limite") ?? undefined }), sesion.api_key_id));

export const POST = endpoint("arancel", async (req, _url, _ctx, sesion) => {
  if (!(req.headers.get("content-type") ?? "").includes("application/json")) {
    throw new ErrorApi(415, "tipo_contenido", "Envíe el cuerpo como JSON (Content-Type: application/json)");
  }
  const texto = await req.text();
  if (texto.length > 8_192) throw new ErrorApi(413, "cuerpo_grande", "El cuerpo no puede superar 8 KB");
  let cuerpo: unknown;
  try { cuerpo = JSON.parse(texto); } catch { throw new ErrorApi(400, "json_invalido", "El cuerpo no es un JSON válido"); }
  if (!cuerpo || typeof cuerpo !== "object" || Array.isArray(cuerpo)) throw new ErrorApi(400, "cuerpo_invalido", "El cuerpo debe ser un objeto JSON");
  return detectar(validarEntrada(cuerpo as Record<string, unknown>), sesion.api_key_id);
});
