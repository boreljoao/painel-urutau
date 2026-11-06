import Link from "next/link";
import type { ReactNode } from "react";

export { CONTATO_PRIVACIDADE } from "@/lib/legal";

/** Moldura das páginas de termos e privacidade: leitura longa, sem o menu do painel. */
export function PaginaLegal({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <main className="legal">
      <article className="legal-texto">
        <p className="nota">
          <Link className="link" href="/entrar">
            ← Painel Urutau
          </Link>
        </p>
        <h1>{titulo}</h1>
        <p className="nota">Em vigor desde 6 de novembro de 2026.</p>
        {children}
        <nav className="legal-pe" aria-label="Documentos">
          <Link className="link" href="/termos">
            Termos de uso
          </Link>
          <Link className="link" href="/privacidade">
            Política de privacidade
          </Link>
        </nav>
      </article>
    </main>
  );
}

/** Linha de baixo das telas de fora do painel (entrar, cadastrar, exemplo). */
export function RodapeLegal() {
  return (
    <p className="feito">
      Painel feito pela Urutau ·{" "}
      <Link className="link" href="/termos">
        Termos
      </Link>{" "}
      ·{" "}
      <Link className="link" href="/privacidade">
        Privacidade
      </Link>
    </p>
  );
}
