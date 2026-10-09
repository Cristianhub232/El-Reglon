// Tasa de mercado USDT/VES (Binance P2P vía CriptoYa): referencia NO oficial, con la brecha frente a la tasa BCV (docs/28)
import { ErrorApi } from "../../../../../core/http.ts";
import { endpoint } from "../../../../../core/ruta.ts";
import { tasaP2PActual } from "../../../../../modules/mercado/p2p.ts";

export const dynamic = "force-dynamic";
export const GET = endpoint("bcv", async () => {
  const t = await tasaP2PActual();
  if (!t) throw new ErrorApi(503, "sin_datos", "No hay una lectura de la tasa de mercado en las últimas 24 horas");
  return { ...t, oficial: false, fuente: "Binance P2P vía CriptoYa (criptoya.com)",
    nota: "Referencia de mercado no oficial. La tasa aplicable a efectos tributarios es la del BCV (art. 25 de la Ley de IVA)." };
});
