// Categorías rápidas del comparador: cada botón busca su producto. Íconos de trazo (24×24, sin relleno); los de carne,
// leche, café, bebé y pastilla siguen el dibujo de Lucide (licencia ISC).
import type { ReactNode } from "react";

export interface Categoria { nombre: string; consulta: string; icono: ReactNode }

const svg = (contenido: ReactNode) => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {contenido}
  </svg>
);

export const CATEGORIAS: Categoria[] = [
  { nombre: "Celular", consulta: "celular", icono: svg(<><rect x="6" y="2" width="12" height="20" rx="2.5" /><path d="M11 18h2" /></>) },
  { nombre: "Televisor", consulta: "televisor", icono: svg(<><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></>) },
  { nombre: "Lavadora", consulta: "lavadora", icono: svg(<><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M4 7h16M8 4.5h.01M11 4.5h2" /><circle cx="12" cy="14" r="4.5" /><path d="M9.8 14.8a2.5 2.5 0 0 0 3.6.9" /></>) },
  { nombre: "Nevera", consulta: "nevera", icono: svg(<><rect x="5" y="2" width="14" height="20" rx="2" /><path d="M5 10h14M9 5v2.5M9 13v3.5" /></>) },
  { nombre: "Licuadora", consulta: "licuadora", icono: svg(<><path d="M8 3h9l-1.5 11h-6z" /><path d="M8 6H6.5a1.5 1.5 0 0 0-1.5 1.5V9a1.5 1.5 0 0 0 1.5 1.5h2" /><rect x="7" y="14" width="10" height="7" rx="1.5" /><path d="M11 17.5h2" /></>) },
  { nombre: "Carne", consulta: "carne de res", icono: svg(<><circle cx="12.5" cy="8.5" r="2.5" /><path d="M12.5 2a6.5 6.5 0 0 0-6.22 4.6c-1.1 3.13-.78 3.9-3.18 6.08A3 3 0 0 0 5 18c4 0 8.4-1.8 11.4-4.3A6.5 6.5 0 0 0 12.5 2Z" /><path d="m18.5 6 2.19 4.5a6.48 6.48 0 0 1 .31 2 6.49 6.49 0 0 1-2.6 5.2C15.4 20.2 11 22 7 22a3 3 0 0 1-2.68-1.66L2.4 16.5" /></>) },
  { nombre: "Arroz", consulta: "arroz", icono: svg(<><path d="M3 12h18a9 9 0 0 1-18 0Z" /><path d="M8 9l.8-1.6M11.5 8l.3-1.8M15 9l1-1.5M10 4.5l.4-1M13.8 5l.6-1" /></>) },
  { nombre: "Aceite", consulta: "aceite", icono: svg(<><path d="M10 2h4v3l2.5 3.5V20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2V8.5L10 5z" /><path d="M12 12c-1.2 1.5-1.7 2.3-1.7 3a1.7 1.7 0 0 0 3.4 0c0-.7-.5-1.5-1.7-3z" /></>) },
  { nombre: "Leche", consulta: "leche", icono: svg(<><path d="M8 2h8" /><path d="M9 2v2.79a4 4 0 0 1-.67 2.22l-.66.98A4 4 0 0 0 7 10.21V20a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-9.79a4 4 0 0 0-.67-2.22l-.66-.98A4 4 0 0 1 15 4.79V2" /><path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" /></>) },
  { nombre: "Café", consulta: "cafe", icono: svg(<><path d="M10 2v2M14 2v2M6 2v2" /><path d="M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1" /></>) },
  { nombre: "Pañales", consulta: "pañales", icono: svg(<><path d="M9 12h.01M15 12h.01M10 16c.5.3 1.2.5 2 .5s1.5-.2 2-.5" /><path d="M19 6.3a9 9 0 0 1 1.8 3.9 2 2 0 0 1 0 3.6 9 9 0 0 1-17.6 0 2 2 0 0 1 0-3.6A9 9 0 0 1 12 3c2 0 3.5 1.1 3.5 2.5s-.9 2.5-2 2.5c-.8 0-1.5-.4-1.5-1" /></>) },
  { nombre: "Medicinas", consulta: "acetaminofén", icono: svg(<><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></>) },
];
