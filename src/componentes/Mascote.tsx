"use client";

/**
 * O urutau (mascote da Urutau) no pé da barra lateral. Os olhos seguem o cursor e ele pisca de vez em quando.
 * Ao clicar, abre a ajuda: cada assunto leva ao WhatsApp da Urutau com a mensagem já escrita.
 * O desenho é o mesmo do site da Urutau (urutau-site/src/components/Owl.jsx), só pousado.
 */
import { animate, motion, useMotionValue, useSpring, useTransform } from "motion/react";
import { usePathname } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Icone } from "./Icone";

const WHATSAPP_URUTAU = "5521993689481";
const COR = { casca: "#8A7A66", clara: "#9C8D7A", galho: "#3A3128", olho: "#F5C518", noite: "#141B34" };

// Olho com pálpebra reta: círculo de raio R cortado R/2 acima do centro.
const R = 24;
const LID = Math.sqrt(R * R - (R / 2) ** 2);
const olhoPath = (cx: number, cy: number) => `M${cx - LID} ${cy - R / 2} L${cx + LID} ${cy - R / 2} A${R} ${R} 0 1 1 ${cx - LID} ${cy - R / 2} Z`;
const OLHOS = [74, 126];
const EY = 106;

const parado = () => matchMedia("(prefers-reduced-motion: reduce)").matches;

function Coruja({ feliz }: { feliz: boolean }) {
  const uid = useId().replace(/:/g, "");
  const ref = useRef<SVGSVGElement>(null);
  const pisca = useMotionValue(0);
  const x = useSpring(0, { stiffness: 180, damping: 18 });
  const y = useSpring(0, { stiffness: 180, damping: 18 });
  const escala = useTransform(pisca, (v) => Math.max(0.04, 1 - v));

  // Os olhos acompanham o cursor (ou o dedo) por toda a página.
  useEffect(() => {
    const mover = (e: PointerEvent) => {
      const r = ref.current?.getBoundingClientRect();
      if (!r) return;
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height * 0.45);
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(d / 60, 1) * 10;
      x.set((dx / d) * k);
      y.set((dy / d) * k * 0.8);
    };
    window.addEventListener("pointermove", mover, { passive: true });
    return () => window.removeEventListener("pointermove", mover);
  }, [x, y]);

  useEffect(() => {
    if (parado()) return;
    let t: ReturnType<typeof setTimeout>;
    const volta = () => {
      t = setTimeout(() => {
        animate(pisca, [0, 1, 0], { duration: 0.24, ease: "easeInOut" });
        volta();
      }, 2400 + Math.random() * 3400);
    };
    volta();
    return () => clearTimeout(t);
  }, [pisca]);

  return (
    <svg ref={ref} viewBox="26 12 148 220" className="coruja" aria-hidden="true">
      <path d="M100 20 C146 20 170 72 170 134 C170 192 140 224 100 224 C60 224 30 192 30 134 C30 72 54 20 100 20 Z" fill={COR.casca} />
      <ellipse cx="100" cy="108" rx="62" ry="40" fill={COR.clara} />
      <g stroke={COR.galho} strokeLinecap="round" fill="none">
        <path d="M46 132 C44 166 56 196 78 214" strokeWidth="5" strokeOpacity=".4" />
        <path d="M154 132 C156 166 144 196 122 214" strokeWidth="5" strokeOpacity=".4" />
      </g>
      <g stroke={COR.galho} strokeOpacity=".5" strokeWidth="4.5" strokeLinecap="round">
        <path d="M100 160 L100 176" />
        <path d="M86 166 L93 176" />
        <path d="M114 166 L107 176" />
      </g>
      <g fill={COR.galho}>
        <rect x="78" y="218" width="16" height="9" rx="4.5" />
        <rect x="106" y="218" width="16" height="9" rx="4.5" />
      </g>
      {feliz ? (
        OLHOS.map((cx) => <path key={cx} d={`M${cx - 17} ${EY + 4} Q${cx} ${EY - 14} ${cx + 17} ${EY + 4}`} stroke={COR.noite} strokeWidth="5.5" strokeLinecap="round" fill="none" />)
      ) : (
        <>
          <g stroke={COR.galho} strokeWidth="5" strokeLinecap="round">
            <path d="M50 74 L88 84" />
            <path d="M150 74 L112 84" />
          </g>
          {OLHOS.map((cx, i) => (
            <motion.g key={cx} style={{ scaleY: escala, originY: 0.7 }}>
              <defs>
                <clipPath id={`${uid}-${i}`}>
                  <path d={olhoPath(cx, EY)} />
                </clipPath>
              </defs>
              <path d={olhoPath(cx, EY)} fill={COR.olho} />
              <g clipPath={`url(#${uid}-${i})`}>
                <motion.g style={{ x, y }}>
                  <circle cx={cx} cy={EY + R * 0.2} r={R * 0.35} fill={COR.noite} />
                  <circle cx={cx + 3} cy={EY + R * 0.2 - 3} r="2.6" fill="#fff" />
                </motion.g>
              </g>
            </motion.g>
          ))}
        </>
      )}
      <path d={feliz ? "M90 132 Q100 150 110 132 Z" : "M93 134 L107 134 L100 146 Z"} fill={COR.galho} />
    </svg>
  );
}

const TELAS: Record<string, string> = { vendas: "Vendas", clientes: "Clientes", whatsapp: "WhatsApp", financeiro: "Financeiro" };
const ASSUNTOS = [
  { id: "lancar", rotulo: "Lançar vendas e despesas", texto: "como lançar vendas e despesas" },
  { id: "numero", rotulo: "Entender um número do painel", texto: "como entender um número do painel" },
  { id: "whatsapp", rotulo: "Conversas e atendente do WhatsApp", texto: "as conversas e o atendente do WhatsApp" },
  { id: "outro", rotulo: "Outro assunto", texto: "o painel" },
];

export function Mascote({ empresa }: { empresa: string }) {
  const caminho = usePathname();
  const [aberta, setAberta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const tela = TELAS[caminho.split("/")[2] ?? ""] ?? "Visão geral";
  const link = (texto: string) => `https://wa.me/${WHATSAPP_URUTAU}?text=${encodeURIComponent(`Oi, urutau! Estou no painel da ${empresa} (tela ${tela}) e quero tirar uma dúvida sobre ${texto}.`)}`;

  // Fecha com Esc ou ao clicar fora.
  useEffect(() => {
    if (!aberta) return;
    const fora = (e: PointerEvent) => !raiz.current?.contains(e.target as Node) && setAberta(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setAberta(false);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [aberta]);

  return (
    <div className="mascote-linha" ref={raiz}>
      <button type="button" className="mascote-botao" aria-expanded={aberta} aria-controls="ajuda-urutau" aria-label="Ajuda com o painel" onClick={() => setAberta((a) => !a)}>
        <Coruja feliz={aberta} />
      </button>
      <p className="feito">Painel feito pela Urutau</p>
      {aberta && (
        <section id="ajuda-urutau" className="ajuda" aria-label="Ajuda com o painel">
          <h2>Oi! Eu sou o urutau.</h2>
          <p>Ficou com dúvida em alguma coisa do painel? Escolha o assunto e a gente conversa pelo WhatsApp.</p>
          <ul>
            {ASSUNTOS.map((a) => (
              <li key={a.id}>
                <a href={link(a.texto)} target="_blank" rel="noreferrer" onClick={() => setAberta(false)}>
                  <Icone nome="whatsapp" />
                  <span>{a.rotulo}</span>
                  <Icone nome="seta" />
                </a>
              </li>
            ))}
          </ul>
          <p className="nota">A mensagem já vai escrita, com o nome da empresa e a tela em que você está.</p>
        </section>
      )}
    </div>
  );
}
