// Archivo de calendario (.ics, RFC 5545) con los deberes tributarios: un evento de día completo por vencimiento,
// con aviso el día anterior. Lo genera el navegador (herramienta "Mis deberes tributarios").
import { fecha } from "../formato.ts";

export interface DeberIcs { fecha: string; fecha_limite: string; obligacion: string; nombre: string; base: string; periodo_desde: string | null; periodo_hasta: string | null }

export function calendarioIcs(r: { rif: string; deberes: DeberIcs[] }): string {
  const esc = (x: string) => x.replace(/[\\;,]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const dia = (f: string) => f.replace(/-/g, "");
  const siguiente = (f: string) => new Date(Date.parse(`${f}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, "");
  const ahora = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const eventos = r.deberes.map((d) => [
    "BEGIN:VEVENT", `UID:${r.rif}-${d.obligacion}-${d.fecha_limite}@elrenglonve.org`, `DTSTAMP:${ahora}`,
    `DTSTART;VALUE=DATE:${dia(d.fecha_limite)}`, `DTEND;VALUE=DATE:${siguiente(d.fecha_limite)}`,
    `SUMMARY:${esc(`${d.nombre} (${r.rif})`)}`,
    `DESCRIPTION:${esc([d.periodo_desde && d.periodo_hasta ? `Período del ${fecha(d.periodo_desde)} al ${fecha(d.periodo_hasta)}.` : "", d.base,
      d.fecha !== d.fecha_limite ? `Vencía el ${fecha(d.fecha)}: día inhábil, se traslada (COT art. 10).` : "", "Calculado por El Renglón · elrenglonve.org"].filter(Boolean).join("\n"))}`,
    "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${esc(`Mañana vence: ${d.nombre}`)}`, "TRIGGER:-P1D", "END:VALARM",
    "END:VEVENT"].join("\r\n"));
  // RFC 5545: líneas de como mucho 75 octetos; las largas continúan en la siguiente con un espacio al inicio
  const plegar = (linea: string) => {
    const bytes = new TextEncoder();
    let salida = "", actual = "";
    for (const c of linea) {
      if (bytes.encode(actual + c).length > (salida ? 74 : 75)) { salida += `${salida ? "\r\n " : ""}${actual}`; actual = ""; }
      actual += c;
    }
    return salida ? `${salida}\r\n ${actual}` : actual;
  };
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//El Renglon//Deberes tributarios//ES", "CALSCALE:GREGORIAN",
    `X-WR-CALNAME:${esc(`Deberes tributarios ${r.rif}`)}`, ...eventos, "END:VCALENDAR"].join("\r\n").split("\r\n").map(plegar).join("\r\n");
}

