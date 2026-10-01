"use client";
// Campana de la cabecera: avisos push de este dispositivo (docs/24). La persona elige los temas (tasa BCV, noticias,
// deberes de sus RIF, novedades); el permiso del navegador se pide solo al pulsar "Activar avisos".
import { useEffect, useRef, useState } from "react";
import s from "./campana.module.css";

type Tema = "tasa" | "noticias" | "deberes" | "novedades";
type Tipo = "ESPECIAL" | "ORDINARIO";
interface Condicion { codigo: string; descripcion: string }
interface RifSeguido { rif: string; tipo: Tipo; condiciones: string[] }
type Soporte = "comprobando" | "si" | "no" | "ios" | "denegado" | "no-disponible";

const TEMAS: [Tema, string, string][] = [
  ["tasa", "Tasa oficial BCV", "Cuando el BCV publica una tasa nueva: dólar y euro, con su variación."],
  ["noticias", "Noticias", "Un resumen tres veces al día: 8:00, 13:00 y 19:00."],
  ["deberes", "Mis deberes tributarios", "Tres días antes y el mismo día de cada vencimiento, a las 8:00."],
  ["novedades", "Novedades de El Renglón", "Cuando agreguemos una herramienta o un módulo nuevo."],
];
const MAX_RIF = 5;
const PREGUNTADO = "avisos.preguntado";

function preguntadoHace30Dias() {
  try { return Date.now() - Number(localStorage.getItem(PREGUNTADO) ?? 0) < 30 * 86_400_000; } catch { return true; }
}
function recordarPregunta() {
  try { localStorage.setItem(PREGUNTADO, String(Date.now())); } catch { /* sin almacenamiento */ }
}
const RIF_VACIO: RifSeguido = { rif: "", tipo: "ESPECIAL", condiciones: [] };

function claveBinaria(b64: string) {
  const relleno = "=".repeat((4 - (b64.length % 4)) % 4);
  const bin = atob((b64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function api<T>(ruta: string, cuerpo: unknown): Promise<T> {
  const r = await fetch(`/api/publico/avisos/${ruta}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(cuerpo) });
  const d = await r.json().catch(() => null);
  if (!r.ok) throw new Error(d?.error?.mensaje ?? "No se pudo completar la operación");
  return d as T;
}

function detectar(): Soporte {
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.userAgent.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const instalada = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) return ios && !instalada ? "ios" : "no";
  if (Notification.permission === "denied") return "denegado";
  return "si";
}

async function registro() {
  return (await navigator.serviceWorker.getRegistration("/")) ?? navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
}

export function Campana() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [soporte, setSoporte] = useState<Soporte>("comprobando");
  const [suscrito, setSuscrito] = useState(false);
  const [temas, setTemas] = useState<Tema[]>(["tasa", "noticias"]);
  const [rifs, setRifs] = useState<RifSeguido[]>([{ ...RIF_VACIO }]);
  const [condiciones, setCondiciones] = useState<Condicion[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<{ tipo: "ok" | "error"; texto: string } | null>(null);

  // Estado de este dispositivo: si ya tiene una suscripción, sus temas y RIF vienen del servidor
  // Estado de este dispositivo: si ya tiene una suscripción, sus temas y RIF vienen del servidor. Si no la tiene, la
  // ventana se abre sola al entrar (sin pedir aún el permiso del navegador); con "Ahora no" no vuelve en 30 días.
  useEffect(() => {
    const sop = detectar();
    setSoporte(sop);
    (async () => {
      if (sop === "si" && Notification.permission === "granted") {
        const reg = await navigator.serviceWorker.getRegistration("/");
        const sub = await reg?.pushManager.getSubscription();
        if (sub) {
          const e = await api<{ temas: Tema[]; rifs: RifSeguido[] }>("estado", { endpoint: sub.endpoint }).catch(() => null);
          if (e?.temas.length) {
            setSuscrito(true); setTemas(e.temas);
            if (e.rifs.length) setRifs(e.rifs);
            return;
          }
        }
      }
      if ((sop === "si" || sop === "ios") && !preguntadoHace30Dias()) setTimeout(() => void abrir(), 600);
    })().catch(() => {});
  }, []);

  async function abrir() {
    setMensaje(null);
    dialogo.current?.showModal();
    if (!condiciones.length) {
      fetch("/api/publico/calendario/condiciones").then((r) => r.json()).then((d) => setCondiciones(d.condiciones ?? [])).catch(() => {});
    }
    // Sin RIF seguidos aún: se propone el que la persona guardó en "Mis deberes tributarios"
    if (!suscrito && !rifs[0].rif) {
      try {
        const g = JSON.parse(localStorage.getItem("deberes.rif") ?? "null") as Partial<RifSeguido> | null;
        if (g?.rif) setRifs([{ rif: g.rif, tipo: g.tipo === "ORDINARIO" ? "ORDINARIO" : "ESPECIAL", condiciones: Array.isArray(g.condiciones) ? g.condiciones : [] }]);
      } catch { /* sin almacenamiento */ }
    }
    if (soporte === "si") {
      const r = await fetch("/api/publico/avisos/clave").catch(() => null);
      if (!r?.ok) setSoporte("no-disponible");
    }
  }

  const alternar = (t: Tema, si: boolean) => setTemas((l) => (si ? [...l, t] : l.filter((x) => x !== t)));
  const cambiarRif = (i: number, c: Partial<RifSeguido>) => setRifs((l) => l.map((r, j) => (j === i ? { ...r, ...c } : r)));

  async function guardar() {
    setMensaje(null);
    if (!temas.length) return desactivar();
    const seguidos = rifs.map((r) => ({ ...r, rif: r.rif.trim().toUpperCase() })).filter((r) => r.rif);
    if (temas.includes("deberes") && !seguidos.length) { setMensaje({ tipo: "error", texto: "Escribe al menos un RIF para los avisos de deberes." }); return; }
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") { setSoporte(permiso === "denied" ? "denegado" : "si"); throw new Error("Hace falta permitir las notificaciones para recibir avisos."); }
      const { clave } = await (await fetch("/api/publico/avisos/clave")).json() as { clave: string };
      const reg = await registro();
      await navigator.serviceWorker.ready;
      // Si el servidor no conoce la suscripción de este navegador (venció o se dio de baja), se pide una nueva
      let sub = await reg.pushManager.getSubscription();
      if (sub && !suscrito) { await sub.unsubscribe().catch(() => {}); sub = null; }
      sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBinaria(clave) });
      const r = await api<{ temas: Tema[]; rifs: RifSeguido[] }>("suscripcion", { suscripcion: sub.toJSON(), temas, rifs: temas.includes("deberes") ? seguidos : [] });
      setTemas(r.temas); if (r.rifs.length) setRifs(r.rifs);
      setMensaje({ tipo: "ok", texto: suscrito ? "Cambios guardados." : "Listo: los avisos quedaron activados en este dispositivo." });
      setSuscrito(true);
    } catch (e) {
      setMensaje({ tipo: "error", texto: (e as Error).message });
    } finally { setOcupado(false); }
  }

  async function desactivar() {
    setOcupado(true); setMensaje(null);
    try {
      const reg = await navigator.serviceWorker.getRegistration("/");
      const sub = await reg?.pushManager.getSubscription();
      if (sub) { await api("baja", { endpoint: sub.endpoint }).catch(() => {}); await sub.unsubscribe(); }
      setSuscrito(false); setTemas(["tasa", "noticias"]);
      setMensaje({ tipo: "ok", texto: "Avisos desactivados en este dispositivo." });
    } catch (e) {
      setMensaje({ tipo: "error", texto: (e as Error).message });
    } finally { setOcupado(false); }
  }

  const aviso = {
    comprobando: null,
    si: null,
    no: "Este navegador no admite avisos. Prueba con Chrome, Edge, Firefox o Safari actualizados.",
    ios: "En iPhone y iPad, primero agrega El Renglón a tu pantalla de inicio (Compartir → «Agregar a inicio») y ábrelo desde ese icono; ahí podrás activar los avisos.",
    denegado: "Bloqueaste las notificaciones de este sitio. Para recibir avisos, permítelas en la configuración del navegador (el candado junto a la dirección) y vuelve a intentarlo.",
    "no-disponible": "Los avisos no están disponibles en este momento. Inténtalo más tarde.",
  }[soporte];

  return (
    <>
      <button type="button" className={s.campana} onClick={abrir} aria-haspopup="dialog"
        aria-label={suscrito ? "Avisos activados: cambiar" : "Activar avisos"} title={suscrito ? "Avisos activados" : "Recibir avisos"}>
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill={suscrito ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {suscrito && <span className={s.marca} aria-hidden="true" />}
      </button>

      <dialog ref={dialogo} className={s.dialogo} aria-labelledby="avisos-titulo" onClose={recordarPregunta} onClick={(e) => { if (e.target === e.currentTarget) dialogo.current?.close(); }}>
        <div className={s.contenido}>
          <div className={s.cabeza}>
            <div>
              <h2 id="avisos-titulo">Avisos en este dispositivo</h2>
              <span>{suscrito ? "Activados. Cambia los temas cuando quieras." : "¿Te avisamos? Elige qué quieres recibir en este dispositivo. No hace falta registrarse."}</span>
            </div>
            <button type="button" className={s.cerrar} onClick={() => dialogo.current?.close()} aria-label="Cerrar">×</button>
          </div>

          {aviso ? <p className={s.nota} role="status">{aviso}</p> : (
            <>
              <fieldset className={s.temas}>
                <legend className="solo-lector">Temas</legend>
                {TEMAS.map(([t, nombre, detalle]) => (
                  <div key={t} className={s.tema}>
                    <label>
                      <input type="checkbox" checked={temas.includes(t)} onChange={(e) => alternar(t, e.target.checked)} />
                      <span><strong>{nombre}</strong><span>{detalle}</span></span>
                    </label>
                    {t === "deberes" && temas.includes("deberes") && (
                      <div className={s.rifs}>
                        {rifs.map((r, i) => (
                          <div key={i} className={s.rif}>
                            <div className={s.fila}>
                              <div className={s.segmentado} role="group" aria-label="Tipo de contribuyente">
                                {(["ESPECIAL", "ORDINARIO"] as Tipo[]).map((x) => (
                                  <button key={x} type="button" aria-pressed={r.tipo === x} onClick={() => cambiarRif(i, { tipo: x })}>{x === "ESPECIAL" ? "Especial" : "Ordinario"}</button>
                                ))}
                              </div>
                              <input value={r.rif} onChange={(e) => cambiarRif(i, { rif: e.target.value.toUpperCase() })} placeholder="J-12345678-9"
                                maxLength={14} autoComplete="off" spellCheck={false} aria-label={`RIF ${i + 1}`} />
                              {rifs.length > 1 && <button type="button" className={s.quitar} onClick={() => setRifs((l) => l.filter((_, j) => j !== i))} aria-label={`Quitar RIF ${i + 1}`}>×</button>}
                            </div>
                            {r.tipo === "ESPECIAL" && condiciones.length > 0 && (
                              <details className={s.condiciones}>
                                <summary>Condiciones especiales{r.condiciones.length ? ` (${r.condiciones.length})` : ""}</summary>
                                <div>
                                  {condiciones.map((c) => (
                                    <label key={c.codigo}>
                                      <input type="checkbox" checked={r.condiciones.includes(c.codigo)}
                                        onChange={(e) => cambiarRif(i, { condiciones: e.target.checked ? [...r.condiciones, c.codigo] : r.condiciones.filter((x) => x !== c.codigo) })} />
                                      <span>{c.descripcion}</span>
                                    </label>
                                  ))}
                                </div>
                              </details>
                            )}
                          </div>
                        ))}
                        {rifs.length < MAX_RIF && <button type="button" className={s.agregar} onClick={() => setRifs((l) => [...l, { ...RIF_VACIO }])}>+ Seguir otro RIF</button>}
                      </div>
                    )}
                  </div>
                ))}
              </fieldset>

              {mensaje && <p className={mensaje.tipo === "ok" ? s.ok : s.error} role={mensaje.tipo === "ok" ? "status" : "alert"}>{mensaje.texto}</p>}

              <div className={s.botones}>
                <button type="button" className="boton boton-primario" onClick={guardar} disabled={ocupado || soporte === "comprobando"}>
                  {ocupado ? "Guardando…" : suscrito ? "Guardar cambios" : "Activar avisos"}
                </button>
                {suscrito
                  ? <button type="button" className={s.desactivar} onClick={desactivar} disabled={ocupado}>Desactivar avisos</button>
                  : <button type="button" className={s.ahoraNo} onClick={() => dialogo.current?.close()}>Ahora no</button>}
              </div>
              <p className={s.pie}>Los RIF que sigas se guardan en nuestro servidor solo para enviarte estos avisos y se borran al desactivarlos · <a href="/privacidad#avisos">Privacidad</a></p>
            </>
          )}
        </div>
      </dialog>
    </>
  );
}
