// «¿Lleva IVA?»: página propia del clasificador de IVA (docs/16), indexable por Google.
import { hoyCaracas } from "../../core/validacion.ts";
import { clasificarSolicitud } from "../../modules/iva/clasificador.ts";
import { imagenReferencia } from "../../modules/comparador/referencia.ts";
import { alicuotasVigentes } from "../../modules/web/portada.ts";
import { BarraClasificador, ClasificadorProvider, PanelClasificador, type Resultado } from "../../ui/sitio/Clasificador.tsx";
import { EJEMPLOS } from "../../ui/sitio/ejemplos.ts";
import { PaginaHerramienta } from "../../ui/sitio/PaginaHerramienta.tsx";
import { TarjetaAlicuotas } from "../../ui/sitio/Tarjetas.tsx";
import { numero } from "../../ui/formato.ts";
import s from "../../ui/sitio/herramienta.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "¿Lleva IVA? Clasificador de IVA de Venezuela con base legal",
  description: "Escribe un producto o su código de barras y sabrás si es exento o si paga 8 %, 16 % o 31 % de IVA, con el artículo de la ley que lo respalda. Gratis y sin registro.",
  alternates: { canonical: "/clasificador-iva" },
};

export default async function PaginaClasificador() {
  const [inicial, a] = await Promise.all([
    clasificarSolicitud({ nombre: EJEMPLOS[0].texto, operacion: "nacional", precio_compra: null, precio_venta: null, moneda: null }, null).catch(() => null) as Promise<Resultado | null>,
    alicuotasVigentes(hoyCaracas()).catch(() => ({ general: null, reducida: null, adicional: null })),
  ]);
  if (inicial?.estado === "determinado") inicial.imagen_referencia = await imagenReferencia(EJEMPLOS[0].texto, []).catch(() => null);
  const g = a.general ? numero(a.general, 0) : "16", r = a.reducida ? numero(a.reducida, 0) : "8";
  const sumada = a.general && a.adicional ? numero(Number(a.general) + Number(a.adicional), 0) : "31";
  return (
    <PaginaHerramienta ruta="/clasificador-iva" nombre="Clasificador de IVA" sobretitulo="Clasificador de IVA · gratis"
      titulo="¿Lleva IVA? Consúltalo con su base legal"
      entrada={`Escribe el nombre de un producto o servicio, o su código de barras: te decimos si está exento o si paga ${r} %, ${g} % o ${sumada} % de IVA, y en qué artículo de la ley se basa.`}
      preguntas={[
        { p: "¿Cuáles son las alícuotas de IVA en Venezuela?", r: `La alícuota general es ${g} % (art. 63 de la Ley del IVA), la reducida ${r} % (art. 64) y los bienes de consumo suntuario pagan además una alícuota adicional, ${sumada} % en total (arts. 27 y 61).` },
        { p: "¿Qué productos están exentos de IVA?", r: "Entre otros, los alimentos básicos como el arroz, la harina de maíz o el café (art. 18, num. 1), las medicinas (art. 18, num. 3) y los demás bienes y servicios de los arts. 16 a 19 de la ley. El clasificador te muestra el literal exacto." },
        { p: "¿Puedo buscar por código de barras?", r: "Sí: acepta EAN, UPC, GTIN-14, ISBN, PLU, SKU o el código arancelario, además del nombre del producto." },
        { p: "¿El resultado es definitivo?", r: "Es orientativo: cuando un producto admite varias interpretaciones, te mostramos las opciones con sus condiciones. La decisión final es tuya y conviene validarla con tu asesor tributario." },
      ]}>
      <ClasificadorProvider inicial={inicial}>
        <BarraClasificador />
        <div className={s.rejilla}>
          <PanelClasificador />
          <TarjetaAlicuotas alicuotas={a} />
        </div>
      </ClasificadorProvider>
      <section className={s.texto}>
        <h2>Exento, exonerado o no sujeto</h2>
        <p>Los tres casos no pagan IVA, pero no son lo mismo: la operación <strong>no sujeta</strong> queda fuera del impuesto (art. 16), la <strong>exenta</strong> está liberada por la propia ley (arts. 17 a 19) y la <strong>exonerada</strong> lo está por un decreto del Ejecutivo, normalmente por un plazo.</p>
        <h2>Importaciones</h2>
        <p>Si eliges la operación de importación, el clasificador aplica también las exoneraciones vigentes por decreto, además de la ley.</p>
      </section>
    </PaginaHerramienta>
  );
}
