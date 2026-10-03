# 26 · Prospección comercial por correo

Correos a empresas para ofrecerles El Renglón, decididos el 01/10/2026. **No es un boletín ni un envío masivo:** son pocos correos al día, personalizados por sector, con un solo seguimiento y baja en un clic. El remitente es siempre **«El Renglón»** (`ventas@elrenglonve.org`).

## Reglas

| Regla | Cómo se cumple |
|---|---|
| Pocos por día | Límite configurable de 1 a 30 por día hábil. **La base rechaza más de 30** (`CHECK` en `prospeccion.ajuste`) |
| Repartidos, nunca en ráfaga | Lunes a viernes, dentro del horario (hora de Caracas). El primer correo del día sale entre 0 y 40 minutos después de la hora de inicio; los siguientes se espacian repartiendo el tiempo que queda, ±40 %, con un mínimo de 10 minutos |
| Un solo seguimiento | A los N días (3 a 30) del primer correo, si no hubo respuesta ni baja. Después, nada más |
| Baja permanente | Enlace al pie de cada correo (`/baja?t=…`) o responder «baja». La dirección queda en `prospeccion.baja`: no se puede volver a cargar ni recibe más correos |
| Origen del contacto | Obligatorio al cargar cada prospecto: de dónde salió el correo (web de la empresa, directorio, tarjeta). Sin listas compradas |
| Personas naturales solo con consentimiento | Escribirle a un particular sin su permiso es spam en casi todas las legislaciones y lo que más daña la reputación del dominio. La base lo impide (`prospecto_consumidor_consentimiento`) y el programador lo vuelve a filtrar. A empresas, en cambio, es prospección comercial normal |
| Contribuyentes especiales con RIF | La base exige el RIF (`prospecto_especial_rif`), validado con el dígito verificador oficial (`rif.validar`) |
| Arranca en pausa | `activo = false` por defecto. Se activa desde el panel, con confirmación |

Calentamiento recomendado del buzón: 5 al día las dos primeras semanas y luego subir hacia 20–30. Nunca escribir a diario a la misma persona: cada día van prospectos nuevos.

## Correo

- **Buzón:** Spacemail (Spaceship). SMTP `mail.spacemail.com`, puerto 465 (SSL), usuario `ventas@elrenglonve.org`.
- **DNS** (en Spaceship): MX, SPF (`include:spf.spacemail.com`) y DKIM (selector `spacemail`) los pone Spacemail; DMARC en `_dmarc` con `p=none` y los informes a `admin@elrenglonve.org`. Endurecer a `p=quarantine` tras unas semanas de informes limpios.
- **Variables:** `CORREO_SMTP_HOST`, `CORREO_SMTP_PUERTO`, `CORREO_SMTP_USUARIO`, `CORREO_SMTP_CLAVE` (solo en `.env`). Sin clave no se envía nada.
- **Contraseña con `#` u otros símbolos:** póngala entre comillas simples en el `.env` (`CORREO_SMTP_CLAVE='…'`). Sin comillas, el lector de `.env` de Node toma el `#` como comentario y la clave queda vacía, aunque `bash` la lea bien.

## Plantillas (`src/modules/prospeccion/plantillas.ts`)

Un primer correo por sector y un seguimiento común, en **estilo de carta**: párrafos, una lista de **enlaces de texto directos a las herramientas** del sitio y la firma «El Renglón». Sin logo, sin botones y sin cajas de color.

**Por qué así (03/10/2026):** la primera versión, con logo, botón azul, cajas de color, texto oculto de vista previa y cabeceras `List-Unsubscribe`, llegó a **Promociones** en Gmail; una prueba de texto simple había llegado a **Principal**. Gmail clasifica por el aspecto del correo.
- **Sin `List-Unsubscribe`:** es la señal más clara de boletín. Gmail y Yahoo solo la exigen a quien envía más de 5.000 correos al día (aquí, 30 como mucho). La baja en un clic sigue disponible por si el volumen crece: `POST /api/publico/prospeccion/baja?t=…` (RFC 8058).
- Los enlaces llevan a las secciones de la portada: `#herramientas` (clasificador de IVA), `#comparador`, `#deberes`, `#tasas`, y a `/docs` y `/solicitar-api-key`.

| Sector | Asunto del primer correo | Enlaces |
|---|---|---|
| General | «{empresa}: ¿qué lleva IVA y qué no? Ejemplos con su base legal» | Ejemplos de IVA · Clasificador de IVA · Tasa BCV · Mis deberes · Comparador |
| Comercio y bodegas | «{empresa}: la harina no paga IVA, el refresco sí (16 %)» | Ejemplos de IVA · Clasificador de IVA · Comparador · Tasa BCV |
| Farmacias | «{empresa}: ¿el protector solar lleva IVA? (sí, 16 %)» | Ejemplos de IVA · Clasificador de IVA · Comparador (Farmatodo, Locatel…) · Tasa BCV |
| Importadores | «{empresa}: código arancelario y tasa BCV aplicable en segundos» | Clasificador (acepta código arancelario) · Tasa BCV · API |
| Contadores | «{empresa}: los vencimientos del SENIAT de sus clientes, en un solo lugar» | Mis deberes · Clasificador de IVA · Tasa BCV |
| Desarrolladores | «{empresa}: API gratuita de IVA, tasa BCV y arancel» | Documentación de la API · API key gratuita · Clasificador |

| Contribuyentes especiales | «{empresa}: su próximo deber con el SENIAT vence el {fecha}» | **Sus próximos 4 deberes** (calendario oficial por su RIF) · «Ver todos sus deberes» (abre «Mis deberes» ya consultado) · Clasificador · Tasa BCV |
| Personas naturales | «{producto}: {n} % más barato en {cadena} que en otra cadena» | **Dónde está más barato hoy** (4 productos básicos) · Comparador · Tasa BCV · Clasificador |

El seguimiento lleva los dos primeros enlaces del sector.

### Datos reales en el correo (`src/modules/prospeccion/datos.ts`)

Lo que llama la atención es un dato útil, no el diseño (03/10/2026):
- **Ejemplos de IVA** (general, comercio y farmacias): tres productos con su alícuota en una etiqueta de color (verde exento, naranja 16 %) y el artículo de la ley. Son fijos (`EJEMPLOS_IVA`) para no inflar las estadísticas del clasificador con cada correo; las pruebas los comparan con el clasificador real.
- **Próximos deberes del RIF** (contribuyentes especiales): `misDeberes(rif, ESPECIAL)` del módulo Calendario. El enlace abre `/?rif=…&tipo=ESPECIAL#deberes`, y «Mis deberes» acepta ahora esos parámetros y consulta sola.
- **Más barato hoy** (personas naturales): el mismo código de barras en al menos dos cadenas, con precio de las últimas 48 horas (US$ convertidos con la tasa del BCV) y más de 3 % de diferencia; uno por rubro (arroz, café, harina…), los 4 con mayor diferencia. Se calcula una vez al día. Cada producto enlaza a `/?comparar=…#comparador`.
- Asuntos con el dato concreto (p. ej. «la harina no paga IVA, el refresco sí (16 %)»).

- Cada correo menciona la **tasa del BCV del día** (dólar y euro) en una frase.
- Los enlaces llevan `utm_source=correo&utm_campaign={sector}` para medir visitas.
- Todo dato del prospecto se escapa. Se envía en HTML y en texto plano.

## Programador

`cicloProspeccion()` (`src/modules/prospeccion/programador.ts`) corre **cada 5 minutos dentro de `noticias-programador`**: no se agrega otro proceso porque el servidor tiene la memoria justa. Envía como mucho un correo por ciclo y usa un cerrojo de PostgreSQL. Si el servidor rechaza la dirección (5xx), el prospecto queda como **rebote**; si es un error temporal, se reintenta más tarde.

## Panel: «Prospección» (solo superadministrador)

- **Indicadores:** estado, enviados hoy frente al límite, prospectos por estado, respuestas, bajas y rebotes.
- **Ajustes:** activa o en pausa, límite diario, horario y días hasta el seguimiento.
- **Vista previa** de cada plantilla (primer correo y seguimiento) y **envío de prueba** a cualquier dirección. Las pruebas no cuentan para el límite ni cambian ningún estado; su enlace de baja (`t=prueba`) no da de baja a nadie.
- **Alta** de un prospecto e **importación CSV** (hasta 500 líneas; `empresa; contacto; correo; sector; origen; rif; consentimiento`). Sectores por clave, nombre o alias («especial», «persona natural»). Los repetidos y los dados de baja se omiten.
- **Estados:** las respuestas llegan a `ventas@`; se marcan a mano con «Respondió». También «Descartar», «Volver a pendiente» y «Dar de baja».
- Todo queda en la auditoría (`prospeccion.*`).

## Base de datos (`db/prospeccion/001_esquema.sql`)

`prospecto` (con `token` de baja), `baja` (supresión permanente), `envio` (historial, incluidas las pruebas) y `ajuste` (una fila). Metabase lee todo salvo el `token` de los prospectos.

## Pruebas

`scripts/prueba-api.ts`, sección «Prospección por correo»: los ejemplos de IVA frente al clasificador, RIF y consentimiento obligatorios, los deberes reales de un RIF, el correo de personas con su comparación, las 16 plantillas (estilo carta sin imágenes ni botones, enlaces a las herramientas, escape, baja visible, tasa, sin doble punto tras «C.A.»), la validación, que abrir `/baja` no da de baja, la baja en un clic con un prospecto temporal, el panel sin sesión y el tope de 30 por día.
