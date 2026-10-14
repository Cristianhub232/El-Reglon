// Tasa BCV de hoy: página propia con la tasa oficial (dólar y euro), historial, conversor y la referencia USDT P2P.
import { hoyCaracas } from "../../core/validacion.ts";
import { tasaP2PActual } from "../../modules/mercado/p2p.ts";
import { tasas } from "../../modules/web/portada.ts";
import { Conversor } from "../../ui/sitio/Conversor.tsx";
import { PaginaHerramienta } from "../../ui/sitio/PaginaHerramienta.tsx";
import { TarjetaTasas } from "../../ui/sitio/Tarjetas.tsx";
import { fecha, fechaCorta, numero } from "../../ui/formato.ts";
import s from "../../ui/sitio/herramienta.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const bcv = await tasas(hoyCaracas()).catch(() => null);
  const usd = bcv?.monedas.find((m) => m.codigo === "USD"), eur = bcv?.monedas.find((m) => m.codigo === "EUR");
  const dato = bcv && usd && eur ? `: Bs. ${numero(usd.tasa, 2)} por dólar y Bs. ${numero(eur.tasa, 2)} por euro (fecha valor ${fecha(bcv.fecha_valor)})` : "";
  return {
    title: `Tasa BCV hoy${bcv ? ` ${fecha(bcv.fecha_valor)}` : ""}: dólar y euro oficiales`,
    description: `Tasa oficial del Banco Central de Venezuela${dato}. Historial, conversor de bolívares y la tasa USDT de Binance P2P como referencia.`,
    alternates: { canonical: "/tasa-bcv" },
  };
}

export default async function PaginaTasa() {
  const [bcv, p2p] = await Promise.all([tasas(hoyCaracas()).catch(() => null), tasaP2PActual().catch(() => null)]);
  const usd = bcv?.monedas.find((m) => m.codigo === "USD"), eur = bcv?.monedas.find((m) => m.codigo === "EUR");
  return (
    <PaginaHerramienta ruta="/tasa-bcv" nombre="Tasa BCV de hoy" sobretitulo="Banco Central de Venezuela · tasa oficial"
      titulo="Tasa oficial del BCV de hoy"
      entrada="El dólar y el euro oficiales publicados por el Banco Central de Venezuela, con su variación, el historial completo y un conversor. Debajo, la tasa USDT de Binance P2P como referencia de mercado."
      preguntas={[
        { p: "¿Qué es la fecha valor?", r: "Es la fecha desde la que rige la tasa publicada. El BCV suele publicar por adelantado la tasa del siguiente día hábil; por eso puede verse una fecha valor posterior a la de hoy." },
        { p: "¿Qué tasa debo usar para facturar e IVA?", r: "La tasa oficial del BCV aplicable a la fecha de la operación (art. 25 de la Ley del IVA): la de esa fecha valor o, si ese día no hubo publicación, la última publicada antes." },
        { p: "¿Cada cuánto se actualiza?", r: "El Renglón lee la publicación del BCV a las 8, 14 y 20 h (hora de Caracas) y la contrasta con los archivos oficiales del BCV." },
        { p: "¿La tasa USDT es oficial?", r: "No. Es una referencia de mercado: el promedio de compra y venta de USDT en Binance P2P, leído cada 30 minutos. La brecha indica cuánto se aleja de la tasa oficial." },
      ]}>
      <div className={s.rejilla}>
        <TarjetaTasas bcv={bcv} p2p={p2p} />
        {usd && eur && bcv && <Conversor tasas={{ USD: usd.tasa, EUR: eur.tasa }} fechaValor={fechaCorta(bcv.fecha_valor)} />}
      </div>
      <section className={s.texto}>
        <h2>De dónde sale la tasa</h2>
        <p>Es la tasa de venta publicada por el Banco Central de Venezuela para cada fecha valor. El historial desde 2025 sale de los archivos oficiales del BCV; el botón «Ver historial» muestra la evolución del dólar y el euro.</p>
      </section>
    </PaginaHerramienta>
  );
}
