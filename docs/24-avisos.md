# 24 · Avisos push

Notificaciones del navegador (Web Push), decididas el 01/10/2026. Se activan **solo desde la campana de la cabecera** del sitio público. No hace falta registrarse.

| Tema | Cuándo | Quién lo dispara |
|---|---|---|
| `tasa` | Cuando el BCV publica una tasa nueva: dólar y euro con su variación | `bcv-programador`, tras ingestar una publicación con estado `registrada` |
| `noticias` | Resumen **3 veces al día**: 8:00, 13:00 y 19:00, hora de Caracas. Lleva el número de titulares nuevos y el más reciente | `noticias-programador`, cada hora (acepta hasta 2 h de retraso si el proceso se reinició) |
| `deberes` | **3 días antes y el mismo día** de cada vencimiento, desde las 8:00, por cada RIF seguido. Si vencen varios deberes el mismo día, van juntos en un aviso | `noticias-programador`, cada hora entre las 8:00 y las 11:59 (quien se suscribe a media mañana también lo recibe) |
| `novedades` | Cuando se publica una herramienta o un módulo nuevo | El panel, en **Avisos push** (curador o superadministrador) |

## Cómo funciona

- **Claves VAPID:** `VAPID_PUBLICO`, `VAPID_PRIVADO` y `VAPID_CONTACTO` en el `.env`. Se generan con `npx web-push generate-vapid-keys`.
  - Cada entorno tiene las suyas; nunca se suben al repositorio.
  - Si se cambian, las suscripciones existentes dejan de funcionar y hay que volver a activarlas.
  - Sin claves, `GET /api/publico/avisos/clave` responde 404 y la campana muestra «no disponible».
- **Navegador:**
  - `src/ui/sitio/Campana.tsx` pide el permiso **solo al pulsar «Activar avisos»**.
  - Registra `public/sw.js`, se suscribe con `pushManager.subscribe` y envía la suscripción con los temas y los RIF.
  - Si la persona guardó su RIF en «Mis deberes tributarios», se propone ese RIF.
- **Service worker:**
  - el evento `push` muestra el aviso (título, texto, icono y una etiqueta para que el aviso nuevo del mismo tema reemplace al anterior);
  - el evento `notificationclick` abre la ruta del aviso, o enfoca una pestaña ya abierta.
- **Servidor:**
  - `src/modules/avisos/envio.ts` cifra y envía con `web-push` (aes128gcm), de a 10 a la vez;
  - `src/modules/avisos/temas.ts` arma los avisos de cada tema.
- **No repetir:**
  - cada aviso automático lleva una clave única en `avisos.envio` (`tasa:2026-10-01`, `noticias:2026-10-01:13`);
  - cada vencimiento ya avisado queda en `avisos.envio_deber`, por dispositivo, RIF, obligación, fecha y momento.
- **Suscripciones vencidas:** si el servicio responde 404 o 410 (permiso quitado, navegador desinstalado), la suscripción se borra. También se borra tras 20 fallos seguidos.

## API pública (límite por IP)

| Ruta | Para qué |
|---|---|
| `GET /api/publico/avisos/clave` | Clave pública VAPID |
| `POST /api/publico/avisos/suscripcion` | `{ suscripcion, temas, rifs }`: alta o cambio. La primera vez envía un aviso de bienvenida unos segundos después de responder (FCM puede rechazar con 410 una suscripción recién creada; se reintenta una vez y nunca se borra por ese rechazo) |
| `POST /api/publico/avisos/estado` | `{ endpoint }`: temas y RIF de este dispositivo |
| `POST /api/publico/avisos/baja` | `{ endpoint }`: borra la suscripción y sus RIF |

**Validaciones:**
- El endpoint debe ser de un servicio de push de navegador: FCM (Chrome, Edge, Android), Mozilla, Apple o Windows. Así una «suscripción» no puede hacer que el servidor llame a otra dirección (SSRF).
- Las claves `p256dh` y `auth` se validan en base64url.
- Se aceptan hasta 5 RIF por dispositivo, validados con `rif.validar` (dígito verificador). El tipo debe ser especial u ordinario, y las condiciones las de `calendario.condicion`.
- El cuerpo puede tener como mucho 8 KB.

## Base de datos (`db/core/004_avisos.sql`)

- **`avisos.suscripcion`:** endpoint, claves, temas, cookie de visitante (si la hay), agente, fechas y fallos.
- **`avisos.suscripcion_rif`:** RIF, tipo y condiciones; se borran en cascada con la suscripción.
- **`avisos.envio`:** historial (tema, clave, texto, origen, quién, destinatarios, entregados, fallidos). Se purga a los 12 meses con `avisos.purgar()`.
- **`avisos.envio_deber`:** control de vencimientos avisados. Se purga una semana después de la fecha límite.
- **Metabase:** solo ve `avisos.envio` y columnas de `avisos.suscripcion` sin endpoint ni claves.

## Panel: «Avisos push»

- **Quién lo ve:** superadministrador, curador y solo lectura.
- **Qué muestra:** dispositivos por tema y por servicio, y los envíos recientes.
- **Quién envía (`avisos.enviar`):** el superadministrador y el curador pueden mandar una **novedad** a todos los que la siguen, con confirmación, y una **prueba** solo a su propio navegador.
- **Auditoría:** cada novedad queda en la auditoría como `avisos.novedad`.
- **RIF seguidos:** son datos personales y solo los ve el superadministrador.

## iPhone y iPad

Safari en iOS/iPadOS 16.4 o posterior solo admite avisos si El Renglón está **agregado a la pantalla de inicio** (Compartir → «Agregar a inicio») y se abre desde ese icono. La campana lo explica cuando detecta un iPhone o iPad sin la app instalada.

## Producción

1. Generar las claves: `npx web-push generate-vapid-keys`. Copiarlas al `.env` del servidor (`VAPID_PUBLICO`, `VAPID_PRIVADO`).
2. Aplicar la base de datos: `herramientas/instalar_bd.sh` (incluye `004_avisos.sql`).
3. Reconstruir y reiniciar `app`, `bcv-programador` y `noticias-programador`: los tres usan las claves.
