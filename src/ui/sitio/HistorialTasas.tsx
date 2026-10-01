"use client";
// "Ver historial" de la tasa oficial BCV: ventana con la línea de tendencia (una moneda a la vez: dólar y euro tienen
// escalas distintas, nunca dos ejes) y la tabla de las publicaciones con dólar y euro. Pasar el cursor o las flechas
// del teclado sobre la gráfica muestran el valor de cada fecha.
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { fecha, numero } from "../formato.ts";
import s from "./historial.module.css";

export interface PuntoTasa { f: string; usd: number; eur: number }
type Moneda = "usd" | "eur";

const RANGOS: [number, string][] = [[30, "30 publ."], [90, "90 publ."], [250, "1 año"], [0, "Todo"]];
const M = { arriba: 16, derecha: 16, abajo: 28, izquierda: 58 };

const variacion = (a: number, b: number) => (b / a - 1) * 100;
const signo = (v: number) => `${v >= 0 ? "+" : "−"}${numero(Math.abs(v), 2)} %`;

function marcas(min: number, max: number, n = 4): number[] {
  const paso = (max - min) / n;
  return Array.from({ length: n + 1 }, (_, i) => min + paso * i);
}

export function HistorialTasas({ historial }: { historial: PuntoTasa[] }) {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [moneda, setMoneda] = useState<Moneda>("usd");
  const [rango, setRango] = useState(90);
  const [cursor, setCursor] = useState<number | null>(null);
  // La gráfica se dibuja al ancho real de la ventana: así el texto conserva su tamaño también en el teléfono
  const marco = useRef<HTMLDivElement>(null);
  const [ANCHO, setAncho] = useState(720);
  useEffect(() => {
    const el = marco.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setAncho(Math.max(260, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const ALTO = ANCHO < 480 ? 220 : 260;

  const datos = useMemo(() => (rango ? historial.slice(-rango) : historial), [historial, rango]);
  const valores = datos.map((d) => d[moneda]);
  const min = Math.min(...valores), max = Math.max(...valores);
  const holgura = (max - min) * 0.08 || max * 0.01;
  const y0 = min - holgura, y1 = max + holgura;
  const x = (i: number) => M.izquierda + (datos.length > 1 ? (i / (datos.length - 1)) * (ANCHO - M.izquierda - M.derecha) : 0);
  const y = (v: number) => M.arriba + (1 - (v - y0) / (y1 - y0)) * (ALTO - M.arriba - M.abajo);
  const linea = valores.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join("");
  const ultimo = valores.at(-1) ?? 0, primero = valores[0] ?? 0;
  const etiquetaX = datos.length ? (ANCHO < 480 ? [0, datos.length - 1] : [0, Math.floor((datos.length - 1) / 2), datos.length - 1]) : [];

  const mover = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * ANCHO;
    const i = Math.round(((px - M.izquierda) / (ANCHO - M.izquierda - M.derecha)) * (datos.length - 1));
    setCursor(Math.max(0, Math.min(datos.length - 1, i)));
  };
  const teclado = (e: KeyboardEvent) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    const actual = cursor ?? datos.length - 1;
    setCursor(e.key === "Home" ? 0 : e.key === "End" ? datos.length - 1 : Math.max(0, Math.min(datos.length - 1, actual + (e.key === "ArrowRight" ? 1 : -1))));
  };
  const descargar = () => {
    const csv = ["fecha_valor,usd_bs,eur_bs", ...historial.map((d) => `${d.f},${d.usd},${d.eur}`)].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = "tasas-bcv.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const c = cursor !== null && datos[cursor] ? cursor : null;
  const nombre = moneda === "usd" ? "Dólar (USD)" : "Euro (EUR)";
  return (
    <>
      <button type="button" className={s.abrir} onClick={() => { setCursor(null); dialogo.current?.showModal(); }}>Ver historial</button>
      <dialog ref={dialogo} className={s.dialogo} aria-labelledby="historial-titulo" onClick={(e) => { if (e.target === dialogo.current) dialogo.current.close(); }}>
        <div className={s.contenido}>
          <div className={s.cabeza}>
            <div>
              <h2 id="historial-titulo">Historial de la tasa oficial BCV</h2>
              <span>Bolívares por unidad · por fecha valor · Banco Central de Venezuela</span>
            </div>
            <button type="button" className={s.cerrar} onClick={() => dialogo.current?.close()} aria-label="Cerrar">×</button>
          </div>

          <div className={s.controles}>
            <div className={s.segmentado} role="group" aria-label="Moneda">
              {(["usd", "eur"] as Moneda[]).map((m) => (
                <button key={m} type="button" aria-pressed={moneda === m} onClick={() => { setMoneda(m); setCursor(null); }}>{m === "usd" ? "Dólar" : "Euro"}</button>
              ))}
            </div>
            <div className={s.segmentado} role="group" aria-label="Período">
              {RANGOS.map(([n, t]) => (
                <button key={n} type="button" aria-pressed={rango === n} onClick={() => { setRango(n); setCursor(null); }}>{t}</button>
              ))}
            </div>
          </div>

          <div className={s.cifras}>
            <div><span>{nombre} · {fecha(datos.at(-1)?.f ?? "")}</span><strong className="mono">Bs. {numero(ultimo, 4)}</strong></div>
            <div><span>Variación en el período</span><strong className="mono">{signo(variacion(primero, ultimo))}</strong></div>
            <div><span>Mínimo · máximo</span><strong className="mono">{numero(min, 2)} · {numero(max, 2)}</strong></div>
          </div>

          <div className={s.grafica} ref={marco}>
            <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" tabIndex={0} onKeyDown={teclado}
              aria-label={`${nombre}: de Bs. ${numero(primero, 2)} el ${fecha(datos[0]?.f ?? "")} a Bs. ${numero(ultimo, 2)} el ${fecha(datos.at(-1)?.f ?? "")}. Use las flechas para recorrer las fechas.`}
              onPointerMove={mover} onPointerLeave={() => setCursor(null)}>
              {marcas(y0 + holgura, y1 - holgura, ANCHO < 480 ? 3 : 4).map((v) => (
                <g key={v}>
                  <line x1={M.izquierda} x2={ANCHO - M.derecha} y1={y(v)} y2={y(v)} className={s.rejilla} />
                  <text x={M.izquierda - 8} y={y(v) + 4} textAnchor="end" className={s.eje}>{numero(v, v >= 100 ? 0 : 2)}</text>
                </g>
              ))}
              {etiquetaX.map((i) => (
                <text key={i} x={x(i)} y={ALTO - 8} textAnchor={i === 0 ? "start" : i === datos.length - 1 ? "end" : "middle"} className={s.eje}>{fecha(datos[i].f)}</text>
              ))}
              <path d={linea} className={s.linea} />
              {c !== null && (
                <g>
                  <line x1={x(c)} x2={x(c)} y1={M.arriba} y2={ALTO - M.abajo} className={s.guia} />
                  <circle cx={x(c)} cy={y(valores[c])} r={5} className={s.punto} />
                </g>
              )}
            </svg>
            {c !== null && (
              <div className={s.globo} style={{ left: `${(x(c) / ANCHO) * 100}%`, transform: `translateX(${x(c) > ANCHO * 0.7 ? "-100%" : x(c) < ANCHO * 0.3 ? "0" : "-50%"})` }} role="status">
                <strong>{fecha(datos[c].f)}</strong>
                <span className="mono">Bs. {numero(valores[c], 4)}</span>
                {c > 0 && <span className="mono">{signo(variacion(valores[c - 1], valores[c]))} vs. anterior</span>}
              </div>
            )}
          </div>

          <div className={s.tablaCabeza}>
            <strong>Publicaciones ({datos.length})</strong>
            <button type="button" className={s.enlace} onClick={descargar}>Descargar CSV (todo el historial)</button>
          </div>
          <div className={s.tablaMarco}>
            <table className={s.tabla}>
              <thead><tr><th>Fecha valor</th><th>Dólar (Bs.)</th><th>Var.</th><th>Euro (Bs.)</th><th>Var.</th></tr></thead>
              <tbody>
                {datos.map((d, i) => ({ d, i })).reverse().map(({ d, i }) => {
                  const ant = i > 0 ? datos[i - 1] : null;
                  return (
                    <tr key={d.f}>
                      <td className="mono">{fecha(d.f)}</td>
                      <td className="mono">{numero(d.usd, 4)}</td>
                      <td className={`mono ${ant ? (d.usd >= ant.usd ? s.sube : s.baja) : ""}`}>{ant ? signo(variacion(ant.usd, d.usd)) : "—"}</td>
                      <td className="mono">{numero(d.eur, 4)}</td>
                      <td className={`mono ${ant ? (d.eur >= ant.eur ? s.sube : s.baja) : ""}`}>{ant ? signo(variacion(ant.eur, d.eur)) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </dialog>
    </>
  );
}
