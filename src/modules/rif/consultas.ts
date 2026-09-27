import { consulta } from "../../core/db.ts";

export async function validar(rif: string) {
  const [v] = await consulta("SELECT * FROM rif.validar($1)", [rif]);
  return { entrada: rif, ...v };
}
