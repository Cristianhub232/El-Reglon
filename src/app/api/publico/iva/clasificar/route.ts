// Clasificador de IVA sin API key, para las herramientas de la página principal ("Consulta sin registrarte").
// Mismo motor y misma respuesta que /api/v1/iva/clasificar, con un límite por IP.
import { endpoint } from "../../../../../core/ruta.ts";
import { ErrorApi } from "../../../../../core/http.ts";
import { ipCliente, limitarPorIp } from "../../../../../core/limite-ip.ts";
import { clasificarSolicitud } from "../../../../../modules/iva/clasificador.ts";
import { imagenReferencia } from "../../../../../modules/comparador/referencia.ts";

export const dynamic = "force-dynamic";
export const POST = endpoint(null, async (req) => {
  limitarPorIp(req.headers, "iva-publico", 30);
  const texto = await req.text();
  if (texto.length > 4_096) throw new ErrorApi(413, "cuerpo_grande", "El cuerpo no puede superar 4 KB");
  let b: Record<string, unknown>;
  try { b = JSON.parse(texto); } catch { throw new ErrorApi(400, "json_invalido", "El cuerpo no es un JSON válido"); }
  if (!b || typeof b !== "object") throw new ErrorApi(400, "cuerpo_invalido", "El cuerpo debe ser un objeto JSON");
  // Solo lo que usa la herramienta pública; los precios van en null (la minería de precios es para la API)
  const r = await clasificarSolicitud({ nombre: b.nombre ?? null, codigo: b.codigo ?? null, operacion: b.operacion, tipo: b.tipo ?? null,
    precio_compra: null, precio_venta: null, moneda: null }, null, { canal: "web", ip: ipCliente(req.headers), agente: req.headers.get("user-agent") }) as Record<string, unknown> & {
      estado: string; entrada?: { nombre?: string | null; codigos?: { codigo: string }[] }; producto_identificado?: { nombre?: string | null } | null };
  // Si el producto quedó determinado, una foto de referencia de lo consultado (de lo que el comparador vio en las tiendas)
  const imagen_referencia = r.estado === "determinado"
    ? await imagenReferencia(r.producto_identificado?.nombre ?? r.entrada?.nombre ?? null, (r.entrada?.codigos ?? []).map((x) => x.codigo)).catch(() => null)
    : null;
  return { ...r, imagen_referencia };
});
