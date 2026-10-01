"use client";
// "Mis deberes tributarios": el contribuyente indica su tipo, su RIF y (si es especial) sus condiciones, y ve sus
// próximos deberes con la fecha límite real (traslados del COT art. 10). Se pueden llevar al calendario (.ics).
// El RIF consultado se registra en el servidor con fines estadísticos (docs/23); en este navegador solo si la persona
// marca "recordar".
import { useEffect, useState, type FormEvent } from "react";
import { diaSemana, fechaCorta } from "../formato.ts";
import { calendarioIcs, type DeberIcs } from "./ics.ts";
import s from "./deberes.module.css";

type Tipo = "ESPECIAL" | "ORDINARIO";
interface Condicion { codigo: string; descripcion: string }
interface Deber extends DeberIcs { fecha: string; fecha_limite: string; dias_restantes: number; obligacion: string; nombre: string; base: string;
  periodo_desde: string | null; periodo_hasta: string | null; aviso: string | null }
interface Respuesta { rif: string; terminal: number; tipo_contribuyente: Tipo; deberes: Deber[]; nota: string }

const GUARDADO = "deberes.rif";
const MES = new Intl.DateTimeFormat("es-VE", { month: "long", year: "numeric", timeZone: "UTC" });
const cuanto = (d: number) => (d === 0 ? "hoy" : d === 1 ? "mañana" : `en ${d} días`);
const ddmm = (f: string) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

export function MisDeberes({ condiciones }: { condiciones: Condicion[] }) {
  const [tipo, setTipo] = useState<Tipo>("ESPECIAL");
  const [rif, setRif] = useState("");
  const [marcadas, setMarcadas] = useState<string[]>([]);
  const [recordar, setRecordar] = useState(false);
  const [resultado, setResultado] = useState<Respuesta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) ?? "null") as { rif?: string; tipo?: Tipo; condiciones?: string[] } | null;
      if (g?.rif) {
        setRif(g.rif); setRecordar(true);
        if (g.tipo === "ESPECIAL" || g.tipo === "ORDINARIO") setTipo(g.tipo);
        if (Array.isArray(g.condiciones)) setMarcadas(g.condiciones.filter((c) => condiciones.some((x) => x.codigo === c)));
      }
    } catch { /* sin almacenamiento */ }
  }, [condiciones]);

  async function consultar(e?: FormEvent) {
    e?.preventDefault();
    const limpio = rif.trim().toUpperCase();
    if (!/^[VEJPGC]/.test(limpio) || limpio.replace(/\D/g, "").length < 8) { setError("Escribe el RIF completo, con su letra y su dígito final (p. ej. J-12345678-9)"); return; }
    setCargando(true); setError(null);
    try {
      const q = new URLSearchParams({ rif: limpio, tipo, ...(tipo === "ESPECIAL" && marcadas.length ? { condiciones: marcadas.join(",") } : {}) });
      const r = await fetch(`/api/publico/calendario/deberes?${q}`);
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error?.mensaje ?? "No se pudo consultar");
      setResultado(d);
      try {
        if (recordar) localStorage.setItem(GUARDADO, JSON.stringify({ rif: limpio, tipo, condiciones: marcadas }));
        else localStorage.removeItem(GUARDADO);
      } catch { /* sin almacenamiento */ }
    } catch (err) {
      setResultado(null); setError((err as Error).message);
    } finally { setCargando(false); }
  }

  const descargar = () => {
    if (!resultado) return;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([calendarioIcs(resultado)], { type: "text/calendar;charset=utf-8" }));
    a.download = `deberes-${resultado.rif}.ics`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Agrupados por mes de la fecha límite
  const meses: [string, Deber[]][] = [];
  for (const d of resultado?.deberes ?? []) {
    const m = MES.format(new Date(`${d.fecha_limite}T12:00:00Z`));
    const ult = meses.at(-1);
    if (ult && ult[0] === m) ult[1].push(d); else meses.push([m, [d]]);
  }

  return (
    <div className={`tarjeta ${s.herramienta}`} id="deberes">
      <div className={s.cabeza}>
        <h3>Mis deberes tributarios</h3>
        <span>Escribe tu RIF y tu tipo de contribuyente: te mostramos tus próximos vencimientos, con los traslados por días inhábiles.</span>
      </div>
      <form className={s.formulario} onSubmit={consultar}>
        <div className={s.segmentado} role="group" aria-label="Tipo de contribuyente">
          {(["ESPECIAL", "ORDINARIO"] as Tipo[]).map((t) => (
            <button key={t} type="button" aria-pressed={tipo === t} onClick={() => setTipo(t)}>{t === "ESPECIAL" ? "Contribuyente especial" : "Ordinario"}</button>
          ))}
        </div>
        <label className={s.campoRif}>
          <span className="solo-lector">RIF</span>
          <input value={rif} onChange={(e) => setRif(e.target.value.toUpperCase())} placeholder="RIF, p. ej. J-12345678-9" maxLength={14} autoComplete="off" spellCheck={false} />
        </label>
        <button type="submit" className="boton boton-primario" disabled={cargando}>{cargando ? "Consultando…" : "Ver mis deberes"}</button>
      </form>
      <div className={s.opciones}>
        {tipo === "ESPECIAL" && condiciones.length > 0 && (
          <details className={s.condiciones}>
            <summary>¿Te aplica alguna condición especial?{marcadas.length ? ` (${marcadas.length})` : ""}</summary>
            <div>
              {condiciones.map((c) => (
                <label key={c.codigo}>
                  <input type="checkbox" checked={marcadas.includes(c.codigo)}
                    onChange={(e) => setMarcadas((m) => e.target.checked ? [...m, c.codigo] : m.filter((x) => x !== c.codigo))} />
                  <span>{c.descripcion}</span>
                </label>
              ))}
            </div>
          </details>
        )}
        <label className={s.recordar}><input type="checkbox" checked={recordar} onChange={(e) => setRecordar(e.target.checked)} /> Recordar mi RIF en este equipo</label>
        <span className={s.aviso}>El RIF consultado queda registrado con fines estadísticos · <a href="/privacidad">Privacidad</a></span>
      </div>
      {error && <p className={s.error} role="alert">{error}</p>}

      {resultado && (
        <div className={s.resultado} aria-live="polite">
          <div className={s.resumen}>
            <span><strong className="mono">{resultado.rif}</strong> · terminal {resultado.terminal} · {resultado.tipo_contribuyente === "ESPECIAL" ? "contribuyente especial" : "contribuyente ordinario"}</span>
            {resultado.deberes.length > 0 && <button type="button" className={s.ics} onClick={descargar}>Agregar a mi calendario (.ics)</button>}
          </div>
          {resultado.deberes.length === 0 && <p className={s.vacio}>No hay deberes próximos cargados para este RIF.</p>}
          {meses.map(([m, lista]) => (
            <div key={m}>
              <div className={s.mes}>{m.charAt(0).toUpperCase() + m.slice(1)}</div>
              {lista.map((d) => (
                <div key={`${d.obligacion}-${d.fecha_limite}`} className={s.deber}>
                  <span className={s.dia}><strong className="mono">{fechaCorta(d.fecha_limite)}</strong><span>{diaSemana(d.fecha_limite)}</span></span>
                  <span className={s.texto}>
                    <strong>{d.nombre}{d.periodo_desde && d.periodo_hasta ? ` · del ${ddmm(d.periodo_desde)} al ${ddmm(d.periodo_hasta)}` : ""}</strong>
                    {d.fecha !== d.fecha_limite
                      ? <span className={s.traslado}>Vencía el {fechaCorta(d.fecha)}, día inhábil: se traslada · {d.base}</span>
                      : <span>{d.base}</span>}
                    {d.aviso && <span className={s.traslado}>{d.aviso}</span>}
                  </span>
                  <span className={`${s.insignia} ${d.dias_restantes <= 7 ? s.pronto : ""}`}>{cuanto(d.dias_restantes)}</span>
                </div>
              ))}
            </div>
          ))}
          <p className={s.nota}>{resultado.nota} Resultado orientativo según el calendario oficial cargado; verifica en el portal del SENIAT. Registramos los RIF consultados con fines estadísticos (ver <a href="/privacidad">Privacidad</a>).</p>
        </div>
      )}
    </div>
  );
}
