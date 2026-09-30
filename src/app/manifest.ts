import type { MetadataRoute } from "next";

// Manifiesto de la PWA (se sirve en /manifest.webmanifest y Next lo enlaza en todas las páginas)
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "El Renglón · Información fiscal venezolana",
    short_name: "El Renglón",
    description: "Clasificación de IVA, tasas oficiales del BCV, arancel de aduanas, calendario tributario y validación del RIF.",
    lang: "es-VE",
    dir: "ltr",
    start_url: "/?origen=pwa",
    scope: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F6F3EA",
    theme_color: "#0E2440",
    categories: ["finance", "business", "productivity"],
    icons: [
      { src: "/iconos/icono.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: "/iconos/icono-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/iconos/icono-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/iconos/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Clasificador de IVA", short_name: "IVA", url: "/#herramientas", icons: [{ src: "/iconos/icono-192.png", sizes: "192x192" }] },
      { name: "Tasa BCV de hoy", short_name: "BCV", url: "/#tasas", icons: [{ src: "/iconos/icono-192.png", sizes: "192x192" }] },
    ],
  };
}
