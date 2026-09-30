// Exporta al archivo del diccionario (datos/arancel/sinonimos.json) los grupos de sinónimos agregados en el panel,
// para que queden en el repositorio. Al recargar el diccionario, pasan a ser grupos del archivo.
//   node scripts/arancel-exportar-sinonimos.ts [sinonimos.json]
import "./entorno.ts";
import { readFileSync, writeFileSync } from "node:fs";
import { consulta, pool } from "../src/core/db.ts";
import type { GrupoSinonimo } from "../src/modules/arancel/sinonimos.ts";

const ruta = process.argv[2] ?? "datos/arancel/sinonimos.json";

async function main() {
  const dic = JSON.parse(readFileSync(ruta, "utf8")) as { grupos: GrupoSinonimo[] };
  const panel = await consulta<GrupoSinonimo & Record<string, unknown>>(
    "SELECT grupo, terminos, excluir, prefijos, categorias_off, prioridad, nota FROM arancel.sinonimo WHERE origen = 'panel' ORDER BY id");
  const nuevos = panel.filter((g) => !dic.grupos.some((x) => x.grupo === g.grupo));
  if (nuevos.length === 0) { console.log("No hay grupos del panel pendientes de exportar."); return; }
  dic.grupos.push(...nuevos.map((g) => ({ grupo: g.grupo, terminos: g.terminos, excluir: g.excluir, prefijos: g.prefijos,
    categorias_off: g.categorias_off, prioridad: Number(g.prioridad), nota: g.nota })));
  writeFileSync(ruta, JSON.stringify(dic, null, 1) + "\n");
  console.log(`Exportados ${nuevos.length} grupos a ${ruta}: ${nuevos.map((g) => g.grupo).join(", ")}\nRecargue con npm run arancel:sinonimos y súbalo al repositorio.`);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => pool().end());
