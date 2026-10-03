# 27 · Botón de contacto y bandeja del panel

Decididos el 03/10/2026: un botón flotante para que cualquiera escriba desde el sitio, y una bandeja en el panel con esos mensajes y con los correos que llegan a `ventas@` y `soporte@` (Spacemail).

## Botón flotante (`src/ui/sitio/Contacto.tsx`)

- Burbuja redonda abajo a la derecha en todo el sitio público. No aparece en el panel ni en `/ingresar`. Por debajo del aviso de cookies (`z-index` 49 frente a 50).
- Ventana con el saludo «¡Hola! 👋 ¿En qué podemos ayudarle?» y los campos: **correo (obligatorio)**, nombre (opcional), **mensaje** (3 a 2.000 caracteres) y la casilla opcional **«Quiero recibir novedades de El Renglón por correo»**. Se cierra con Esc.
- `POST /api/publico/contacto`:
  - límite de 5 mensajes por minuto por IP y de 5 por hora por correo;
  - campo trampa `sitio_web`: si viene lleno (robots), responde bien pero no guarda nada;
  - se guarda en `contacto.mensaje` con la página, la IP, el navegador y la cookie de analítica;
  - **aviso a `soporte@`** por correo (desde `ventas@`), con «Responder a» el correo del usuario: se le contesta con «Responder». No se avisa para los dominios reservados de prueba (`example.com`, `.test`, `.invalid`; RFC 2606);
  - con la casilla de novedades marcada, el contacto queda en **Prospección como persona natural con consentimiento** (origen: el número de mensaje y la fecha). Es la forma legítima de conseguir esos contactos.
- La página `/privacidad#contacto` explica qué se guarda y para qué.

## Bandeja del panel (`/admin/bandeja`, solo superadministrador)

| Pestaña | Contenido |
|---|---|
| Mensajes del sitio | Los mensajes del botón: estado (nuevo, atendido, spam), «Responder» (abre su correo), «Atendido», «Spam» y «Volver a nuevo». Todo queda en la auditoría (`contacto.mensaje`) |
| `ventas@` y `soporte@` | Los 50 correos más recientes de la bandeja de entrada; al abrir uno se muestra como **texto plano** (nunca su HTML: puede traer rastreadores o scripts), con sus adjuntos por nombre y un botón para responder |

- Lectura por IMAP (`mail.spacemail.com:993`) en **solo lectura** (`EXAMINE`): no marca correos como leídos ni los mueve. Librerías `imapflow` y `mailparser` (externas en `next.config.ts`).
- Contraseñas: `CORREO_SMTP_CLAVE` (ventas@, la misma del envío) y `CORREO_SOPORTE_CLAVE` (soporte@), solo en `.env` y **entre comillas simples** si tienen `#` o `$`.

## Respuestas de los prospectos

Cada 5 minutos, dentro de `noticias-programador` y después del ciclo de prospección, `revisarRespuestas()` lee los correos nuevos de `ventas@` (cursor en `contacto.cursor_buzon`):

| El correo es… | Resultado |
|---|---|
| De un prospecto y pide la baja («baja», «no me interesa», «elimínenme», «unsubscribe»…) | Prospecto en **baja** y su correo en la lista de supresión (`origen = 'respuesta'`) |
| Cualquier otra respuesta de un prospecto | **Respondió**: ya no recibe el seguimiento |
| Respuesta automática (`Auto-Submitted`, «fuera de la oficina») | Se ignora |
| Rebote (`mailer-daemon`, «Undelivered»…) | El prospecto rebotado queda como **rebote** |

Solo cuenta lo que escribió la persona: el texto se corta en la cita del correo original, que contiene nuestra propia frase «responda con la palabra «baja»». Cada cambio queda en la auditoría (`prospeccion.respuesta`) y en la pestaña de `ventas@`.

## Base de datos (`db/contacto/001_esquema.sql`)

`contacto.mensaje` y `contacto.cursor_buzon`. Metabase las lee completas (lectura completa de todos los esquemas desde el 03/10/2026, docs/19 §4).

## Pruebas

`scripts/prueba-api.ts`, «Contacto y bandeja»: sin correo → 400, el campo trampa no guarda, el mensaje con novedades crea el prospecto con consentimiento, la cita no cuenta como baja, la bandeja pide sesión y la portada muestra el botón.
