// Respuestas y errores homogéneos: { "error": { "codigo", "mensaje", "detalle"? } }
export class ErrorApi extends Error {
  readonly estado: number;
  readonly codigo: string;
  readonly detalle?: unknown;
  constructor(estado: number, codigo: string, mensaje: string, detalle?: unknown) {
    super(mensaje);
    this.estado = estado;
    this.codigo = codigo;
    this.detalle = detalle;
  }
}

export function json(datos: unknown, estado = 200, cabeceras: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...cabeceras },
  });
}

export function respuestaError(e: ErrorApi, cabeceras: Record<string, string> = {}): Response {
  return json({ error: { codigo: e.codigo, mensaje: e.message, ...(e.detalle !== undefined ? { detalle: e.detalle } : {}) } },
    e.estado, cabeceras);
}
