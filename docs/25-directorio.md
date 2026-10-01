# 25 · Directorio de contribuyentes

Importadores y sistemas de facturación, cargados el 01/10/2026 desde dos exportaciones:
- `Importadores.xlsx`: importadores con su CIF y su contacto;
- `proveesores SOftware.csv`: sistemas de facturación declarados por cada empresa, con su contacto.

> **Datos personales.** Incluye unos 4.900 RIF de personas naturales (V y E), con correos, teléfonos y direcciones.
> **Ni las fuentes ni la semilla van al repositorio, que es público.** `.gitignore` excluye:
> - `fuentes/privadas/`;
> - `datos/directorio/`;
> - las hojas de cálculo y CSV sueltos en la raíz.
>
> Metabase no tiene acceso al esquema `directorio`.

## Saneamiento (`herramientas/directorio/sanear_directorio.py`)

Usa solo la biblioteca estándar de Python, sin pandas ni openpyxl.

| Fuente | Filas | Resultado |
|---|---|---|
| Importadores | 15.221 | **14.862** importadores. 342 RIF aparecían varias veces con el nombre escrito distinto («ZONA TECH, C.A.» / «ZONA TECH , C.A»), cada vez con su propio CIF y el mismo contacto. Se unen: se suma el CIF y se guardan los nombres declarados distintos |
| Software | 516 | **57** sistemas de 49 empresas. La exportación repetía cada sistema una vez por cada dirección de la empresa (Farmatodo: 165 filas). Los sistemas van a `software` y las direcciones a `direccion` |

- **RIF:** `J123456789` → `J-12345678-9`. Los 14.862 tienen el dígito verificador correcto. Las 49 empresas de software también son importadoras.
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
| `directorio.software` | Sistema, versión, medios de emisión, categoría, fecha de lanzamiento, modalidad (`exclusivo` / `distribuido`) y PDF |

La carga (`002_cargar_semilla.sql`) reemplaza todo el directorio en una transacción y comprueba tres cosas:
- **V1:** los conteos coinciden con el manifiesto;
- **V2:** no hay direcciones repetidas;
- **V3:** cada contribuyente tiene su fila en la fuente de la que viene.

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
