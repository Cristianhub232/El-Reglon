// Emparejamiento de ofertas de varias tiendas en "grupos" (el mismo producto). Corre en el servidor (API) y en el
// navegador (los resultados llegan tienda por tienda). Regla: mismo código de barras, o misma marca y presentación
// con nombres parecidos. Nunca se juntan dos ofertas con códigos de barras distintos.
import { clavePresentacion, ean as eanValido, palabras, presentaciones, textoPresentacion, basico } from "./normalizar.ts";

export interface Oferta {
  tienda: string; tienda_nombre: string; id_externo: string; nombre: string; marca: string | null; ean: string | null;
  url: string; imagen: string | null; disponible: boolean;
  precio: string; moneda: "VES" | "USD"; precio_bs: number; precio_usd: number;
}
export interface Grupo { clave: string; nombre: string; presentacion: string; imagen: string | null; ofertas: Oferta[]; mejor: Oferta; relevancia: number }

interface Interna { o: Oferta; ean: string | null; marca: string | null; pres: string; palabras: Set<string> }

const parecido = (a: Set<string>, b: Set<string>) => {
  let comunes = 0;
  for (const x of a) if (b.has(x)) comunes++;
  return comunes / Math.max(1, Math.min(a.size, b.size));
};

export function agrupar(ofertas: Oferta[], consulta: string): Grupo[] {
  const q = new Set(palabras(consulta));
  const internas: Interna[] = ofertas.map((o) => {
    const marca = o.marca ? basico(o.marca).replace(/[^a-z0-9]/g, "") || null : null;
    return { o, ean: eanValido(o.ean), marca, pres: clavePresentacion(presentaciones(o.nombre)),
      palabras: new Set([...palabras(o.nombre)].filter((w) => w !== marca)) };
  });
  const grupos: Interna[][] = [];
  for (const x of internas) {
    const destino = grupos.find((g) => g.some((y) =>
      (x.ean && y.ean && x.ean === y.ean)
      || (!(x.ean && y.ean) && x.pres !== "" && x.pres === y.pres && (!x.marca || !y.marca || x.marca === y.marca) && parecido(x.palabras, y.palabras) >= 0.75)));
    if (destino) destino.push(x); else grupos.push([x]);
  }
  return grupos.map((g) => {
    const ordenadas = g.map((x) => x.o).sort((a, b) => Number(b.disponible) - Number(a.disponible) || a.precio_bs - b.precio_bs);
    const todas = new Set(g.flatMap((x) => [...x.palabras, ...(x.marca ? [x.marca] : [])]));
    const relevancia = q.size ? [...q].filter((w) => todas.has(w) || [...todas].some((t) => t.startsWith(w))).length / q.size : 1;
    const base = g[0];
    return {
      clave: base.ean ? `ean:${base.ean}` : `${base.marca ?? ""}|${base.pres}|${base.o.tienda}:${base.o.id_externo}`,
      nombre: base.o.nombre, presentacion: textoPresentacion(presentaciones(base.o.nombre)),
      imagen: ordenadas.find((o) => o.imagen)?.imagen ?? null, ofertas: ordenadas, mejor: ordenadas[0], relevancia,
    };
  })
    .filter((g) => g.relevancia >= 0.5)
    // Primero lo más pertinente, luego lo que aparece en más tiendas (lo comparable) y por último el precio
    .sort((a, b) => b.relevancia - a.relevancia || new Set(b.ofertas.map((o) => o.tienda)).size - new Set(a.ofertas.map((o) => o.tienda)).size || a.mejor.precio_bs - b.mejor.precio_bs);
}
