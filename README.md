# El Renglón

**Ecosistema abierto de información fiscal venezolana: categorización de IVA, tasas BCV y arancel de aduanas.**

> En Venezuela, un *renglón* es cada producto que se vende ("los renglones de la cesta básica") y también cada línea de la declaración de IVA ante el SENIAT. El Renglón conecta ambos sentidos: dice cómo tributa cada producto.

## Módulos

| Módulo | Qué responde |
|---|---|
| **IVA** (núcleo) | Cómo tributa un bien o servicio: exento, 8 %, 16 % o 16 % + 15 %, con su base legal |
| **BCV** | Tasa oficial del BCV en **dólares y euros** por fecha valor, histórico y conversión |
| **Arancel** | Códigos arancelarios (Decreto 4.944) categorizados, búsqueda y **detección de la clasificación arancelaria de un producto** |
| **Calendario** | Próximos deberes por RIF y tipo de contribuyente (especial u ordinario), con base legal y período |
| **RIF** | Validación del RIF con dígito verificador |
| *Futuros* | Unidad Tributaria e IGTF. Ver [07](docs/07-ecosistema.md) §7 |

API de **consulta** protegida con **API key**, con UI y Swagger, exclusiva para el **contexto venezolano** y homologada a la terminología del **SENIAT**.

Recibe el nombre de un bien o servicio, uno o varios códigos (EAN, UPC, GTIN-14, ISBN, ISSN, PLU, código arancelario, SKU…) y la **operación** (`nacional` o `importacion`). Responde cómo tributa en IVA. En las zonas grises devuelve **varias opciones con sus condiciones**, y la decisión queda del lado del usuario.

| Categoría | Alícuota | Base legal |
|---|---|---|
| Operación exenta / exonerada / no sujeta | — | Ley IVA arts. 16–19, 66 |
| Alícuota reducida | 8 % | art. 64 |
| Alícuota general | 16 % | art. 63 |
| Alícuota general más adicional (consumo suntuario) | 16 % + 15 % = 31 % | arts. 27 y 61 |

**Estado:** documentación levantada. **Módulo Arancel:** semilla de datos lista y validada (Decreto 4.944 más las reformas 5.103, 5.147 y 5.198), con esquema PostgreSQL y carga automatizada ([docs/09](docs/09-semilla-arancel.md)). **Módulo BCV:** histórico oficial 2025–2026 cargado y validado, con función de tasa aplicable ([docs/11](docs/11-historico-tasas-bcv.md)). **Módulos Calendario y RIF:** calendario 2026 de especiales y ordinarios con validación del RIF ([docs/13](docs/13-modulo-calendario.md)). El **clasificador de IVA** (núcleo) y la detección arancelaria están pendientes.
**Plataforma:** Next.js 16 + PostgreSQL 16, desplegable con Docker Compose. **API en servicio:** BCV, Arancel (consulta), Calendario y RIF, con API key, Swagger en `/docs` y 37 pruebas de extremo a extremo ([docs/15](docs/15-plataforma.md)).

```bash
cp .env.example .env && docker compose up -d db && herramientas/instalar_bd.sh
docker compose --profile app up -d --build        # http://127.0.0.1:3000/docs
npm run apikey -- crear --nombre "prueba" --permisos bcv,arancel,calendario,rif
```

## Documentación

0. [Premisas](docs/00-premisas.md): las 13 premisas del equipo, decisiones confirmadas y observaciones legales.
1. [Marco legal](docs/01-marco-legal.md): normas, alícuotas, bienes y servicios por artículo, zonas grises y fuentes.
2. [Alcance y requerimientos](docs/02-alcance-y-requerimientos.md): objetivo, requerimientos funcionales y no funcionales, casos de uso.
3. [Modelo, clasificación y API](docs/03-modelo-de-clasificacion.md): códigos aceptados, modelo de datos, algoritmo, contrato de API y arquitectura.
4. [Preguntas abiertas](docs/04-preguntas-abiertas.md): decisiones tomadas, pendientes y dudas para el asesor tributario.
5. [Fuentes y diccionario](docs/05-fuentes-y-diccionario.md): Arancel, Open Food Facts y sus respaldos, relación arancel → ley y reglas regex.
6. [Terminología SENIAT](docs/06-terminologia-seniat.md): glosario, códigos homologados y renglones de la Forma 30.
7. [Ecosistema](docs/07-ecosistema.md): arquitectura de los módulos IVA, BCV y Arancel como APIs propias.
8. [Análisis de Rep-Arancel](docs/analisis/08-analisis-rep-arancel.md): revisión de código y calidad de los datos semilla del repositorio de arancel.
9. [Semilla propia del Arancel](docs/09-semilla-arancel.md): extracción desde la Gaceta, reformas 2025, validaciones y carga en PostgreSQL.
10. [Análisis de tasas-bcv](docs/analisis/10-analisis-tasas-bcv.md): revisión del servicio de tasas BCV del equipo y cómo integrarlo.
11. [Histórico oficial de tasas BCV](docs/11-historico-tasas-bcv.md): 417 publicaciones (2025–2026) desde los archivos del BCV, tasa aplicable (art. 25) y carga en PostgreSQL.
12. [Análisis de calendarioapi](docs/analisis/12-analisis-calendarioapi.md): calendario SPE 2026 verificado contra la Gaceta (GO 43.283), errores encontrados y plan del módulo Calendario.
13. [Módulo Calendario tributario](docs/13-modulo-calendario.md): especiales (Providencia 000091) y ordinarios (Reglamento IVA art. 60), validación del RIF, verificaciones.
14. [Código Orgánico Tributario](docs/14-codigo-organico-tributario.md): artículos que afectan a El Renglón (plazos y días bancarios, multas en moneda de mayor valor, facturación, retraso, prescripción).
15. [Plataforma base](docs/15-plataforma.md): API, seguridad, lectura diaria del BCV, despliegue y verificación.

> Resultado orientativo: cuando hay varias opciones, la selección corresponde al usuario bajo su responsabilidad y análisis. Las reglas deben ser validadas por un asesor tributario.
