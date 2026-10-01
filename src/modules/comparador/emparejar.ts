// Emparejamiento de ofertas de varias tiendas en "grupos" (el mismo producto). Corre en el servidor (API) y en el
// navegador (los resultados llegan tienda por tienda). Reglas, de más fuerte a más débil:
//   1. Mismo código de barras válido → mismo producto. Códigos distintos → nunca se juntan.
//   2. Sin código: misma presentación, misma marca (dada por la tienda o deducida del nombre) y nombres que solo se
//      diferencian en una palabra de un lado ("Pasta Primor Vermicelli" ≈ "Pasta Primor Larga Vermicelli"; pero
//      "Dedal" ≠ "Vermicelli" y "Descremada" no puede faltar de un lado). Se aceptan abreviaturas ("arr" = "arroz")
//      y el género ("blanco" = "blanca").
//   3. Cada oferta debe ser compatible con todas las del grupo (sin cadenas) y un grupo no junta dos productos
//      distintos de la misma tienda y sede.
import { basico, clavePresentacion, ean as eanValido, palabras, presentaciones, textoPresentacion } from "./normalizar.ts";

export interface Oferta {
  tienda: string; tienda_nombre: string; sucursal: string | null; id_externo: string; nombre: string; marca: string | null; ean: string | null;
  url: string; imagen: string | null; disponible: boolean;
  precio: string; moneda: "VES" | "USD"; precio_bs: number; precio_usd: number;
  leido_en?: string | null;   // tiendas por índice: cuándo se leyó el precio en su página
  dudoso?: boolean;           // precio desproporcionado frente al resto del grupo (error probable de la tienda)
}
export interface Grupo { clave: string; nombre: string; presentacion: string; imagen: string | null; ofertas: Oferta[]; mejor: Oferta; relevancia: number }

// Palabras que describen el empaque, no el producto ("Premium" o "Tradicional" sí distinguen productos: no van aquí)
const RELLENO = new Set(["frasco", "paquete", "paq", "pote", "lata", "bolsa", "botella", "envase", "unidad", "und", "tipo", "presentacion"]);
// Atributos que, si un nombre los dice y el otro no, impiden emparejar: mejor no comparar que comparar mal
const DISTINTIVAS = ["descrem", "semidescrem", "complet", "deslactos", "integral", "light", "diet", "zero", "sin", "libre", "gluten",
  "organic", "dulc", "salad", "picant", "amarill", "blanc", "negr", "rojo", "roja", "verde", "infantil", "nino", "adulto"];
const distintiva = (w: string) => DISTINTIVAS.some((d) => w.startsWith(d));

interface Interna { o: Oferta; ean: string | null; marca: string | null; pres: string; palabras: string[]; origen: string }

const raiz = (w: string) => w.replace(/[aoe]$/, "");
// Misma palabra, mismo género, o abreviatura de la tienda (al menos 3 letras: "arr" → "arroz", "dulc" → "dulce")
function igual(a: string, b: string): boolean {
  if (a === b || raiz(a) === raiz(b)) return true;
  const [corta, larga] = a.length <= b.length ? [a, b] : [b, a];
  return corta.length >= 3 && larga.startsWith(corta) && !/^\d/.test(corta);
}
const contiene = (lista: string[], w: string) => lista.some((x) => igual(x, w));

const sinMarca = (ws: string[], marcas: (string | null)[]) => {
  const m = marcas.filter(Boolean).flatMap((x) => basico(x!).split(/\s+/));
  return ws.filter((w) => !m.some((x) => igual(x, w)) && !RELLENO.has(w));
};

function compatibles(x: Interna, y: Interna): boolean {
  if (x.ean && y.ean) return x.ean === y.ean;
  if (x.origen === y.origen) return false;                               // dos productos distintos de la misma tienda y sede
  if (!x.pres || x.pres !== y.pres) return false;
  // Marca: si las dos la traen, igual; si solo una, el nombre de la otra debe contenerla
  if (x.marca && y.marca && x.marca !== y.marca && !igual(x.marca, y.marca)) return false;
  const marca = x.marca ?? y.marca;
  if (marca) {
    const partes = marca.split(/\s+/);
    for (const z of [x, y]) if (!z.marca && !partes.every((p) => contiene(z.palabras, p))) return false;
  }
  const a = sinMarca(x.palabras, [x.marca, y.marca]), b = sinMarca(y.palabras, [x.marca, y.marca]);
  if (!a.length || !b.length) return false;
  const soloA = a.filter((w) => !contiene(b, w)), soloB = b.filter((w) => !contiene(a, w));
  // Como mucho una palabra de diferencia, de un solo lado, y que no sea un atributo distintivo
  const resto = [...soloA, ...soloB];
  return resto.length <= 1 && !resto.some(distintiva);
}

// Precio dudoso: menos del 40 % o más de 2,5 veces la mediana de las ofertas del mismo producto (con 3 o más);
// con solo 2, si una cuesta más de 4 veces la otra, se marcan las dos. Así un error de la tienda (p. ej. un precio
// viejo en su página) nunca sale como "el más barato".
function marcarDudosos(ofertas: Oferta[]): Oferta[] {
  const copia = ofertas.map((o) => ({ ...o, dudoso: false }));
  const precios = copia.map((o) => o.precio_bs).filter((p) => p > 0);
  if (copia.length >= 3) {
    // Mediana de todas las ofertas (incluida la propia): un solo precio absurdo no la arrastra
    const orden = [...precios].sort((a, b) => a - b);
    const mediana = orden.length % 2 ? orden[(orden.length - 1) / 2] : (orden[orden.length / 2 - 1] + orden[orden.length / 2]) / 2;
    for (const o of copia) o.dudoso = o.precio_bs < mediana * 0.4 || o.precio_bs > mediana * 2.5;
  } else if (copia.length === 2 && Math.max(...precios) > Math.min(...precios) * 4) {
    for (const o of copia) o.dudoso = true;
  }
  return copia;
}

// Pertinencia frente a lo buscado: palabras exactas, del mismo género, o prefijo si lo buscado tiene 4 letras o más
function pertinencia(q: string[], ws: string[]): number {
  if (!q.length) return 1;
  return q.filter((w) => ws.some((x) => x === w || raiz(x) === raiz(w) || (w.length >= 4 && x.startsWith(w)))).length / q.length;
}

export function agrupar(ofertas: Oferta[], consulta: string): Grupo[] {
  const q = palabras(consulta);
  const internas: Interna[] = ofertas.map((o) => ({
    o, ean: eanValido(o.ean), marca: o.marca ? basico(o.marca).replace(/[^a-z0-9 ]/g, "").trim() || null : null,
    pres: clavePresentacion(presentaciones(o.nombre)), palabras: palabras(o.nombre), origen: `${o.tienda}|${o.sucursal ?? ""}`,
  }));
  const grupos: Interna[][] = [];
  for (const x of internas) {
    const destino = grupos.find((g) => g.every((y) => compatibles(x, y)));
    if (destino) destino.push(x); else grupos.push([x]);
  }
  // Con muy pocas palabras buscadas, todas deben aparecer ("harina pan" no trae un tamizador de harina)
  const minimo = q.length <= 2 ? 1 : 0.66;
  return grupos.map((g) => {
    const ofertasG = marcarDudosos(g.map((x) => x.o));
    const ordenadas = ofertasG.sort((a, b) => Number(Boolean(a.dudoso)) - Number(Boolean(b.dudoso)) || Number(b.disponible) - Number(a.disponible) || a.precio_bs - b.precio_bs);
    const todas = [...new Set(g.flatMap((x) => [...x.palabras, ...(x.marca ? x.marca.split(/\s+/) : [])]))];
    const base = g.find((x) => x.ean) ?? g[0];
    return {
      clave: base.ean ? `ean:${base.ean}` : `${base.origen}:${base.o.id_externo}`,
      nombre: base.o.nombre, presentacion: textoPresentacion(presentaciones(base.o.nombre)),
      imagen: ordenadas.find((o) => o.imagen)?.imagen ?? null, ofertas: ordenadas, mejor: ordenadas[0], relevancia: pertinencia(q, todas),
    };
  })
    .filter((g) => g.relevancia >= minimo)
    // Primero lo más pertinente, luego lo que aparece en más tiendas (lo comparable) y por último el precio
    .sort((a, b) => b.relevancia - a.relevancia || new Set(b.ofertas.map((o) => o.tienda)).size - new Set(a.ofertas.map((o) => o.tienda)).size || a.mejor.precio_bs - b.mejor.precio_bs);
}
