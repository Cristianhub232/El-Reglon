import Swagger from "./swagger.tsx";

export const metadata = { title: "El Renglón · API" };

export default function Docs() {
  return (
    <>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.20.0/swagger-ui.css" />
      <div id="swagger" />
      <Swagger />
    </>
  );
}
