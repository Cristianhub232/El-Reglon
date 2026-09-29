// Diccionario de nombres comerciales → prefijos del arancel (puro: sin base de datos).
// Un término coincide como palabra o frase completa y admite el plural simple (-s, -es). " ... " admite hasta
// 3 palabras intermedias ("leche ... en polvo" reconoce "leche completa en polvo").
// Un término de 'excluir' coincide al inicio de palabra ("enlatad" excluye "enlatadas").
import { normalizar } from "../iva/normalizar.ts";

export interface GrupoSinonimo {
  grupo: string; terminos: string[]; excluir: string[]; prefijos: string[]; categorias_off: string[]; prioridad: number; nota: string | null;
}
interface GrupoCompilado extends GrupoSinonimo { re: { termino: string; re: RegExp }[]; reExcluir: RegExp[] }
export interface Sinonimos { grupos: GrupoCompilado[]; off: Map<string, GrupoCompilado[]>; vocabulario: Map<string, string> }
export interface Vocablo { comercial: string; oficial: string }
export interface Coincidencia { grupo: GrupoSinonimo; termino: string; posicion: number }

const escapar = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export function compilarSinonimos(grupos: GrupoSinonimo[], vocabulario: Vocablo[] = []): Sinonimos {
  const compilados = grupos.map((g) => ({
    ...g,
    re: g.terminos.map((t) => ({ termino: t.replaceAll(" ... ", " "),
      re: new RegExp(`(?<![a-z0-9])${t.split(" ... ").map(escapar).join("(?: [a-z0-9]+){0,3} ")}(?:s|es)?(?![a-z0-9])`) })),
    reExcluir: g.excluir.map((e) => new RegExp(`(?<![a-z0-9])${escapar(e)}`)),
  }));
  const off = new Map<string, GrupoCompilado[]>();
  for (const g of compilados) for (const c of g.categorias_off) off.set(c, [...(off.get(c) ?? []), g]);
  return { grupos: compilados, off, vocabulario: new Map(vocabulario.map((v) => [v.comercial, v.oficial])) };
}

// Agrega al texto las palabras oficiales equivalentes a las comerciales ("arroz blanco" → "+ blanqueado")
export function expandirVocabulario(s: Sinonimos, texto: string): string {
  const extra: string[] = [];
  for (const [comercial, oficial] of s.vocabulario) {
    if (new RegExp(`(?<![a-z0-9])${escapar(comercial)}(?![a-z0-9])`).test(texto)) extra.push(oficial);
  }
  return [texto, ...extra].filter(Boolean).join(" ");
}

// Grupos de mayor prioridad que coinciden con el texto; a igual prioridad gana el que aparece antes
// (el sustantivo principal va primero: "harina pan" es harina, no pan); empates exactos se devuelven juntos.
export function buscarSinonimos(s: Sinonimos, texto: string): Coincidencia[] {
  const t = normalizar(texto);
  if (!t) return [];
  let mejores: Coincidencia[] = [];
  for (const g of s.grupos) {
    if (g.reExcluir.some((re) => re.test(t))) continue;
    let mejor: Coincidencia | null = null;
    for (const { termino, re } of g.re) {
      const m = re.exec(t);
      if (m && (!mejor || m.index < mejor.posicion || (m.index === mejor.posicion && termino.length > mejor.termino.length))) {
        mejor = { grupo: g, termino, posicion: m.index };
      }
    }
    if (!mejor) continue;
    const ref = mejores[0];
    if (!ref || g.prioridad > ref.grupo.prioridad || (g.prioridad === ref.grupo.prioridad && mejor.posicion < ref.posicion)) mejores = [mejor];
    else if (g.prioridad === ref.grupo.prioridad && mejor.posicion === ref.posicion) mejores.push(mejor);
  }
  return mejores;
}

export function gruposPorCategoriasOff(s: Sinonimos, categorias: string[]): GrupoSinonimo[] {
  return [...new Set(categorias.flatMap((c) => s.off.get(c) ?? []))];
}

// Consulta para la búsqueda por texto: sin números ni unidades ("1 kg", "900g", "128 GB"), que no describen el producto
const UNIDADES = new Set(["g", "gr", "grs", "gramos", "kg", "kgs", "kilo", "kilos", "ml", "l", "lt", "lts", "litro", "litros", "cc", "cm", "mm", "m",
  "und", "unid", "unidades", "x", "pack", "oz", "lb", "lbs", "gb", "tb", "mah", "w", "v", "pulgadas"]);
export function limpiarConsulta(texto: string): string {
  return normalizar(texto).split(" ").filter((p) => p && !/^\d+$/.test(p) && !/^\d+[a-z]{1,4}$/.test(p) && !UNIDADES.has(p)).join(" ");
}
