// Envoltorio de los endpoints: autenticación por API key (cabecera X-API-Key), permiso por módulo,
// límite de peticiones por minuto y conversión de errores a JSON.
import { consulta } from "./db.ts";
import { registrarUso } from "./uso.ts";
import { ErrorApi, json, respuestaError } from "./http.ts";
import { hashIguales, prefijoDe, sha256, type Permiso } from "./api-key.ts";

interface Clave { id: number; prefijo: string; hash_sha256: string; permisos: string[]; limite_por_minuto: number; activa: boolean }

// Límite en memoria (ventana fija de 60 s). Con varias instancias, cada una lleva su cuenta.
const ventanas = new Map<number, { inicio: number; usadas: number }>();
const ultimoUsoRegistrado = new Map<number, number>();

async function autenticar(req: Request, permiso: Permiso): Promise<{ clave: Clave; cabeceras: Record<string, string> }> {
  const token = req.headers.get("x-api-key") ?? "";
  const prefijo = prefijoDe(token);
  if (!prefijo) throw new ErrorApi(401, "api_key_requerida", "Envíe una API key válida en la cabecera X-API-Key");
  const [clave] = await consulta<Clave>(
    "SELECT id, prefijo, hash_sha256, permisos, limite_por_minuto, activa FROM core.api_key WHERE prefijo = $1", [prefijo]);
  if (!clave || !clave.activa || !hashIguales(clave.hash_sha256, sha256(token))) {
    throw new ErrorApi(401, "api_key_invalida", "La API key no existe o fue revocada");
  }
  if (!clave.permisos.includes(permiso) && !clave.permisos.includes("admin")) {
    throw new ErrorApi(403, "sin_permiso", `La API key no tiene permiso para el módulo '${permiso}'`);
  }
  const ahora = Date.now();
  let v = ventanas.get(clave.id);
  if (!v || ahora - v.inicio >= 60_000) { v = { inicio: ahora, usadas: 0 }; ventanas.set(clave.id, v); }
  v.usadas += 1;
  const restantes = Math.max(0, clave.limite_por_minuto - v.usadas);
  const reinicio = Math.ceil((v.inicio + 60_000 - ahora) / 1000);
  const cabeceras = { "x-ratelimit-limit": String(clave.limite_por_minuto), "x-ratelimit-remaining": String(restantes),
    "x-ratelimit-reset": String(reinicio) };
  if (v.usadas > clave.limite_por_minuto) {
    throw Object.assign(new ErrorApi(429, "limite_excedido", `Límite de ${clave.limite_por_minuto} consultas por minuto excedido`),
      { cabeceras: { ...cabeceras, "retry-after": String(reinicio) }, api_key_id: clave.id });
  }
  if (ahora - (ultimoUsoRegistrado.get(clave.id) ?? 0) > 60_000) {   // como mucho una escritura por minuto
    ultimoUsoRegistrado.set(clave.id, ahora);
    void consulta("UPDATE core.api_key SET ultimo_uso = now() WHERE id = $1", [clave.id]).catch(() => {});
  }
  return { clave, cabeceras };
}

export interface Sesion { api_key_id: number | null }
type Manejador<C> = (req: Request, url: URL, contexto: C, sesion: Sesion) => Promise<unknown>;

// Cuenta cada consulta de la API (con API key) y de las herramientas públicas (/api/publico/<módulo>/…)
export function endpoint<C = unknown>(permiso: Permiso | null, fn: Manejador<C>) {
  const ejecutar = ejecutor(permiso, fn);
  return async (req: Request, contexto: C): Promise<Response> => {
    const sesion: Sesion = { api_key_id: null };
    const res = await ejecutar(req, contexto, sesion);
    const ruta = new URL(req.url).pathname;
    const modulo = permiso ?? (ruta.startsWith("/api/publico/") ? ruta.split("/")[3] : null);
    if (modulo) registrarUso(sesion.api_key_id, modulo, res.status);
    return res;
  };
}

function ejecutor<C>(permiso: Permiso | null, fn: Manejador<C>) {
  return async (req: Request, contexto: C, sesion: Sesion): Promise<Response> => {
    let cabeceras: Record<string, string> = {};
    try {
      if (permiso) {
        const a = await autenticar(req, permiso);
        cabeceras = a.cabeceras;
        sesion.api_key_id = a.clave.id;
      }
      const datos = await fn(req, new URL(req.url), contexto, sesion);
      return datos instanceof Response ? datos : json(datos, 200, cabeceras);
    } catch (e) {
      if (e instanceof ErrorApi) {
        const id = (e as ErrorApi & { api_key_id?: number }).api_key_id;
        if (id) sesion.api_key_id = id;
        return respuestaError(e, { ...cabeceras, ...((e as ErrorApi & { cabeceras?: Record<string, string> }).cabeceras ?? {}) });
      }
      const pgErr = e as { code?: string; message?: string };
      if (pgErr?.code === "22023" || pgErr?.code === "22007" || pgErr?.code === "22008") {
        return respuestaError(new ErrorApi(400, "parametro_invalido", pgErr.message ?? "Parámetro inválido"), cabeceras);
      }
      console.error("[el-renglon] error no controlado:", e);
      return respuestaError(new ErrorApi(500, "error_interno", "Error interno del servicio"), cabeceras);
    }
  };
}
