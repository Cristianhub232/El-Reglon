// Service worker de El Renglón (PWA).
// - Nunca guarda en caché la API, el panel ni el inicio de sesión: son datos vivos o privados.
// - Recursos estáticos con versión (/_next/static, íconos, imágenes): primero la caché.
// - Páginas públicas: primero la red; sin conexión, la última copia o la página /sin-conexion.
const VERSION = "renglon-v1";
const ESTATICOS = `${VERSION}-estaticos`;
const PAGINAS = `${VERSION}-paginas`;
const PRECARGA = ["/sin-conexion", "/iconos/icono.svg", "/iconos/icono-192.png", "/favicon.ico"];
const NUNCA = [/^\/api\//, /^\/admin(\/|$)/, /^\/ingresar(\/|$)/, /^\/salir(\/|$)/];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(ESTATICOS).then((c) => c.addAll(PRECARGA)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((claves) => Promise.all(claves.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);
  if (req.method !== "GET" || url.origin !== self.location.origin) return;
  if (NUNCA.some((re) => re.test(url.pathname))) return;

  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/iconos/") || url.pathname.startsWith("/imagenes/")) {
    e.respondWith(
      caches.match(req).then((guardada) => guardada || fetch(req).then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(ESTATICOS).then((c) => c.put(req, copia)); }
        return res;
      })),
    );
    return;
  }

  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).then((res) => {
        if (res.ok) { const copia = res.clone(); caches.open(PAGINAS).then((c) => c.put(req, copia)); }
        return res;
      }).catch(() => caches.match(req).then((guardada) => guardada || caches.match("/sin-conexion"))),
    );
  }
});
