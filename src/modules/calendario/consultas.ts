// Módulo Calendario: especiales (Providencia SNAT/2025/000091) y ordinarios (Reglamento IVA art. 60); COT art. 10.
import { consulta } from "../../core/db.ts";
import { ErrorApi } from "../../core/http.ts";

export async function proximos(rif: string, tipo: string, condiciones: string[], desde: string, limite: number) {
  const t = tipo.toUpperCase();
  if (t !== "ESPECIAL" && t !== "ORDINARIO") throw new ErrorApi(400, "tipo_invalido", "'tipo' debe ser ESPECIAL u ORDINARIO");
  const [v] = await consulta<{ valido: boolean; rif_formateado: string | null; terminal: number | null; mensaje: string }>(
    "SELECT valido, rif_formateado, terminal, mensaje FROM rif.validar($1)", [rif]);
  if (!v.valido) throw new ErrorApi(400, "rif_invalido", v.mensaje);
  const deberes = await consulta("SELECT * FROM calendario.proximos_deberes($1, $2, $3::text[], $4::date, $5)", [rif, t, condiciones, desde, limite]);
  return { rif: v.rif_formateado, terminal: v.terminal, tipo_contribuyente: t, condiciones, desde, deberes,
    nota: t === "ESPECIAL" ? "La condición de contribuyente especial la notifica el SENIAT; no se deduce del RIF."
      : "Contribuyentes ordinarios: IVA mensual, igual para todos los terminales del RIF." };
}

export async function obligaciones() {
  return { obligaciones: await consulta(
    `SELECT o.codigo, o.tipo_contribuyente, o.nombre, o.base_legal, o.aplica_a, o.requiere, o.excluye, o.nota, i.nombre AS instrumento, i.gaceta
       FROM calendario.obligacion o JOIN calendario.instrumento i ON i.codigo = o.instrumento ORDER BY o.tipo_contribuyente, o.codigo`) };
}

export async function condiciones() {
  return { condiciones: await consulta("SELECT codigo, descripcion FROM calendario.condicion ORDER BY codigo") };
}

export async function diasInhabiles(anio: number) {
  return { anio, base_legal: "COT art. 10 (feriados y días en que la banca no abre al público)", dias: await consulta(
    "SELECT fecha, descripcion, tipo, base_legal FROM calendario.dia_inhabil WHERE extract(year FROM fecha) = $1 ORDER BY fecha", [anio]) };
}
