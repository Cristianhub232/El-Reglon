// "Casos de uso · Lo que obtiene cada perfil": factura del comerciante, próximos deberes del contador y la misma
// respuesta por API para el desarrollador. Datos de src/modules/web/casos.ts (motor real, empresas de ejemplo).
import Link from "next/link";
import { EMPRESA_CALENDARIO, EMPRESA_FACTURA, type Casos } from "../../modules/web/casos.ts";
import { claseCategoria, diaSemana, etiquetaTasa, fecha, fechaCorta, numero } from "../formato.ts";
import { CasosPestanas } from "./CasosPestanas.tsx";
import s from "./casos.module.css";

const PERFILES = [
  { id: "comerciante", titulo: "Comerciante", texto: "Factura con la alícuota de cada renglón y el total a la tasa BCV del día." },
  { id: "contador", titulo: "Contador o asesor", texto: "Próximos deberes por RIF, con prórrogas por días inhábiles." },
  { id: "desarrollador", titulo: "Desarrollador", texto: "Las mismas respuestas por API, listas para tu POS o ERP." },
];

function Factura({ f, hoy }: { f: NonNullable<Casos["factura"]>; hoy: string }) {
  return (
    <div className={s.tarjeta}>
      <div className={s.cabeza}>
        <div><strong className={s.empresa}>{EMPRESA_FACTURA.nombre}</strong><span className={s.rif}>RIF {EMPRESA_FACTURA.rif} · Factura {EMPRESA_FACTURA.numero}</span></div>
        <span className={s.ejemplo}>{fecha(hoy)} · ejemplo</span>
      </div>
      <div className={s.tablaMarco}>
        <table className={s.tabla}>
          <thead><tr><th>Descripción</th><th className={s.num}>Cant.</th><th>Alícuota</th><th className={s.num}>Monto Bs.</th></tr></thead>
          <tbody>
            {f.renglones.map((r) => (
              <tr key={r.descripcion}>
                <td><span className={s.producto}>{r.descripcion}</span><span className={s.cita}>{r.base}</span></td>
                <td className={`${s.num} mono`}>{r.cantidad}</td>
                <td><span className={`punto t-${claseCategoria(r.categoria)}`} style={{ fontWeight: 600 }}>{etiquetaTasa(r.categoria, r.alicuota)}</span></td>
                <td className={`${s.num} mono`}>{numero(r.montoBs, 2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className={s.totales}>
        <div><span>Base exenta</span><span className="mono">{numero(f.exenta, 2)}</span></div>
        <div><span>Base imponible {numero(f.alicuota, 0)} %</span><span className="mono">{numero(f.imponible, 2)}</span></div>
        <div><span>IVA {numero(f.alicuota, 0)} %</span><span className="mono">{numero(f.iva, 2)}</span></div>
        <div className={s.total}><strong>Total</strong><span><strong className="mono">Bs. {numero(f.total, 2)}</strong><small className="mono">≈ US$ {numero(f.totalUsd, 2)} a tasa BCV {numero(f.tasa, 4)}</small></span></div>
      </div>
    </div>
  );
}

function Deberes({ d }: { d: Casos["deberes"] }) {
  return (
    <div className={s.tarjeta}>
      <div className={s.cabeza}>
        <div><strong className={s.empresa}>{EMPRESA_CALENDARIO.nombre}</strong><span className={s.rif}>RIF {EMPRESA_CALENDARIO.rif} · Contribuyente especial</span></div>
        <span className={s.ejemplo}>Próximos deberes · ejemplo</span>
      </div>
      {d.map((x) => (
        <div key={`${x.fecha}-${x.nombre}`} className={s.deber}>
          <span className={s.dia}><strong className="mono">{fechaCorta(x.limite)}</strong><span>{diaSemana(x.limite)}</span></span>
          <span className={s.deberTexto}>
            <strong>{x.nombre}{x.periodo ? ` · ${x.periodo}` : ""}</strong>
            {x.trasladado
              ? <span className={s.traslado}>Vencía el {fechaCorta(x.fecha)}, día inhábil: se traslada</span>
              : <span>{x.base}</span>}
          </span>
          <span className={`${s.insignia} ${x.dias <= 7 ? s.insigniaPronto : ""}`}>{x.dias === 0 ? "hoy" : x.dias === 1 ? "mañana" : `en ${x.dias} días`}</span>
        </div>
      ))}
      {d.length === 0 && <div className={s.deber}><span className={s.deberTexto}><span>El calendario no tiene deberes próximos cargados.</span></span></div>}
      <div className={s.pie}>Si el vencimiento cae en día inhábil, se traslada al siguiente día hábil (COT art. 10). · <a href="#deberes">Consulta los de tu RIF</a></div>
    </div>
  );
}

// JSON con colores (sin HTML de terceros: los valores vienen del motor y React los escapa)
function Json({ v, sangria = 0 }: { v: unknown; sangria?: number }) {
  const pad = "  ".repeat(sangria + 1), fin = "  ".repeat(sangria);
  if (Array.isArray(v)) return <>[{"\n"}{v.map((x, i) => <span key={i}>{pad}<Json v={x} sangria={sangria + 1} />{i < v.length - 1 ? "," : ""}{"\n"}</span>)}{fin}]</>;
  if (v && typeof v === "object") {
    const e = Object.entries(v);
    return <>{"{"}{"\n"}{e.map(([k, x], i) => <span key={k}>{pad}<span className={s.jClave}>&quot;{k}&quot;</span>: <Json v={x} sangria={sangria + 1} />{i < e.length - 1 ? "," : ""}{"\n"}</span>)}{fin}{"}"}</>;
  }
  if (typeof v === "string") return <span className={s.jTexto}>&quot;{v}&quot;</span>;
  return <span className={s.jValor}>{String(v)}</span>;
}

function Api({ a }: { a: NonNullable<Casos["api"]> }) {
  return (
    <div className={s.tarjeta}>
      <div className={s.cabeza}>
        <div><strong className={s.empresa}><span className={s.metodo}>POST</span> /api/v1/iva/clasificar</strong><span className={s.rif}>Cabecera X-API-Key · respuesta JSON</span></div>
        <span className={s.ejemplo}>Respuesta real · recortada</span>
      </div>
      <pre className={s.codigo} aria-label="Petición de ejemplo"><span className={s.jComentario}># Petición</span>{"\n"}curl -X POST https://elrenglonve.org/api/v1/iva/clasificar \{"\n"}  -H <span className={s.jTexto}>&quot;X-API-Key: rgl_…&quot;</span> -H <span className={s.jTexto}>&quot;Content-Type: application/json&quot;</span> \{"\n"}  -d <span className={s.jTexto}>&apos;{JSON.stringify(a.cuerpo)}&apos;</span></pre>
      <pre className={`${s.codigo} ${s.respuesta}`} aria-label="Respuesta"><span className={s.jComentario}># 200 OK</span>{"\n"}<Json v={a.respuesta} /></pre>
      <div className={s.pie}>Montos como texto decimal exacto · <Link href="/docs">Documentación Swagger</Link> · <Link href="/solicitar-api-key">API key gratuita</Link></div>
    </div>
  );
}

export function CasosDeUso({ casos, hoy }: { casos: Casos; hoy: string }) {
  const sinDatos = <div className={s.tarjeta}><div className={s.pie}>Ejemplo no disponible en este momento.</div></div>;
  return (
    <section className={s.seccion} id="casos">
      <CasosPestanas perfiles={PERFILES} paneles={[
        casos.factura ? <Factura f={casos.factura} hoy={hoy} /> : sinDatos,
        <Deberes d={casos.deberes} />,
        casos.api ? <Api a={casos.api} /> : sinDatos,
      ]} />
    </section>
  );
}
