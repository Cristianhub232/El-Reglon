// sitemap.xml: solo las páginas públicas indexables, con su URL canónica.
import type { MetadataRoute } from "next";
import { SITIO_URL } from "../core/sitio.ts";

export default function sitemap(): MetadataRoute.Sitemap {
  const hoy = new Date();
  return [
    { url: `${SITIO_URL}/`, lastModified: hoy, changeFrequency: "daily", priority: 1 },   // tasas del BCV y noticias del día
    { url: `${SITIO_URL}/noticias`, lastModified: hoy, changeFrequency: "hourly", priority: 0.8 },   // titulares de los medios cada hora
    { url: `${SITIO_URL}/solicitar-api-key`, lastModified: hoy, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITIO_URL}/docs`, lastModified: hoy, changeFrequency: "monthly", priority: 0.5 },
  ];
}
