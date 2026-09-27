# 05 · Fuentes de datos y diseño del diccionario

> Premisas 8 y 9: primero un diccionario basado en **códigos arancelarios**, después uno de **productos básicos**, y **APIs libres** para identificar productos por código de barras.

## 1. Fuentes de datos

| Fuente | Qué aporta | Formato / acceso | Notas |
|---|---|---|---|
| **Módulo Arancel (propio, [07](07-ecosistema.md))** | Nomenclatura vigente con AEC, Ex-AEC, régimen, unidad y ruta jerárquica | `arancel.subpartida` y `arancel.v_subpartida_ruta`: semilla propia ([09](09-semilla-arancel.md)) | **Fuente preferente** del diccionario arancelario |
| **Módulo BCV (propio, [07](07-ecosistema.md))** | Tasa oficial por fecha valor e histórico | `bcv.tasa`, con ingesta diaria | Umbrales y montos |
| **Arancel de Aduanas**, Decreto N° 4.944 (GO Ext. 6.804, 24/04/2024, vigente desde el 25/05/2024) y sus reformas de 2025 (p. ej. Decreto N° 5.122, GO 43.111) | Códigos de **10 dígitos** con su descripción, basados en el Sistema Armonizado y NANDINA | PDF de la Gaceta en `fuentes/arancel/`. ✅ Extraído a CSV y cargado ([09](09-semilla-arancel.md)) | Base del diccionario arancelario |
| **Ley de IVA** (GO Ext. 6.507) | Literales de los arts. 18, 61 y 64 | Transcrito en [01](01-marco-legal.md) | Tabla `base_legal` |
| **Decreto 5.196**, Apéndice I | Códigos arancelarios con exoneración (COMEX) en importación | PDF de la GO Ext. 6.952 | Solo para `operacion=importacion` |
| **Decreto 5.197** | 1.351 códigos arancelarios con 90 % de IVA de importación exonerado | PDF de la GO Ext. 6.952 | Solo para `operacion=importacion` |
| **Open Food Facts** (alimentos) | Nombre, marca, cantidad y **categorías normalizadas** (`categories_tags`) por código de barras | API v2 `GET https://world.openfoodfacts.org/api/v2/product/{codigo}.json` y volcados diarios CSV/JSONL | Ver §3 |
| **Open Beauty Facts / Open Products Facts / Open Pet Food Facts** | Lo mismo para cosméticos, productos generales y alimento para mascotas | Misma API en otros dominios | Proyectos experimentales, con menos cobertura |
| **UPCitemdb (plan gratuito)**: segunda opción | Nombre, marca y categoría de productos generales (electrónica, hogar, ropa…) | `GET https://api.upcitemdb.com/prod/trial/lookup?upc={codigo}`, **sin key** | **100 consultas por día y 6 por minuto por IP**. Solo como respaldo |
| **Open Library** | Datos de libros por **ISBN** | `GET https://openlibrary.org/isbn/{isbn}.json`, sin key | Confirma que es un libro (18.6). Pide User-Agent descriptivo y caché |
| **Ley de IVA, art. 19 y arts. 16, 61.2 y 64** | Catálogo de **servicios** | Transcrito en [01](01-marco-legal.md) §6 | Tabla `regla` con `tipo = SERVICIO` |
| **Tabla PLU (IFPS)** | Códigos de 4 o 5 dígitos de frutas y verduras | Lista pública de la IFPS (ifpsglobal.com) | Tabla `plu` → EXENTO 18.1.a |

### Orden de consulta por código de barras

```
1. producto_cache (local)            → si está, se usa y no se consulta a nadie
2. ISBN/ISSN → Open Library          (solo libros; aunque no responda, el prefijo 978/979/977 ya basta)
3. Open Food Facts                   (15 consultas por minuto por IP)
4. Open Beauty / Products / Pet Food Facts
5. UPCitemdb, plan gratuito          (100 por día; si se agota la cuota, se omite sin error)
6. Sin resultado → se clasifica solo con el nombre enviado, con advertencia "código no identificado"
```

Cada resultado externo se guarda en `producto_cache`, para que la próxima consulta del mismo código no dependa de terceros.

## 2. Diccionario arancelario (primera etapa)

Se relaciona un **prefijo** arancelario (capítulo, partida o subpartida) con una **regla**. Siempre gana el prefijo más largo. Hay casos donde el código arancelario **no basta** (p. ej. el 1604.14 cubre el atún en agua y en aceite). En esos casos la regla queda marcada como `zona_gris` o exige atributos, y el nombre del producto termina de decidir.

**Borrador inicial**, que el asesor debe validar contra el texto del Decreto 4.944:

| Prefijo SA | Descripción (resumen) | Regla sugerida | Base | Comentario |
|---|---|---|---|---|
| 0102, 0103 | Bovinos y porcinos vivos | EXENTO | 18.1.r / 18.1.s | Solo si son para matadero o cría |
| 0104 | Ovinos y caprinos vivos | ALICUOTA_REDUCIDA | 64.1.a / 64.1.b | |
| 0105 | Aves de corral vivas | EXENTO | 18.1.b | |
| 0201, 0202, 0203 | Carne bovina y porcina fresca o congelada | EXENTO | 18.1.o | |
| 0204, 0205, 0208 | Carne ovina, caprina, equina y otras | ALICUOTA_REDUCIDA | 64.1.c | |
| 0207 | Carne de aves | EXENTO (pollo) / ALICUOTA_REDUCIDA (pavo, pato) | 18.1.o / 64.1.c | El nombre decide |
| 0210 | Carnes saladas o ahumadas | ZONA GRIS | 18.1.o / 64.1.c | Las ahumadas pasarían a 16 % |
| 03 | Pescados y mariscos | ZONA GRIS | ¿64.1.c? | Pregunta B5 para el asesor |
| 0401 | Leche líquida | EXENTO | 18.1.m | |
| 0402 | Leche en polvo o concentrada | EXENTO / ZONA GRIS | 18.1.m | ¿Leche condensada? |
| 0403 | Yogur y leches fermentadas | ALICUOTA_GENERAL (zona gris) | — | No aparecen en el 18.1.m |
| 0405 | Mantequilla | EXENTO | 18.1.ñ | |
| 0406 | Quesos | EXENTO solo el queso blanco; el resto ALICUOTA_GENERAL | 18.1.n | El nombre decide |
| 0407 | Huevos | EXENTO | 18.1.b / 18.1.f | |
| 0701–0709, 0714 | Hortalizas y tubérculos frescos | EXENTO | 18.1.a | Estado natural |
| 0710–0712 | Hortalizas congeladas, conservadas o secas | ZONA GRIS | 18.1.a | Pregunta B1 |
| 0713 | Legumbres secas (caraotas, lentejas) | EXENTO (a confirmar) | 18.1.a | |
| 0801–0810 | Frutas frescas | EXENTO | 18.1.a | |
| 0901 | Café | EXENTO | 18.1.i | ¿Café soluble (2101)? No entra |
| 1001–1008 | Cereales (arroz 1006, maíz 1005, avena 1004, sorgo 1007) | EXENTO | 18.1.a / c / q, 18.7, 18.11 | |
| 1101–1104 | Harinas, sémolas, copos de avena | EXENTO | 18.1.d / 18.1.q | |
| 1201 | Soya | EXENTO | 18.11 | |
| 1507–1515 (excepto 1509, 1510) | Aceites vegetales comestibles | EXENTO | 18.1.t | |
| 1509, 1510 | Aceite de oliva | ALICUOTA_GENERAL | 18.1.t (excepción) | |
| 1517 | Margarina | EXENTO | 18.1.ñ | |
| 1601 | Embutidos | EXENTO solo la mortadela; el resto ALICUOTA_GENERAL | 18.1.j | El nombre decide |
| 1604.13 | Sardinas en conserva | EXENTO si el envase es cilíndrico y ≤ 170 g | 18.1.l | Requiere atributos |
| 1604.14 | Atún en conserva | EXENTO si es "al natural" | 18.1.k | Pregunta B3 |
| 1604.31, 1604.32 | Caviar y sucedáneos | ALICUOTA_GENERAL_MAS_ADICIONAL | 61.1.l | |
| 1701 | Azúcar y papelón (panela) | EXENTO, salvo uso industrial | 18.1.h | |
| 1902 | Pastas alimenticias | EXENTO | 18.1.e | ¿Pastas rellenas? |
| 1905 | Pan, galletas, tortas | ZONA GRIS | 18.1.e | Pregunta B2 |
| 2103.90 (subpartida de la mayonesa) | Salsas | EXENTO solo la mayonesa | 18.1.p | El nombre decide |
| 2501 | Sal | EXENTO | 18.1.g | |
| 2710 | Combustibles | EXONERADO (Decreto 5.207, con vigencia) | Decreto | |
| 30 (3002, 3003, 3004) | Vacunas y medicamentos | EXENTO | 18.3 | ¿Suplementos? Pregunta B7 |
| 31 | Fertilizantes | EXENTO | 18.2 | |
| 3808 | Agroquímicos (plaguicidas) | EXENTO | 18.3 | ¿Los de uso doméstico? |
| 4203, 4303 | Prendas de cuero o peletería | ALICUOTA_GENERAL_MAS_ADICIONAL si ≥ US$ 10.000 | 61.1.j | Umbral |
| 4901, 4902 | Libros, folletos, diarios y revistas | EXENTO | 18.5 / 18.6 | |
| 7113, 7114, 7116 | Joyería | ALICUOTA_GENERAL_MAS_ADICIONAL si ≥ US$ 300 | 61.1.f | Umbral |
| 8703 | Automóviles | ALICUOTA_GENERAL_MAS_ADICIONAL si ≥ US$ 40.000 | 61.1.a | Umbral |
| 8708 | Partes y accesorios de vehículos | ZONA GRIS: repuesto 16 %; accesorio ≥ US$ 100 al 31 % | 61.1.h | |
| 8711 | Motocicletas | ALICUOTA_GENERAL_MAS_ADICIONAL si ≥ US$ 20.000 | 61.1.b | Umbral |
| 8713 | Sillas de ruedas | EXENTO | 18.4 | |
| 8802 | Aeronaves | ALICUOTA_GENERAL_MAS_ADICIONAL (uso particular o recreativo) | 61.1.c | |
| 8903 | Yates y embarcaciones de recreo | ALICUOTA_GENERAL_MAS_ADICIONAL | 61.1.d | |
| 9021 | Prótesis y marcapasos | EXENTO | 18.4 | |
| 9101, 9102 | Relojes | ALICUOTA_GENERAL_MAS_ADICIONAL si ≥ US$ 300 | 61.1.f | Umbral |
| 93 | Armas y municiones | ALICUOTA_GENERAL_MAS_ADICIONAL | 61.1.g | Sin umbral |
| 9504.30 | Máquinas de juego con monedas o fichas | ALICUOTA_GENERAL_MAS_ADICIONAL | 61.1.e | |
| 9701–9706 | Obras de arte y antigüedades | ALICUOTA_GENERAL_MAS_ADICIONAL si ≥ US$ 40.000 | 61.1.i | Umbral |
| *(resto)* | — | ALICUOTA_GENERAL | Art. 63 | Por defecto, con confianza media |

## 3. Diccionario de productos básicos por nombre (segunda etapa)

Cada regla combina **patrones de inclusión** y **patrones de exclusión**. Las reglas específicas tienen **más prioridad** que las genéricas. Los patrones se aplican sobre el texto **normalizado** (minúsculas y sin acentos).

| Regla | Prioridad | Incluir (regex) | Excluir (regex) | Resultado |
|---|---|---|---|---|
| Aceite de oliva | 90 | `\baceite\b.*\boliva\b` | — | ALICUOTA_GENERAL |
| Aceite comestible | 50 | `\baceite\b` | `\b(oliva\|motor\|lubricante\|bebe\|corporal\|cabello\|capilar\|esencial)\b` | EXENTO 18.1.t |
| Arroz | 50 | `\barroz\b` | `\b(con leche\|chino\|galleta\|inflado\|cereal)\b` | EXENTO 18.1.c |
| Leche | 50 | `\bleche\b` | `\b(dulce de leche\|de coco\|condensada\|chocolate con leche\|limpiadora\|corporal\|de magnesia)\b` | EXENTO 18.1.m |
| Queso blanco | 80 | `\bqueso\s+(blanco\|llanero\|duro)\b` *(confirmar sinónimos)* | — | EXENTO 18.1.n |
| Queso (otros) | 40 | `\bqueso\b` | — | ALICUOTA_GENERAL |
| Pan | 50 | `\bpan\b` (el `\b` evita "pantalón" o "panela") | `\b(dulce\|tostado\|rallado)\b` | EXENTO 18.1.e (zona gris en las exclusiones) |
| Papelón | 60 | `\b(papelon\|panela)\b` | — | EXENTO 18.1.h |
| Sardinas | 60 | `\bsardinas?\b` | — | EXENTO 18.1.l si el peso extraído es ≤ 170 g; si no, advertencia |
| Reloj | 60 | `\brelo(j\|jes)\b` | `\b(de pared\|despertador)\b` *(¿aplica?)* | Umbral US$ 300 → 16 % o 31 % |

**Por qué no basta con regex:** los nombres comerciales ("Mary", "P.A.N.", "Primor") no dicen qué es el producto. En esos casos, el **código de barras** vía Open Food Facts o una tabla de **marcas → producto** que se mantiene aparte aportan la señal que falta. Por eso el código "ayuda a que la regex no falle", como plantea la premisa 2.

## 4. Open Food Facts: condiciones de uso

- **Límites:** 15 consultas de producto por minuto por IP y 10 búsquedas por minuto por IP. Es **inviable consultarlo en cada petición** de una API pública: se necesita caché local en `producto_cache`.
- **Carga inicial recomendada:** descargar el volcado (CSV o JSONL) y filtrar los productos de Venezuela (`countries_tags` = `en:venezuela` o códigos 759…) para poblar la caché sin usar la API.
- **User-Agent obligatorio**, con el formato `NombreApp/Version (email de contacto)`.
- **Licencia ODbL:** exige atribuir a Open Food Facts, y si se redistribuye la base derivada, publicarla con la misma licencia. **Decisión (27/09/2026): Open Food Facts es viable y se incorpora.** Se mostrará la atribución en la UI y en el campo `atribucion` de las respuestas que usen sus datos.
- **Ventaja:** `categories_tags` (p. ej. `en:rices`, `en:olive-oils`, `en:sardines`) sigue una taxonomía estable, así que se puede relacionar con reglas de forma más confiable que el nombre libre.

## 5. Plan de construcción del diccionario

1. ✅ Cargar el **módulo Arancel** desde la Gaceta (Decreto 4.944 y reformas 2025), contrastado con Rep-Arancel ([09](09-semilla-arancel.md)).
2. Cargar la tabla `regla_arancel` con el borrador de §2 y validarla con el asesor.
3. Crear unas 50–100 reglas de nombre para la canasta básica y los suntuarios frecuentes (§3).
4. Relacionar las categorías de Open Food Facts más comunes en Venezuela con esas reglas.
5. Cargar la caché desde el volcado de Open Food Facts filtrado para Venezuela.
6. Revisar periódicamente las consultas pendientes (`consulta_pendiente`) para ampliar el diccionario.

## 6. Tasas BCV y arancel

Por decisión del equipo, ya no son servicios externos: son **módulos propios del ecosistema**, con sus propias APIs. El diseño completo (datos, ingesta, fecha valor, endpoints) está en [07 · Ecosistema](07-ecosistema.md).

## Fuentes

- Arancel de Aduanas, Decreto 4.944: https://www.tradex.com.ve/wp-content/uploads/Tradex-Arancel-de-Aduanas-Decreto-4.944-GOE-6.804.pdf y https://stanzione.com/actualizacion-en-el-arancel-de-aduanas-en-venezuela-a-partir-del-pasado-25-de-mayo-de-2024/
- Reforma de 2025: https://www.legis.com.ve/BancoConocimiento/N/nota_13-05-2025-n2/nota_13-05-2025-n2.asp?Miga=1&CodSeccion=25
- API de Open Food Facts: https://openfoodfacts.github.io/openfoodfacts-server/api/ y https://world.openfoodfacts.org/data
