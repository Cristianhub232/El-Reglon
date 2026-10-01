// PM2: un proceso por tienda del comparador (docs/22). En Docker lo ejecuta pm2-runtime (servicio "comparador");
// fuera de Docker: npx pm2 start comparador/ecosystem.config.cjs. Las tiendas salen de datos/comparador/tiendas.json.
const { tiendas } = require("../datos/comparador/tiendas.json");

module.exports = {
  apps: tiendas.map((t) => ({
    name: `comparador-${t.id}`,
    // node como binario (Node ejecuta TypeScript directamente), sin el cargador de módulos de PM2
    script: "node",
    args: `scripts/comparador-tienda.ts --tienda=${t.id}`,
    interpreter: "none",
    cwd: `${__dirname}/..`,
    max_memory_restart: "200M",
    exp_backoff_restart_delay: 1000,     // si se cae, reintenta con espera creciente
    time: true,
  })),
};
