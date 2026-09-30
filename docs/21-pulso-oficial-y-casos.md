# 21 · Pulso oficial y casos de uso (portada)

## Pulso oficial

El carrusel del inicio de la portada muestra las últimas publicaciones del SENIAT, el BCV y el SAREN. Ocupa el lugar de la antigua foto del comerciante y el conversor BCV queda encima. Si no hay ninguna publicación de los últimos 30 días, vuelve a mostrarse la foto.

- **Selección.** Se muestran hasta 5 publicaciones: primero la más reciente de cada ente, para que todos aparezcan, y después las demás por fecha.
- **Tarjeta.** Cada publicación lleva su tarjeta: ente, origen (Instagram, sitio web o nota de prensa), fecha, título y enlaces a la publicación y al perfil o sitio del ente.
- **Movimiento.** El carrusel avanza solo cada 8 s. Se detiene con el cursor o el foco dentro y no se mueve si el usuario pidió reducir el movimiento. También se maneja con las flechas del teclado.

### Fuentes

| Cuenta | Método | Estado inicial |
|---|---|---|
| SENIAT · Instagram `@seniatoficial` | API de Instagram de Meta | Activa; necesita la configuración de abajo |
| BCV · Instagram | API de Instagram de Meta | Pausada y sin usuario: hay que indicarlo en el panel |
| SAREN · Instagram | API de Instagram de Meta | Pausada y sin usuario: hay que indicarlo en el panel |
| BCV · notas de prensa | Tabla de `bcv.org.ve/comunicados-de-prensa/notas-de-prensa`; de cada nota nueva se toman la imagen y el primer párrafo | Activa |
| SAREN · sitio web | RSS de `saren.gob.ve/feed/`, sin obituarios ni condolencias | Activa |

Por qué se usan estos métodos:
- **Instagram no se raspa.** instagram.com exige iniciar sesión y sus condiciones prohíben la lectura automática. La vía legítima es la **Instagram Graph API (Business Discovery)**, que devuelve las publicaciones públicas de cuentas profesionales (empresa o creador).
- **SENIAT.** Su sitio web rechaza las conexiones desde fuera de Venezuela (tanto este equipo como el VPS), así que para el SENIAT solo queda Instagram.
- **Usuarios de Instagram.** Instagram no muestra perfiles sin iniciar sesión, así que los usuarios no se pudieron verificar al instalar. Hay que confirmarlos en el panel: si uno no existe o no es una cuenta profesional, la API responde con un error y el panel lo muestra.
- **Imágenes del SAREN.** Hoy dan 404 en su propio servidor, así que sus publicaciones se muestran con una lámina con la sigla del ente.

### Configurar la API de Instagram (una vez)

1. Tener una **cuenta profesional de Instagram**, por ejemplo la de El Renglón, vinculada a una **página de Facebook**.
2. En developers.facebook.com, crear una app de tipo *Business* y agregarle el producto *Instagram Graph API*.
3. Generar un token de usuario con los permisos `instagram_basic` y `pages_show_list`, y cambiarlo por uno de larga duración.
   - Los tokens de usuario de larga duración vencen a los 60 días.
   - Un token de página obtenido con un token de usuario de larga duración no vence.
4. Obtener el **id de la cuenta de Instagram**: `GET /me/accounts?fields=instagram_business_account` con ese token.
5. En el `.env` del servidor:
   ```
   INSTAGRAM_USUARIO_ID=1784…
   INSTAGRAM_TOKEN=EAAG…
   ```
   Después, `docker compose --profile app up -d`.
6. En el panel, en Noticiero → Pulso oficial, confirmar el usuario de cada ente, activar la cuenta y pulsar «Leer».

La consulta es `GET graph.facebook.com/v23.0/{INSTAGRAM_USUARIO_ID}?fields=business_discovery.username(<usuario>){media.limit(8){…}}`. Se hace una por cuenta y por hora; el límite de la API es de 200 por hora.

### Almacenamiento y seguridad

- **Tablas.** `noticias.pulso_cuenta` guarda la cuenta, el método, el usuario, si está activa y el último éxito o error. `noticias.pulso_publicacion` guarda el id externo (único por cuenta), la URL, el título, el texto, la imagen y la fecha.
- **Imágenes guardadas en la base.** Las URL de Instagram caducan, así que la imagen se descarga una vez y se guarda en la base. Solo se aceptan jpeg, png, webp o gif de hasta 3 MB. Cada cuenta conserva la imagen de sus 10 publicaciones más recientes, y las publicaciones se borran a los 180 días.
- **Cómo se sirven.** `GET /api/publico/pulso/imagen/{id}` es público; es la misma imagen que ya publicó el ente. Se sirve con caché de 24 h, `Content-Security-Policy: default-src 'none'` y `Cross-Origin-Resource-Policy: same-origin`.
- **Texto.** Se trata como no confiable: sin HTML y recortado. Los enlaces deben ser del dominio de la cuenta (instagram.com o el sitio del ente).
- **Token.** Solo vive en el `.env`, y los mensajes de error de la API se guardan sin él.
- **Descargas.** Usan las raíces de Node más `config/ca`, porque el BCV no envía su certificado intermedio.

### Lectura

`noticias-programador` lee cada hora el noticiero y después el Pulso. A mano:
- `node scripts/noticias-programador.ts --una-vez` lee los dos.
- `node scripts/noticias-programador.ts --una-vez --solo-pulso` lee solo el Pulso.

En el panel (Noticiero → Pulso oficial) se puede:
- leer todas las cuentas o una;
- pausar o activar una cuenta;
- cambiar el usuario de Instagram;
- ocultar publicaciones.

Todo queda en la auditoría, en la categoría «Noticiero».

## Casos de uso · «Lo que obtiene cada perfil»

Reemplaza a la sección «Hecho para quien factura, declara e integra», que eran tres fotos. Tiene pestañas a la izquierda (navegables con el teclado) y un ejemplo a la derecha. Los ejemplos se calculan con los **módulos reales** y se guardan 10 minutos en memoria (`src/modules/web/casos.ts`):

| Perfil | Ejemplo | De dónde sale |
|---|---|---|
| Comerciante | Factura de «Bodega La Esquina, C.A.» con 5 renglones | Alícuota y base legal de cada renglón: clasificador de IVA. Montos: precio de ejemplo en US$ × tasa BCV vigente. Totales: base exenta, base imponible, IVA y equivalente en US$ |
| Contador o asesor | Próximos 4 deberes de «Inversiones Caribe 2020, C.A.», contribuyente especial | Calendario tributario, con traslado por días inhábiles (COT art. 10) y aviso cuando faltan 7 días o menos |
| Desarrollador | `curl` a `POST /api/v1/iva/clasificar` y su respuesta | Respuesta real del motor, recortada |

Las empresas, los RIF (J-40123456-9 y J-30987654-6, válidos pero de ejemplo) y los precios en US$ son ficticios. Las alícuotas, la base legal, la tasa y las fechas son las reales del día.
