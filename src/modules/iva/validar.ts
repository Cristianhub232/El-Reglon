// Validación de las expresiones regulares de una regla (la usan el cargador del catálogo y el panel)
// Se aplican sobre texto normalizado: sin mayúsculas ni acentos (los escapes como \b o \W se permiten).
export function problemasPatron(p: string): string[] {
  const e: string[] = [];
  if (!p.trim()) e.push("expresión vacía");
  if (p.length > 2000) e.push("expresión demasiado larga");
  try { new RegExp(p); } catch (err) { e.push(`no compila (${(err as Error).message})`); }
  if (/[^\x20-\x7e]/.test(p) || /[A-Z]/.test(p.replace(/\\[A-Za-z]/g, ""))) e.push("tiene mayúsculas o caracteres no normalizados (use minúsculas sin acentos; la ñ se escribe n)");
  return e;
}
