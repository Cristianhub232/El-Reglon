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

**Estado:** documentación levantada. **Módulo Arancel:** semilla de datos lista y validada (Decreto 4.944 más las reformas 5.103, 5.147 y 5.198), con esquema PostgreSQL y carga automatizada ([docs/09](docs/09-semilla-arancel.md)). **Módulo BCV:** histórico oficial 2025–2026 cargado y validado, con función de tasa aplicable ([docs/11](docs/11-historico-tasas-bcv.md)). **Módulos Calendario y RIF:** calendario 2026 de especiales y ordinarios con validación del RIF ([docs/13](docs/13-modulo-calendario.md)). **Clasificador de IVA** (núcleo): 115 reglas que cubren todos los literales de los arts. 16, 18, 19, 61 y 64, con los textos legales verificados contra la Gaceta, el Decreto 5.196 en importaciones y 116 casos de referencia ([docs/16](docs/16-clasificador-iva.md)). El catálogo está pendiente de validación por el asesor. **Detección arancelaria:** un diccionario de 568 nombres comerciales lleva a la partida y la búsqueda de texto en español afina la subpartida, con 41 casos de referencia ([docs/17](docs/17-deteccion-arancelaria.md)).
**Plataforma:** Next.js 16 + PostgreSQL 16, desplegable con Docker Compose; en producción en **https://elrenglonve.org**, con Metabase en `metabase.elrenglonve.org` ([docs/19](docs/19-despliegue-produccion.md)). **API en servicio:** IVA, BCV, Arancel (consulta y detección), Calendario, RIF, Noticias y Comparador de precios, con API key y Swagger en `/docs` ([docs/15](docs/15-plataforma.md)). **Interfaz (PWA):** los diseños de `resources/` implementados: landing con datos reales y herramientas sin registro, inicio de sesión con verificación en dos pasos y panel de administración con 8 secciones por rol, todo auditado ([docs/18](docs/18-interfaz-pwa-panel.md)). 87 pruebas de extremo a extremo. **Noticiero:** titulares de 10 medios venezolanos cada hora ([docs/20](docs/20-noticiero.md)); **El día en cifras** y casos de uso en la portada ([docs/21](docs/21-dia-en-cifras-y-casos.md)); **comparador de precios** entre tiendas ([docs/22](docs/22-comparador.md)).

```bash
cp .env.example .env                               # cambie la contraseña y genere APP_SECRETO: openssl rand -hex 32
docker compose up -d db && herramientas/instalar_bd.sh
docker compose --profile app up -d --build         # http://127.0.0.1:3000  (panel en /admin, Swagger en /docs)
node scripts/usuario.ts crear --correo usted@empresa.com.ve --nombre "Su nombre" --rol super   # primer administrador
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
16. [Clasificador de IVA](docs/16-clasificador-iva.md): catálogo de reglas, motor, validaciones del cargador (texto legal contra la Gaceta, cobertura de la ley, casos de referencia) y API.
17. [Detección arancelaria](docs/17-deteccion-arancelaria.md): diccionario de nombres comerciales, afinado por texto dentro de la partida, respaldo por texto, validaciones y API.
18. [Interfaz, PWA y panel](docs/18-interfaz-pwa-panel.md): identidad de marca, PWA, sitio público, acceso con verificación en dos pasos, panel por roles y cómo las ediciones del panel vuelven a los archivos del repositorio.
19. [Despliegue en producción](docs/19-despliegue-produccion.md): servidor, Caddy con TLS, dominio elrenglonve.org, Metabase con conexión de solo lectura y actualización.
20. [Noticiero](docs/20-noticiero.md): titulares de 10 medios venezolanos leídos cada hora (RSS, WordPress y WorldNewsAPI), portada, `/noticias`, API y moderación en el panel.
21. [El día en cifras y casos de uso](docs/21-dia-en-cifras-y-casos.md): carrusel del hero con datos propios (vencimientos, días inhábiles, monedas del BCV, moneda de mayor valor, dato del catálogo de IVA y actividad) y ejemplos por perfil calculados con los módulos reales.
22. [Comparador de precios](docs/22-comparador.md): «¿Dónde está más barato?» en vivo en tiendas venezolanas en línea, un servicio por tienda bajo PM2, emparejamiento por código de barras y precios en Bs. y US$.
23. [Analítica y privacidad](docs/23-analitica.md): visitas con cookie propia, RIF consultados, aviso de cookies, página de privacidad y conservación de 12 meses.
24. [Avisos push](docs/24-avisos.md): campana en la cabecera; tasa BCV al publicarse, noticias 3 veces al día, deberes por RIF 3 días antes y el día, y novedades desde el panel.
- [Diseños](resources/): identidad de marca, logo, landing, inicio de sesión y panel (se abren en el navegador).

> Resultado orientativo: cuando hay varias opciones, la selección corresponde al usuario bajo su responsabilidad y análisis. Las reglas deben ser validadas por un asesor tributario.
