import { endpoint } from "../../../../../core/ruta.ts";
import { tiendasActivas } from "../../../../../modules/comparador/buscador.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("comparador", async () => ({
  tiendas: (await tiendasActivas()).map((t) => ({ id: t.id, nombre: t.nombre, sitio: t.sitio, rubros: t.rubros, moneda_publicada: t.moneda })),
}));
