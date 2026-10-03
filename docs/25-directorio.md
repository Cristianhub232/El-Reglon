# 25 · Directorio de contribuyentes

Importadores y sistemas de facturación, cargados el 01/10/2026 desde dos exportaciones:
- `Importadores.xlsx`: importadores con su CIF y su contacto;
- `proveesores SOftware.csv`: sistemas de facturación declarados por cada empresa, con su contacto;
- `Mejores PAgadores Terminal Deberes.csv`: monto total pagado por contribuyente y región de recaudación (77 MB). Se agregó el 03/10/2026.

> **Datos personales.** Incluye unos 4.900 RIF de personas naturales (V y E) con correos, teléfonos y direcciones, y unos
> 565.000 RIF de personas naturales con sus apellidos y el monto que pagaron.
> **Ni las fuentes ni la semilla van al repositorio, que es público.** `.gitignore` excluye:
> - `fuentes/privadas/`;
> - `datos/directorio/`;
> - las hojas de cálculo y CSV sueltos en la raíz.
>
> **Metabase:** el diseño original no le daba acceso a este esquema. En producción, por decisión del responsable (03/10/2026), `metabase_lectura` lee **todo** el directorio, incluidos correos, teléfonos y personas naturales, como el resto de los esquemas. Si Metabase se abre a otras personas, conviene restringirlo a columnas sin datos de contacto (docs/19 §4).
>
> **Uso en la prospección:** el 03/10/2026 se cargaron como prospectos los 639 contribuyentes especiales con correo (RIF J o C válido; sin entes de gobierno) desde este directorio (docs/26).

## Saneamiento (`herramientas/directorio/sanear_directorio.py`)

Usa solo la biblioteca estándar de Python, sin pandas ni openpyxl.

| Fuente | Filas | Resultado |
|---|---|---|
| Importadores | 15.221 | **14.862** importadores. 342 RIF aparecían varias veces con el nombre escrito distinto («ZONA TECH, C.A.» / «ZONA TECH , C.A»), cada vez con su propio CIF y el mismo contacto. Se unen: se suma el CIF y se guardan los nombres declarados distintos |
| Pagadores | 1.048.575 | **938.997** pagadores. Un RIF aparecía una vez por cada región donde pagó; 109.001 pagaron en dos o más (por ejemplo, Región Capital y Región de Contribuyentes Especiales). Queda una fila por RIF con el total y el desglose por región aparte. La columna «Digito Verif» se omite: es el último dígito del RIF |
| Software | 516 | **57** sistemas de 49 empresas. La exportación repetía cada sistema una vez por cada dirección de la empresa (Farmatodo: 165 filas). Los sistemas van a `software` y las direcciones a `direccion` |

- **RIF:** `J123456789` → `J-12345678-9`. Los 14.862 tienen el dígito verificador correcto. Las 49 empresas de software también son importadoras.
- **Pagadores, exportación incompleta:** trae exactamente 1.048.575 filas, el máximo de Excel y de las descargas de Metabase. Viene ordenada de mayor a menor, así que **faltan todos los pagos por debajo de Bs. 1.333,21** (el último exportado). Si un contribuyente pagó poco en alguna región, ese monto pequeño tampoco está. Para tenerla completa, hay que exportarla por partes (por ejemplo, por región o por terminal) o consultar directamente su base.
- **Pagadores, otros detalles:**
  - las regiones se normalizan («REGIÓN FALCÓN» / «REGION CAPITAL» → «Región Falcón» / «Región Capital»);
  - «INFORMACION NO DISPONIBLE» y vacío quedan como sin región;
  - 5 pagadores vienen sin nombre en la fuente;
  - 3 RIF tienen el dígito verificador incorrecto (quedan marcados con `rif_valido = false`).

  La fuente no dice la moneda ni el período del monto.
- **Sin dato:** «NO INDICA», «NO APLICA», «NO IND», «-», «.» y «0» → vacío.
- **Teléfonos:** se normalizan a `0212-1234567`. Los que no tienen 11 dígitos o son ceros («0000-0000000», «0212-0000000») se descartan: fueron 2.143.
- **Correos y web:** los correos van en minúscula y se validan. Una «web» que es un correo se descarta.
- **Direcciones:** sin repetir por RIF (misma vialidad, sector, edificación, local y teléfonos). Se unieron 450.
- **Medios de emisión:** a una lista sin repetir («Forma libre», «Imprenta digital», «Máquina fiscal»).
- **Fechas:** «febrero 27, 2026, 12:00 a. m.» → `2026-02-27`. Los montos «$184.930.383,23» → `184930383.23`.
- **PDF:** la columna «Pdf Data» (`[B@103488ef`) no es el PDF, sino el nombre de un objeto Java, y se descarta. Se conserva el nombre del archivo.

La salida va a `datos/directorio/semilla/`:
- los CSV;
- `manifiesto.json`, con los conteos y los SHA-256 de la semilla y de las fuentes;
- `informe.json`, con lo que se limpió.

## Base de datos (`db/directorio/`)

| Tabla | Contenido |
|---|---|
| `directorio.contribuyente` | RIF, razón social, correo, último período de ISLR y de IVA (AAAAMM), vencimiento del certificado, `rif_valido`, `terminal` y de qué fuentes viene |
| `directorio.direccion` | Direcciones y teléfonos; varias por RIF cuando la empresa tiene sucursales |
| `directorio.importador` | Nombres declarados, CIF total en US$ y Bs. (según la fuente) y cuántas filas se unieron |
| `directorio.pagador` | Nombre, monto total, `puesto` (1 = el que más pagó), número de regiones, `especial` (pagó en la Región de Contribuyentes Especiales), `rif_valido` y `terminal`. No está ligado a `contribuyente`: es otra fuente, sin contacto. 14.168 de los importadores también están aquí |
| `directorio.pago_region` | Desglose del monto por región de recaudación (región vacía: la fuente no la indica) |
| `directorio.software` | Sistema, versión, medios de emisión, categoría, fecha de lanzamiento, modalidad (`exclusivo` / `distribuido`) y PDF |

La carga (`002_cargar_semilla.sql`) reemplaza todo el directorio en una transacción y comprueba tres cosas:
- **V1:** los conteos coinciden con el manifiesto;
- **V2:** no hay direcciones repetidas;
- **V3:** cada contribuyente tiene su fila en la fuente de la que viene;
- **V4:** el total de cada pagador es la suma de sus regiones.

Con la exportación de pagadores, sanear toma unos 17 segundos y cargar unos 40.

## Cómo se carga

**En local:**
```bash
python3 herramientas/directorio/sanear_directorio.py      # fuentes en fuentes/privadas/directorio/
herramientas/directorio/cargar_directorio.sh               # también lo hace instalar_bd.sh si la semilla existe
```

**En producción** (los datos no llegan por GitHub):
```bash
scp -r datos/directorio/semilla usuario@servidor:/ruta/El-Reglon/datos/directorio/
# en el servidor:
herramientas/directorio/cargar_directorio.sh
```
