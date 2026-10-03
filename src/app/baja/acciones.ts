"use server";
// Baja de la prospección por correo desde la página /baja (el botón confirma; abrir el enlace no da de baja)
import { bajaPorToken } from "../../modules/prospeccion/prospectos.ts";

export async function accionBaja(_p: { hecho?: boolean; error?: string }, form: FormData): Promise<{ hecho?: boolean; error?: string }> {
  const ok = await bajaPorToken(String(form.get("t") ?? ""), "enlace");
  return ok ? { hecho: true } : { error: "Este enlace no es válido o ya no está vigente." };
}
