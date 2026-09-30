// robots.txt: el sitio público se rastrea; el panel y la API no (la API exige API key y no es contenido).
// /ingresar y /sin-conexion se rastrean, pero llevan noindex en sus metadatos.
import type { MetadataRoute } from "next";
import { SITIO_URL } from "../core/sitio.ts";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${SITIO_URL}/sitemap.xml`,
    host: SITIO_URL,
  };
}
