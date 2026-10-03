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

async function post(ruta: string, cuerpo: unknown, key?: string): Promise<{ estado: number; cuerpo: any; cabeceras: Headers }> {
  const r = await fetch(BASE + ruta, { method: "POST", body: JSON.stringify(cuerpo),
    headers: { "content-type": "application/json", ...(key ? { "X-API-Key": key } : {}) } });
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
  const K = await clave("completa", ["bcv", "arancel", "calendario", "rif", "iva"]);   // sin "noticias": se prueba el 403
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

  console.log("Detección arancelaria");
  const detectar = (c: Record<string, unknown>) => post("/api/v1/arancel/detectar", c, K);
  r = await get("/api/v1/arancel/detectar?q=" + encodeURIComponent("Teléfono celular Samsung 128 GB"), K);
  verificar("'teléfono celular' → determinado 8517.13.00.00 (diccionario)", r.cuerpo?.estado === "determinado"
    && r.cuerpo?.candidatos?.[0]?.codigo === "8517130000" && !!r.cuerpo?.responsabilidad, r.cuerpo);
  r = await detectar({ descripcion: "Pollo entero congelado" });
  verificar("'pollo entero congelado' → 0207.12 (sin trocear, congelados)", r.cuerpo?.estado === "determinado" && r.cuerpo?.candidatos?.[0]?.codigo === "0207120000", r.cuerpo);
  r = await detectar({ descripcion: "Arroz blanco", limite: 8 });
  verificar("'arroz blanco' → condicionado dentro de 1006.30, con pregunta para afinar", r.cuerpo?.estado === "condicionado"
    && r.cuerpo?.candidatos?.every((c: any) => c.codigo.startsWith("100630")) && r.cuerpo?.preguntas_para_afinar?.length > 0, r.cuerpo);
  r = await detectar({ descripcion: "Paraguas plegable" });
  verificar("fuera del diccionario → respaldo por texto (6601) con advertencia", r.cuerpo?.candidatos?.[0]?.codigo?.startsWith("6601") && r.cuerpo?.advertencias?.length > 0, r.cuerpo);
  r = await get("/api/v1/arancel/detectar?q=xyzzy%20qwerty", K);
  verificar("sin coincidencias → 200 no_determinado", r.estado === 200 && r.cuerpo?.estado === "no_determinado", r.cuerpo);
  r = await detectar({ limite: 3 });
  verificar("sin descripción ni código → 400", r.estado === 400 && r.cuerpo?.error?.codigo === "entrada_insuficiente", r.cuerpo);
  r = await get("/api/v1/arancel/detectar?q=arroz&limite=50", K);
  verificar("límite fuera de rango → 400", r.estado === 400, r.cuerpo);
  r = await post("/api/v1/arancel/detectar", { descripcion: "arroz" }, soloRif);
  verificar("sin permiso arancel → 403", r.estado === 403);

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

  console.log("Noticias");
  const N = await clave("noticias", ["noticias"]);
  verificar("sin permiso 'noticias' → 403", (await get("/api/v1/noticias", K)).estado === 403);
  r = await get("/api/v1/noticias/fuentes", N);
  verificar("10 fuentes del noticiero", r.estado === 200 && r.cuerpo?.fuentes?.length === 10 && r.cuerpo.fuentes.some((f: any) => f.id === "elpitazo"), r.cuerpo);
  r = await get("/api/v1/noticias?limite=5", N);
  const lista: any[] = r.cuerpo?.noticias ?? [];
  verificar("titulares: estructura, orden y como mucho 5", r.estado === 200 && typeof r.cuerpo?.total === "number" && lista.length <= 5
    && lista.every((n, i) => i === 0 || n.publicado_en <= lista[i - 1].publicado_en), r.cuerpo);
  verificar("titulares en texto plano con enlace http(s)", lista.every((n) => /^https?:\/\//.test(n.url) && !/[<>]/.test(n.titulo) && !/[<>]/.test(n.resumen ?? "")), lista[0]);
  verificar("limite=0 → 400", (await get("/api/v1/noticias?limite=0", N)).estado === 400);
  verificar("fuente con caracteres inválidos → 400", (await get("/api/v1/noticias?fuente=%27%3B--", N)).estado === 400);

  r = await post("/api/publico/iva/clasificar", { codigo: "7591002200046", operacion: "nacional" });
  verificar("clasificador público: trae imagen_referencia (foto o null)", r.estado === 200 && "imagen_referencia" in (r.cuerpo ?? {})
    && (r.cuerpo.imagen_referencia === null || /^https:\/\//.test(r.cuerpo.imagen_referencia.url)), r.cuerpo?.imagen_referencia);

  console.log("Mis deberes tributarios (público)");
  r = await get("/api/publico/calendario/deberes?rif=J309876546&tipo=especial&condiciones=ENTE_PUBLICO");
  verificar("RIF sin guiones y en minúsculas → deberes con base legal, incluido el aporte del 70 %", r.estado === 200 && r.cuerpo?.rif === "J-30987654-6"
    && r.cuerpo.deberes.length > 0 && r.cuerpo.deberes.every((d: any) => d.base && d.fecha_limite >= d.fecha) && r.cuerpo.deberes.some((d: any) => d.obligacion === "APORTE_70"), r.cuerpo);
  r = await get("/api/publico/calendario/deberes?rif=V-12345678-9&tipo=ORDINARIO");
  verificar("dígito verificador incorrecto → 400 con el dígito esperado", r.estado === 400 && /se esperaba/.test(r.cuerpo?.error?.mensaje ?? ""), r.cuerpo);
  r = await get("/api/publico/calendario/condiciones");
  verificar("condiciones declarables", r.estado === 200 && r.cuerpo?.condiciones?.some((c: any) => c.codigo === "ENTE_PUBLICO"), r.cuerpo);

  console.log("Analítica del sitio");
  const navegador = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36";
  let v = await fetch(`${BASE}/api/publico/visita`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": navegador }, body: JSON.stringify({ ruta: "/prueba-e2e" }) });
  verificar("visita → 204 con cookie de visitante (1 año, HttpOnly)", v.status === 204 && /renglon_visitante=[0-9a-f-]{36}.*HttpOnly/i.test(v.headers.get("set-cookie") ?? ""), v.headers.get("set-cookie"));
  v = await fetch(`${BASE}/api/publico/visita`, { method: "POST", headers: { "Content-Type": "application/json", "User-Agent": "Googlebot/2.1" }, body: JSON.stringify({ ruta: "/" }) });
  verificar("robot → 204 sin cookie (no se registra)", v.status === 204 && !v.headers.get("set-cookie"));
  await consulta("DELETE FROM analitica.visita WHERE ruta = '/prueba-e2e'");

  console.log("Avisos push");
  r = await get("/api/publico/avisos/clave");
  verificar("clave pública VAPID (o 404 sin claves configuradas)", (r.estado === 200 && /^[A-Za-z0-9_-]{80,}$/.test(r.cuerpo?.clave ?? "")) || r.estado === 404, r.cuerpo);
  if (r.estado === 200) {
    // Claves con formato válido pero que no son un punto de la curva: el cifrado falla antes de llamar a FCM
    const keys = { p256dh: "B" + "A".repeat(86), auth: "A".repeat(22) };
    const endpointPrueba = `https://fcm.googleapis.com/fcm/send/prueba-e2e-${Date.now()}`;
    r = await post("/api/publico/avisos/suscripcion", { suscripcion: { endpoint: "https://ejemplo.com/push", keys }, temas: ["tasa"] });
    verificar("suscripción a un servicio que no es de push → 400", r.estado === 400 && r.cuerpo?.error?.codigo === "suscripcion_invalida", r.cuerpo);
    r = await post("/api/publico/avisos/suscripcion", { suscripcion: { endpoint: endpointPrueba, keys }, temas: ["deberes"], rifs: [{ rif: "J-12345678-0", tipo: "ESPECIAL" }] });
    verificar("RIF con dígito verificador incorrecto → 400", r.estado === 400 && r.cuerpo?.error?.codigo === "rif_invalido", r.cuerpo);
    const rifAviso = rifConTerminal(4);
    r = await post("/api/publico/avisos/suscripcion", { suscripcion: { endpoint: endpointPrueba, keys }, temas: ["tasa", "deberes", "otro"], rifs: [{ rif: rifAviso.replace(/-/g, ""), tipo: "ORDINARIO" }] });
    verificar("suscripción: temas válidos y RIF normalizado", r.estado === 200 && r.cuerpo?.temas?.join() === "tasa,deberes" && r.cuerpo?.rifs?.[0]?.rif === rifAviso && r.cuerpo?.nueva === true, r.cuerpo);
    r = await post("/api/publico/avisos/estado", { endpoint: endpointPrueba });
    verificar("estado del dispositivo: sus temas y su RIF", r.estado === 200 && r.cuerpo?.temas?.includes("deberes") && r.cuerpo?.rifs?.[0]?.tipo === "ORDINARIO", r.cuerpo);
    r = await post("/api/publico/avisos/baja", { endpoint: endpointPrueba });
    const despues = await post("/api/publico/avisos/estado", { endpoint: endpointPrueba });
    verificar("baja: la suscripción y sus RIF se borran", r.cuerpo?.borrada === true && despues.cuerpo?.temas?.length === 0, [r.cuerpo, despues.cuerpo]);
  }

  console.log("Comparador de precios");
  verificar("sin permiso 'comparador' → 403", (await get("/api/v1/comparador/tiendas", K)).estado === 403);
  const CP = await clave("comparador", ["comparador"]);
  r = await get("/api/v1/comparador/tiendas", CP);
  verificar("tiendas del comparador, Central Madeirense con sus sedes", r.estado === 200 && r.cuerpo?.tiendas?.some((t: any) => t.id === "locatel") && r.cuerpo.tiendas.find((t: any) => t.id === "centralmadeirense")?.sucursales?.length >= 10, r.cuerpo);
  verificar("consulta de una letra → 400", (await get("/api/v1/comparador/buscar?q=a", CP)).estado === 400);
  verificar("limite=0 → 400", (await get("/api/v1/comparador/buscar?q=harina&limite=0", CP)).estado === 400);
  r = await get("/api/v1/comparador/buscar?q=harina%20pan&limite=5", CP);
  verificar("comparación: cada tienda responde ok o error, productos con mejor precio en Bs. y US$", r.estado === 200
    && r.cuerpo.tiendas.every((t: any) => t.estado === "ok" || t.estado === "error") && r.cuerpo.productos.length <= 5
    && r.cuerpo.productos.every((p: any) => /^\d+\.\d{2}$/.test(p.mejor_precio.precio_bs) && /^\d+\.\d{2}$/.test(p.mejor_precio.precio_usd)), r.cuerpo);
  const flujo = await fetch(`${BASE}/api/publico/comparador/buscar?q=harina%20pan`);
  const lineas = (await flujo.text()).trim().split("\n").map((l) => JSON.parse(l));
  verificar("portada: flujo NDJSON inicio → tiendas → fin", flujo.headers.get("content-type")?.includes("ndjson") === true
    && lineas[0]?.tipo === "inicio" && lineas.at(-1)?.tipo === "fin" && lineas.filter((l) => l.tipo === "tienda" || l.tipo === "error").length === lineas[0].tiendas.length, lineas.map((l) => l.tipo));

  console.log("Prospección por correo");
  {
    const { armarCorreo, SECTORES } = await import("../src/modules/prospeccion/plantillas.ts");
    const { validar } = await import("../src/modules/prospeccion/prospectos.ts");
    const tasa = { usd: "190.5", eur: "221.25", fecha_valor: "2026-10-01" };
    const correos = Object.keys(SECTORES).flatMap((sec) => (["inicial", "seguimiento"] as const).map((tipo) =>
      armarCorreo({ empresa: "Bodega <b>La Esquina</b>", contacto: null, sector: sec as keyof typeof SECTORES, token: "a".repeat(32) }, tipo, tasa)));
    verificar("plantillas: 6 sectores × 2 correos, con baja visible, sin datos sin escapar", correos.length === 12 && correos.every((c) =>
      c.asunto.length <= 100 && c.html.includes(`/baja?t=${"a".repeat(32)}`) && c.texto.includes("/baja?t=") && !c.html.includes("<b>La Esquina")
      && !/undefined|NaN/.test(c.html + c.texto) && c.html.includes("Bs. 190,50")), correos.map((c) => c.asunto));
    verificar("validación de prospectos: correo, sector y origen", validar({ empresa: "Farmacia X", correo: "a@b.co", sector: "Farmacias", origen: "web" }).ok
      && !validar({ empresa: "X S.A.", correo: "no-es-correo", sector: "", origen: "web" }).ok
      && !validar({ empresa: "X S.A.", correo: "a@b.co", sector: "panadería", origen: "web" }).ok
      && !validar({ empresa: "X S.A.", correo: "a@b.co", sector: "", origen: "" }).ok);
    let r1 = await fetch(BASE + "/baja?t=prueba");
    verificar("página /baja de un correo de prueba: no da de baja nada", r1.status === 200 && (await r1.text()).includes("correo de prueba"));
    r = await post(`/api/publico/prospeccion/baja?t=${"0".repeat(32)}`, {});
    verificar("baja en un clic con un enlace que no existe → 404", r.estado === 404 && r.cuerpo?.error?.codigo === "enlace_invalido", r.cuerpo);
    const correoPrueba = `prueba-e2e-${Date.now()}@ejemplo.com`;
    const [p] = await consulta<{ id: number; token: string }>(
      "INSERT INTO prospeccion.prospecto (empresa, correo, sector, origen) VALUES ('Prueba E2E', $1, 'general', 'prueba automática') RETURNING id::int, token", [correoPrueba]);
    r1 = await fetch(BASE + `/baja?t=${p.token}`);
    const [antes] = await consulta<{ estado: string }>("SELECT estado FROM prospeccion.prospecto WHERE id = $1", [p.id]);
    verificar("abrir el enlace de baja no da de baja (solo el botón)", r1.status === 200 && antes.estado === "pendiente");
    r1 = await fetch(BASE + `/api/publico/prospeccion/baja?t=${p.token}`, { method: "POST", body: "List-Unsubscribe=One-Click", headers: { "content-type": "application/x-www-form-urlencoded" } });
    const [despues] = await consulta<{ estado: string; en_baja: boolean }>(
      "SELECT estado, EXISTS (SELECT 1 FROM prospeccion.baja WHERE correo = $2) AS en_baja FROM prospeccion.prospecto WHERE id = $1", [p.id, correoPrueba]);
    verificar("baja en un clic (RFC 8058): el prospecto queda en baja y en la lista de supresión", r1.status === 200 && despues.estado === "baja" && despues.en_baja, despues);
    await consulta("DELETE FROM prospeccion.prospecto WHERE id = $1", [p.id]);
    await consulta("DELETE FROM prospeccion.baja WHERE correo = $1", [correoPrueba]);
    r1 = await fetch(BASE + "/admin/prospeccion", { redirect: "manual" });
    verificar("panel de prospección sin sesión → redirige a /ingresar", r1.status === 307 && (r1.headers.get("location") ?? "").includes("/ingresar"));
    const limite = await consulta("UPDATE prospeccion.ajuste SET limite_diario = 31").then(() => "aceptado", () => "rechazado");
    verificar("la base rechaza más de 30 correos por día", limite === "rechazado");
  }

  console.log("IVA");
  const sinPrecios = { precio_compra: null, precio_venta: null, moneda: null };
  const clasificar = (c: Record<string, unknown>) => post("/api/v1/iva/clasificar", { operacion: "nacional", ...sinPrecios, ...c }, K);
  const cats = (x: any) => (x?.opciones ?? []).map((o: any) => o.categoria).sort().join();
  r = await clasificar({ nombre: "Arroz blanco tipo I 1 kg" });
  verificar("arroz nacional → determinado EXENTO (18.1.c), marca (E)", r.cuerpo?.estado === "determinado" && cats(r.cuerpo) === "EXENTO"
    && r.cuerpo?.opciones?.[0]?.base_legal?.[0]?.id === "LIVA-18-1-c" && r.cuerpo?.opciones?.[0]?.marca_exento === true, r.cuerpo);
  r = await clasificar({ nombre: "Arroz blanco tipo I 1 kg", operacion: "importacion" });
  verificar("arroz importación → 16 % por el Decreto 5.196", cats(r.cuerpo) === "ALICUOTA_GENERAL"
    && r.cuerpo?.opciones?.[0]?.base_legal?.some((b: any) => b.id === "DEC-5196-1") && r.cuerpo?.notas_operacion?.length === 1, r.cuerpo);
  r = await clasificar({ nombre: "Atún en aceite 140 g", precio_compra: 1.1, precio_venta: 1.6, moneda: "USD", fecha: "2026-09-28" });
  const g = r.cuerpo?.opciones?.find((o: any) => o.categoria === "ALICUOTA_GENERAL");
  verificar("atún en aceite → condicionado GENERAL/EXENTO (zona gris)", r.cuerpo?.estado === "condicionado" && cats(r.cuerpo) === "ALICUOTA_GENERAL,EXENTO", r.cuerpo);
  verificar("montos: 1,60 USD × 857,0058 = 1.371,21 Bs.; IVA 219,39; total 1.590,60", g?.montos?.bs?.base_imponible_venta === "1371.21"
    && g?.montos?.bs?.iva_venta === "219.39" && g?.montos?.bs?.total_venta === "1590.60" && g?.montos?.usd?.iva_compra === "0.18", g?.montos);
  r = await clasificar({ nombre: "Reloj de pulsera", precio_venta: 400000, moneda: "VES", fecha: "2026-09-28" });
  verificar("reloj de 400.000 Bs. (≈ US$ 466,74) → 31 % suntuario (61.1.f)", r.cuerpo?.estado === "determinado"
    && r.cuerpo?.opciones?.[0]?.alicuota_total === "31.00" && r.cuerpo?.opciones?.[0]?.condicion_evaluada?.cumple === true, r.cuerpo);
  r = await clasificar({ nombre: "Reloj de pulsera" });
  verificar("reloj sin precio → dos opciones con el umbral de US$ 300", cats(r.cuerpo) === "ALICUOTA_GENERAL,ALICUOTA_GENERAL_MAS_ADICIONAL", r.cuerpo);
  r = await clasificar({ codigo: "978-84-376-0494-7" });
  verificar("ISBN → libro EXENTO (18.6)", r.cuerpo?.estado === "determinado" && r.cuerpo?.opciones?.[0]?.base_legal?.[0]?.id === "LIVA-18-6", r.cuerpo);
  r = await clasificar({ nombre: "Mortadela", codigo_arancelario: "1601.00.00.10" });
  verificar("partida 16.01 + 'mortadela' → la señal específica acota: EXENTO", r.cuerpo?.estado === "determinado" && cats(r.cuerpo) === "EXENTO", r.cuerpo);
  r = await clasificar({ codigo_arancelario: "8471.30.12.90" });
  verificar("arancel sin regla → regla residual del art. 63 con advertencia", cats(r.cuerpo) === "ALICUOTA_GENERAL" && r.cuerpo?.arancel?.existe === true, r.cuerpo);
  r = await clasificar({ nombre: "Servicio eléctrico", atributos: { uso: "residencial" } });
  verificar("electricidad residencial → EXENTO (19.9)", r.cuerpo?.estado === "determinado" && cats(r.cuerpo) === "EXENTO", r.cuerpo);
  r = await clasificar({ nombre: "zzqx producto desconocido" });
  verificar("sin coincidencias → 200 no_determinado (nunca se niega)", r.estado === 200 && r.cuerpo?.estado === "no_determinado", r.cuerpo);
  await new Promise((ok) => setTimeout(ok, 300));
  const [ne] = await consulta<{ canal: string; api_key_id: number | null; operacion: string; texto_normalizado: string }>(
    "SELECT canal, api_key_id, operacion, texto_normalizado FROM iva.articulo_no_encontrado WHERE texto = 'zzqx producto desconocido' ORDER BY id DESC LIMIT 1");
  verificar("artículo no encontrado registrado con su origen (canal api y API key)", ne?.canal === "api" && ne.api_key_id !== null && ne.texto_normalizado === "zzqx producto desconocido", ne);
  r = await post("/api/v1/iva/clasificar", { nombre: "arroz", ...sinPrecios }, K);
  verificar("sin operacion → 400 operacion_requerida", r.estado === 400 && r.cuerpo?.error?.codigo === "operacion_requerida", r.cuerpo);
  r = await post("/api/v1/iva/clasificar", { nombre: "arroz", operacion: "nacional" }, K);
  verificar("sin las claves de precio → 400 precios_requeridos", r.estado === 400 && r.cuerpo?.error?.codigo === "precios_requeridos", r.cuerpo);
  r = await clasificar({ nombre: "arroz", precio_venta: 5 });
  verificar("precio sin moneda → 400 moneda_requerida", r.estado === 400 && r.cuerpo?.error?.codigo === "moneda_requerida", r.cuerpo);
  r = await clasificar({ nombre: "arroz", operacion: "exportacion" });
  verificar("exportación → 400 (fuera del alcance)", r.estado === 400, r.cuerpo);
  r = await post("/api/v1/iva/clasificar", { nombre: "arroz", operacion: "nacional", ...sinPrecios }, soloRif);
  verificar("sin permiso iva → 403", r.estado === 403);
  r = await get("/api/v1/iva/alicuotas?fecha=2026-09-28", K);
  verificar("alícuotas 16/8/15 y combinación 31 %", r.cuerpo?.alicuotas?.map((a: any) => a.porcentaje).join() === "16.00,8.00,15.00"
    && r.cuerpo?.categorias?.find((c: any) => c.codigo === "ALICUOTA_GENERAL_MAS_ADICIONAL")?.alicuota_total === "31.00", r.cuerpo);
  r = await get("/api/v1/iva/base-legal", K);
  verificar("base legal: todo verificado contra la Gaceta salvo el Decreto 5.207", r.cuerpo?.cantidad - r.cuerpo?.verificados === 1
    && r.cuerpo?.base_legal?.find((b: any) => b.id === "DEC-5207")?.verificado === false, { cantidad: r.cuerpo?.cantidad, verificados: r.cuerpo?.verificados });
  r = await get("/api/v1/iva/reglas?q=queso%20blanco", K);
  verificar("reglas?q=queso blanco → QUESO_BLANCO", r.cuerpo?.clasificacion_por_texto?.[0] === "QUESO_BLANCO", r.cuerpo);
  r = await get("/api/v1/iva/codigo/7591002100101", K);
  verificar("EAN con dígito verificador errado → detectado y no consultable", r.cuerpo?.tipo === "EAN-13" && r.cuerpo?.digito_verificador === false, r.cuerpo);
}

// Sitio público, PWA, protección del panel y lógica de sesiones (contraseña, TOTP, bloqueo y cierre)
async function sitioYSesiones() {
  console.log("Sitio, PWA y sesiones");
  const pagina = async (ruta: string) => { const r = await fetch(BASE + ruta, { redirect: "manual" }); return { estado: r.status, texto: await r.text(), r }; };
  let p = await pagina("/");
  verificar("portada 200 con el titular y datos del BCV", p.estado === 200 && p.texto.includes("Cómo tributa cada renglón") && p.texto.includes("Tasa oficial BCV"));
  p = await pagina("/manifest.webmanifest");
  const m = JSON.parse(p.texto || "{}");
  verificar("manifiesto PWA: standalone, íconos 192/512 y maskable", m.display === "standalone" && m.icons?.some((i: any) => i.purpose === "maskable") && m.icons?.some((i: any) => i.sizes === "512x512"), m);
  p = await pagina("/sw.js");
  verificar("service worker sin caché y sin tocar /api ni /admin", p.estado === 200 && /no-cache/.test(p.r.headers.get("cache-control") ?? "") && p.texto.includes("/^\\/admin"), p.r.headers.get("cache-control"));
  p = await pagina("/sin-conexion");
  verificar("página sin conexión", p.estado === 200);
  // Indexación: robots.txt, sitemap.xml, canonical en las páginas públicas y noindex en las privadas
  p = await pagina("/robots.txt");
  verificar("robots.txt: permite el sitio, bloquea /admin y /api/ y anuncia el sitemap", p.estado === 200 && /Allow: \/\n/.test(p.texto) && p.texto.includes("Disallow: /admin") && p.texto.includes("Disallow: /api/") && /Sitemap: https:\/\/.+\/sitemap\.xml/.test(p.texto), p.texto);
  p = await pagina("/sitemap.xml");
  verificar("sitemap.xml con la portada y sin el panel", p.estado === 200 && /<loc>https:\/\/[^<]+\/<\/loc>/.test(p.texto) && !p.texto.includes("/admin"), p.texto.slice(0, 300));
  p = await pagina("/");
  verificar("portada: canonical y sin noindex", /<link rel="canonical" href="https:\/\/[^"]+\/?"/.test(p.texto) && !/noindex/.test(p.texto));
  p = await pagina("/ingresar");
  verificar("inicio de sesión con noindex", /<meta name="robots" content="noindex/.test(p.texto));
  p = await pagina("/admin/usuarios");
  verificar("panel sin sesión → redirige a /ingresar con 'siguiente'", p.estado === 307 && (p.r.headers.get("location") ?? "").includes("/ingresar?siguiente=%2Fadmin%2Fusuarios"), p.r.headers.get("location"));
  p = await pagina("/admin/auditoria/csv");
  verificar("CSV de auditoría sin sesión → no disponible", p.estado === 307 || p.estado === 403, p.estado);
  const r = await post("/api/publico/iva/clasificar", { nombre: "Arroz Mary 1kg", operacion: "nacional" });
  verificar("clasificador público sin API key → arroz EXENTO", r.estado === 200 && r.cuerpo?.opciones?.[0]?.categoria === "EXENTO", r.cuerpo);
  const marca = `zzqx articulo web ${Date.now()}`;
  await post("/api/publico/iva/clasificar", { nombre: marca, operacion: "importacion" });
  await new Promise((ok) => setTimeout(ok, 300));
  const [web] = await consulta<{ canal: string; api_key_id: number | null; operacion: string }>(
    "SELECT canal, api_key_id, operacion FROM iva.articulo_no_encontrado WHERE texto = $1", [marca]);
  verificar("no encontrado desde la herramienta pública → canal web, sin API key", web?.canal === "web" && web.api_key_id === null && web.operacion === "importacion", web);
  await consulta("DELETE FROM iva.articulo_no_encontrado WHERE texto = $1", [marca]);

  // Sesiones (módulo del servidor) con un usuario temporal
  const { hashClave } = await import("../src/core/auth/claves.ts");
  const { ingresar, usuarioDeSesion, cerrarSesion } = await import("../src/core/auth/sesiones.ts");
  const correo = `prueba-${Date.now()}@ejemplo.ve`;
  const [u] = await consulta<{ id: number }>("INSERT INTO core.usuario (nombre, correo, rol, clave_hash, debe_cambiar_clave) VALUES ('Prueba', $1, 'lectura', $2, false) RETURNING id",
    [correo, await hashClave("clave de prueba segura")]);
  try {
    let s = await ingresar(correo, "incorrecta", "", false, null);
    verificar("contraseña incorrecta → error genérico", !s.ok && s.error === "Correo o contraseña incorrectos");
    s = await ingresar("nadie@ejemplo.ve", "x", "", false, null);
    verificar("correo inexistente → el mismo error (no revela cuentas)", !s.ok && s.error === "Correo o contraseña incorrectos");
    s = await ingresar(correo, "clave de prueba segura", "", true, "prueba");
    const token = s.ok ? s.token : "";
    verificar("ingreso correcto → token y sesión de 30 días", s.ok && s.segundos === 30 * 24 * 3600 && (await usuarioDeSesion(token))?.correo === correo);
    await cerrarSesion(token, correo);
    verificar("cierre de sesión invalida el token", (await usuarioDeSesion(token)) === null);
    if ((process.env.APP_SECRETO ?? "").length >= 32) {
      const { cifrarSecreto, codigoTotp, nuevoSecreto } = await import("../src/core/auth/totp.ts");
      const sec = nuevoSecreto();
      await consulta("UPDATE core.usuario SET totp_secreto = $2, totp_activo = true WHERE id = $1", [u.id, cifrarSecreto(sec)]);
      s = await ingresar(correo, "clave de prueba segura", "", false, null);
      verificar("con 2FA activa y sin código → pide el código", !s.ok && s.pideCodigo === true);
      s = await ingresar(correo, "clave de prueba segura", codigoTotp(sec), false, null);
      verificar("con el código TOTP vigente → ingresa", s.ok);
    }
    for (let i = 0; i < 5; i++) await ingresar(correo, "incorrecta", "", false, null);
    s = await ingresar(correo, "clave de prueba segura", "", false, null);
    verificar("5 intentos fallidos → cuenta bloqueada aunque la clave sea correcta", !s.ok && s.error.includes("bloqueada"), s);
  } finally {
    await consulta("DELETE FROM core.usuario WHERE id = $1", [u.id]);
    await consulta("DELETE FROM core.auditoria WHERE actor = $1", [correo]);
  }
}

main()
  .then(sitioYSesiones)
  .catch((e) => { fallos++; console.error("Error en las pruebas:", e); })
  .finally(async () => {
    const ids = `SELECT id FROM core.api_key WHERE prefijo = ANY ($1)`;
    await consulta(`DELETE FROM iva.observacion_precio WHERE api_key_id IN (${ids})`, [prefijos]).catch(() => {});
    await consulta(`DELETE FROM iva.consulta_registro WHERE api_key_id IN (${ids})`, [prefijos]).catch(() => {});
    await consulta(`DELETE FROM iva.articulo_no_encontrado WHERE api_key_id IN (${ids})`, [prefijos]).catch(() => {});
    await consulta(`DELETE FROM arancel.deteccion WHERE api_key_id IN (${ids})`, [prefijos]).catch(() => {});
    await consulta("DELETE FROM core.api_key WHERE prefijo = ANY ($1)", [prefijos]).catch(() => {});
    await pool().end();
    console.log(`\n${total - fallos}/${total} verificaciones correctas`);
    process.exitCode = fallos ? 1 : 0;
  });
