// Dirección pública canónica del sitio: base de las URL absolutas (canonical, Open Graph, robots.txt y sitemap.xml).
export const SITIO_URL = (process.env.SITIO_URL ?? "https://elrenglonve.org").replace(/\/+$/, "");
