// Condiciones que puede declarar un contribuyente especial (para la herramienta "Mis deberes tributarios")
import { endpoint } from "../../../../../core/ruta.ts";
import { condiciones } from "../../../../../modules/calendario/consultas.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint(null, async () => condiciones());
