// Proxy (antes "middleware" en Next < 16): comprobación optimista de la sesión del panel.
// Solo mira si existe la cookie; la validación real (base de datos, rol) la hace la capa de acceso en cada página.
import { NextResponse, type NextRequest } from "next/server";

const COOKIE_SESION = "renglon_sesion";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const tiene = req.cookies.has(COOKIE_SESION);
  if (pathname.startsWith("/admin") && !tiene) {
    const url = new URL("/ingresar", req.url);
    if (pathname !== "/admin") url.searchParams.set("siguiente", pathname + search);
    return NextResponse.redirect(url);
  }
  const res = NextResponse.next();
  // El panel y el inicio de sesión nunca se guardan en cachés intermedias
  if (pathname.startsWith("/admin") || pathname.startsWith("/ingresar")) res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = { matcher: ["/admin/:path*", "/ingresar"] };
