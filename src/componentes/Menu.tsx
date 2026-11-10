"use client";

import { motion } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "./Icone";

export interface ItemMenu {
  href: string;
  nome: string;
  icone: NomeIcone;
  /** Seção da barra lateral (Operação, Gestão, Divulgação); some no celular. */
  secao?: string;
  /** Aba do pacote do negócio: no celular fica fora da barra de baixo (aparece na Visão geral). */
  doNegocio?: boolean;
  emBreve?: boolean;
  /** No celular: aba do negócio que fica na barra de baixo (a agenda) ou tela que sai dela. */
  naBarra?: boolean;
  foraDaBarra?: boolean;
}

/** O menu da barra lateral, em seções; no celular vira a barra de baixo. */
export function Menu({ itens, selos }: { itens: ItemMenu[]; selos: Record<string, number> }) {
  const caminho = usePathname();
  // O item mais específico que casa com o endereço é o ativo (a Visão geral é a raiz da empresa).
  const ativo = [...itens].sort((a, b) => b.href.length - a.href.length).find((i) => caminho === i.href || caminho.startsWith(`${i.href}/`));
  const secoes = [...new Set(itens.map((i) => i.secao ?? ""))];
  return (
    <nav className="menu" aria-label="Telas">
      {secoes.map((secao, n) => (
        <div key={secao || "geral"} className="menu-grupo" role="group" aria-label={secao || undefined}>
          {secao && (n > 0 || secoes.length > 1) && <p className="menu-secao">{secao}</p>}
          {itens
            .filter((i) => (i.secao ?? "") === secao)
            .map((i) => (
              <Link
                key={i.href}
                href={i.href}
                aria-current={i === ativo ? "page" : undefined}
                className={[i.doNegocio && "do-negocio", i.naBarra && "na-barra", i.foraDaBarra && "fora-da-barra"].filter(Boolean).join(" ") || undefined}
              >
                {i === ativo && <motion.span layoutId="menu-ativo" className="menu-ativo" transition={{ type: "spring", stiffness: 500, damping: 40 }} aria-hidden />}
                <Icone nome={i.icone} />
                <span>{i.nome}</span>
                {i.emBreve && <small className="em-breve">em breve</small>}
                {selos[i.href] ? (
                  <b className="selo" aria-label={`${selos[i.href]} esperando`}>
                    {selos[i.href]}
                  </b>
                ) : null}
              </Link>
            ))}
        </div>
      ))}
    </nav>
  );
}
