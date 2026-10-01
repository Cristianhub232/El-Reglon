import { endpoint } from "../../../../../core/ruta.ts";
import { tiendasActivas } from "../../../../../modules/comparador/buscador.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("comparador", async () => ({
  tiendas: (await tiendasActivas()).map((t) => ({ id: t.id, nombre: t.nombre, sitio: t.sitio, rubros: t.rubros, moneda_publicada: t.moneda,
    ubicacion: t.ubicacion ?? null, sucursal_predeterminada: t.predeterminada ?? null,
    sucursales: t.sucursales?.map((s) => ({ clave: s.clave, nombre: s.nombre, ciudad: s.ciudad ?? null, estado: s.estado ?? null })) ?? [] })),
}));
