// Logo de El Renglón (resources/Logo.dc.html): la R métrica con la regla en el asta y el trazo tricolor.
// Oficial: horizontal "claro" en toda la aplicación; "oscuro" para cabeceras oscuras; "mono" para impresión.
import type { CSSProperties } from "react";

type Tipo = "horizontal" | "simbolo" | "vertical";
type Variante = "claro" | "oscuro" | "tinta" | "mono";

const V: Record<Variante, { ink: string; y: string; b: string; r: string; knock: string; sub: string; yo: number; bo: number; ro: number }> = {
  claro: { ink: "#3D3F45", y: "#F2B632", b: "#1F4E8C", r: "#B8352B", knock: "#F6F3EA", sub: "#3D3F45", yo: 1, bo: 1, ro: 1 },
  oscuro: { ink: "#D9A93F", y: "#F2B632", b: "#4A7FD0", r: "#D9453A", knock: "#0E2440", sub: "#C9D2DF", yo: 1, bo: 1, ro: 1 },
  tinta: { ink: "#0E2440", y: "#F2B632", b: "#1F4E8C", r: "#B8352B", knock: "#FFFFFF", sub: "#3A4250", yo: 1, bo: 1, ro: 1 },
  mono: { ink: "#0E2440", y: "#0E2440", b: "#0E2440", r: "#0E2440", knock: "#FFFFFF", sub: "#0E2440", yo: 1, bo: 0.6, ro: 0.32 },
};

const R_ASTA = "M6 20 H66 C92 20 104 34 104 50 C104 67 91 78 66 78 H40 V99 H52 V106 H6 V99 H18 V27 H6 Z M40 29 V69 H63 C77 69 84 62 84 50 C84 38 78 29 63 29 Z M60 74 H82 L108 99 H116 V106 H86 L58 78 Z";
const REGLA = "M18 31h10M18 35h6M18 39h6M18 43h6M18 47h10M18 51h6M18 55h6M18 59h6M18 63h10M18 67h6M18 71h6M18 75h6M18 79h10M18 83h6M18 87h6M18 91h6M18 95h10";
const SLOGAN = "ECOSISTEMA ABIERTO DE INFORMACIÓN FISCAL VENEZOLANA";
const SERIF = "var(--font-serif), 'Source Serif 4', Georgia, serif";
const SANS = "var(--font-sans), 'Public Sans', system-ui, sans-serif";

interface Props {
  tipo?: Tipo; variante?: Variante; pincel?: boolean; slogan?: boolean; badge?: boolean; radio?: number;
  fondo?: string; className?: string; style?: CSSProperties; titulo?: string;
}

export function Logo({ tipo = "horizontal", variante = "claro", pincel = true, slogan = false, badge = false, radio = 40,
  fondo, className, style, titulo = "El Renglón" }: Props) {
  const c = { ...V[variante] };
  if (fondo) c.knock = fondo;
  const a11y = { role: "img", "aria-label": titulo };
  const svgStyle: CSSProperties = { display: "block", width: "100%", height: "100%", ...style };

  // La R con la regla, común a los tres tipos
  const letra = (
    <>
      <path fillRule="evenodd" fill={c.ink} d={R_ASTA} />
      <path d={REGLA} stroke={c.knock} strokeWidth={1.4} />
    </>
  );
  const pincelCorto = (
    <g>
      <path d="M74 70 C 96 58, 108 42, 132 30" fill="none" stroke={c.y} strokeWidth={10} opacity={c.yo} />
      <path d="M76 78 C 98 66, 110 50, 134 37" fill="none" stroke={c.b} strokeWidth={7} opacity={c.bo} />
      <path d="M78 86 C 100 74, 112 58, 136 44" fill="none" stroke={c.r} strokeWidth={7} opacity={c.ro} />
      <g transform="translate(135 37) rotate(-40)">
        <rect x="0" y="-11" width="12" height="22" rx="2" fill={c.ink} />
        <rect x="3.5" y="-11" width="2" height="22" fill={c.knock} />
        <path d="M12 -10 C 26 -17, 38 -24, 50 -34 C 47 -12, 32 7, 12 10 Z" fill={c.ink} />
      </g>
    </g>
  );
  const gota = <path d="M-2 90 C 8 104, 48 104, 76 84 C 50 98, 12 100, -2 90 Z" fill={c.y} opacity={c.yo} />;

  if (tipo === "simbolo") {
    return (
      <svg viewBox="-10 -47 200 200" preserveAspectRatio="xMidYMid meet" className={className} style={svgStyle} {...a11y}>
        {badge && <rect x="-10" y="-47" width="200" height="200" rx={radio} fill={c.knock} />}
        <g>
          {gota}
          {pincel ? pincelCorto : (
            <g>
              <rect x="112" y="78" width="66" height="7" rx="3.5" fill={c.y} opacity={c.yo} />
              <rect x="112" y="89" width="50" height="7" rx="3.5" fill={c.b} opacity={c.bo} />
              <rect x="112" y="100" width="34" height="6" rx="3" fill={c.r} opacity={c.ro} />
            </g>
          )}
          {letra}
        </g>
      </svg>
    );
  }

  if (tipo === "vertical") {
    return (
      <svg viewBox="0 0 400 262" preserveAspectRatio="xMidYMid meet" className={className} style={svgStyle} {...a11y}>
        <g transform="translate(112 26)">{gota}{pincelCorto}{letra}</g>
        <text x="200" y="204" textAnchor="middle" style={{ fontFamily: SERIF }} fontWeight={700} fontSize={56} fill={c.ink}>El Renglón</text>
        {slogan && (
          <text x="200" y="238" textAnchor="middle" textLength={330} lengthAdjust="spacing" style={{ fontFamily: SANS }} fontWeight={600} fontSize={11} fill={c.sub}>{SLOGAN}</text>
        )}
      </svg>
    );
  }

  const vb = slogan ? (pincel ? "-4 -52 474 208" : "-4 12 474 150") : (pincel ? "-4 -52 474 166" : "-4 12 474 124");
  return (
    <svg viewBox={vb} preserveAspectRatio="xMidYMid meet" className={className} style={svgStyle} {...a11y}>
      {pincel ? (
        <g>
          {gota}
          <path d="M74 70 C 110 50, 140 12, 196 14 C 246 16, 266 30, 318 12" fill="none" stroke={c.y} strokeWidth={10} opacity={c.yo} />
          <path d="M150 22 C 172 6, 204 2, 236 7" fill="none" stroke={c.y} strokeWidth={2} strokeLinecap="round" opacity={c.yo} />
          <path d="M76 78 C 112 58, 142 20, 198 22 C 248 24, 268 38, 320 18" fill="none" stroke={c.b} strokeWidth={7} opacity={c.bo} />
          <path d="M78 86 C 114 66, 144 28, 200 30 C 250 32, 270 46, 322 24" fill="none" stroke={c.r} strokeWidth={7} opacity={c.ro} />
          <g transform="translate(322 18) rotate(-34)">
            <rect x="0" y="-11" width="14" height="22" rx="2" fill={c.ink} />
            <rect x="4" y="-11" width="2" height="22" fill={c.knock} />
            <path d="M14 -10 C 30 -18, 46 -26, 60 -38 C 56 -14, 38 8, 14 10 Z" fill={c.ink} />
          </g>
        </g>
      ) : (
        <g>
          <rect x="130" y="114" width="334" height="4" rx="2" fill={c.y} opacity={c.yo} />
          <rect x="130" y="121" width="260" height="4" rx="2" fill={c.b} opacity={c.bo} />
          <rect x="130" y="128" width="178" height="4" rx="2" fill={c.r} opacity={c.ro} />
        </g>
      )}
      {letra}
      <text x="130" y="106" textLength={334} lengthAdjust="spacing" style={{ fontFamily: SERIF }} fontWeight={700} fontSize={70} fill={c.ink}>El Renglón</text>
      {slogan && (
        <text x="130" y={pincel ? 142 : 154} textLength={334} lengthAdjust="spacing" style={{ fontFamily: SANS }} fontWeight={600} fontSize={11} fill={c.sub}>{SLOGAN}</text>
      )}
    </svg>
  );
}
