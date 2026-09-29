# 17 · Detección de la clasificación arancelaria

> "Tengo este producto, ¿qué código arancelario le corresponde?". Es un fin propio del módulo Arancel, independiente del IVA ([07](07-ecosistema.md) §4). Sirve a importadores, agentes de aduanas y comercios.
> **Siempre es orientativa:** la clasificación oficial la determina la autoridad aduanera, conforme a las Reglas Generales para la Interpretación (Decreto 4.944, art. 5). Cada candidato trae su ruta jerárquica para que el usuario la verifique.

## 1. El problema

Las descripciones oficiales del arancel son técnicas y no usan los nombres de la calle:

| Se dice… | El arancel dice… |
|---|---|
| caraotas | Porotos (frijoles, fréjoles, alubias, judías) |
| celular | Teléfonos inteligentes y demás teléfonos celulares |
| arroz blanco | Arroz semiblanqueado o blanqueado |
| pollo entero | Sin trocear |
| cauchos | Neumáticos (llantas neumáticas) |

Por eso la búsqueda por texto sola falla. En las pruebas, "caraotas negras" terminó en tintas negras y "neumáticos para automóvil" en un manómetro.

## 2. Cómo detecta

1. **Código de barras** (opcional): identifica el producto en Open Food Facts, con la misma caché que el módulo IVA.
2. **Diccionario de nombres comerciales** (`datos/arancel/sinonimos.json`): 172 grupos y 568 términos llevan a **194 prefijos** (partida o subpartida).
   - Cada término se reconoce como palabra completa, con plural simple. `" ... "` admite hasta 3 palabras intermedias: `leche ... en polvo` reconoce "leche completa en polvo".
   - `excluir` descarta usos engañosos: "pasta dental" no es pasta alimenticia y "mantequilla con sal" no es sal.
   - Gana el grupo de mayor prioridad. A igual prioridad gana el que aparece antes, porque el sustantivo principal va primero ("harina pan" es harina, no pan).
3. **Afinar dentro de la partida** con búsqueda de texto en español (raíces de palabras) sobre la ruta oficial:
   - Solo cuentan las palabras que no son el nombre ya reconocido. Si no, "arroz" favorecería a "Arroz partido" solo por repetir la palabra.
   - Un **vocabulario** traduce al lenguaje oficial: blanco → blanqueado, entero → sin trocear, integral → descascarillado, presas → trozos.
   - Si el texto distingue una subpartida, esa gana (confianza 0,80). Si no, se ofrecen las subpartidas empatadas (0,55) con la **pregunta para afinar** y la **diferencia** de cada una.
4. **Respaldo por texto** en todo el arancel, cuando el diccionario no reconoce el producto (sin los capítulos 98 y 99, que son regímenes especiales):
   - Se ordena por frase exacta ("cepillo de dientes"), cobertura de palabras, palabras en el texto de la partida (lo que el producto **es**) y relevancia normalizada por longitud (prefiere las partidas específicas).
   - Se exige cubrir al menos la mitad de las palabras y que alguna esté en la partida.
   - Siempre lleva una advertencia.
5. **Estado:**
   - `determinado`: el primer candidato tiene confianza de 0,80 o más y el segundo está al menos 0,25 por debajo.
   - `condicionado`: hay varios candidatos plausibles.
   - `no_determinado`: no hay candidatos; se sugiere describir el producto por lo que es y de qué está hecho.

Cada detección se registra en `arancel.deteccion` para mejorar el diccionario, sin datos personales.

**Ejemplos verificados:**

| Descripción | Resultado |
|---|---|
| Pollo entero congelado | **0207.12.00.00** Sin trocear, congelados (determinado) |
| Teléfono celular Samsung 128 GB | **8517.13.00.00** (determinado) |
| Arroz blanco | Condicionado dentro de **1006.30** (parboilizado o no; al por menor o no) |
| Arroz integral | Condicionado dentro de **1006.20** (descascarillado) |
| Aceite vegetal | Condicionado entre soya, girasol, maíz y palma, con la nota de indicar el tipo |
| Zapatos deportivos | Condicionado entre 64.02, 64.03 y 64.04, con la nota de que depende del material |
| Paraguas plegable | **6601**, por respaldo de texto con advertencia |

## 3. Carga y validaciones

`scripts/arancel-cargar-sinonimos.ts`, en una transacción y **después del arancel**. Recrea el índice de búsqueda (`arancel.indice_busqueda`, vista materializada con la ruta ponderada: partida A, descripción propia B, resto C). Recargar el arancel también lo refresca.

| # | Qué comprueba |
|---|---|
| V1 | Grupos únicos; ningún término en dos grupos |
| V2 | Términos, exclusiones y vocabulario normalizados; prefijos de 4 a 10 dígitos; ninguna exclusión anula un término propio |
| V3 | Casos de referencia (`datos/arancel/casos_deteccion.json`): el diccionario reconoce el grupo esperado, sin base de datos |
| V4 | Cada prefijo tiene subpartidas declarables en el arancel vigente |
| V5 | Casos de referencia de la **detección completa**, ejecutados con los datos de la misma transacción, antes del COMMIT |
| V6 | Conteos cargados |

**Hallazgos al verificar los prefijos contra la descripción oficial:**

- La subpartida del detergente 3402.20 ya no existe en la nomenclatura vigente; ahora es 3402.50 más 3402.90.3.
- Los errores de lógica descritos en §2 (la palabra del nombre que favorecía a "Arroz partido" y la palabra "entero" que se perdía al afinar) los detectaron los casos de referencia.

## 4. Endpoints (permiso `arancel`)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/api/v1/arancel/detectar` | `{ descripcion?, codigo?, limite? }`: candidatos con ruta, AEC, unidad, confianza, motivo y diferencia |
| GET | `/api/v1/arancel/detectar?q=&limite=` | Versión rápida por texto |

## 5. Pendientes

- Ampliar el diccionario con los productos que más aparezcan como `no_determinado` en `arancel.deteccion` (curaduría).
- Notas legales de sección y capítulo como criterio de exclusión (p. ej. "Este capítulo no comprende…").
- Revisión del diccionario por un agente de aduanas.
