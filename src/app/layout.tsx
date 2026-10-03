import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { IBM_Plex_Mono, Public_Sans, Source_Serif_4 } from "next/font/google";
import { SITIO_URL } from "../core/sitio.ts";
import { RegistroServiceWorker } from "../ui/RegistroServiceWorker.tsx";
import { AvisoCookies, RegistroVisita } from "../ui/Analitica.tsx";
import { BotonContacto } from "../ui/sitio/Contacto.tsx";
import "./globals.css";

// Tipografías de la marca: se descargan al compilar y se sirven desde el propio dominio (sin llamadas a Google)
const serif = Source_Serif_4({ subsets: ["latin"], axes: ["opsz"], variable: "--font-serif", display: "swap" });
const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-mono", display: "swap" });

export const metadata: Metadata = {
  // Base de las URL absolutas. El canonical va en cada página pública: si estuviera aquí, todas las páginas lo heredarían
  metadataBase: new URL(SITIO_URL),
  title: { default: "El Renglón · Cómo tributa cada renglón", template: "%s · El Renglón" },
  description: "Ecosistema abierto de información fiscal venezolana: clasificación de IVA con su base legal, tasas oficiales del BCV, arancel de aduanas, calendario tributario y validación del RIF.",
  applicationName: "El Renglón",
  appleWebApp: { capable: true, title: "El Renglón", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  openGraph: { siteName: "El Renglón", locale: "es_VE", type: "website" },
  icons: {
    icon: [{ url: "/iconos/icono.svg", type: "image/svg+xml" }, { url: "/favicon.ico", sizes: "48x48" }],
    apple: "/iconos/apple-touch-icon.png",
  },
};

export const viewport: Viewport = { themeColor: "#0E2440", width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es-VE" className={`${serif.variable} ${sans.variable} ${mono.variable}`}>
      <body>
        {children}
        <RegistroServiceWorker />
        <RegistroVisita />
        <AvisoCookies />
        <BotonContacto />
      </body>
    </html>
  );
}
