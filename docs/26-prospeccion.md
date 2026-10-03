# 26 · Prospección comercial por correo

Correos a empresas para ofrecerles El Renglón, decididos el 01/10/2026. **No es un boletín ni un envío masivo:** son pocos correos al día, personalizados por sector, con un solo seguimiento y baja en un clic. El remitente es siempre **«El Renglón»** (`ventas@elrenglonve.org`).

## Reglas

| Regla | Cómo se cumple |
|---|---|
| Pocos por día | Límite configurable de 1 a 30 por día hábil. **La base rechaza más de 30** (`CHECK` en `prospeccion.ajuste`) |
| Repartidos, nunca en ráfaga | Lunes a viernes, dentro del horario (hora de Caracas). El primer correo del día sale entre 0 y 40 minutos después de la hora de inicio; los siguientes se espacian repartiendo el tiempo que queda, ±40 %, con un mínimo de 10 minutos |
| Un solo seguimiento | A los N días (3 a 30) del primer correo, si no hubo respuesta ni baja. Después, nada más |
| Baja permanente | Enlace visible en cada correo (`/baja?t=…`) y cabeceras `List-Unsubscribe` + `List-Unsubscribe-Post` (baja en un clic de Gmail y Yahoo, RFC 8058). La dirección queda en `prospeccion.baja`: no se puede volver a cargar ni recibe más correos |
| Origen del contacto | Obligatorio al cargar cada prospecto: de dónde salió el correo (web de la empresa, directorio, tarjeta). Sin listas compradas |
| Arranca en pausa | `activo = false` por defecto. Se activa desde el panel, con confirmación |

Calentamiento recomendado del buzón: 5 al día las dos primeras semanas y luego subir hacia 20–30. Nunca escribir a diario a la misma persona: cada día van prospectos nuevos.

## Correo

- **Buzón:** Spacemail (Spaceship). SMTP `mail.spacemail.com`, puerto 465 (SSL), usuario `ventas@elrenglonve.org`.
- **DNS** (en Spaceship): MX, SPF (`include:spf.spacemail.com`) y DKIM (selector `spacemail`) los pone Spacemail; DMARC en `_dmarc` con `p=none` y los informes a `admin@elrenglonve.org`. Endurecer a `p=quarantine` tras unas semanas de informes limpios.
- **Variables:** `CORREO_SMTP_HOST`, `CORREO_SMTP_PUERTO`, `CORREO_SMTP_USUARIO`, `CORREO_SMTP_CLAVE` (solo en `.env`). Sin clave no se envía nada.
- **Contraseña con `#` u otros símbolos:** póngala entre comillas simples en el `.env` (`CORREO_SMTP_CLAVE='…'`). Sin comillas, el lector de `.env` de Node toma el `#` como comentario y la clave queda vacía, aunque `bash` la lea bien.

## Plantillas (`src/modules/prospeccion/plantillas.ts`)

Un primer correo por sector y un seguimiento común. Diseño de carta: poco HTML, sin imágenes salvo el logo, un solo botón. Los correos muy gráficos suelen ir a Promociones o a Spam.

| Sector | Asunto del primer correo | Botón |
|---|---|---|
| General | «{empresa}: IVA, tasa BCV y deberes del SENIAT en un solo lugar» | Probar El Renglón gratis |
| Comercio y bodegas | «{empresa}: ¿qué productos llevan IVA y cuáles no?» | Clasificar un producto ahora |
| Farmacias | «{empresa}: el IVA de cada medicamento, con su base legal» | Probar el clasificador gratis |
| Importadores | «{empresa}: código arancelario y tasa BCV aplicable en segundos» | Buscar un código arancelario |
| Contadores | «{empresa}: los vencimientos del SENIAT de sus clientes, en un solo lugar» | Consultar los deberes de un RIF |
| Desarrolladores | «{empresa}: API gratuita de IVA, tasa BCV y arancel» | Ver la documentación de la API |

- Cada correo incluye la **tasa del BCV del día** (dólar y euro) como dato útil.
- Los enlaces llevan `utm_source=correo&utm_medium=prospeccion&utm_campaign={sector}-{tipo}` para medir visitas.
- Todo dato del prospecto se escapa. Se envía en HTML y en texto plano.

## Programador

`cicloProspeccion()` (`src/modules/prospeccion/programador.ts`) corre **cada 5 minutos dentro de `noticias-programador`**: no se agrega otro proceso porque el servidor tiene la memoria justa. Envía como mucho un correo por ciclo y usa un cerrojo de PostgreSQL. Si el servidor rechaza la dirección (5xx), el prospecto queda como **rebote**; si es un error temporal, se reintenta más tarde.

## Panel: «Prospección» (solo superadministrador)

- **Indicadores:** estado, enviados hoy frente al límite, prospectos por estado, respuestas, bajas y rebotes.
- **Ajustes:** activa o en pausa, límite diario, horario y días hasta el seguimiento.
- **Vista previa** de cada plantilla (primer correo y seguimiento) y **envío de prueba** a cualquier dirección. Las pruebas no cuentan para el límite ni cambian ningún estado; su enlace de baja (`t=prueba`) no da de baja a nadie.
- **Alta** de un prospecto e **importación CSV** (hasta 500 líneas; `empresa; contacto; correo; sector; origen`). Los repetidos y los dados de baja se omiten.
- **Estados:** las respuestas llegan a `ventas@`; se marcan a mano con «Respondió». También «Descartar», «Volver a pendiente» y «Dar de baja».
- Todo queda en la auditoría (`prospeccion.*`).

## Base de datos (`db/prospeccion/001_esquema.sql`)

`prospecto` (con `token` de baja), `baja` (supresión permanente), `envio` (historial, incluidas las pruebas) y `ajuste` (una fila). Metabase lee todo salvo el `token` de los prospectos.

## Pruebas

`scripts/prueba-api.ts`, sección «Prospección por correo»: las 12 plantillas (escape, baja visible, tasa), la validación, que abrir `/baja` no da de baja, la baja en un clic con un prospecto temporal, el panel sin sesión y el tope de 30 por día.
