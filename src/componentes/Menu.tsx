"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icone, type NomeIcone } from "./Icone";

export interface ItemMenu {
  href: string;
  nome: string;
  icone: NomeIcone;
}

/** O menu da barra lateral; no celular vira a barra de baixo. */
export function Menu({ itens, selos }: { itens: ItemMenu[]; selos: Record<string, number> }) {
  const caminho = usePathname();
  // O item mais específico que casa com o endereço é o ativo (a Visão geral é a raiz da empresa).
  const ativo = [...itens].sort((a, b) => b.href.length - a.href.length).find((i) => caminho === i.href || caminho.startsWith(`${i.href}/`));
  return (
    <nav className="menu" aria-label="Telas">
      {itens.map((i) => (
        <Link key={i.href} href={i.href} aria-current={i === ativo ? "page" : undefined}>
          <Icone nome={i.icone} />
          <span>{i.nome}</span>
          {selos[i.href] ? (
            <b className="selo" aria-label={`${selos[i.href]} esperando`}>
              {selos[i.href]}
            </b>
          ) : null}
        </Link>
      ))}
    </nav>
  );
}
