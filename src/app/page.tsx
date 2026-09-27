const modulos = [
  { nombre: "BCV", texto: "Tasa oficial del BCV (USD, EUR y 19 monedas más) desde 2025; tasa aplicable a una operación (art. 25 Ley IVA) y conversión." },
  { nombre: "Arancel", texto: "Arancel de Aduanas vigente (Decreto 4.944 con las reformas de 2025): códigos, búsqueda, régimen legal e historial." },
  { nombre: "Calendario", texto: "Próximos deberes tributarios 2026 por RIF, para contribuyentes especiales y ordinarios, con prórrogas del COT art. 10." },
  { nombre: "RIF", texto: "Validación del RIF con dígito verificador." },
  { nombre: "IVA", texto: "Clasificación de bienes y servicios según la Ley de IVA. En construcción." },
];

export default function Inicio() {
  return (
    <main style={{ maxWidth: 760, margin: "0 auto", padding: "48px 16px" }}>
      <h1 style={{ fontSize: 36, margin: 0 }}>El Renglón</h1>
      <p style={{ fontSize: 18, color: "#55554f" }}>Ecosistema abierto de información fiscal venezolana, homologado al SENIAT.</p>
      <ul style={{ listStyle: "none", padding: 0 }}>
        {modulos.map((m) => (
          <li key={m.nombre} style={{ padding: "12px 0", borderBottom: "1px solid #e4e4dc" }}>
            <strong>{m.nombre}</strong> · {m.texto}
          </li>
        ))}
      </ul>
      <p><a href="/docs">Documentación de la API (Swagger)</a> · <a href="/api/salud">Estado del servicio</a></p>
      <p style={{ fontSize: 13, color: "#77776f" }}>Resultados orientativos: no constituyen asesoría tributaria ni aduanera.</p>
    </main>
  );
}
