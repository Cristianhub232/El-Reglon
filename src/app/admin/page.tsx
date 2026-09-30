// Resumen del panel (resources/Admin.dc.html · RESUMEN)
import Link from "next/link";
import { requerirSeccion } from "../../core/auth/dal.ts";
import { puedeVer } from "../../core/auth/roles.ts";
import { datosResumen, PERIODOS, type Periodo } from "../../modules/admin/resumen.ts";
import { CATEGORIAS, categoria, describir } from "../../ui/admin/eventos.ts";
import { entero, fechaCorta, fechaHora, fechaLarga, hora, haceCuanto, numero } from "../../ui/formato.ts";
import s from "../../ui/admin/admin.module.css";
import r from "../../ui/admin/resumen.module.css";

export const metadata = { title: "Resumen" };

const COLOR_MODULO: Record<string, string> = { iva: "#2E7D5B", bcv: "#C8921A", arancel: "#1F4E8C", calendario: "#B8352B", rif: "#0E2440" };
const NOMBRE_MODULO: Record<string, string> = { iva: "IVA", bcv: "BCV", arancel: "Arancel", calendario: "Calendario", rif: "RIF" };

export default async function Resumen({ searchParams }: { searchParams: Promise<{ periodo?: string }> }) {
  const u = await requerirSeccion("resumen");
  const pq = (await searchParams).periodo;
  const periodo: Periodo = pq && pq in PERIODOS ? (pq as Periodo) : "14";
  const d = await datosResumen(u, periodo);
  const max = Math.max(1, ...d.serie.map((x) => x.consultas));
  const variacion = d.variacion === null ? "sin datos de ayer" : `${d.variacion >= 0 ? "+" : "−"}${numero(Math.abs(d.variacion), 1)} % vs. ayer`;
  const kpis = d.propias
    ? [
      { label: "Consultas hoy (tus keys)", valor: entero(d.consultasHoy), nota: variacion, clase: (d.variacion ?? 0) >= 0 ? "t-exento" : "t-adicional" },
      { label: "Tus API keys activas", valor: String(d.keys.activas), nota: `de ${d.keys.total}`, clase: "t-apagado" },
      { label: "Errores 429 hoy", valor: entero(d.limitadasHoy), nota: "límite por minuto", clase: "t-adicional" },
    ]
    : [
      { label: "Consultas hoy", valor: entero(d.consultasHoy), nota: variacion, clase: (d.variacion ?? 0) >= 0 ? "t-exento" : "t-adicional" },
      { label: "API keys activas", valor: String(d.keys.activas), nota: `${d.keys.nuevas} ${d.keys.nuevas === 1 ? "nueva" : "nuevas"} esta semana`, clase: "t-apagado" },
      { label: "Consultas no determinadas", valor: entero(d.curaduria), nota: "para curaduría", clase: d.curaduria ? "t-adicional" : "t-apagado" },
    ];
  if (d.tasa) kpis.push({ label: "Tasa BCV USD", valor: numero(d.tasa.venta_bs, 4), nota: `fecha valor ${fechaCorta(d.tasa.fecha_valor)}`, clase: "t-apagado" });
  const bcv = d.estados.ultimaBcv;
  const estados = [
    ["IVA", d.estados.catalogo ? `Clasificador · ${d.estados.catalogo.reglas} reglas · ${d.estados.catalogo.version}` : "Catálogo no cargado",
      d.estados.catalogo?.estado === "validado" ? "en servicio" : "validación"],
    ["BCV", bcv ? `Última lectura ${hora(bcv.ocurrido_en)} · ${bcv.accion.replace("bcv.", "")}` : "Sin lecturas registradas", bcv?.accion === "bcv.lectura_fallida" ? "con fallas" : "en servicio"],
    ["Arancel", d.estados.versionesArancel.join(" + ").replace(/Decreto N° /g, "") || "No cargado", "en servicio"],
    ["Calendario", `Especiales y ordinarios${d.estados.calendarioHasta ? ` · hasta ${fechaCorta(d.estados.calendarioHasta)}/${d.estados.calendarioHasta.slice(0, 4)}` : ""}`, "en servicio"],
    ["RIF", "Dígito verificador", "en servicio"],
  ];
  const n = d.serie.length;
  return (
    <div className={s.seccion} style={{ gap: 24 }}>
      <div className={s.encabezado}>
        <div><h1>Resumen</h1><span className={s.subtitulo}>{fechaLarga(d.hoy)} · hora de Caracas</span></div>
        <nav className={s.selector} aria-label="Período">
          {([["14", "14 días"], ["30", "30 días"], ["trimestre", "Trimestre"]] as const).map(([k, t]) => (
            <Link key={k} href={k === "14" ? "/admin" : `/admin?periodo=${k}`} aria-current={periodo === k}>{t}</Link>
          ))}
        </nav>
      </div>
      {u.rol === "super" && !u.totp_activo && (
        <div className={s.soloLectura}>La verificación en dos pasos es obligatoria para los superadministradores. <Link href="/admin/cuenta">Actívala en Mi cuenta</Link>.</div>
      )}
      {u.rol === "lectura" && <div className={s.soloLectura}>Modo solo lectura: puedes consultar todo, pero no crear, editar ni revocar.</div>}
      <div className={s.kpis}>
        {kpis.map((k) => (
          <div key={k.label} className={s.kpi}><span>{k.label}</span><span className={s.kpiValor}>{k.valor}</span><span className={`${s.kpiNota} ${k.clase}`}>{k.nota}</span></div>
        ))}
      </div>
      <div className={s.rejilla2}>
        <div className={`${s.panel} ${r.grafico}`}>
          <div className={r.graficoCabeza}><strong className={s.panelTitulo}>Consultas por día</strong><span className={s.apagado}>Total {PERIODOS[periodo]} días: {entero(d.total)}</span></div>
          <div className={r.barras} role="img" aria-label={`Consultas por día; hoy ${d.consultasHoy}`}>
            {d.serie.map((x, i) => (
              <div key={x.fecha} className={r.barra} title={`${fechaCorta(x.fecha)}: ${entero(x.consultas)}`}>
                <div style={{ height: `${(x.consultas / max) * 100}%`, background: i === n - 1 ? "var(--amarillo)" : "var(--azul)" }} />
              </div>
            ))}
          </div>
          <div className={r.ejes}><span>{fechaCorta(d.serie[0].fecha)}</span><span>{fechaCorta(d.serie[Math.floor(n / 2)].fecha)}</span><span>{fechaCorta(d.serie[n - 1].fecha)}</span></div>
          {d.total === 0 && <span className={s.apagado}>Todavía no hay consultas registradas en este período.</span>}
        </div>
        <div className={`${s.panel} ${r.reparto}`}>
          <strong className={s.panelTitulo}>Por módulo</strong>
          {d.reparto.length === 0 && <span className={s.apagado}>Sin consultas en el período.</span>}
          {d.reparto.map((m) => (
            <div key={m.modulo} className={r.modulo}>
              <div><span>{NOMBRE_MODULO[m.modulo] ?? m.modulo}</span><span className="mono">{numero(m.pct, 0)}%</span></div>
              <div className={r.pista}><div style={{ width: `${m.pct}%`, background: COLOR_MODULO[m.modulo] ?? "var(--texto-3)" }} /></div>
            </div>
          ))}
        </div>
      </div>
      <div className={s.rejilla2}>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Estado de los módulos</strong></div>
          {estados.map(([m, texto, estado]) => (
            <div key={m} className={s.fila} style={{ gridTemplateColumns: "100px minmax(0,1fr) auto" }}>
              <strong style={{ color: "var(--tinta)" }}>{m}</strong><span className={s.apagado} style={{ fontSize: 14 }}>{texto}</span>
              <span className={`punto ${estado === "en servicio" ? "t-exento" : estado === "validación" ? "t-condicionado" : "t-adicional"}`}>{estado}</span>
            </div>
          ))}
        </div>
        <div className={s.panel}>
          <div className={s.panelCabeza}><strong>Actividad reciente</strong>{puedeVer(u.rol, "auditoria") && <Link href="/admin/auditoria" style={{ fontSize: 14, fontWeight: 600 }}>Ver auditoría</Link>}</div>
          {d.actividad.length === 0 && <div className={s.vacio}>Sin actividad todavía.</div>}
          {d.actividad.map((a, i) => (
            <div key={i} className={s.fila} style={{ gridTemplateColumns: "72px minmax(0,1fr)" }} title={fechaHora(a.ocurrido_en)}>
              <span className={s.monoChico} style={{ color: "var(--texto-4)" }}>{haceCuanto(a.ocurrido_en).startsWith("hace") || haceCuanto(a.ocurrido_en) === "ahora" ? hora(a.ocurrido_en) : fechaCorta(new Date(a.ocurrido_en).toISOString().slice(0, 10))}</span>
              <span><strong>{a.actor}</strong> · <span className={CATEGORIAS[categoria(a.accion)].clase}>{a.accion}</span> · {describir(a.accion, a.detalle)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
