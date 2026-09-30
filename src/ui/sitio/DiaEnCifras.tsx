"use client";
// "El día en cifras" (hero de la portada): carrusel de tarjetas con datos propios. Avanza solo cada 8 s (salvo con
// movimiento reducido, o mientras el cursor o el foco están dentro) y se maneja con botones y flechas del teclado.
import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react";
import type { Tarjeta } from "../../modules/web/cifras.ts";
import { diaSemana, entero, fecha, fechaCorta, numero } from "../formato.ts";
import s from "./cifras.module.css";

const MODULOS: Record<string, string> = { iva: "IVA", bcv: "BCV", arancel: "Arancel", calendario: "Calendario", rif: "RIF", noticias: "Noticias" };
const cuanto = (d: number) => (d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`);

interface Vista { etiqueta: string; acento: string; fondo: string; contenido: ReactNode }

function vista(t: Tarjeta): Vista {
  switch (t.tipo) {
    case "vence": return {
      etiqueta: t.dias <= 7 ? "Esta semana vence" : "Próximo vencimiento", acento: "var(--azul)", fondo: fechaCorta(t.fecha),
      contenido: <>
        <div className={s.figura}><strong className="mono">{fechaCorta(t.fecha)}</strong><span>{diaSemana(t.fecha)} · <b className={t.dias <= 3 ? s.pronto : ""}>{cuanto(t.dias)}</b></span></div>
        <h2 className={s.titulo}>Declaración de IVA de los contribuyentes especiales</h2>
        <p className={s.texto}>RIF terminados en {t.terminales.join(", ")}{t.periodo ? ` · período ${t.periodo}` : ""}{t.trasladada ? " · se trasladó por día inhábil" : ""}.</p>
        <span className={s.pie}>Providencia SNAT/2025/000091 · IVA, anticipos de ISLR, IGTF y retenciones</span>
      </>,
    };
    case "inhabil": return {
      etiqueta: "Próximo día inhábil", acento: "var(--rojo)", fondo: fechaCorta(t.fecha),
      contenido: <>
        <div className={s.figura}><strong className="mono">{fechaCorta(t.fecha)}</strong><span>{diaSemana(t.fecha)} · {cuanto(t.dias)}</span></div>
        <h2 className={s.titulo}>{t.descripcion}</h2>
        <p className={s.texto}>{t.bancario ? "La banca no abre al público." : "Feriado nacional."} Si un vencimiento tributario cae ese día, se traslada al día hábil siguiente.</p>
        <span className={s.pie}>Código Orgánico Tributario, art. 10</span>
      </>,
    };
    case "monedas": return {
      etiqueta: "Otras monedas del BCV", acento: "var(--amarillo)", fondo: "¥ ₺ ₽",
      contenido: <>
        <h2 className={s.titulo}>Tipo de cambio oficial del día</h2>
        <div className={s.filas}>
          {t.filas.map((f) => (
            <div key={f.codigo} className={s.filaMoneda}>
              <span><b className="mono">{f.codigo}</b> {f.nombre}</span>
              <span className="mono">Bs. {numero(f.tasa, 4)}</span>
              {f.variacion !== null && <span className={`mono ${f.variacion >= 0 ? s.sube : s.baja}`}>{f.variacion >= 0 ? "▲" : "▼"} {numero(Math.abs(f.variacion), 2)} %</span>}
            </div>
          ))}
        </div>
        <span className={s.pie}>Banco Central de Venezuela · fecha valor {fecha(t.fecha_valor)}</span>
      </>,
    };
    case "mayor": return {
      etiqueta: "Moneda de mayor valor", acento: "var(--amarillo)", fondo: t.moneda,
      contenido: <>
        <div className={s.figura}><strong className="mono">{t.moneda}</strong><span>{t.nombre} · Bs. {numero(t.tasa, 4)}</span></div>
        <h2 className={s.titulo}>La referencia para las multas tributarias</h2>
        <p className={s.texto}>El COT expresa las multas en la moneda de mayor valor que publica el BCV y se pagan al tipo de cambio oficial del día del pago.</p>
        <span className={s.pie}>Código Orgánico Tributario, arts. 91 y 92 · fecha valor {fecha(t.fecha_valor)}</span>
      </>,
    };
    case "sabias": return {
      etiqueta: "¿Sabías que…?", acento: "var(--exento)", fondo: "IVA",
      contenido: <>
        <div className={s.figura}><strong className="mono">{t.etiqueta}</strong><span>según la Ley de IVA</span></div>
        <h2 className={s.titulo}>{t.nombre}: {t.frase}.</h2>
        {t.texto && <p className={s.texto}>«{t.texto.length > 150 ? `${t.texto.slice(0, 147).replace(/\s+\S*$/, "")}…` : t.texto}»</p>}
        <span className={s.pie}>{t.cita} · <a href="#herramientas">Clasifica un producto</a></span>
      </>,
    };
    case "actividad": return {
      etiqueta: "Actividad de El Renglón", acento: "#8FA3BF", fondo: "API",
      contenido: <>
        {t.hoy > 0
          ? <div className={s.figura}><strong className="mono">{entero(t.hoy)}</strong><span>{t.hoy === 1 ? "consulta" : "consultas"} hoy</span></div>
          : <div className={s.figura}><strong className="mono">{entero(t.semana)}</strong><span>consultas en los últimos 7 días</span></div>}
        <h2 className={s.titulo}>{t.hoy > 0 && t.semana > t.hoy ? `${entero(t.semana)} en los últimos 7 días` : "Consultas a la API y a las herramientas gratuitas"}</h2>
        <p className={s.texto}>{t.modulos.map((m) => `${MODULOS[m.modulo] ?? m.modulo} ${entero(m.consultas)}`).join(" · ")}</p>
        <span className={s.pie}>API y herramientas gratuitas · solo totales, sin datos de quien consulta</span>
      </>,
    };
  }
}

export function DiaEnCifras({ tarjetas }: { tarjetas: Tarjeta[] }) {
  const [i, setI] = useState(0);
  const [pausa, setPausa] = useState(false);
  const n = tarjetas.length;
  useEffect(() => {
    if (pausa || n < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const t = setTimeout(() => setI((x) => (x + 1) % n), 8000);
    return () => clearTimeout(t);
  }, [i, pausa, n]);
  const ir = (d: number) => setI((x) => (x + d + n) % n);
  const teclado = (e: KeyboardEvent) => {
    if (e.key === "ArrowRight") { e.preventDefault(); ir(1); }
    if (e.key === "ArrowLeft") { e.preventDefault(); ir(-1); }
  };
  const vistas = tarjetas.map(vista);
  const v = vistas[i];
  return (
    <section className={s.cifras} aria-roledescription="carrusel" aria-label="El día en cifras"
      onMouseEnter={() => setPausa(true)} onMouseLeave={() => setPausa(false)} onFocus={() => setPausa(true)} onBlur={() => setPausa(false)} onKeyDown={teclado}>
      <div className={s.barra}>
        <span className={s.barraTitulo}><strong>El día en cifras</strong><span>{v.etiqueta} · {i + 1} de {n}</span></span>
        {n > 1 && (
          <span className={s.controles}>
            <span className={s.puntos} role="tablist" aria-label="Tarjetas">
              {vistas.map((x, k) => (
                <button key={k} type="button" role="tab" aria-selected={k === i} aria-label={`${k + 1} de ${n}: ${x.etiqueta}`} className={s.punto} onClick={() => setI(k)} />
              ))}
            </span>
            <button type="button" className={s.flecha} onClick={() => ir(-1)} aria-label="Tarjeta anterior">‹</button>
            <button type="button" className={s.flecha} onClick={() => ir(1)} aria-label="Tarjeta siguiente">›</button>
          </span>
        )}
      </div>
      <div className={s.lamina} style={{ ["--acento" as string]: v.acento }} aria-hidden="true"><span key={i}>{v.fondo}</span></div>
      <article key={i} className={s.tarjeta} aria-live={pausa ? "polite" : "off"} aria-roledescription="tarjeta" aria-label={`${i + 1} de ${n}: ${v.etiqueta}`}>
        <span className={s.etiqueta} style={{ ["--acento" as string]: v.acento }}>{v.etiqueta}</span>
        {v.contenido}
      </article>
    </section>
  );
}
