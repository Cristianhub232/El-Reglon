import { ErrorApi } from "./http.ts";

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function hoyCaracas(): string {
  // Venezuela: UTC-4 todo el año
  return new Date(Date.now() - 4 * 3600_000).toISOString().slice(0, 10);
}

export function fecha(valor: string | null, nombre: string, porDefecto?: string): string {
  if (valor === null || valor === "") {
    if (porDefecto !== undefined) return porDefecto;
    throw new ErrorApi(400, "parametro_requerido", `Falta el parámetro '${nombre}' (AAAA-MM-DD)`);
  }
  const d = new Date(`${valor}T00:00:00Z`);
  if (!RE_FECHA.test(valor) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== valor) {
    throw new ErrorApi(400, "fecha_invalida", `'${nombre}' debe ser una fecha válida en formato AAAA-MM-DD`);
  }
  return valor;
}

export function entero(valor: string | null, nombre: string, min: number, max: number, porDefecto: number): number {
  if (valor === null || valor === "") return porDefecto;
  const n = Number(valor);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new ErrorApi(400, "parametro_invalido", `'${nombre}' debe ser un entero entre ${min} y ${max}`);
  }
  return n;
}

export function requerido(valor: string | null, nombre: string): string {
  if (valor === null || valor.trim() === "") throw new ErrorApi(400, "parametro_requerido", `Falta el parámetro '${nombre}'`);
  return valor.trim();
}

export function moneda(valor: string | null, nombre: string, porDefecto?: string): string {
  const v = (valor ?? porDefecto ?? "").toUpperCase();
  if (!/^[A-Z]{3}$/.test(v)) throw new ErrorApi(400, "moneda_invalida", `'${nombre}' debe ser un código de moneda de 3 letras (p. ej. USD)`);
  return v;
}

export function decimal(valor: string | null, nombre: string): string {
  const v = requerido(valor, nombre);
  if (!/^-?\d+(\.\d+)?$/.test(v)) throw new ErrorApi(400, "parametro_invalido", `'${nombre}' debe ser un número con punto decimal (p. ej. 1250.50)`);
  return v;
}
