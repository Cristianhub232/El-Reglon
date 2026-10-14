// Calendario de deberes tributarios por RIF (docs/13): página propia de «Mis deberes», indexable por Google.
// Acepta ?rif=J-12345678-9&tipo=ESPECIAL (lo usan los correos de prospección).
import { condiciones } from "../../modules/calendario/consultas.ts";
import { hoyCaracas } from "../../core/validacion.ts";
import { diasInhabiles } from "../../modules/web/portada.ts";
import { MisDeberes } from "../../ui/sitio/MisDeberes.tsx";
import { PaginaHerramienta } from "../../ui/sitio/PaginaHerramienta.tsx";
import { TarjetaInhabiles } from "../../ui/sitio/Tarjetas.tsx";
import s from "../../ui/sitio/herramienta.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Calendario de deberes tributarios 2026 por RIF",
  description: "Contribuyentes especiales y ordinarios: consulta gratis tus próximos vencimientos con el SENIAT según el último dígito de tu RIF: IVA, ISLR, retenciones e IGTF, con la prórroga por días inhábiles (COT art. 10). Agrégalos a tu calendario.",
  alternates: { canonical: "/deberes-tributarios" },
};

export default async function PaginaDeberes() {
  const [cond, inhabiles] = await Promise.all([
    condiciones().catch(() => ({ condiciones: [] })),
    diasInhabiles(hoyCaracas(), 8).catch(() => []),
  ]);
  return (
    <PaginaHerramienta ruta="/deberes-tributarios" nombre="Deberes tributarios" sobretitulo="Calendario tributario 2026 · gratis"
      titulo="Tus próximos deberes con el SENIAT, según tu RIF"
      entrada="Escribe tu RIF y elige si eres contribuyente especial u ordinario: verás tus próximos vencimientos de IVA, ISLR, retenciones e IGTF, con su base legal y la prórroga cuando caen en día inhábil."
      preguntas={[
        { p: "¿Cómo sé si soy contribuyente especial?", r: "La condición de contribuyente especial la notifica el SENIAT; no se deduce del número de RIF. Si no fuiste notificado, eres contribuyente ordinario." },
        { p: "¿De qué depende la fecha de mi vencimiento?", r: "Para los contribuyentes especiales, del último dígito del RIF, según el calendario de la Providencia SNAT/2025/000091. Para los ordinarios, el IVA vence el primer día hábil desde el día 15 del mes siguiente al período (Reglamento de la Ley de IVA, art. 60), igual para todos los terminales." },
        { p: "¿Qué pasa si el vencimiento cae en un día feriado?", r: "Según el art. 10 del Código Orgánico Tributario, se prorroga al siguiente día hábil. También cuentan como inhábiles los días bancarios no laborables." },
        { p: "¿Puedo recibir un aviso antes de que venza?", r: "Sí: activa los avisos con la campana de la cabecera y sigue tu RIF; te avisamos 3 días antes y el mismo día. También puedes descargar tus vencimientos y agregarlos a tu calendario." },
        { p: "¿Guardan mi RIF?", r: "Registramos los RIF consultados con fines estadísticos durante 12 meses, sin asociarlos a tu nombre. Ver la página de Privacidad." },
      ]}>
      <div className={s.rejilla}>
        <MisDeberes condiciones={cond.condiciones as { codigo: string; descripcion: string }[]} />
        <TarjetaInhabiles inhabiles={inhabiles} />
      </div>
      <section className={s.texto}>
        <h2>Contribuyentes especiales</h2>
        <p>El SENIAT fija cada año un calendario por el último dígito del RIF. En 2026 rige la Providencia SNAT/2025/000091: el IVA y las retenciones se declaran por quincenas, junto con los anticipos de ISLR y el IGTF, además de las estimadas y las retenciones de ISLR.</p>
        <h2>Contribuyentes ordinarios</h2>
        <p>Declaran el IVA una vez al mes. El vencimiento es el primer día hábil a partir del día 15 del mes siguiente al período declarado (Reglamento de la Ley de IVA, art. 60), sin importar el terminal del RIF.</p>
        <h2>Días inhábiles y prórrogas</h2>
        <p>Cuando un vencimiento cae en un día feriado nacional o bancario, se corre al siguiente día hábil (Código Orgánico Tributario, art. 10). Las fechas que muestra El Renglón ya incluyen esa prórroga.</p>
      </section>
    </PaginaHerramienta>
  );
}
