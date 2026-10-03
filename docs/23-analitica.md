# 23 · Analítica del sitio y privacidad

Registro de las visitas al sitio público y de los RIF consultados, decidido el 01/10/2026:
- **IP completa**;
- **aviso informativo** (no consentimiento previo);
- **conservación de 12 meses**.

## Qué se registra

| Tabla | Contenido |
|---|---|
| `analitica.visitante` | Un navegador identificado por la cookie propia `renglon_visitante` (UUID aleatorio, `HttpOnly`, `SameSite=Lax`, 1 año). Guarda la primera y la última visita y el número de visitas |
| `analitica.visita` | Cada página vista del sitio público: fecha, ruta, de dónde llegó (dominio y ruta, **sin parámetros**), **IP completa**, navegador, sistema, dispositivo, idioma, tamaño de pantalla y agente |
| `analitica.rif_consultado` | RIF consultado (formato `J-12345678-9`, también los no válidos), si es válido, origen (`web` o `api`), herramienta (`deberes`, `calendario` o `rif`), tipo de contribuyente, condiciones, visitante o API key e IP |

- **Qué no se registra:**
  - el panel ni el inicio de sesión;
  - los robots (agentes con bot, crawl, spider, headless, curl…), que no reciben cookie.
- **IP:** se toma de `X-Forwarded-For` solo con `TRUST_PROXY=1`, es decir, detrás de Caddy en producción. En la copia local (`TRUST_PROXY=0`) queda vacía, porque esa cabecera la puede falsificar cualquiera.
- **Límite por IP:** el endpoint de visitas acepta 120 avisos por minuto por IP.

## Cómo

- **Visitas:** `src/ui/Analitica.tsx`, en el layout raíz. En cada cambio de página, el navegador envía `POST /api/publico/visita` (`fetch` con `keepalive`) con la ruta, el idioma, la pantalla y, solo en la primera página, el referente. Si el navegador no tiene la cookie, la ruta se la asigna.
- **RIF:** se registran en tres sitios:
  - `GET /api/publico/calendario/deberes` (herramienta «Mis deberes tributarios»);
  - `GET /api/v1/calendario/proximos`;
  - `GET /api/v1/rif/validar`.

  El registro va en segundo plano: si falla, la consulta responde igual.
- **Borrado:** `analitica.purgar()` elimina lo de más de 12 meses. La llama `noticias-programador` cada hora.

## Transparencia

- **Aviso:** una franja abajo, en el sitio público, con «Entendido» y un enlace a Privacidad. La decisión se recuerda en el navegador (`localStorage`, clave `aviso.cookies`).
- **Página `/privacidad`:** explica qué se registra, para qué (estadísticas y mejora del servicio), quién lo ve, por cuánto tiempo y el derecho a acceso y borrado (Constitución, art. 28). Muestra el correo de `SOPORTE_CORREO` si está configurado. Está enlazada desde el pie de página y en el sitemap.
- **«Mis deberes tributarios»:** avisa antes de consultar que «El RIF consultado queda registrado con fines estadísticos».

## Quién lo ve

- **Panel → Control → «Visitas y RIF»:** solo el **superadministrador**, porque tiene datos personales. Muestra:
  - visitantes, páginas vistas, visitantes nuevos y RIF consultados en 7 o 30 días, 90 días o 12 meses;
  - visitantes por día;
  - páginas más vistas, de dónde llegan, dispositivos y navegadores;
  - RIF más consultados y recientes, con su IP;
  - visitas recientes con IP y visitante.
- **Metabase** lee las tablas de analítica completas, con la IP (lectura completa de todos los esquemas desde el 03/10/2026, docs/19 §4).
