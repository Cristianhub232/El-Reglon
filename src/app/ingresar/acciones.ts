"use server";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { ErrorApi } from "../../core/http.ts";
import { limitarPorIp } from "../../core/limite-ip.ts";
import { COOKIE_SESION, ingresar } from "../../core/auth/sesiones.ts";

export interface EstadoIngreso { error: string | null; pideCodigo: boolean; correo: string }

// Solo se vuelve a rutas internas del panel (evita redirecciones abiertas)
const destinoSeguro = (d: FormDataEntryValue | null) => typeof d === "string" && /^\/admin(\/[\w\-/?=&%.]*)?$/.test(d) ? d : "/admin";

export async function accionIngresar(_prev: EstadoIngreso, form: FormData): Promise<EstadoIngreso> {
  const correo = String(form.get("correo") ?? "").trim().slice(0, 200);
  const clave = String(form.get("clave") ?? "").slice(0, 200);
  const codigo = String(form.get("codigo") ?? "").replace(/\D/g, "").slice(0, 6);
  const h = await headers();
  try {
    limitarPorIp(h, "ingreso", 10);
  } catch (e) {
    return { error: e instanceof ErrorApi ? "Demasiados intentos desde esta conexión. Espera un minuto." : "No se pudo iniciar sesión", pideCodigo: false, correo };
  }
  if (!correo || !clave) return { error: "Escribe tu correo y tu contraseña", pideCodigo: false, correo };
  const r = await ingresar(correo, clave, codigo, form.get("mantener") === "on", h.get("user-agent"));
  if (!r.ok) return { error: r.error, pideCodigo: !!r.pideCodigo, correo };
  (await cookies()).set(COOKIE_SESION, r.token, {
    httpOnly: true, sameSite: "lax", path: "/", maxAge: r.segundos,
    secure: process.env.NODE_ENV === "production" && process.env.COOKIE_SEGURA !== "0",
  });
  redirect(r.usuario.debe_cambiar_clave ? "/admin/cuenta" : destinoSeguro(form.get("siguiente")));
}
