# 21 · El día en cifras y casos de uso (portada)

## El día en cifras

El carrusel del inicio de la portada ocupa el lugar de la antigua foto del comerciante; el conversor BCV queda encima. Tiene **tarjetas con datos propios**, sin fuentes externas, así que nunca queda vacío ni roto. Si por algún motivo no hubiera ninguna tarjeta, vuelve a mostrarse la foto.

| Tarjeta | Qué muestra | De dónde sale |
|---|---|---|
| Esta semana vence / Próximo vencimiento | Fecha y cuenta regresiva de la próxima declaración de IVA de los contribuyentes especiales, con sus terminales de RIF y el período | `calendario.vencimiento` (Providencia SNAT/2025/000091), con los traslados del COT art. 10 |
| Próximo día inhábil | Fecha, motivo y efecto: los vencimientos se trasladan al día hábil siguiente | `calendario.dia_inhabil` |
| Otras monedas del BCV | Yuan, lira turca y rublo con su variación. El dólar y el euro ya están en el panel de tasas de al lado | `bcv.tasa` |
| Moneda de mayor valor | La moneda y su tasa, base de las multas del COT (arts. 91 y 92) | `bcv.moneda_mayor_valor()` |
| ¿Sabías que…? | Una regla del catálogo de IVA con su alícuota, su base legal y el texto de la norma. Es la misma para todos durante el día y cambia cada día | `iva.regla`, `iva.opcion_regla` e `iva.base_legal`; solo reglas con una sola opción que no son zona gris |
| Actividad de El Renglón | Consultas de hoy y de los últimos 7 días por módulo | `core.uso_diario`: solo totales. Nunca se muestra lo que escribió cada usuario |

- **Movimiento.** El carrusel avanza solo cada 8 s. Se detiene con el cursor o el foco dentro, no se mueve si el usuario pidió reducir el movimiento y se maneja con las flechas del teclado.
- **Código.** Los datos están en `src/modules/web/cifras.ts` y la vista en `src/ui/sitio/DiaEnCifras.tsx`.

Antes, este lugar lo ocupaba el «Pulso oficial», con las publicaciones del SENIAT, el BCV y el SAREN leídas de Instagram (API de Meta) y de sus sitios web. Se retiró el mismo 30/09/2026 para simplificar: dependía de un token de Meta y de sitios poco estables. `db/noticias/002_pulso.sql` borra sus tablas si llegaron a crearse.

## Casos de uso · «Lo que obtiene cada perfil»

Reemplaza a la sección «Hecho para quien factura, declara e integra», que eran tres fotos. Tiene pestañas a la izquierda (navegables con el teclado) y un ejemplo a la derecha. Los ejemplos se calculan con los **módulos reales** y se guardan 10 minutos en memoria (`src/modules/web/casos.ts`):

| Perfil | Ejemplo | De dónde sale |
|---|---|---|
| Comerciante | Factura de «Bodega La Esquina, C.A.» con 5 renglones | Alícuota y base legal de cada renglón: clasificador de IVA. Montos: precio de ejemplo en US$ × tasa BCV vigente. Totales: base exenta, base imponible, IVA y equivalente en US$ |
| Contador o asesor | Próximos 4 deberes de «Inversiones Caribe 2020, C.A.», contribuyente especial | Calendario tributario, con traslado por días inhábiles (COT art. 10) y aviso cuando faltan 7 días o menos |
| Desarrollador | `curl` a `POST /api/v1/iva/clasificar` y su respuesta | Respuesta real del motor, recortada |

Las empresas, los RIF (J-40123456-9 y J-30987654-6, válidos pero de ejemplo) y los precios en US$ son ficticios. Las alícuotas, la base legal, la tasa y las fechas son las reales del día.
