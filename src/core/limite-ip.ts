// Límite de consultas por IP para lo que se usa sin API key (herramientas públicas e inicio de sesión).
// La IP sale de X-Forwarded-For / X-Real-IP solo si TRUST_PROXY=1 (detrás del proxy inverso); si no, todas las
// peticiones comparten un cupo común, más amplio, para no depender de una cabecera que el cliente puede falsificar.
import { ErrorApi } from "./http.ts";

const ventanas = new Map<string, { inicio: number; usadas: number }>();

export function ipCliente(h: Headers): string | null {
  if (process.env.TRUST_PROXY !== "1") return null;
  const xff = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || h.get("x-real-ip")?.trim() || null;
}

// Devuelve false si se superó el límite (ventana fija de 60 s por clave)
export function permitir(clave: string, limitePorMinuto: number): boolean {
  const ahora = Date.now();
  let v = ventanas.get(clave);
  if (!v || ahora - v.inicio >= 60_000) {
    v = { inicio: ahora, usadas: 0 };
    ventanas.set(clave, v);
    if (ventanas.size > 50_000) for (const [k, x] of ventanas) if (ahora - x.inicio >= 60_000) ventanas.delete(k);
  }
  v.usadas += 1;
  return v.usadas <= limitePorMinuto;
}

export function limitarPorIp(h: Headers, ambito: string, limitePorMinuto: number) {
  const ip = ipCliente(h);
  const ok = ip ? permitir(`${ambito}:${ip}`, limitePorMinuto) : permitir(`${ambito}:*`, limitePorMinuto * 20);
  if (!ok) throw new ErrorApi(429, "limite_excedido", "Demasiadas consultas desde esta conexión. Espere un minuto o use una API key gratuita.");
}
