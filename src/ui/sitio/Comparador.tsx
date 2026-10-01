"use client";
// Comparador de precios de la portada: busca en todas las tiendas a la vez y muestra cada respuesta en cuanto llega
// (NDJSON de /api/publico/comparador/buscar). Las ofertas se emparejan aquí mismo con la misma regla que la API.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { agrupar, type Grupo, type Oferta } from "../../modules/comparador/emparejar.ts";
import { numero } from "../formato.ts";
import s from "./comparador.module.css";

interface TiendaPublica { id: string; nombre: string; rubros: string[] }
type EstadoTienda = { estado: "esperando" } | { estado: "ok"; ofertas: number; ms: number } | { estado: "error"; mensaje: string };

const EJEMPLOS = ["Harina PAN", "Acetaminofén 500 mg", "Televisor 32", "Leche en polvo"];
const VISIBLES = 9;

export function Comparador({ tiendas }: { tiendas: TiendaPublica[] }) {
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoTienda>>({});
  const [tasa, setTasa] = useState<string | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const control = useRef<AbortController | null>(null);

  async function buscar(q: string) {
    const limpio = q.trim().replace(/\s+/g, " ");
    if (limpio.length < 2) { setError("Escribe al menos 2 letras"); return; }
    control.current?.abort();
    const c = new AbortController();
    control.current = c;
    setTexto(limpio); setConsulta(limpio); setOfertas([]); setError(null); setTodos(false); setBuscando(true);
    setEstados(Object.fromEntries(tiendas.map((t) => [t.id, { estado: "esperando" }])));
    try {
      const r = await fetch(`/api/publico/comparador/buscar?q=${encodeURIComponent(limpio)}`, { signal: c.signal });
      if (!r.ok || !r.body) {
        const d = await r.json().catch(() => null) as { error?: { mensaje?: string } } | null;
        throw new Error(d?.error?.mensaje ?? "No se pudo buscar en este momento");
      }
      const lector = r.body.pipeThrough(new TextDecoderStream()).getReader();
      let resto = "";
      for (;;) {
        const { done, value } = await lector.read();
        if (done) break;
        resto += value;
        const lineas = resto.split("\n");
        resto = lineas.pop() ?? "";
        for (const l of lineas.filter(Boolean)) {
          const ev = JSON.parse(l);
          if (ev.tipo === "inicio") setTasa(ev.tasa?.usd ?? null);
          if (ev.tipo === "tienda") {
            setOfertas((o) => [...o, ...ev.ofertas]);
            setEstados((e) => ({ ...e, [ev.tienda]: { estado: "ok", ofertas: ev.ofertas.length, ms: ev.ms } }));
          }
          if (ev.tipo === "error") setEstados((e) => ({ ...e, [ev.tienda]: { estado: "error", mensaje: ev.mensaje } }));
        }
      }
      try { history.replaceState(null, "", `?comparar=${encodeURIComponent(limpio)}#comparador`); } catch { /* sin historial */ }
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (control.current === c) setBuscando(false);
    }
  }

  // Enlace compartible: /?comparar=harina%20pan
  useEffect(() => {
    const q = new URLSearchParams(location.search).get("comparar");
    if (q) void buscar(q);
    return () => control.current?.abort();
  }, []);

  const grupos = useMemo(() => (consulta ? agrupar(ofertas, consulta) : []), [ofertas, consulta]);
  const comparables = grupos.filter((g) => new Set(g.ofertas.map((o) => o.tienda)).size > 1).length;
  const enviar = (e: FormEvent) => { e.preventDefault(); void buscar(texto); };

  return (
    <section className={s.seccion} id="comparador" aria-labelledby="comparador-titulo">
      <div className={s.cabeza}>
        <span className={s.sobretitulo}>Nuevo · Comparador de precios</span>
        <h2 id="comparador-titulo" className={s.titulo}>¿Dónde está más barato?</h2>
        <p className={s.lead}>
          Busca un producto y compara su precio en {tiendas.map((t) => t.nombre).join(", ").replace(/, ([^,]*)$/, " y $1")} al momento.
          En bolívares y en dólares, a la tasa BCV del día.
        </p>
      </div>

      <form className={s.buscador} onSubmit={enviar} role="search">
        <label htmlFor="comparador-q" className="solo-lector">Producto a comparar</label>
        <input id="comparador-q" className={s.campo} value={texto} onChange={(e) => setTexto(e.target.value)} maxLength={80}
          placeholder="Ej.: harina PAN 1 kg, acetaminofén 500 mg, televisor 32" autoComplete="off" />
        <button type="submit" className={s.boton} disabled={buscando && texto === consulta}>{buscando ? "Buscando…" : "Comparar precios"}</button>
      </form>
      <div className={s.ejemplos}>
        <span>Prueba con:</span>
        {EJEMPLOS.map((x) => <button key={x} type="button" onClick={() => void buscar(x)}>{x}</button>)}
      </div>

      {consulta && (
        <div className={s.estado} aria-live="polite">
          {tiendas.map((t) => {
            const e = estados[t.id] ?? { estado: "esperando" };
            return (
              <span key={t.id} className={`${s.pastilla} ${e.estado === "ok" ? s.pastillaOk : e.estado === "error" ? s.pastillaError : ""}`}>
                {e.estado === "esperando" && <span className={s.girando} aria-hidden="true" />}
                {t.nombre}{e.estado === "ok" ? ` · ${e.ofertas || "sin"} resultado${e.ofertas === 1 ? "" : "s"}` : e.estado === "error" ? " · no respondió" : ""}
              </span>
            );
          })}
          {tasa && <span className={s.tasa}>Tasa BCV <b className="mono">{numero(tasa, 4)}</b></span>}
        </div>
      )}
      {error && <p className={s.error}>{error}</p>}

      {consulta && !buscando && grupos.length === 0 && !error && (
        <p className={s.vacio}>No encontramos «{consulta}» en las tiendas. Prueba con otras palabras o con la marca.</p>
      )}
      {grupos.length > 0 && (
        <>
          <p className={s.resumen}>{grupos.length} producto{grupos.length === 1 ? "" : "s"}{comparables ? ` · ${comparables} en más de una tienda` : ""}{buscando ? " · llegando más resultados…" : ""}</p>
          <div className={s.rejilla}>
            {(todos ? grupos : grupos.slice(0, VISIBLES)).map((g) => <Tarjeta key={g.clave} g={g} />)}
          </div>
          {!todos && grupos.length > VISIBLES && <button type="button" className={s.mas} onClick={() => setTodos(true)}>Ver los {grupos.length} productos</button>}
        </>
      )}
      <p className={s.aviso}>Precios publicados por cada tienda en su sitio web al momento de la consulta; pueden variar por sucursal y existencia. El Renglón no vende productos. También por API: <span className="mono">/api/v1/comparador/buscar</span>.</p>
    </section>
  );
}

function Tarjeta({ g }: { g: Grupo }) {
  const tiendas = new Set(g.ofertas.map((o) => o.tienda)).size;
  return (
    <article className={s.tarjeta}>
      <div className={s.producto}>
        {g.imagen
          // imagen de la tienda, cargada directo (sin pasar por el optimizador de Next)
          ? <img src={g.imagen} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" className={s.foto} />
          : <span className={s.foto} aria-hidden="true" />}
        <div>
          <h3 className={s.nombre}>{g.nombre}</h3>
          <span className={s.detalle}>{[g.presentacion, tiendas > 1 ? `en ${tiendas} tiendas` : `solo en ${g.mejor.tienda_nombre}`].filter(Boolean).join(" · ")}</span>
        </div>
      </div>
      <div className={s.mejor}>
        <span>{tiendas > 1 ? "Mejor precio" : "Precio"}{g.mejor.disponible ? "" : " (agotado)"}</span>
        <strong className="mono">Bs. {numero(g.mejor.precio_bs, 2)}</strong>
        <span className="mono">US$ {numero(g.mejor.precio_usd, 2)} · {g.mejor.tienda_nombre}</span>
      </div>
      <ul className={s.ofertas}>
        {g.ofertas.map((o, i) => (
          <li key={`${o.tienda}-${o.id_externo}`}>
            <a href={o.url} target="_blank" rel="noopener noreferrer nofollow">{o.tienda_nombre}</a>
            <span className="mono">Bs. {numero(o.precio_bs, 2)}</span>
            <span className={`mono ${s.diferencia}`}>{i === 0 ? (tiendas > 1 ? "más barato" : "") : `+${numero(((o.precio_bs / g.mejor.precio_bs) - 1) * 100, 0)} %`}{o.disponible ? "" : " · agotado"}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
