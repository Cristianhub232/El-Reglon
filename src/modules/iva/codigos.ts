// Detección del tipo de código de un producto (docs/03 §2): GTIN (EAN-8, UPC-A, EAN-13, GTIN-14), ISBN, ISSN,
// peso variable o uso interno (prefijos 20–29), PLU y, si nada coincide, SKU.
export type TipoCodigo = "EAN-8" | "UPC-A" | "EAN-13" | "GTIN-14" | "ISBN-13" | "ISBN-10" | "ISSN" | "USO_INTERNO" | "PLU" | "SKU";

export interface CodigoDetectado {
  codigo: string;           // normalizado (sin espacios ni guiones)
  tipo: TipoCodigo;
  digito_verificador: boolean | null;   // null: el tipo no lleva dígito verificador
  consultable: boolean;     // se puede buscar en bases públicas de productos (Open Food Facts)
  nota?: string;
}

export function digitoGtinValido(d: string): boolean {
  let suma = 0;
  for (let i = d.length - 2, peso = 3; i >= 0; i--, peso = peso === 3 ? 1 : 3) suma += Number(d[i]) * peso;
  return (10 - (suma % 10)) % 10 === Number(d[d.length - 1]);
}

function isbn10Valido(d: string): boolean {
  let suma = 0;
  for (let i = 0; i < 10; i++) suma += (d[i] === "X" ? 10 : Number(d[i])) * (10 - i);
  return suma % 11 === 0;
}

function issnValido(d: string): boolean {
  let suma = 0;
  for (let i = 0; i < 7; i++) suma += Number(d[i]) * (8 - i);
  const dv = (11 - (suma % 11)) % 11;
  return (dv === 10 ? "X" : String(dv)) === d[7];
}

export function detectarCodigo(entrada: string): CodigoDetectado {
  const bruto = entrada.trim().toUpperCase();
  const c = bruto.replace(/[\s-]/g, "");
  if (/^\d{4}-?\d{3}[\dX]$/.test(bruto) && bruto.includes("-") && issnValido(c)) {
    return { codigo: c, tipo: "ISSN", digito_verificador: true, consultable: false };
  }
  // ISBN-10 solo con guiones o terminado en X: diez dígitos sueltos suelen ser un SKU (1 de cada 11 pasaría el dígito)
  if (/^\d{9}[\dX]$/.test(c) && (bruto.includes("-") || c.endsWith("X")) && isbn10Valido(c)) return { codigo: c, tipo: "ISBN-10", digito_verificador: true, consultable: false };
  if (/^\d+$/.test(c)) {
    const n = c.length;
    if (n === 4 || (n === 5 && c[0] === "9")) {
      return { codigo: c, tipo: "PLU", digito_verificador: null, consultable: false,
        nota: "Código PLU de frutas y verduras a granel (IFPS); no identifica el producto por sí solo: envíe también el nombre" };
    }
    if (n === 8 || n === 12 || n === 13 || n === 14) {
      const ok = digitoGtinValido(c);
      if (n === 13 && /^97[89]/.test(c)) return { codigo: c, tipo: "ISBN-13", digito_verificador: ok, consultable: false };
      if (n === 13 && c.startsWith("977")) return { codigo: c, tipo: "ISSN", digito_verificador: ok, consultable: false };
      if (n === 13 && /^2\d/.test(c)) {
        return { codigo: c, tipo: "USO_INTERNO", digito_verificador: ok, consultable: false,
          nota: "Prefijo GS1 20–29: peso variable o código interno de la tienda; no identifica el producto fuera de ella" };
      }
      const tipo: TipoCodigo = n === 8 ? "EAN-8" : n === 12 ? "UPC-A" : n === 13 ? "EAN-13" : "GTIN-14";
      return { codigo: c, tipo, digito_verificador: ok, consultable: ok,
        ...(ok ? {} : { nota: "El dígito verificador no coincide: el código puede estar mal transcrito" }) };
    }
  }
  return { codigo: c, tipo: "SKU", digito_verificador: null, consultable: false,
    nota: "Código propio del comercio: no identifica el producto fuera de él; la clasificación se hace por el nombre" };
}
