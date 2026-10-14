// Plantilla de las páginas de cada herramienta: migas, título y entrada, la herramienta, texto explicativo,
// preguntas frecuentes y enlaces a las demás herramientas. Incluye datos estructurados (BreadcrumbList y FAQPage).
import Link from "next/link";
import type { ReactNode } from "react";
import { SITIO_URL } from "../../core/sitio.ts";
import { Cabecera, PiePagina } from "./Cabecera.tsx";
import s from "./herramienta.module.css";

export const HERRAMIENTAS = [
  { ruta: "/comparador-de-precios", nombre: "Comparador de precios", texto: "¿Dónde está más barato? El mismo producto en las principales cadenas del país." },
  { ruta: "/clasificador-iva", nombre: "Clasificador de IVA", texto: "¿Lleva IVA? Exento, 8 %, 16 % o 31 %, con el artículo de la ley." },
  { ruta: "/deberes-tributarios", nombre: "Deberes tributarios", texto: "Próximos vencimientos con el SENIAT según tu RIF." },
  { ruta: "/tasa-bcv", nombre: "Tasa BCV de hoy", texto: "Tasa oficial del dólar y el euro, historial, conversor y USDT." },
  { ruta: "/noticias", nombre: "Noticias", texto: "Titulares de los principales medios venezolanos, cada hora." },
] as const;

export interface Pregunta { p: string; r: string }

export function PaginaHerramienta({ ruta, nombre, sobretitulo, titulo, entrada, preguntas, children }: {
  ruta: string; nombre: string; sobretitulo: string; titulo: string; entrada: ReactNode; preguntas: Pregunta[]; children: ReactNode;
}) {
  const ld = [
    { "@context": "https://schema.org", "@type": "BreadcrumbList", itemListElement: [
      { "@type": "ListItem", position: 1, name: "El Renglón", item: `${SITIO_URL}/` },
      { "@type": "ListItem", position: 2, name: nombre, item: `${SITIO_URL}${ruta}` }] },
    { "@context": "https://schema.org", "@type": "FAQPage", mainEntity: preguntas.map((x) => ({
      "@type": "Question", name: x.p, acceptedAnswer: { "@type": "Answer", text: x.r } })) },
  ];
  return (
    <div className={s.pagina}>
      <Cabecera />
      <main className={s.contenido}>
        <nav className={s.migas} aria-label="Migas de pan"><Link href="/">Inicio</Link><span>›</span><span>{nombre}</span></nav>
        <header className={s.cabeza}>
          <span className="sobretitulo">{sobretitulo}</span>
          <h1>{titulo}</h1>
          <p>{entrada}</p>
        </header>
        {children}
        <section className={s.preguntas} aria-labelledby="preguntas">
          <h2 id="preguntas">Preguntas frecuentes</h2>
          {preguntas.map((x) => <details key={x.p}><summary>{x.p}</summary><p>{x.r}</p></details>)}
        </section>
        <section className={s.otras} aria-labelledby="otras">
          <h2 id="otras">Otras herramientas gratis</h2>
          <div className={s.otrasRejilla}>
            {HERRAMIENTAS.filter((h) => h.ruta !== ruta).map((h) => <Link key={h.ruta} href={h.ruta}><strong>{h.nombre}</strong>{h.texto}</Link>)}
          </div>
        </section>
      </main>
      <PiePagina />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
    </div>
  );
}
