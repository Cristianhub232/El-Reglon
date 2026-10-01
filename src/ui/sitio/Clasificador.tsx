"use client";
// Clasificador de IVA de la portada: la barra del hero y la herramienta completa comparten el mismo estado.
// Consulta /api/publico/iva/clasificar (mismo motor que la API, sin API key y con límite por IP).
import { createContext, useContext, useState, type FormEvent, type ReactNode } from "react";
import { citaCorta, claseCategoria, etiquetaTasa, type CitaLegal } from "../formato.ts";
import { EJEMPLOS } from "./ejemplos.ts";
import s from "./portada.module.css";

type Operacion = "nacional" | "importacion";
export interface Opcion {
  categoria: string; denominacion: string; alicuota_total: string; condicion: string | null;
  concepto_declaracion: string; base_legal: CitaLegal[]; nota_operacion?: string;
}
export interface Resultado {
  estado: "determinado" | "condicionado" | "no_determinado"; opciones: Opcion[];
  advertencias: string[]; notas_operacion: string[]; entrada?: { codigos: { tipo: string }[] };
  // Foto de un producto que el comparador vio en una tienda (solo si quedó determinado; ver comparador/referencia.ts)
  imagen_referencia?: { url: string; producto: string; tienda: string; enlace: string } | null;
}

// Imagen de referencia de la tienda; si no carga (enlace roto o bloqueo), no se muestra nada
function ImagenRef({ r, chica }: { r: NonNullable<Resultado["imagen_referencia"]>; chica?: boolean }) {
  const [fallo, setFallo] = useState(false);
  if (fallo) return null;
  // imagen de la tienda, cargada directo (sin el optimizador de Next)
  const img = <img src={r.url} alt={`Imagen de referencia: ${r.producto}`} loading="lazy" decoding="async" referrerPolicy="no-referrer"
    className={chica ? s.refChica : s.refImagen} onError={() => setFallo(true)} />;
  if (chica) return img;
  return (
    <div className={s.referencia}>
      {img}
      <span><strong>Imagen de referencia</strong>{r.producto} · <a href={r.enlace} target="_blank" rel="noopener noreferrer nofollow">{r.tienda} ↗</a></span>
    </div>
  );
}

// Un texto de solo dígitos (o con guiones) es un código: EAN, UPC, ISBN, ISSN…
const esCodigo = (t: string) => /^[\d\s-]{8,18}X?$/i.test(t.trim());

interface Estado {
  texto: string; setTexto: (t: string) => void; operacion: Operacion; resultado: Resultado | null;
  cargando: boolean; error: string | null; ejemplo: string | null;
  clasificar: (texto?: string, operacion?: Operacion, ejemplo?: string | null) => void;
}
const Ctx = createContext<Estado | null>(null);
const useClasificador = () => { const c = useContext(Ctx); if (!c) throw new Error("Falta ClasificadorProvider"); return c; };

export function ClasificadorProvider({ inicial, children }: { inicial: Resultado | null; children: ReactNode }) {
  const [texto, setTexto] = useState<string>(EJEMPLOS[0].texto);
  const [operacion, setOperacion] = useState<Operacion>("nacional");
  const [resultado, setResultado] = useState<Resultado | null>(inicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ejemplo, setEjemplo] = useState<string | null>(EJEMPLOS[0].clave);

  async function clasificar(t = texto, op = operacion, ej: string | null = null) {
    const limpio = t.trim();
    setTexto(t); setOperacion(op); setEjemplo(ej);
    if (!limpio) return;
    setCargando(true); setError(null);
    try {
      const r = await fetch("/api/publico/iva/clasificar", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...(esCodigo(limpio) ? { codigo: limpio } : { nombre: limpio }), operacion: op }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.mensaje ?? "No se pudo clasificar");
      setResultado(d);
    } catch (e) {
      setError(e instanceof TypeError ? "Sin conexión: el clasificador necesita internet." : (e as Error).message);
    } finally {
      setCargando(false);
    }
  }
  return <Ctx.Provider value={{ texto, setTexto, operacion, resultado, cargando, error, ejemplo, clasificar }}>{children}</Ctx.Provider>;
}

function Ejemplos({ etiqueta }: { etiqueta?: string }) {
  const c = useClasificador();
  return (
    <div className={s.ejemplos}>
      {etiqueta && <span className={s.ejemplosEtiqueta}>{etiqueta}</span>}
      {EJEMPLOS.map((e) => (
        <button key={e.clave} type="button" className={s.ejemplo} aria-pressed={c.ejemplo === e.clave}
          onClick={() => c.clasificar(e.texto, c.operacion, e.clave)}>{e.corto}</button>
      ))}
    </div>
  );
}

function Entrada({ id, grande }: { id: string; grande?: boolean }) {
  const c = useClasificador();
  const enviar = (e: FormEvent) => { e.preventDefault(); c.clasificar(); };
  return (
    <form onSubmit={enviar} className={s.entrada}>
      <label className={`${s.buscador} ${grande ? s.buscadorGrande : ""}`} htmlFor={id}>
        <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><circle cx="7" cy="7" r="5" fill="none" stroke="#5A6170" strokeWidth="1.6" /><path d="M11 11l3.5 3.5" stroke="#5A6170" strokeWidth="1.6" strokeLinecap="round" /></svg>
        <span className="solo-lector">Bien o servicio, código de barras o ISBN</span>
        <input id={id} value={c.texto} onChange={(e) => c.setTexto(e.target.value)} placeholder="Bien, servicio o código de barras"
          autoComplete="off" enterKeyHint="search" />
      </label>
      <div className={s.segmentado} role="group" aria-label="Operación">
        {([["nacional", "Nacional"], ["importacion", "Importación"]] as const).map(([k, l]) => (
          <button key={k} type="button" aria-pressed={c.operacion === k} className={s.segmento} onClick={() => c.clasificar(c.texto, k, c.ejemplo)}>{l}</button>
        ))}
      </div>
    </form>
  );
}

// Cita breve: en una importación con la exención suspendida, lo que explica el 16 % (decreto y art. 63)
const cita = (o: Opcion) => (o.nota_operacion ? o.base_legal.filter((b) => b.id.startsWith("DEC-") || b.id === "LIVA-63") : o.base_legal)
  .slice(0, 2).map(citaCorta).join(" · ");

// Barra del hero: resumen de la primera opción
export function BarraClasificador() {
  const c = useClasificador();
  const primera = c.resultado?.opciones[0];
  const mas = (c.resultado?.opciones.length ?? 0) - 1;
  return (
    <div className={s.barra}>
      <div className={s.barraCabeza}>
        <strong className={s.barraTitulo}>Prueba el clasificador de IVA</strong>
        <Ejemplos />
      </div>
      <div className={s.barraFila}>
        <Entrada id="clasificador-barra" grande />
        <div className={s.barraResultado} aria-live="polite">
          {c.cargando ? <span className={s.cargando}>Clasificando…</span> : c.error ? <span className="t-adicional">{c.error}</span> : primera ? (
            <span className={s.barraPrimera}>
              {c.resultado?.imagen_referencia && <ImagenRef r={c.resultado.imagen_referencia} chica />}
              <strong className={`punto punto-mono t-${claseCategoria(primera.categoria)}`}>{etiquetaTasa(primera.categoria, primera.alicuota_total)}</strong>
              <span className={s.barraCategoria}>{primera.denominacion}</span>
              <span className={`mono ${s.barraBase}`}>{cita(primera)}</span>
            </span>
          ) : <span className={s.cargando}>{c.resultado?.estado === "no_determinado" ? "No determinado: pruebe con otro nombre" : ""}</span>}
          <a href="#herramientas" className={s.barraMas}>{mas > 0 ? `+${mas} ${mas === 1 ? "opción" : "opciones"} · ver detalle` : "Ver detalle"}</a>
        </div>
      </div>
    </div>
  );
}

// Herramienta completa: todas las opciones con su condición y base legal
export function PanelClasificador() {
  const c = useClasificador();
  const r = c.resultado;
  const notas = r ? [...r.notas_operacion, ...r.advertencias.filter((a) => !a.startsWith("Catálogo de reglas pendiente"))] : [];
  return (
    <div className={`tarjeta ${s.herramienta}`}>
      <div className={s.herramientaCabeza}>
        <h3>Clasificador de IVA</h3>
        <span>Escribe un bien o servicio y la operación. Recibe la categoría, la alícuota y la base legal.</span>
      </div>
      <div className={s.herramientaCuerpo}>
        <Entrada id="clasificador-panel" />
        <Ejemplos etiqueta="Ejemplos:" />
        <div className={s.resultado} aria-live="polite" aria-busy={c.cargando}>
          <div className={s.resultadoCabeza}>
            <span>estado: <strong>{c.cargando ? "…" : r?.estado ?? "—"}</strong></span>
            <span>operación: {c.operacion === "nacional" ? "nacional" : "importación"}</span>
          </div>
          {c.error && <div className={s.resultadoNota}>{c.error}</div>}
          {r?.estado === "no_determinado" && (
            <div className={s.opcion}><span className="punto t-apagado">—</span><strong>No determinado</strong>
              <span className={s.opcionCondicion}>No se identificó el bien o servicio. Escríbalo sin marcas ni abreviaturas, o use el código de barras.</span></div>
          )}
          {r?.opciones.map((o, i) => (
            <div key={i} className={s.opcion}>
              <span className={`punto punto-mono t-${claseCategoria(o.categoria)} ${s.opcionTasa}`}>{etiquetaTasa(o.categoria, o.alicuota_total)}</span>
              <strong>{o.denominacion}</strong>
              <span className={s.opcionCondicion}>{o.condicion ?? `Renglón de la Forma 30: ${o.concepto_declaracion.toLowerCase()}.`}</span>
              <span className={`mono ${s.opcionBase}`}>{cita(o)}</span>
            </div>
          ))}
          {r?.imagen_referencia && <ImagenRef r={r.imagen_referencia} />}
          {notas.slice(0, 3).map((n, i) => <div key={i} className={s.resultadoNota}>{n}</div>)}
        </div>
        <span className="aviso-legal">Resultado orientativo. Cuando hay varias opciones, la selección corresponde al usuario bajo su responsabilidad y análisis. Catálogo en validación por el asesor tributario.</span>
      </div>
    </div>
  );
}
