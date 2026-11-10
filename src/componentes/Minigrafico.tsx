"use client";

import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

/** A linha pequena dos cartões de número: aparece da esquerda para a direita ao abrir a tela. */
export function Minigrafico({ valores, rotulo }: { valores: number[]; rotulo: string }) {
  const reduzir = useReducedMotion();
  const id = useId().replace(/:/g, "");
  if (valores.length < 2) return null;
  const l = 160;
  const a = 40;
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const passo = l / (valores.length - 1);
  const y = (v: number) => (max === min ? a / 2 : a - 4 - ((v - min) / (max - min)) * (a - 8));
  const linha = valores.map((v, i) => `${i ? "L" : "M"}${(i * passo).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = `${linha} L${l},${a} L0,${a} Z`;
  return (
    <svg className="minigrafico" viewBox={`0 0 ${l} ${a}`} preserveAspectRatio="none" role="img" aria-label={rotulo}>
      <defs>
        <clipPath id={`revela-${id}`}>
          <motion.rect x={0} y={0} height={a} initial={{ width: reduzir ? l : 0 }} animate={{ width: l }} transition={{ duration: 0.9, ease: [0.23, 1, 0.32, 1] }} />
        </clipPath>
      </defs>
      <g clipPath={`url(#revela-${id})`}>
        <path d={area} className="minigrafico-area" />
        <path d={linha} className="minigrafico-linha" />
      </g>
    </svg>
  );
}
