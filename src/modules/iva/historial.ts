// Contenido versionable de una regla (lo que se compara entre la carga del archivo y las ediciones del panel). Puro.
import type { ReglaCatalogo } from "./motor.ts";

export interface ContenidoRegla {
  prioridad: number; patrones_incluir: string[]; patrones_excluir: string[]; patrones_todos: string[]; nota: string | null;
  opciones: ReglaCatalogo["opciones"];
}

export function contenidoRegla(r: Pick<ReglaCatalogo, "prioridad" | "patrones_incluir" | "patrones_excluir" | "patrones_todos" | "nota" | "opciones">): ContenidoRegla {
  return {
    prioridad: Number(r.prioridad), patrones_incluir: [...r.patrones_incluir], patrones_excluir: [...r.patrones_excluir],
    patrones_todos: [...r.patrones_todos], nota: r.nota ?? null,
    // jsonb reordena las claves: se reconstruye condicion_eval con un orden fijo
    opciones: r.opciones.map((o) => ({ categoria: o.categoria, base_legal: [...o.base_legal], condicion: o.condicion ?? null,
      condicion_eval: o.condicion_eval ? { campo: o.condicion_eval.campo, op: o.condicion_eval.op, valor: o.condicion_eval.valor } : null })),
  };
}

export const mismoContenido = (a: ContenidoRegla | null | undefined, b: ContenidoRegla) => !!a && JSON.stringify(contenidoRegla(a)) === JSON.stringify(contenidoRegla(b));
