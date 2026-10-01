// Avisos automáticos de cada tema (docs/24):
//   tasa      → cuando el BCV publica una tasa nueva (bcv-programador)
//   noticias  → resumen a las 8:00, 13:00 y 19:00, hora de Caracas (noticias-programador)
//   deberes   → 3 días antes y el mismo día del vencimiento, a las 8:00, por cada RIF seguido (noticias-programador)
import { consulta } from "../../core/db.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { numero } from "../../ui/formato.ts";
import { difundir, enviar, registrarEnvioSuelto, type Destino } from "./envio.ts";

const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;
const pct = (v: number) => `${v >= 0 ? "+" : "−"}${numero(Math.abs(v), 2)} %`;

export async function avisarTasa(fechaValor: string) {
  const filas = await consulta<{ moneda: string; venta_bs: string; anterior: string | null }>(
    `SELECT t.moneda, t.venta_bs, (SELECT a.venta_bs FROM bcv.tasa a WHERE a.moneda = t.moneda AND a.fecha_valor < t.fecha_valor ORDER BY a.fecha_valor DESC LIMIT 1) AS anterior
       FROM bcv.tasa t WHERE t.fecha_valor = $1::date AND t.moneda IN ('USD', 'EUR')`, [fechaValor]);
  const usd = filas.find((f) => f.moneda === "USD"), eur = filas.find((f) => f.moneda === "EUR");
  if (!usd || !eur) return null;
  const linea = (n: string, f: typeof usd) => `${n} Bs. ${numero(f.venta_bs, 4)}${f.anterior ? ` (${pct((Number(f.venta_bs) / Number(f.anterior) - 1) * 100)})` : ""}`;
  return difundir("tasa", { titulo: `Tasa oficial BCV · fecha valor ${ddmm(fechaValor)}`, cuerpo: `${linea("Dólar", usd)} · ${linea("Euro", eur)}`, url: "/#tasas", etiqueta: "tasa" },
    { clave: `tasa:${fechaValor}`, origen: "automatico" });
}

// Resumen de titulares de la franja (8, 13 o 19 h): los publicados desde la franja anterior
export async function avisarNoticias(franja: number) {
  const hoy = hoyCaracas();
  const [r] = await consulta<{ nuevos: number; titulo: string | null; fuente: string | null }>(
    `WITH nuevos AS (
       SELECT a.titulo, f.nombre AS fuente, a.publicado_en FROM noticias.articulo a JOIN noticias.fuente f ON f.id = a.fuente_id
        WHERE a.visible AND f.activa AND a.publicado_en > now() - make_interval(hours => $1))
     SELECT (SELECT count(*)::int FROM nuevos) AS nuevos,
            (SELECT titulo FROM nuevos ORDER BY publicado_en DESC LIMIT 1) AS titulo,
            (SELECT fuente FROM nuevos ORDER BY publicado_en DESC LIMIT 1) AS fuente`, [franja === 8 ? 13 : franja === 13 ? 5 : 6]);
  if (!r?.nuevos || !r.titulo) return null;
  return difundir("noticias", {
    titulo: `Noticias del día · ${r.nuevos} ${r.nuevos === 1 ? "titular nuevo" : "titulares nuevos"}`,
    cuerpo: `${r.titulo}${r.fuente ? ` (${r.fuente})` : ""}`, url: "/noticias", etiqueta: "noticias",
  }, { clave: `noticias:${hoy}:${franja}`, origen: "automatico" });
}

interface DeberRif { obligacion: string; nombre: string; fecha_limite: string; dias_restantes: number; periodo_desde: string | null; periodo_hasta: string | null }

// Vencimientos de cada RIF seguido: un aviso por dispositivo, RIF y momento (si vencen varios el mismo día, van juntos).
// Corre cada hora entre las 8:00 y las 11:59; avisos.envio_deber evita repetir, así que quien se suscribe a media
// mañana también recibe el aviso del día. "hoy" solo se pasa en pruebas.
export async function avisarDeberes(hoy = hoyCaracas()) {
  const seguidos = await consulta<Destino & { rif: string; tipo: string; condiciones: string[] }>(
    `SELECT s.id::int, s.endpoint, s.p256dh, s.auth, r.rif, r.tipo, r.condiciones FROM avisos.suscripcion s
       JOIN avisos.suscripcion_rif r ON r.suscripcion_id = s.id WHERE s.temas @> ARRAY['deberes']`);
  let destinatarios = 0, entregados = 0, fallidos = 0;
  for (const x of seguidos) {
    let deberes: DeberRif[];
    try {
      deberes = await consulta<DeberRif & Record<string, unknown>>(
        "SELECT * FROM calendario.proximos_deberes($1, $2, $3::text[], $4::date, 30)", [x.rif, x.tipo, x.condiciones, hoy]);
    } catch { continue; }                                          // RIF o condición que ya no es válida
    for (const [momento, dias] of [["hoy", 0], ["3_dias", 3]] as const) {
      const lista = deberes.filter((d) => d.dias_restantes === dias);
      if (!lista.length) continue;
      // Control por dispositivo: solo los que aún no se avisaron en este momento
      const nuevos: DeberRif[] = [];
      for (const d of lista) {
        const [ok] = await consulta(
          `INSERT INTO avisos.envio_deber (suscripcion_id, rif, obligacion, fecha_limite, momento) VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT DO NOTHING RETURNING 1`, [x.id, x.rif, d.obligacion, d.fecha_limite, momento]);
        if (ok) nuevos.push(d);
      }
      if (!nuevos.length) continue;
      const cuando = momento === "hoy" ? "Hoy vence" : `El ${ddmm(nuevos[0].fecha_limite)} vence`;
      const titulo = nuevos.length === 1 ? `${cuando}: ${nuevos[0].nombre}` : `${cuando.replace("vence", "vencen")} ${nuevos.length} deberes tributarios`;
      const cuerpo = `RIF ${x.rif} · ${nuevos.map((d) => d.nombre + (d.periodo_desde && d.periodo_hasta ? ` (del ${ddmm(d.periodo_desde)} al ${ddmm(d.periodo_hasta)})` : "")).join(" · ")}`;
      const r = await enviar([x], { titulo, cuerpo, url: "/#deberes", etiqueta: `deber-${x.rif}` }, 20 * 3600);
      destinatarios++; entregados += r.entregados; fallidos += r.fallidos;
    }
  }
  if (!destinatarios) return null;
  const resumen = { destinatarios, entregados, fallidos };
  await registrarEnvioSuelto("deberes", { titulo: "Vencimientos de deberes tributarios", cuerpo: `${destinatarios} ${destinatarios === 1 ? "aviso" : "avisos"} de vencimiento (3 días antes o el día)`, url: "/#deberes" }, "automatico", resumen);
  return resumen;
}

// Avisos programados (noticias-programador, cada hora): la franja de noticias vigente (hasta 2 h tarde, por si el
// proceso se reinició) y los vencimientos entre las 8:00 y las 11:59
export async function avisosProgramados() {
  const hora = Number(new Intl.DateTimeFormat("es-VE", { hour: "numeric", hourCycle: "h23", timeZone: "America/Caracas" }).format(new Date()));
  const franja = [19, 13, 8].find((f) => hora >= f);
  const salida: Record<string, unknown> = {};
  if (franja !== undefined && hora - franja < 2) salida.noticias = await avisarNoticias(franja);
  if (hora >= 8 && hora < 12) salida.deberes = await avisarDeberes();
  await consulta("SELECT avisos.purgar()").catch(() => {});
  return salida;
}
