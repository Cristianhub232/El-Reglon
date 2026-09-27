// Motor de clasificación de IVA (puro: sin base de datos ni red). docs/03 §4.
// Recibe el catálogo y las señales ya obtenidas (nombre, código arancelario, categorías de Open Food Facts, ISBN/ISSN)
// y devuelve las opciones fiscales con su condición. El clasificador agrega alícuotas, textos legales y montos.
import { normalizar } from "./normalizar.ts";

export type Campo = "precio_usd" | "peso_g" | "uso" | "cliente";
export interface CondicionEval { campo: Campo; op: "<" | "<=" | ">" | ">=" | "=" | "!="; valor: number | string }
export interface OpcionCatalogo { categoria: string; base_legal: string[]; condicion: string | null; condicion_eval: CondicionEval | null }
export interface ReglaCatalogo {
  id: string; tipo: "BIEN" | "SERVICIO"; nombre: string; prioridad: number;
  patrones_incluir: string[]; patrones_excluir: string[]; patrones_todos: string[]; categorias_off: string[];
  zona_gris: boolean; nota: string | null; opciones: OpcionCatalogo[];
}
export interface CatalogoMotor { reglas: ReglaCatalogo[]; regla_arancel: { prefijo: string; regla_id: string }[] }

interface ReglaCompilada extends ReglaCatalogo { incluir: RegExp[]; excluir: RegExp[]; todos: RegExp[] }
export interface MotorCompilado { reglas: Map<string, ReglaCompilada>; arancel: Map<string, string>; off: Map<string, ReglaCompilada[]> }

export const CAMPOS: readonly Campo[] = ["precio_usd", "peso_g", "uso", "cliente"];
export const OPERADORES = ["<", "<=", ">", ">=", "=", "!="] as const;
export const PESOS = { codigo_arancelario: 0.95, isbn_issn: 0.95, categorias_off: 0.85, nombre: 0.75, nombre_producto: 0.7 } as const;
export type Origen = keyof typeof PESOS;

export function compilar(c: CatalogoMotor): MotorCompilado {
  const reglas = new Map<string, ReglaCompilada>();
  const off = new Map<string, ReglaCompilada[]>();
  for (const r of c.reglas) {
    const rc: ReglaCompilada = { ...r, incluir: r.patrones_incluir.map((p) => new RegExp(p)),
      excluir: r.patrones_excluir.map((p) => new RegExp(p)), todos: r.patrones_todos.map((p) => new RegExp(p)) };
    reglas.set(r.id, rc);
    for (const cat of r.categorias_off) off.set(cat, [...(off.get(cat) ?? []), rc]);
  }
  return { reglas, arancel: new Map(c.regla_arancel.map((x) => [x.prefijo, x.regla_id])), off };
}

// Reglas de mayor prioridad cuyos patrones coinciden con el texto. A igual prioridad gana la que coincide antes
// en el texto (en español el sustantivo principal va primero: "mantequilla con sal", "galletas de avena");
// si también empatan en posición, se devuelven juntas.
export function reglasPorTexto(m: MotorCompilado, texto: string, tipo?: "BIEN" | "SERVICIO"): string[] {
  const t = normalizar(texto);
  if (!t) return [];
  let mejor = { prioridad: 0, posicion: Infinity };
  let ids: string[] = [];
  for (const r of m.reglas.values()) {
    if (tipo && r.tipo !== tipo) continue;
    if (r.excluir.some((re) => re.test(t)) || !r.todos.every((re) => re.test(t))) continue;
    const posicion = Math.min(...r.incluir.map((re) => re.exec(t)?.index ?? Infinity));
    if (posicion === Infinity) continue;
    if (r.prioridad > mejor.prioridad || (r.prioridad === mejor.prioridad && posicion < mejor.posicion)) {
      mejor = { prioridad: r.prioridad, posicion }; ids = [r.id];
    } else if (r.prioridad === mejor.prioridad && posicion === mejor.posicion) ids.push(r.id);
  }
  return ids;
}

export function reglaPorArancel(m: MotorCompilado, codigo: string): { regla_id: string; prefijo: string } | null {
  for (let n = codigo.length; n >= 2; n--) {
    const id = m.arancel.get(codigo.slice(0, n));
    if (id) return { regla_id: id, prefijo: codigo.slice(0, n) };
  }
  return null;
}

export function reglasPorCategoriasOff(m: MotorCompilado, categorias: string[]): string[] {
  const cand = categorias.flatMap((c) => m.off.get(c) ?? []);
  const mejor = Math.max(0, ...cand.map((r) => r.prioridad));
  return [...new Set(cand.filter((r) => r.prioridad === mejor).map((r) => r.id))];
}

export type Contexto = Partial<Record<Campo, number | string | null>>;

export function cumple(c: CondicionEval, v: number | string): boolean {
  if (typeof c.valor === "number") {
    const n = Number(v);
    switch (c.op) {
      case "<": return n < c.valor;
      case "<=": return n <= c.valor;
      case ">": return n > c.valor;
      case ">=": return n >= c.valor;
      case "=": return n === c.valor;
      case "!=": return n !== c.valor;
    }
  }
  const s = String(v).toLowerCase();
  return c.op === "=" ? s === String(c.valor) : c.op === "!=" ? s !== String(c.valor) : false;
}

export interface Senal { origen: Origen; reglas: string[]; detalle?: string }

export interface OpcionResultado {
  categoria: string; base_legal: string[]; condicion: string | null;
  condicion_evaluada: { campo: Campo; valor: number | string; cumple: true } | null;
  reglas: string[]; peso: number; nota_operacion?: string;
}

export interface Suspension { codigo: string; base_legal: string; articulo_17: string; alicuota_general: string }

export interface EntradaMotor {
  senales: Senal[];
  operacion: "nacional" | "importacion";
  contexto: Contexto;
  suspension_importacion: Suspension | null;   // decreto vigente que suspende la exención del art. 17.1
}

export interface ResultadoMotor {
  estado: "determinado" | "condicionado" | "no_determinado";
  opciones: OpcionResultado[];
  reglas: { id: string; nombre: string; tipo: string; zona_gris: boolean; nota: string | null; origenes: Origen[] }[];
  confianza: number;
  metodo: Origen[];
  advertencias: string[];
  notas_operacion: string[];
}

export function clasificar(m: MotorCompilado, e: EntradaMotor): ResultadoMotor {
  const advertencias: string[] = [];
  const notas: string[] = [];
  // Reglas señaladas, con el mayor peso de las señales que las proponen
  const pesoRegla = new Map<string, number>();
  const origenes = new Map<string, Set<Origen>>();
  for (const s of e.senales) {
    for (const id of s.reglas) {
      if (!m.reglas.has(id)) continue;
      pesoRegla.set(id, Math.max(pesoRegla.get(id) ?? 0, PESOS[s.origen]));
      origenes.set(id, (origenes.get(id) ?? new Set()).add(s.origen));
    }
  }
  const ids = [...pesoRegla.keys()].sort((a, b) => pesoRegla.get(b)! - pesoRegla.get(a)! || m.reglas.get(b)!.prioridad - m.reglas.get(a)!.prioridad);
  if (ids.length === 0) {
    return { estado: "no_determinado", opciones: [], reglas: [], confianza: 0, metodo: [],
      advertencias: ["No se identificó el bien o servicio. Revise el nombre (sin marcas ni abreviaturas) o envíe el código arancelario."],
      notas_operacion: [] };
  }
  // Opciones de cada regla, con sus condiciones evaluadas y el efecto de la operación (importación)
  const porRegla = new Map<string, OpcionResultado[]>();
  for (const id of ids) {
    const r = m.reglas.get(id)!;
    // Si falta el dato, la opción queda con su condición en texto; si llega, se descartan las que no se cumplen
    const evaluadas = r.opciones.map((o) => {
      if (!o.condicion_eval) return { o, cumple: null as boolean | null };
      const v = e.contexto[o.condicion_eval.campo];
      return { o, cumple: v === null || v === undefined || v === "" ? null : cumple(o.condicion_eval, v) };
    });
    const vivas = evaluadas.some((x) => x.cumple !== false) ? evaluadas.filter((x) => x.cumple !== false) : evaluadas;
    porRegla.set(id, vivas.map(({ o, cumple: ok }) => {
      let op: OpcionResultado = { categoria: o.categoria, base_legal: [...o.base_legal], condicion: o.condicion,
        condicion_evaluada: ok && o.condicion_eval ? { campo: o.condicion_eval.campo, valor: e.contexto[o.condicion_eval.campo]!, cumple: true } : null,
        reglas: [id], peso: pesoRegla.get(id)! };
      // Importación: la exención del art. 18 (vía art. 17.1) está suspendida por decreto → alícuota general
      if (e.operacion === "importacion" && e.suspension_importacion && op.categoria === "EXENTO" && op.base_legal.some((b) => b.startsWith("LIVA-18-"))) {
        const s = e.suspension_importacion;
        op = { ...op, categoria: "ALICUOTA_GENERAL", base_legal: [s.articulo_17, s.base_legal, s.alicuota_general, ...op.base_legal],
          nota_operacion: `En la venta nacional este bien está exento (${op.base_legal.join(", ")}); en la importación la exención del art. 17.1 está suspendida (${s.codigo}). Puede existir una exoneración específica para el importador (p. ej. certificado COMEX).` };
      }
      return op;
    }));
  }

  // Varias reglas: si coinciden en alguna categoría, la más específica acota a las demás (p. ej. partida 16.01
  // "mortadela o embutidos" + nombre "mortadela" → exento). Si no coinciden en ninguna, se muestran todas (conflicto).
  let elegidas: OpcionResultado[] = [];
  let acuerdo = false;
  if (ids.length === 1) elegidas = porRegla.get(ids[0])!;
  else {
    const conjuntos = ids.map((id) => new Set(porRegla.get(id)!.map((o) => o.categoria)));
    const comun = [...conjuntos[0]].filter((c) => conjuntos.every((k) => k.has(c)));
    if (comun.length) {
      acuerdo = true;
      const exactas = ids.filter((_, i) => conjuntos[i].size === comun.length);
      const conEvaluacion = (id: string) => (m.reglas.get(id)!.opciones.some((o) => o.condicion_eval) ? 1 : 0);
      if (exactas.length) {
        const mejor = [...exactas].sort((a, b) => conEvaluacion(b) - conEvaluacion(a) || pesoRegla.get(b)! - pesoRegla.get(a)!)[0];
        elegidas = porRegla.get(mejor)!.map((o) => ({ ...o, reglas: ids }));
      } else {
        for (const id of ids) for (const o of porRegla.get(id)!) if (comun.includes(o.categoria) && !elegidas.some((x) => x.categoria === o.categoria)) elegidas.push(o);
      }
    } else {
      advertencias.push(`Las señales apuntan a reglas distintas (${ids.map((i) => m.reglas.get(i)!.nombre).join("; ")}): se muestran las opciones de todas.`);
      elegidas = ids.flatMap((id) => porRegla.get(id)!);
    }
  }

  // Opciones con la misma categoría dan el mismo resultado fiscal: se unen y la condición deja de importar
  // (p. ej. en la importación, "si es queso blanco" y "si es otro queso" terminan ambas en la alícuota general)
  const opciones: OpcionResultado[] = [];
  for (const op of elegidas) {
    const igual = opciones.find((x) => x.categoria === op.categoria);
    if (igual) {
      igual.base_legal = [...new Set([...igual.base_legal, ...op.base_legal])];
      igual.reglas = [...new Set([...igual.reglas, ...op.reglas])];
      if (igual.condicion !== op.condicion) { igual.condicion = null; igual.condicion_evaluada = null; }
    } else opciones.push({ ...op });
    if (op.nota_operacion && !notas.includes(op.nota_operacion)) notas.push(op.nota_operacion);
  }
  if (opciones.length > 1) {
    for (const id of new Set(opciones.flatMap((o) => o.reglas))) {
      const r = m.reglas.get(id)!;
      if (r.zona_gris) advertencias.push(`Zona gris (${r.nombre})${r.nota ? `: ${r.nota}` : ""}. El operario decide entre las opciones.`);
    }
  }

  const reglas = ids.map((id) => {
    const r = m.reglas.get(id)!;
    return { id, nombre: r.nombre, tipo: r.tipo, zona_gris: r.zona_gris, nota: r.nota, origenes: [...origenes.get(id)!] };
  });
  const estado = opciones.length === 1 ? "determinado" : "condicionado";
  const base = pesoRegla.get(ids[0])!;
  const factor = ids.length === 1 ? 1 : acuerdo ? 1.05 : 0.8;   // señales que coinciden refuerzan; en conflicto, restan
  const confianza = Math.min(0.99, Math.round(base * (estado === "determinado" ? 1 : 0.8) * factor * 100) / 100);
  const metodo = [...new Set(e.senales.filter((s) => s.reglas.length).map((s) => s.origen))];
  return { estado, opciones, reglas, confianza, metodo, advertencias, notas_operacion: notas };
}
