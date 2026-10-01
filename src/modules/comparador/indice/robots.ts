// robots.txt (RFC 9309): grupo para nuestro agente o, si no hay, para "*"; gana la regla más larga que coincide
// (Allow gana en empate); comodines "*" y fin "$". También devuelve el Crawl-delay del grupo.
export interface Robots { permitido: (ruta: string) => boolean; pausaMs: number | null }

interface Regla { permitir: boolean; patron: string; re: RegExp }

const aRegex = (p: string) => new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$")}`);

export function interpretarRobots(texto: string, agente: string): Robots {
  const grupos: { agentes: string[]; reglas: Regla[]; pausa: number | null }[] = [];
  let actual: (typeof grupos)[number] | null = null, enAgentes = false;
  for (const linea of texto.split(/\r?\n/)) {
    const l = linea.replace(/#.*/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(l);
    if (!m) continue;
    const campo = m[1].toLowerCase(), valor = m[2].trim();
    if (campo === "user-agent") {
      if (!actual || !enAgentes) { actual = { agentes: [], reglas: [], pausa: null }; grupos.push(actual); }
      actual.agentes.push(valor.toLowerCase());
      enAgentes = true;
      continue;
    }
    enAgentes = false;
    if (!actual) continue;
    if ((campo === "disallow" || campo === "allow") && valor) actual.reglas.push({ permitir: campo === "allow", patron: valor, re: aRegex(valor) });
    if (campo === "crawl-delay" && Number(valor) > 0) actual.pausa = Number(valor);
  }
  const nombre = agente.toLowerCase().split("/")[0];
  const grupo = grupos.find((g) => g.agentes.some((a) => a !== "*" && nombre.includes(a))) ?? grupos.find((g) => g.agentes.includes("*"));
  return {
    pausaMs: grupo?.pausa ? grupo.pausa * 1000 : null,
    permitido(ruta: string) {
      let mejor: Regla | null = null;
      for (const r of grupo?.reglas ?? []) {
        if (!r.re.test(ruta)) continue;
        if (!mejor || r.patron.length > mejor.patron.length || (r.patron.length === mejor.patron.length && r.permitir)) mejor = r;
      }
      return mejor ? mejor.permitir : true;
    },
  };
}
