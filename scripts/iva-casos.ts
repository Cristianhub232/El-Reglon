// Casos de referencia del clasificador de IVA, sin base de datos: node scripts/iva-casos.ts [catalogo.json] [casos.json] [fecha]
import { readFileSync } from "node:fs";
import { ejecutarCasos, type Caso } from "../src/modules/iva/casos.ts";
import { hoyCaracas } from "../src/core/validacion.ts";

const [rutaCatalogo = "datos/iva/catalogo.json", rutaCasos = "datos/iva/casos_prueba.json", fecha = hoyCaracas()] = process.argv.slice(2);
const { casos } = JSON.parse(readFileSync(rutaCasos, "utf8")) as { casos: Caso[] };
const fallos = ejecutarCasos(JSON.parse(readFileSync(rutaCatalogo, "utf8")), casos, fecha);
for (const f of fallos) console.log(`✘ ${f}`);
console.log(`${casos.length - fallos.length}/${casos.length} casos correctos`);
if (fallos.length) process.exitCode = 1;
