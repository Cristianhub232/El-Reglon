// Pruebas de extremo a extremo contra un servidor en marcha. Crea API keys temporales y las borra al terminar.
//   BASE_URL=http://127.0.0.1:3000 node scripts/prueba-api.ts
import "./entorno.ts";
import { consulta, pool } from "../src/core/db.ts";
import { generarToken } from "../src/core/api-key.ts";

const BASE = process.env.BASE_URL ?? "http://127.0.0.1:3000";
let fallos = 0, total = 0;
const prefijos: string[] = [];

async function clave(nombre: string, permisos: string[], limite = 1000): Promise<string> {
  const { token, prefijo, hash } = generarToken();
  await consulta("INSERT INTO core.api_key (nombre, prefijo, hash_sha256, permisos, limite_por_minuto) VALUES ($1,$2,$3,$4,$5)",
    [`prueba: ${nombre}`, prefijo, hash, permisos, limite]);
  prefijos.push(prefijo);
  return token;
}

async function get(ruta: string, key?: string): Promise<{ estado: number; cuerpo: any; cabeceras: Headers }> {
  const r = await fetch(BASE + ruta, { headers: key ? { "X-API-Key": key } : {} });
  return { estado: r.status, cuerpo: await r.json().catch(() => null), cabeceras: r.headers };
}

function verificar(nombre: string, condicion: boolean, detalle?: unknown) {
  total++;
  if (condicion) console.log(`  ✔ ${nombre}`);
  else { fallos++; console.log(`  ✘ ${nombre}`, detalle === undefined ? "" : JSON.stringify(detalle).slice(0, 400)); }
}

function rifConTerminal(t: number): string {                         // RIF J válido cuyo dígito verificador es t
  const pesos = [3, 2, 7, 6, 5, 4, 3, 2];
  for (let n = 1; n < 1000; n++) {
    const d = String(n).padStart(8, "0");
    let s = 3 * 4; for (let i = 0; i < 8; i++) s += Number(d[i]) * pesos[i];
    let dv = 11 - (s % 11); if (dv >= 10) dv = 0;
    if (dv === t) return `J-${d}-${t}`;
  }
  throw new Error("sin RIF");
}

async function main() {
  const K = await clave("completa", ["bcv", "arancel", "calendario", "rif"]);
  const soloRif = await clave("solo rif", ["rif"]);
  const limitada = await clave("limitada", ["rif"], 3);

  console.log("Servicio y seguridad");
  let r = await get("/api/salud");
  verificar("salud sin API key → 200 con fecha BCV", r.estado === 200 && !!r.cuerpo?.datos?.bcv_ultima_fecha_valor, r.cuerpo);
  verificar("sin API key → 401", (await get("/api/v1/rif/validar?rif=J000029610")).estado === 401);
  verificar("API key falsa → 401", (await get("/api/v1/rif/validar?rif=J000029610", "rgl_00000000_" + "x".repeat(43))).estado === 401);
  verificar("sin permiso de módulo → 403", (await get("/api/v1/bcv/monedas", soloRif)).estado === 403);
  const estados = [];
  for (let i = 0; i < 4; i++) estados.push((await get("/api/v1/rif/validar?rif=J000029610", limitada)).estado);
  verificar("límite de 3/min → la 4ª da 429", estados.join() === "200,200,200,429", estados);
  r = await get("/api/openapi.json");
  verificar("OpenAPI publicado", r.estado === 200 && r.cuerpo?.openapi === "3.1.0");

  console.log("BCV");
  r = await get("/api/v1/bcv/tasas/actual?fecha=2026-09-26", K);
  verificar("sábado 26/09 → fecha valor 28/09, USD 857,0058", r.cuerpo?.fecha_valor === "2026-09-28" && Number(r.cuerpo?.tasas?.USD?.tasa_bs) === 857.0058, r.cuerpo);
  r = await get("/api/v1/bcv/tasa-aplicable?fecha=2025-12-24&moneda=EUR", K);
  verificar("24/12/2025 (feriado) EUR → 26/12, 342,93634242", r.cuerpo?.fecha_valor === "2025-12-26" && r.cuerpo?.tasa_bs === "342.93634242", r.cuerpo);
  r = await get("/api/v1/bcv/tasas?fecha=2025-04-01&moneda=USD", K);
  verificar("publicación 01/04/2025 USD 69,776 con compra", r.cuerpo?.tasas?.[0]?.tasa_bs === "69.77600000" && r.cuerpo?.tasas?.[0]?.compra_bs, r.cuerpo);
  r = await get("/api/v1/bcv/tasas?desde=2026-09-21&hasta=2026-09-28&moneda=USD", K);
  verificar("histórico de una semana (≥ 5 fechas)", r.cuerpo?.cantidad >= 5, r.cuerpo);
  r = await get("/api/v1/bcv/convertir?monto=100&de=USD&fecha=2026-09-28", K);
  verificar("100 USD → 85.700,58 Bs.", r.cuerpo?.resultado === "85700.58", r.cuerpo);
  r = await get("/api/v1/bcv/convertir?monto=976.90091142&de=VES&a=EUR&fecha=2026-09-28", K);
  verificar("976,90091142 Bs. → 1,00 EUR", r.cuerpo?.resultado === "1.00", r.cuerpo);
  r = await get("/api/v1/bcv/moneda-mayor-valor?fecha=2026-09-28", K);
  verificar("moneda de mayor valor = EUR", r.cuerpo?.moneda === "EUR", r.cuerpo);
  r = await get("/api/v1/bcv/tasas/actual?fecha=2026-02-30", K);
  verificar("fecha inexistente → 400", r.estado === 400 && r.cuerpo?.error?.codigo === "fecha_invalida", r.cuerpo);
  r = await get("/api/v1/bcv/tasa-aplicable?fecha=2030-01-01", K);
  verificar("fecha futura sin publicación → 404 (no se estima)", r.estado === 404, r.cuerpo);

  console.log("Arancel");
  r = await get("/api/v1/arancel/1006.30.11.10", K);
  verificar("1006.30.11.10: declarable, ruta con ARROZ, régimen y unidad", r.cuerpo?.nivel === "subpartida_declarable" && /ARROZ/.test(r.cuerpo?.ruta) && r.cuerpo?.unidad === "kg" && r.cuerpo?.regimenes?.length > 0, r.cuerpo);
  r = await get("/api/v1/arancel/1104.22.00.10", K);
  verificar("1104.22.00.10 (creada por el Decreto 5.198) con historial", r.cuerpo?.historial?.some((c: any) => c.instrumento === "Decreto N° 5.198"), r.cuerpo?.historial);
  r = await get("/api/v1/arancel/10", K);
  verificar("capítulo 10 = CEREALES, sección II", r.cuerpo?.titulo === "CEREALES" && r.cuerpo?.seccion === "II", r.cuerpo);
  r = await get("/api/v1/arancel/1006", K);
  verificar("partida 1006 con subpartidas", r.cuerpo?.nivel === "partida" && r.cuerpo?.subpartidas?.length > 5);
  r = await get("/api/v1/arancel/9999999999", K);
  verificar("código inexistente → 404", r.estado === 404);
  r = await get("/api/v1/arancel/10a", K);
  verificar("código mal formado → 400", r.estado === 400);
  r = await get("/api/v1/arancel/buscar?q=telefonos%20inteligentes", K);
  verificar("buscar 'telefonos inteligentes' (sin tilde) → 8517.13.00.00 primero", r.cuerpo?.resultados?.[0]?.codigo === "8517130000", r.cuerpo?.resultados?.slice(0, 3));
  for (const [c, n] of [["reglas", 15], ["abreviaturas", 66], ["conversiones", 20], ["regimenes", 21], ["unidades", 12]] as const) {
    r = await get(`/api/v1/arancel/catalogos/${c}`, K);
    verificar(`catálogo ${c} = ${n}`, r.cuerpo?.elementos?.length === n, r.cuerpo?.elementos?.length);
  }
  r = await get("/api/v1/arancel/secciones", K);
  verificar("22 secciones", r.cuerpo?.secciones?.length === 22);

  console.log("Calendario y RIF");
  r = await get("/api/v1/calendario/proximos?rif=J-07013380-5&tipo=ESPECIAL&desde=2026-09-27", K);
  verificar("especial terminal 5 → primer deber 08/10/2026", r.cuerpo?.deberes?.[0]?.fecha === "2026-10-08", r.cuerpo?.deberes?.[0]);
  r = await get("/api/v1/calendario/proximos?rif=V-12345678-1&tipo=ORDINARIO&desde=2026-07-01&limite=2", K);
  verificar("ordinario: 15/07 y 17/08 (15/08 es sábado)", r.cuerpo?.deberes?.map((d: any) => d.fecha).join() === "2026-07-15,2026-08-17", r.cuerpo?.deberes);
  r = await get(`/api/v1/calendario/proximos?rif=${rifConTerminal(1)}&tipo=ESPECIAL&desde=2026-01-16&limite=1`, K);
  verificar("19/01 lunes bancario → fecha límite 20/01 con aviso", r.cuerpo?.deberes?.[0]?.fecha_limite === "2026-01-20" && !!r.cuerpo?.deberes?.[0]?.aviso, r.cuerpo?.deberes?.[0]);
  r = await get("/api/v1/calendario/proximos?rif=J-07013380-5&tipo=ESPECIAL&condiciones=MINERIA_HIDROCARBUROS&desde=2026-09-27", K);
  verificar("minería: IVA mensual del art. 2 y sin tabla a)", r.cuerpo?.deberes?.some((d: any) => d.obligacion === "IVA_MENSUAL_MINERIA_HIDROCARBUROS")
    && !r.cuerpo?.deberes?.some((d: any) => d.obligacion.startsWith("IVA_ANT")), r.cuerpo?.deberes);
  r = await get("/api/v1/calendario/proximos?rif=J-07013380-6&tipo=ESPECIAL", K);
  verificar("RIF con dígito errado → 400 rif_invalido", r.estado === 400 && r.cuerpo?.error?.codigo === "rif_invalido", r.cuerpo);
  r = await get("/api/v1/calendario/proximos?rif=J-07013380-5&tipo=OTRO", K);
  verificar("tipo inválido → 400", r.estado === 400);
  r = await get("/api/v1/calendario/proximos?rif=J-07013380-5&tipo=ESPECIAL&condiciones=MINERIA", K);
  verificar("condición desconocida → 400", r.estado === 400, r.cuerpo);
  r = await get("/api/v1/calendario/dias-inhabiles?anio=2026", K);
  verificar("24 días inhábiles en 2026 (10 bancarios + 14 nacionales)", r.cuerpo?.dias?.length === 24, r.cuerpo?.dias?.length);
  r = await get("/api/v1/rif/validar?rif=G-20000303-0", K);
  verificar("RIF G-20000303-0 válido", r.cuerpo?.valido === true && r.cuerpo?.terminal === 0, r.cuerpo);
}

main()
  .catch((e) => { fallos++; console.error("Error en las pruebas:", e); })
  .finally(async () => {
    await consulta("DELETE FROM core.api_key WHERE prefijo = ANY ($1)", [prefijos]).catch(() => {});
    await pool().end();
    console.log(`\n${total - fallos}/${total} verificaciones correctas`);
    process.exitCode = fallos ? 1 : 0;
  });
