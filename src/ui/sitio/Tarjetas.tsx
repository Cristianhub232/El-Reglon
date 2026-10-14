// Tarjetas compartidas por la portada y las páginas de cada herramienta: tasas BCV (con USDT), alícuotas de IVA y
// próximos días inhábiles. Mismos estilos que la portada (portada.module.css).
import type { DatosPortada } from "../../modules/web/portada.ts";
import { Grafica } from "./Grafica.tsx";
import { HistorialTasas } from "./HistorialTasas.tsx";
import { diaSemana, fecha, fechaCorta, hora, numero } from "../formato.ts";
import s from "./portada.module.css";

export function Variacion({ v, corta }: { v: number | null; corta?: boolean }) {
  if (v === null) return null;
  const txt = `${numero(Math.abs(v), 2)} %`;
  return <span className={v >= 0 ? s.sube : s.baja}>{corta ? `${v >= 0 ? "+" : "−"}${txt}` : `${v >= 0 ? "▲" : "▼"} ${txt}`}</span>;
}

export function TarjetaTasas({ bcv, p2p }: { bcv: DatosPortada["bcv"]; p2p: DatosPortada["p2p"] }) {
  const usd = bcv?.monedas.find((m) => m.codigo === "USD");
  const eur = bcv?.monedas.find((m) => m.codigo === "EUR");
  return (
    <div className={s.tasas} id="tasas">
      <div className={s.tasasCabeza}>
        <strong>Tasa oficial BCV {bcv?.vigente ? "de hoy" : "vigente"}</strong>
        {bcv && <span className={s.tasasFecha}>Fecha valor {diaSemana(bcv.fecha_valor)} {fecha(bcv.fecha_valor)}{bcv.historial.length > 1 && <HistorialTasas historial={bcv.historial} />}</span>}
      </div>
      {bcv && !bcv.vigente && (
        <span className={s.aviso}>Aún no hay tasa publicada con fecha valor de hoy: se muestra la última publicación del BCV.</span>
      )}
      <div className={s.tasasRejilla}>
        {[usd, eur].filter(Boolean).map((m, i) => (
          <div key={m!.codigo} className={s.tasa}>
            <div className={s.tasaFila}>
              <span className={s.tasaMoneda}>{m!.codigo === "USD" ? "USD · Dólar" : "EUR · Euro"}</span>
              <span className={s.tasaVariacion}><Variacion v={m!.variacion} /></span>
            </div>
            <div className={s.tasaValorFila}>
              <span className={s.tasaValor}><span>Bs.</span><strong>{numero(m!.tasa, 4)}</strong></span>
              <Grafica valores={m!.serie} id={`g${m!.codigo}`} retraso={250 + i * 200}
                color={(m!.variacion ?? 0) >= 0 ? "#2E7D5B" : "#B8352B"} />
            </div>
            <span className={s.tasaNota}>por 1 {m!.codigo} · últimas {m!.serie.length} publicaciones</span>
          </div>
        ))}
      </div>
      <span className={s.tasasPie}>
        Fuente: Banco Central de Venezuela · tasa aplicable según art. 25 de la Ley de IVA
        {bcv?.leida ? ` · leída a las ${hora(bcv.leida)}, hora de Caracas` : ""}
      </span>
      {p2p && (
        <div className={s.p2p} aria-labelledby="p2p-titulo">
          <div className={s.tasaFila}>
            <span id="p2p-titulo" className={s.tasaMoneda}>USDT · Binance P2P</span>
            {p2p.brecha_pct && (
              <span className={`${s.brecha} ${Number(p2p.brecha_pct) >= 0 ? s.brechaSube : s.brechaBaja}`}>
                {Number(p2p.brecha_pct) >= 0 ? "▲ +" : "▼ −"}{numero(Math.abs(Number(p2p.brecha_pct)), 1)} % <span>frente al BCV</span>
              </span>
            )}
          </div>
          <span className={s.p2pValor}><span>Bs.</span><strong>{numero(p2p.promedio, 2)}</strong></span>
          <span className={s.p2pNota}>promedio por 1 USDT</span>
          <dl className={s.p2pDatos}>
            <div><dt>Compra</dt><dd>Bs. {numero(p2p.compra, 2)}</dd></div>
            <div><dt>Venta</dt><dd>Bs. {numero(p2p.venta, 2)}</dd></div>
            {p2p.bcv && <div><dt>BCV</dt><dd>Bs. {numero(p2p.bcv.tasa, 2)}</dd></div>}
          </dl>
          <span className={s.p2pPie}>Fuente: Binance P2P</span>
        </div>
      )}
    </div>
  );
}

export function TarjetaAlicuotas({ alicuotas }: { alicuotas: DatosPortada["alicuotas"] }) {
  return (
    <div className="tarjeta" style={{ overflow: "hidden" }}>
      <div className={s.herramientaCabeza}>
        <h3>Alícuotas vigentes</h3>
        <span>Ley que establece el Impuesto al Valor Agregado</span>
      </div>
      <div className={s.tabla}>
        <div className={s.alicuota}><span className="t-exento">—</span><span>Exenta, exonerada o no sujeta</span><span>arts. 16–19</span></div>
        <div className={s.alicuota}><span className="t-reducida">{alicuotas.reducida ? `${numero(alicuotas.reducida, 0)} %` : "—"}</span><span>Alícuota reducida</span><span>art. 64</span></div>
        <div className={s.alicuota}><span className="t-general">{alicuotas.general ? `${numero(alicuotas.general, 0)} %` : "—"}</span><span>Alícuota general</span><span>art. 63</span></div>
        <div className={s.alicuota}><span className="t-adicional">{alicuotas.general && alicuotas.adicional ? `${numero(Number(alicuotas.general) + Number(alicuotas.adicional), 0)} %` : "—"}</span><span>General más adicional (consumo suntuario)</span><span>arts. 27, 61</span></div>
      </div>
    </div>
  );
}

export function TarjetaInhabiles({ inhabiles }: { inhabiles: DatosPortada["inhabiles"] }) {
  return (
    <div className={`tarjeta ${s.inhabiles}`}>
      <div className={s.inhabilesCabeza}><h3>Próximos días inhábiles</h3><span>COT art. 10</span></div>
      <div>
        {inhabiles.map((x) => (
          <div key={x.fecha} className={s.inhabil}>
            <span>{fechaCorta(x.fecha)}</span>
            <span>{x.descripcion.replace(/ \(.*\)$/, "")}<span className={s.apagado}> · {diaSemana(x.fecha)}</span></span>
            <span>{x.tipo === "NACIONAL" ? "Nacional" : "Bancario"}</span>
          </div>
        ))}
      </div>
      <span className="aviso-legal">Los días bancarios no laborables también son inhábiles para declarar y pagar tributos.</span>
    </div>
  );
}
