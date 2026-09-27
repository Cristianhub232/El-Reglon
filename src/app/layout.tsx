import type { ReactNode } from "react";

export const metadata = {
  title: "El Renglón",
  description: "Ecosistema abierto de información fiscal venezolana: IVA, tasas BCV, arancel, calendario tributario y RIF",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body style={{ margin: 0, fontFamily: "system-ui, -apple-system, Segoe UI, sans-serif", background: "#fafaf7", color: "#1d1d1b" }}>
        {children}
      </body>
    </html>
  );
}
