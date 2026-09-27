// Casos de referencia (datos/iva/casos_prueba.json) ejecutados contra un catálogo, sin base de datos.
// Los usan scripts/iva-casos.ts y el cargador del catálogo (que no carga un catálogo que los falle).
import { detectarCodigo } from "./codigos.ts";
import { clasificar, compilar, type CatalogoMotor, type Contexto } from "./motor.ts";
import { construirSenales, suspensionVigente, type DecretoCatalogo } from "./senales.ts";

export interface Caso {
  nombre: string | null; operacion: "nacional" | "importacion"; tipo?: "bien" | "servicio"; contexto?: Contexto;
  codigo_arancelario?: string; codigo?: string;
  esperado: { estado: string; categorias: string[]; regla?: string };
}

export function ejecutarCasos(catalogo: CatalogoMotor & { decretos: DecretoCatalogo[] }, casos: Caso[], fecha: string): string[] {
  const motor = compilar(catalogo);
  const suspension = suspensionVigente(catalogo.decretos, fecha);
  const fallos: string[] = [];
  for (const c of casos) {
    const { senales } = construirSenales(motor, {
      nombre: c.nombre, tipo: c.tipo ? (c.tipo.toUpperCase() as "BIEN" | "SERVICIO") : undefined,
      codigo_arancelario: c.codigo_arancelario?.replace(/\D/g, "") ?? null, codigos: c.codigo ? [detectarCodigo(c.codigo)] : [] });
    const r = clasificar(motor, { senales, operacion: c.operacion, contexto: c.contexto ?? {}, suspension_importacion: suspension });
    const cats = r.opciones.map((o) => o.categoria);
    const ok = r.estado === c.esperado.estado && cats.length === c.esperado.categorias.length
      && c.esperado.categorias.every((x) => cats.includes(x)) && (!c.esperado.regla || r.reglas[0]?.id === c.esperado.regla);
    if (!ok) {
      fallos.push(`${c.nombre ?? c.codigo_arancelario ?? c.codigo} [${c.operacion}${c.contexto ? " " + JSON.stringify(c.contexto) : ""}]: ` +
        `esperado ${c.esperado.estado} ${c.esperado.categorias.join(",")} ${c.esperado.regla ?? ""}; ` +
        `obtenido ${r.estado} ${cats.join(",")} ${r.reglas.map((x) => x.id).join(",")}`);
    }
  }
  return fallos;
}
