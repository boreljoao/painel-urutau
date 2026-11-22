/**
 * Capa do imóvel. Com foto, a foto. Sem foto, uma ilustração do tipo (prédio, casa, cobertura,
 * terreno, comercial) sobre um céu de cor suave: a carteira fica bonita desde o primeiro cadastro,
 * e cada imóvel tem a sua cor (sai do código, então não muda de uma visita para outra).
 */

const CEUS = [
  ["#d7e8ef", "#f2f7f5", "#9cc3d1"], // manhã na orla
  ["#f3e3cf", "#fbf5ec", "#d9b48a"], // fim de tarde
  ["#dfe8dc", "#f5f8f1", "#a7bf9f"], // serra
  ["#e4e0f0", "#f7f5fb", "#b3a9d3"], // entardecer
  ["#d9e6f5", "#f4f8fc", "#9db6d8"], // céu limpo
  ["#f0dcd6", "#fbf3f0", "#d5a597"], // terracota
];

function hash(s: string) {
  let h = 0;
  for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function Janelas({ x, y, colunas, linhas, w, h, gx, gy, acesas }: { x: number; y: number; colunas: number; linhas: number; w: number; h: number; gx: number; gy: number; acesas: number }) {
  const r = [];
  for (let l = 0; l < linhas; l++)
    for (let c = 0; c < colunas; c++) {
      const acesa = (l * 7 + c * 3 + acesas) % 5 === 0;
      r.push(<rect key={`${l}-${c}`} x={x + c * (w + gx)} y={y + l * (h + gy)} width={w} height={h} rx={1.2} fill={acesa ? "#ffe7b0" : "rgba(255,255,255,.55)"} />);
    }
  return <>{r}</>;
}

function Desenho({ tipo, tinta, semente }: { tipo: string; tinta: string; semente: number }) {
  switch (tipo) {
    case "apartamento":
      return (
        <g>
          <rect x="118" y="38" width="64" height="112" rx="3" fill={tinta} opacity=".92" />
          <rect x="182" y="70" width="40" height="80" rx="3" fill={tinta} opacity=".7" />
          <rect x="84" y="82" width="34" height="68" rx="3" fill={tinta} opacity=".55" />
          <Janelas x={126} y={48} colunas={4} linhas={8} w={9} h={7} gx={5.5} gy={5} acesas={semente} />
          <Janelas x={189} y={80} colunas={2} linhas={5} w={9} h={7} gx={6} gy={6} acesas={semente + 2} />
          <rect x="143" y="134" width="14" height="16" rx="1.5" fill="rgba(255,255,255,.75)" />
        </g>
      );
    case "cobertura":
      return (
        <g>
          <rect x="108" y="56" width="84" height="94" rx="3" fill={tinta} opacity=".92" />
          <rect x="120" y="40" width="60" height="18" rx="2" fill={tinta} opacity=".75" />
          <rect x="116" y="38" width="68" height="3" rx="1.5" fill="rgba(255,255,255,.8)" />
          <circle cx="198" cy="36" r="9" fill="#7fb07a" opacity=".85" />
          <rect x="197" y="40" width="2" height="16" fill={tinta} opacity=".6" />
          <Janelas x={117} y={66} colunas={5} linhas={6} w={9} h={7} gx={6} gy={5.5} acesas={semente} />
          <Janelas x={128} y={45} colunas={3} linhas={1} w={10} h={8} gx={7} gy={0} acesas={0} />
        </g>
      );
    case "casa":
    case "casa_condominio":
    case "chacara":
      return (
        <g>
          {tipo === "chacara" && <ellipse cx="150" cy="150" rx="140" ry="14" fill="#9cc08f" opacity=".55" />}
          <path d="M92 104 150 62l58 42" fill="none" stroke={tinta} strokeWidth="7" strokeLinejoin="round" strokeLinecap="round" />
          <rect x="102" y="100" width="96" height="50" rx="2" fill={tinta} opacity=".9" />
          <rect x="140" y="118" width="20" height="32" rx="2" fill="rgba(255,255,255,.8)" />
          <rect x="114" y="112" width="18" height="14" rx="1.5" fill="#ffe7b0" />
          <rect x="168" y="112" width="18" height="14" rx="1.5" fill="rgba(255,255,255,.6)" />
          <rect x="176" y="68" width="10" height="20" fill={tinta} opacity=".8" />
          <circle cx="226" cy="128" r="16" fill="#7fb07a" opacity=".8" />
          <circle cx="74" cy="132" r="12" fill="#7fb07a" opacity=".65" />
          {tipo === "casa_condominio" && <rect x="40" y="140" width="220" height="4" rx="2" fill={tinta} opacity=".35" />}
        </g>
      );
    case "terreno":
      return (
        <g>
          <path d="M30 150 C 90 118, 170 128, 270 112 L270 150 Z" fill="#a9c79a" opacity=".8" />
          <path d="M60 150 C 120 132, 190 138, 270 130 L270 150 Z" fill="#8db57e" opacity=".75" />
          <rect x="140" y="92" width="3" height="34" fill={tinta} />
          <rect x="143" y="92" width="34" height="20" rx="2" fill={tinta} opacity=".9" />
          <rect x="148" y="98" width="24" height="3" rx="1.5" fill="rgba(255,255,255,.85)" />
          <rect x="148" y="104" width="16" height="3" rx="1.5" fill="rgba(255,255,255,.6)" />
          <path d="M70 140 l30 -6 M210 132 l30 -4" stroke={tinta} strokeWidth="2" strokeDasharray="4 4" opacity=".5" />
        </g>
      );
    default:
      // sala, loja, galpão
      return (
        <g>
          {tipo === "galpao" ? (
            <>
              <path d="M70 150V96l80-26 80 26v54z" fill={tinta} opacity=".9" />
              <rect x="122" y="112" width="56" height="38" rx="2" fill="rgba(255,255,255,.7)" />
              <path d="M122 120h56M122 128h56M122 136h56" stroke={tinta} strokeWidth="1.5" opacity=".35" />
            </>
          ) : (
            <>
              <rect x="96" y="62" width="108" height="88" rx="3" fill={tinta} opacity=".9" />
              <rect x="96" y="104" width="108" height="10" fill="rgba(255,255,255,.85)" />
              <path d="M96 104h108l-6 10H102z" fill="#f0c27b" opacity=".85" />
              <rect x="106" y="120" width="40" height="30" rx="1.5" fill="rgba(255,255,255,.7)" />
              <rect x="156" y="120" width="38" height="30" rx="1.5" fill="#ffe7b0" opacity=".9" />
              <Janelas x={106} y={72} colunas={5} linhas={2} w={14} h={10} gx={6.5} gy={6} acesas={semente} />
            </>
          )}
        </g>
      );
  }
}

export function ImovelCapa({ codigo, tipo, foto, cor, alt }: { codigo: string; tipo: string; foto?: string | null; cor: string; alt: string }) {
  if (foto)
    return (
      <span className="imovel-capa">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={foto} alt={alt} loading="lazy" />
      </span>
    );
  const h = hash(codigo);
  const [ceu1, ceu2, chao] = CEUS[h % CEUS.length];
  const id = `ceu-${codigo.replace(/[^a-z0-9]/gi, "")}`;
  return (
    <span className="imovel-capa" role="img" aria-label={alt}>
      <svg viewBox="0 0 300 160" preserveAspectRatio="xMidYMax slice" aria-hidden>
        <defs>
          <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={ceu1} />
            <stop offset="1" stopColor={ceu2} />
          </linearGradient>
        </defs>
        <rect width="300" height="160" fill={`url(#${id})`} />
        <circle cx={40 + (h % 200)} cy={30 + (h % 17)} r="14" fill="#fff" opacity=".55" />
        <ellipse cx={60 + (h % 90)} cy="40" rx="26" ry="6" fill="#fff" opacity=".5" />
        <ellipse cx={200 + (h % 60)} cy="28" rx="20" ry="5" fill="#fff" opacity=".45" />
        <rect y="148" width="300" height="12" fill={chao} opacity=".55" />
        <Desenho tipo={tipo} tinta={cor} semente={h % 5} />
      </svg>
    </span>
  );
}
