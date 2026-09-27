import { consulta } from "../../../core/db.ts";
import { endpoint } from "../../../core/ruta.ts";

export const dynamic = "force-dynamic";

// Sin API key: estado del servicio y frescura de los datos
export const GET = endpoint(null, async () => {
  const [r] = await consulta<Record<string, string | null>>(`SELECT
    (SELECT max(fecha_valor)::text FROM bcv.publicacion) AS bcv_ultima_fecha_valor,
    (SELECT max(fecha_publicacion)::text FROM arancel.version) AS arancel_ultima_reforma,
    (SELECT max(fecha)::text FROM calendario.vencimiento) AS calendario_hasta`);
  return { estado: "ok", servicio: "El Renglón", version: "0.1.0", datos: r };
});
