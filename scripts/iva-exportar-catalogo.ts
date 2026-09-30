// Exporta al archivo del catálogo (datos/iva/catalogo.json) las reglas tal como están en la base, para que las
// ediciones hechas en el panel queden en el repositorio. Solo cambia los campos editables de cada regla.
//   node scripts/iva-exportar-catalogo.ts [catalogo.json]
import "./entorno.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { consulta, pool } from "../src/core/db.ts";
import type { ReglaCatalogo } from "../src/modules/iva/motor.ts";

const ruta = process.argv[2] ?? "datos/iva/catalogo.json";

async function main() {
  const cat = JSON.parse(readFileSync(ruta, "utf8")) as { reglas: ReglaCatalogo[] };
  const db = await consulta<Pick<ReglaCatalogo, "id" | "prioridad" | "patrones_incluir" | "patrones_excluir" | "patrones_todos" | "nota">>(
    "SELECT id, prioridad, patrones_incluir, patrones_excluir, patrones_todos, nota FROM iva.regla");
  const porId = new Map(db.map((r) => [r.id, r]));
  const cambiadas: string[] = [];
  for (const r of cat.reglas) {
    const d = porId.get(r.id);
    if (!d) continue;
    const antes = JSON.stringify([r.prioridad, r.patrones_incluir, r.patrones_excluir, r.patrones_todos, r.nota ?? null]);
    Object.assign(r, { prioridad: Number(d.prioridad), patrones_incluir: d.patrones_incluir, patrones_excluir: d.patrones_excluir, patrones_todos: d.patrones_todos, nota: d.nota });
    if (JSON.stringify([r.prioridad, r.patrones_incluir, r.patrones_excluir, r.patrones_todos, r.nota ?? null]) !== antes) cambiadas.push(r.id);
  }
  if (cambiadas.length === 0) { console.log("El archivo ya recoge todas las reglas de la base: nada que exportar."); return; }
  writeFileSync(ruta, JSON.stringify(cat, null, 1) + "\n");
  console.log(`Exportadas ${cambiadas.length} reglas a ${ruta}: ${cambiadas.join(", ")}\nRevise el cambio con git diff, ejecute npm run iva:casos y súbalo al repositorio.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool().end());
