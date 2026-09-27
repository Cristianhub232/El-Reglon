// Conexión a PostgreSQL (un pool por proceso). Fechas (date) y numéricos se devuelven como texto:
// así no hay corrimientos de zona horaria ni pérdida de decimales en tasas y tarifas.
import pg from "pg";

pg.types.setTypeParser(1082, (v: string) => v); // date
pg.types.setTypeParser(1700, (v: string) => v); // numeric

export function urlBaseDatos(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;
  const u = process.env.POSTGRES_USER ?? "elrenglon";
  const p = process.env.POSTGRES_PASSWORD;
  if (!p) throw new Error("Defina DATABASE_URL o POSTGRES_PASSWORD en el entorno (.env)");
  const h = process.env.POSTGRES_HOST ?? "127.0.0.1";
  const puerto = process.env.POSTGRES_PUERTO ?? "55432";
  const bd = process.env.POSTGRES_DB ?? "elrenglon";
  return `postgresql://${encodeURIComponent(u)}:${encodeURIComponent(p)}@${h}:${puerto}/${bd}`;
}

const global_ = globalThis as unknown as { __renglonPool?: pg.Pool };

export function pool(): pg.Pool {
  if (!global_.__renglonPool) {
    global_.__renglonPool = new pg.Pool({ connectionString: urlBaseDatos(), max: 10, idleTimeoutMillis: 30_000 });
  }
  return global_.__renglonPool;
}

export async function consulta<T extends pg.QueryResultRow>(sql: string, params: unknown[] = []): Promise<T[]> {
  const r = await pool().query<T>(sql, params);
  return r.rows;
}
