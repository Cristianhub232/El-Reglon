// Mini gráfica de la tasa de los últimos 7 días (resources/Landing v2: se dibuja la línea, aparece el área y luego el punto)
import s from "./portada.module.css";

export function Grafica({ valores, color, id, retraso = 0 }: { valores: number[]; color: string; id: string; retraso?: number }) {
  const W = 140, H = 44;
  if (valores.length < 2) return null;
  const mn = Math.min(...valores), mx = Math.max(...valores);
  const pts = valores.map((y, i) => [4 + (i * (W - 10)) / (valores.length - 1), 6 + (1 - (y - mn) / (mx - mn || 1)) * (H - 14)]);
  const linea = pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" ");
  const ult = pts[pts.length - 1];
  const area = `M${pts[0][0]},${H} L${linea.split(" ").join(" L")} L${ult[0]},${H} Z`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={s.grafica} aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity={0.18} />
          <stop offset="1" stopColor={color} stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={area} fill={`url(#${id})`} className={s.graficaArea} style={{ animationDelay: `${retraso + 900}ms` }} />
      <polyline points={linea} pathLength={1} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round"
        className={s.graficaLinea} style={{ animationDelay: `${retraso}ms` }} />
      <circle cx={ult[0]} cy={ult[1]} r={3.5} fill={color} stroke="#FFFFFF" strokeWidth={1.5} className={s.graficaPunto}
        style={{ animationDelay: `${retraso + 1000}ms` }} />
    </svg>
  );
}
