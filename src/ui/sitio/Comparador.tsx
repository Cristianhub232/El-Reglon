"use client";
// Comparador de precios de la portada: busca en todas las tiendas a la vez y muestra cada respuesta en cuanto llega
// (NDJSON de /api/publico/comparador/buscar). Las ofertas se emparejan aquí mismo con la misma regla que la API.
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { agrupar, type Grupo, type Oferta } from "../../modules/comparador/emparejar.ts";
import { haceCuanto, numero } from "../formato.ts";
import s from "./comparador.module.css";

export interface TiendaPublica { id: string; nombre: string; rubros: string[]; ciudad: string | null }
type EstadoTienda = { estado: "esperando" } | { estado: "ok"; ofertas: number; ms: number; leyendo: number } | { estado: "error"; mensaje: string };
type Orden = "relevancia" | "menor" | "mayor";

const EJEMPLOS = ["Harina PAN", "Acetaminofén 500 mg", "Televisor 32", "Leche en polvo"];
const VISIBLES = 9;
const ORDENES: [Orden, string][] = [["relevancia", "Más relevantes"], ["menor", "Menor precio"], ["mayor", "Mayor precio"]];
const GUARDADO = "comparador.filtros";

export function Comparador({ tiendas }: { tiendas: TiendaPublica[] }) {
  const [texto, setTexto] = useState("");
  const [consulta, setConsulta] = useState<string | null>(null);
  const [ofertas, setOfertas] = useState<Oferta[]>([]);
  const [estados, setEstados] = useState<Record<string, EstadoTienda>>({});
  const [tasa, setTasa] = useState<{ usd: string; fecha_valor: string } | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  // Filtros: cadenas elegidas (ninguna = todas) y orden; se recuerdan en este navegador
  const [elegidas, setElegidas] = useState<string[]>([]);
  const [orden, setOrden] = useState<Orden>("relevancia");
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
          if (ev.tipo === "inicio") setTasa(ev.tasa ?? null);
          if (ev.tipo === "tienda") {
            setOfertas((o) => [...o, ...ev.ofertas]);
            setEstados((e) => ({ ...e, [ev.tienda]: { estado: "ok", ofertas: ev.ofertas.length, ms: ev.ms, leyendo: ev.leyendo ?? 0 } }));
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

  // Filtros guardados y enlace compartible (/?comparar=harina%20pan)
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) ?? "{}") as { elegidas?: string[]; orden?: Orden };
      if (Array.isArray(g.elegidas)) setElegidas(g.elegidas.filter((id) => tiendas.some((t) => t.id === id)));
      if (g.orden && ORDENES.some(([o]) => o === g.orden)) setOrden(g.orden);
    } catch { /* sin almacenamiento */ }
    const q = new URLSearchParams(location.search).get("comparar");
    if (q) void buscar(q);
    return () => control.current?.abort();
  }, []);
  const guardar = (e: string[], o: Orden) => { try { localStorage.setItem(GUARDADO, JSON.stringify({ elegidas: e, orden: o })); } catch { /* sin almacenamiento */ } };
  // Pulsar una cadena la muestra (solo las elegidas); pulsarla de nuevo la quita de la selección
  const alternar = (id: string) => {
    const nuevo = elegidas.includes(id) ? elegidas.filter((x) => x !== id) : [...elegidas, id];
    setElegidas(nuevo.length === tiendas.length ? [] : nuevo); setTodos(false); guardar(nuevo.length === tiendas.length ? [] : nuevo, orden);
  };
  const todas = () => { setElegidas([]); guardar([], orden); };
  const ordenar = (o: Orden) => { setOrden(o); guardar(elegidas, o); };

  // Se emparejan solo las ofertas de las cadenas elegidas: el "mejor precio" es el mejor entre ellas
  const grupos = useMemo(() => {
    if (!consulta) return [];
    const g = agrupar(elegidas.length ? ofertas.filter((o) => elegidas.includes(o.tienda)) : ofertas, consulta);
    if (orden === "relevancia") return g;
    const signo = orden === "menor" ? 1 : -1;
    // Los productos cuyo mejor precio es dudoso van al final en cualquier orden
    return [...g].sort((a, b) => Number(Boolean(a.mejor.dudoso)) - Number(Boolean(b.mejor.dudoso)) || signo * (a.mejor.precio_bs - b.mejor.precio_bs));
  }, [ofertas, consulta, elegidas, orden]);
  const comparables = grupos.filter((g) => new Set(g.ofertas.map((o) => o.tienda)).size > 1).length;
  const enviar = (e: FormEvent) => { e.preventDefault(); void buscar(texto); };

  return (
    <section className={s.seccion} id="comparador" aria-labelledby="comparador-titulo">
      <div className={s.cabeza}>
        <span className={s.sobretitulo}>Nuevo · Comparador de precios</span>
        <h2 id="comparador-titulo" className={s.titulo}>¿Dónde está más barato?</h2>
        <p className={s.lead}>
          Busca un producto y compara su precio en {tiendas.length} cadenas venezolanas al momento. En bolívares y en dólares, a la tasa BCV del día.
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

      <div className={s.filtros}>
        <div className={s.filtro} role="group" aria-labelledby="filtro-cadenas">
          <span id="filtro-cadenas" className={s.filtroTitulo}>Cadenas</span>
          <div className={s.cadenas}>
            {tiendas.map((t) => {
              const e = estados[t.id];
              const elegida = elegidas.includes(t.id);
              const visible = !elegidas.length || elegida;
              return (
                <button key={t.id} type="button" aria-pressed={elegida} onClick={() => alternar(t.id)}
                  title={elegida ? `Quitar ${t.nombre} de la selección` : `Ver ${elegidas.length ? "también " : "solo "}${t.nombre}`}
                  className={`${s.cadena} ${elegida ? s.cadenaElegida : visible ? s.cadenaActiva : ""} ${e?.estado === "error" ? s.cadenaError : ""}`}>
                  {consulta && visible && e?.estado === "esperando" && <span className={s.girando} aria-hidden="true" />}
                  <span>{t.nombre}{t.ciudad ? ` (${t.ciudad})` : ""}</span>
                  {consulta && e?.estado === "ok" && <span className={s.cuenta}>{e.ofertas}{e.leyendo > 0 ? ` · leyendo ${e.leyendo}` : ""}</span>}
                  {consulta && e?.estado === "error" && <span className={s.cuenta}>no respondió</span>}
                </button>
              );
            })}
            {elegidas.length > 0 && <button type="button" className={s.todas} onClick={todas}>Todas</button>}
          </div>
        </div>
        <div className={s.filtro} role="group" aria-labelledby="filtro-orden">
          <span id="filtro-orden" className={s.filtroTitulo}>Ordenar</span>
          <div className={s.segmentado}>
            {ORDENES.map(([o, nombre]) => (
              <button key={o} type="button" aria-pressed={orden === o} onClick={() => ordenar(o)}>{nombre}</button>
            ))}
          </div>
        </div>
      </div>
      {consulta && Object.values(estados).some((e) => e.estado === "ok" && e.leyendo > 0) && (
        <p className={s.nota}>«Leyendo»: algunas cadenas no permiten búsquedas automáticas; leemos sus páginas de producto una a una. Vuelve a buscar en un minuto para ver lo que falta.</p>
      )}
      {error && <p className={s.error}>{error}</p>}

      {consulta && !buscando && grupos.length === 0 && !error && (
        <p className={s.vacio}>No encontramos «{consulta}» en {elegidas.length ? "las cadenas elegidas" : "las tiendas"}. Prueba con otras palabras o con la marca{elegidas.length ? ", o elige más cadenas" : ""}.</p>
      )}
      {grupos.length > 0 && (
        <>
          <p className={s.resumen}>
            {grupos.length} producto{grupos.length === 1 ? "" : "s"}{comparables ? ` · ${comparables} en más de una tienda` : ""}{buscando ? " · llegando más resultados…" : ""}
            {tasa && <span className={s.tasa}>Tasa BCV <b className="mono">{numero(tasa.usd, 4)}</b> · fecha valor {tasa.fecha_valor.slice(8, 10)}/{tasa.fecha_valor.slice(5, 7)}</span>}
          </p>
          <div className={s.rejilla}>
            {(todos ? grupos : grupos.slice(0, VISIBLES)).map((g) => <Tarjeta key={g.clave} g={g} />)}
          </div>
          {!todos && grupos.length > VISIBLES && <button type="button" className={s.mas} onClick={() => setTodos(true)}>Ver los {grupos.length} productos</button>}
        </>
      )}
      <p className={s.aviso}>Precios publicados por cada tienda en su sitio web al momento de la consulta; en Farmatodo, Plan Suárez y Gama, cuando se leyó su página (se indica hace cuánto). Pueden variar por sucursal y existencia. El Renglón no vende productos. También por API: <span className="mono">/api/v1/comparador/buscar</span>.</p>
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
        <span>{g.mejor.dudoso ? "Precios muy distintos: verifica en cada tienda" : tiendas > 1 ? "Mejor precio" : "Precio"}{g.mejor.disponible ? "" : " (agotado)"}</span>
        <strong className="mono">Bs. {numero(g.mejor.precio_bs, 2)}</strong>
        <span className="mono">US$ {numero(g.mejor.precio_usd, 2)} · {g.mejor.tienda_nombre}{g.mejor.sucursal ? ` (${g.mejor.sucursal})` : ""}</span>
      </div>
      <ul className={s.ofertas}>
        {g.ofertas.map((o, i) => (
          <li key={`${o.tienda}-${o.id_externo}`}>
            <a href={o.url} target="_blank" rel="noopener noreferrer nofollow" title={o.sucursal ? `${o.tienda_nombre} · ${o.sucursal}` : o.tienda_nombre}>{o.tienda_nombre}{o.sucursal ? <small> · {o.sucursal}</small> : null}</a>
            <span className="mono">Bs. {numero(o.precio_bs, 2)}</span>
            <span className={`mono ${s.diferencia}`}>{o.dudoso ? <b className={s.dudoso} title="Este precio no guarda proporción con el de las otras tiendas: puede ser un error o un precio viejo en su página. Verifícalo en la tienda.">precio dudoso</b> : i === 0 ? (tiendas > 1 ? "más barato" : "") : `${o.precio_bs >= g.mejor.precio_bs ? "+" : "−"}${numero(Math.abs((o.precio_bs / g.mejor.precio_bs) - 1) * 100, 0)} %`}{o.disponible ? "" : " · agotado"}{o.leido_en ? <small title="Precio leído de su página de producto: esta tienda no permite búsquedas automáticas"> · {haceCuanto(o.leido_en)}</small> : null}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}
