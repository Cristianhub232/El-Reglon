# 18 · Interfaz, PWA y panel de administración

> Implementación de los diseños de `resources/` (identidad de marca, logo, landing, inicio de sesión y panel) sobre Next.js 16. La aplicación es una **PWA** instalable.

## 1. Identidad

| Pieza | Implementación |
|---|---|
| Paleta | Tokens CSS en `src/app/globals.css`: Tinta Caracas `#0E2440`, Azul Renglón `#1F4E8C`, Amarillo Araguaney `#F2B632`, Rojo Sello `#B8352B`, Papel `#F6F3EA`, Línea `#DDD7C8`, y el código de colores de alícuotas (exento, 8 %, 16 %, 31 %, condicionado). Solo modo claro, como define la marca |
| Tipografías | Source Serif 4 (títulos), Public Sans (interfaz) e IBM Plex Mono (códigos, tasas, RIF), con `next/font`: se descargan al compilar y se sirven desde el propio dominio |
| Logo | `src/ui/Logo.tsx`, portado del SVG del diseño: tipos `horizontal`, `simbolo` y `vertical`; variantes `claro` (oficial), `oscuro`, `tinta` y `mono` |
| Voz | Términos del SENIAT, base legal citada, formato local (Bs. 1.234,56 · DD/MM/AAAA · hora de Caracas): `src/ui/formato.ts` |

## 2. PWA

- **Manifiesto** (`src/app/manifest.ts`): `standalone`, colores de la marca, accesos directos al clasificador y a la tasa del día. Los íconos (`public/iconos/`) salen del símbolo del logo; el `maskable` deja la zona segura de Android.
- **Service worker** (`public/sw.js`): nunca guarda en caché la API, el panel ni el inicio de sesión, porque son datos vivos o privados. Los recursos estáticos con versión van primero a la caché; las páginas públicas van primero a la red. Sin conexión, muestra la última copia de la página o `/sin-conexion`. Solo se registra en producción.
- **Encabezados de seguridad** (`next.config.ts`): `nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy` y el service worker sin caché.

## 3. Sitio público

| Ruta | Contenido |
|---|---|
| `/` | Landing del diseño con datos reales: tasas BCV USD y EUR con variación y gráfica de las últimas 7 publicaciones, conversor, clasificador de IVA sin registro, cifras, noticias, alícuotas vigentes, próximos días inhábiles, módulos y ejemplo de la API |
| `/solicitar-api-key` | Formulario de solicitud: queda pendiente hasta que un superadministrador la aprueba |
| `/sin-conexion` | Página sin conexión de la PWA |
| `/docs` | Swagger |

- **Noticias del día.** El diseño trae titulares de muestra. Aquí se **generan a partir de las publicaciones oficiales** (tasa del BCV, próximas declaraciones de especiales, próximo día inhábil y última reforma del arancel), con una lámina tipográfica en lugar de foto.
- **Herramientas sin registro.** Usan `POST /api/publico/iva/clasificar`: el mismo motor que la API, sin API key, con límite por IP y sin guardar precios.
- **Límite por IP.** Detrás del proxy inverso (`TRUST_PROXY=1`), la IP sale de `X-Forwarded-For`; sin proxy, todas las peticiones comparten un cupo común.

## 4. Acceso al panel

- **Roles** (del diseño): superadministrador, curador o asesor, desarrollador y solo lectura. La matriz de permisos está en `src/core/auth/roles.ts` y se muestra en "Usuarios y roles".
- **Contraseñas:** scrypt con sal. La inicial es temporal y **se exige cambiarla** al entrar. Al cambiarla se cierran las demás sesiones.
- **Verificación en dos pasos:** TOTP (RFC 6238, comprobado con los vectores del RFC) con código QR. El secreto se guarda cifrado con AES-256-GCM (clave derivada de `APP_SECRETO`). Es obligatoria para los superadministradores; el panel lo recuerda hasta que se activa.
- **Sesiones en base de datos:** el navegador guarda un token aleatorio y la base solo su SHA-256. Duran 12 h, o 30 días con "mantener la sesión". La cookie es `httpOnly`, `SameSite=Lax` y `Secure` en producción.
- **Protección contra fuerza bruta:** 10 intentos por minuto por IP. Tras 5 fallos seguidos, la cuenta se bloquea 15 minutos. Un correo inexistente responde igual y tarda lo mismo que uno existente.
- **Capas:** `src/proxy.ts` solo redirige si falta la cookie. La autorización real está en `src/core/auth/dal.ts`, en cada página y acción.
- **Primer superadministrador:** `node scripts/usuario.ts crear --correo … --nombre … --rol super` (muestra una contraseña temporal una vez). También hay `restablecer` (con `--sin-2fa`) y `desactivar`.

## 5. Panel (`/admin`)

| Sección | Qué hace |
|---|---|
| Resumen | Consultas de hoy y variación, API keys activas, consultas no determinadas (curaduría), tasa BCV, consultas por día (14, 30 o 90 días), reparto por módulo, estado de los módulos y actividad reciente. El desarrollador solo ve lo de sus API keys |
| API keys | Crear (el token se muestra una vez), revocar, uso de hoy y último uso. Atender solicitudes públicas: aprobar entrega el token para enviarlo; rechazar |
| Usuarios y roles | Lista con búsqueda, filtros (rol; activos, desactivados, bloqueados, con contraseña temporal, sin 2FA) e indicadores; alta de usuarios con contraseña temporal; matriz de permisos. Cada usuario tiene su ficha (`/admin/usuarios/[id]`): editar nombre, correo y rol (cambiar correo o rol cierra sus sesiones), restablecer la contraseña, reiniciar la 2FA, desbloquear tras intentos fallidos, ver y cerrar sus sesiones abiertas (una o todas), sus API keys, activar o desactivar y su actividad en la auditoría. Eliminar solo se permite con la cuenta desactivada y escribiendo su correo; la auditoría conserva sus acciones. Siempre queda al menos un superadministrador activo y nadie puede desactivarse, eliminarse ni quitarse el rol de superadministrador a sí mismo |
| Catálogo legal IVA | Artículos no encontrados por el clasificador (qué se consultó y desde dónde) para curaduría. Reglas por artículo, con sus opciones fiscales, base legal y renglón de la Forma 30. La **edición** exige Gaceta y motivo, y antes de guardar ejecuta los **casos de referencia** con la regla modificada. Cada regla lleva su historial de versiones |
| Arancel | Versiones del arancel, sinónimos comerciales de la detección (agregar grupos, validados con los casos de la detección), detecciones para curaduría y observaciones de la fuente |
| Calendario | Mes con días inhábiles y vencimientos. Agregar un día inhábil (p. ej. un día no laborable decretado) **recalcula las prórrogas** del COT art. 10 en la misma transacción |
| Noticiero | Estado de las 10 fuentes, lecturas horarias, «Leer ahora», pausar o reactivar una fuente y ocultar titulares ([docs/20](20-noticiero.md)). Pulso oficial: cuentas de los entes, usuario de Instagram, pausar, leer y ocultar publicaciones ([docs/21](21-pulso-oficial-y-casos.md)) |
| Mi cuenta | Editar el nombre propio, cambiar la contraseña y activar o desactivar la 2FA |
| Auditoría | Todos los eventos (sesiones, API keys, usuarios, lecturas del BCV, catálogos), con filtros, búsqueda, paginación y exportación CSV (celdas protegidas contra fórmulas) |

Además: búsqueda (reglas, RIF, códigos arancelarios, API keys), notificaciones (lecturas y discrepancias del BCV, solicitudes de API key, cargas de catálogo) y "Mi cuenta".

**Métricas de uso:** cada consulta de la API y de las herramientas públicas se cuenta por día, API key y módulo en `core.uso_diario`. Se acumulan en memoria y se escriben cada 30 s, sin IP ni contenido.

## 6. Ediciones del panel y archivos del repositorio

Los catálogos nacen de archivos versionados (`datos/…`). Lo que se edita en el panel se guarda en la base con su historial y se puede llevar de vuelta al archivo:

| Qué | Exportar | Protección al recargar |
|---|---|---|
| Reglas de IVA | `node scripts/iva-exportar-catalogo.ts` | El cargador **se niega** (V11) a pisar ediciones no exportadas; `--forzar` las descarta |
| Sinónimos del arancel | `node scripts/arancel-exportar-sinonimos.ts` | Los grupos del panel se conservan al recargar |
| Días inhábiles | se agregan a `datos/calendario/dia_inhabil_2026.csv` | Los días del panel se conservan al recargar y las prórrogas se recalculan |

## 7. Configuración (`.env`)

| Variable | Uso |
|---|---|
| `APP_SECRETO` | Obligatoria para la verificación en dos pasos (`openssl rand -hex 32`) |
| `TRUST_PROXY` | `1` detrás del proxy inverso (en el compose el puerto solo escucha en 127.0.0.1) |
| `COOKIE_SEGURA` | `1` (por defecto): cookies solo por HTTPS |
| `SOPORTE_WHATSAPP`, `SOPORTE_CORREO` | Canales de soporte del inicio de sesión (si están vacíos, no se muestran) |

## 8. Pendientes

- Envío de correos (invitaciones, API keys aprobadas, recuperación de contraseña): hoy la contraseña temporal y el token se entregan por un canal que elige el administrador.
- Notificaciones push de la PWA, por ejemplo al publicarse la tasa del BCV.
- Métricas de uso compartidas si se despliegan varias instancias (hoy cada una escribe sus propios contadores, que se suman en la base).
