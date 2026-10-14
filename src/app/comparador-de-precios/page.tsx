// «¿Dónde está más barato?»: página propia del comparador de precios (docs/22), indexable por Google.
import { tiendasActivas } from "../../modules/comparador/buscador.ts";
import { Comparador } from "../../ui/sitio/Comparador.tsx";
import { PaginaHerramienta } from "../../ui/sitio/PaginaHerramienta.tsx";
import s from "../../ui/sitio/herramienta.module.css";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const n = (await tiendasActivas().catch(() => [])).length;
  return {
    title: "¿Dónde está más barato? Comparador de precios en Venezuela",
    description: `Compara el precio del mismo producto en ${n || "las principales"} cadenas venezolanas en línea: farmacias, supermercados y tiendas de electrodomésticos. En bolívares y dólares, a la tasa BCV del día. Gratis.`,
    alternates: { canonical: "/comparador-de-precios" },
  };
}

export default async function PaginaComparador() {
  const tiendas = await tiendasActivas().catch(() => []);
  return (
    <PaginaHerramienta ruta="/comparador-de-precios" nombre="Comparador de precios" sobretitulo="Comparador de precios · gratis"
      titulo="¿Dónde está más barato?"
      entrada={`Busca un producto y compara su precio en ${tiendas.length || "las principales"} cadenas venezolanas al mismo tiempo: farmacias, supermercados y tiendas de electrodomésticos, en bolívares y en dólares.`}
      preguntas={[
        { p: "¿De dónde salen los precios?", r: "Se consultan en vivo en la tienda en línea de cada cadena en el momento de tu búsqueda, con una memoria de 15 minutos por término. El Renglón no vende productos ni cobra a las tiendas." },
        { p: "¿Cómo saben que es el mismo producto?", r: "Se empareja por código de barras cuando la tienda lo publica; si no, por el nombre y la presentación (peso o volumen). Los combos no se emparejan con una de sus piezas." },
        { p: "¿En qué moneda aparecen los precios?", r: "En bolívares y en dólares. Los precios publicados en una sola moneda se convierten con la tasa oficial del BCV del día." },
        { p: "¿El precio en la tienda física es el mismo?", r: "Puede variar: son los precios publicados en la tienda en línea, y algunas cadenas tienen precios distintos por sede o ciudad. Verifica el precio final en la tienda antes de comprar." },
      ]}>
      {tiendas.length > 0 && <Comparador tiendas={tiendas.map((x) => ({ id: x.id, nombre: x.nombre, rubros: x.rubros, ciudad: x.ubicacion?.ciudad ?? null }))} />}
      <section className={s.texto}>
        <h2>Cadenas que comparamos</h2>
        <div className={s.chips}>{tiendas.map((t) => <span key={t.id}>{t.nombre}{t.ubicacion?.ciudad ? ` · ${t.ubicacion.ciudad}` : ""}</span>)}</div>
        <h2>Cómo usarlo</h2>
        <ul>
          <li>Escribe el producto como lo buscarías en la tienda: «harina pan», «aceite 1 litro», «acetaminofén 500 mg», «televisor 32».</li>
          <li>Los resultados aparecen a medida que responde cada cadena, ordenados por precio.</li>
          <li>Puedes elegir qué cadenas comparar y compartir la búsqueda con su enlace.</li>
        </ul>
      </section>
    </PaginaHerramienta>
  );
}
