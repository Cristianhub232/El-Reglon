import Swagger from "./swagger.tsx";

export const metadata = { title: "El Renglón · API", description: "Documentación de la API de El Renglón (OpenAPI/Swagger): IVA, tasas BCV, arancel, calendario tributario y RIF.", alternates: { canonical: "/docs" } };

export default function Docs() {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.20.0/swagger-ui.css" />
      <div id="swagger" />
      <Swagger />
    </>
  );
}
