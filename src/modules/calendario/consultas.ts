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

// Herramienta pública "Mis deberes tributarios" (portada): los próximos deberes del RIF con la cita corta del
// instrumento de cada uno y las condiciones que se pueden declarar. El RIF no se guarda.
export async function misDeberes(rif: string, tipo: string, condicionesPedidas: string[], desde: string, limite: number) {
  const r = await proximos(rif, tipo, condicionesPedidas, desde, limite) as Awaited<ReturnType<typeof proximos>> & {
    deberes: { fecha: string; fecha_limite: string; dias_restantes: number; obligacion: string; nombre: string; base_legal: string;
      periodo_desde: string | null; periodo_hasta: string | null; aviso: string | null }[] };
  const instrumentos = new Map((await consulta<{ codigo: string; nombre: string }>(
    "SELECT o.codigo, i.nombre FROM calendario.obligacion o JOIN calendario.instrumento i ON i.codigo = o.instrumento")).map((f) => [f.codigo, f.nombre]));
  const corto = (n: string | undefined) => /Providencia[^:]*SNAT\/(\d{4})\/(\d+)/.exec(n ?? "")?.[0].replace("Providencia Administrativa", "Providencia")
    ?? (/Reglamento/.test(n ?? "") ? "Reglamento de la Ley de IVA" : n ?? "");
  return { ...r, deberes: r.deberes.map((d) => {
    const inst = corto(instrumentos.get(d.obligacion));
    // Si la base legal ya nombra el instrumento (ordinarios: "Reglamento General Ley IVA art. 60"), va sola
    return { ...d, base: inst && !/Reglamento|Providencia|Decreto/i.test(d.base_legal) ? `${inst}, ${d.base_legal}` : d.base_legal };
  }) };
}
