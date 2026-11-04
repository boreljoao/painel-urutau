import Link from "next/link";
import { type Mes, nomeDoMes, somarMeses } from "@/lib/datas";

/** O título de cada tela, com o que estiver à direita (seletor de mês, botões). */
export function Topo({ titulo, sub, children }: { titulo: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="titulo">
      <div>
        <h1>{titulo}</h1>
        {sub && <p>{sub}</p>}
      </div>
      {children}
    </header>
  );
}

/** ‹ mês › — o link leva os outros filtros junto. */
export function SeletorMes({ mes, atual, link }: { mes: Mes; atual: Mes; link: (m: Mes) => string }) {
  return (
    <nav className="seletor-mes" aria-label="Mês">
      <Link href={link(somarMeses(mes, -1))} aria-label="Mês anterior">
        ‹
      </Link>
      <span>{nomeDoMes(mes)}</span>
      {mes === atual ? (
        <span aria-hidden>›</span>
      ) : (
        <Link href={link(somarMeses(mes, 1))} aria-label="Próximo mês">
          ›
        </Link>
      )}
    </nav>
  );
}

/** Monta o endereço com os filtros que têm valor. */
export function endereco(caminho: string, filtros: Record<string, string | undefined | null>) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(filtros)) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${caminho}?${s}` : caminho;
}
