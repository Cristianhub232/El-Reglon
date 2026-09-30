"use client";
// Conversor BCV de la portada: monto × tasa oficial aplicable (la que ya muestra la página)
import { useState } from "react";
import { leerMonto, numero } from "../formato.ts";
import s from "./portada.module.css";

export function Conversor({ tasas, fechaValor }: { tasas: Record<"USD" | "EUR", string>; fechaValor: string }) {
  const [monto, setMonto] = useState("100");
  const [moneda, setMoneda] = useState<"USD" | "EUR">("USD");
  const valor = leerMonto(monto);
  const resultado = Number.isFinite(valor) ? valor * Number(tasas[moneda]) : NaN;
  return (
    <div className={s.conversor}>
      <div className={s.conversorCabeza}><strong>Conversor BCV</strong><span>fecha valor {fechaValor}</span></div>
      <div className={s.conversorCuerpo}>
        <div className={s.conversorFila}>
          <label className="solo-lector" htmlFor="conv-monto">Monto en {moneda}</label>
          <input id="conv-monto" className={s.conversorMonto} inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} />
          <div className={s.segmentado} role="group" aria-label="Moneda">
            {(["USD", "EUR"] as const).map((m) => (
              <button key={m} type="button" aria-pressed={m === moneda} onClick={() => setMoneda(m)} className={`${s.segmento} mono`}>{m}</button>
            ))}
          </div>
        </div>
        <div className={s.conversorResultado}>
          <span>Equivale a</span>
          <output className="mono" aria-live="polite">Bs. {Number.isFinite(resultado) ? numero(resultado, 2) : "—"}</output>
        </div>
      </div>
    </div>
  );
}
