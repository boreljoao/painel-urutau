"use client";

/**
 * Caixa (PDV) do painel. O leitor de código de barras "digita" o código e aperta Enter: o produto
 * entra no carrinho na hora. Também dá para buscar pelo nome ou tocar nos mais vendidos.
 * O preço que vale é o do cadastro (o servidor recalcula); aqui é só a conta para a tela.
 */
import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useRef, useState, useTransition } from "react";
import type { FormaPagamento, Unidade } from "@/db/schema";
import { lerReais } from "@/lib/dinheiro";
import { MIL, UNIDADES, formatarQuantidade, limparCodigo, totalDoItem } from "@/lib/estoque";
import { Icone } from "@/componentes/Icone";

export interface ProdutoPdv {
  id: string;
  nome: string;
  codigoBarras: string | null;
  sku: string | null;
  unidade: Unidade;
  precoCentavos: number;
  saldoMil: number;
  controlaEstoque: boolean;
}

type Resultado = { erro: string } | { vendaId: string; totalCentavos: number; estoqueNegativo: string[] };
type Vender = (v: {
  itens: { produtoId: string | null; quantidadeMil: number }[];
  descontoCentavos: number;
  formaPagamento: FormaPagamento;
  clienteId: string | null;
  aReceber: boolean;
}) => Promise<Resultado>;

const FORMAS: { id: FormaPagamento | "fiado"; nome: string }[] = [
  { id: "pix", nome: "Pix" },
  { id: "debito", nome: "Débito" },
  { id: "credito", nome: "Crédito" },
  { id: "dinheiro", nome: "Dinheiro" },
  { id: "fiado", nome: "Fiado" },
];

const reais = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const semAcento = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function CaixaPdv({
  produtos,
  clientes,
  vender,
  base,
  compacto = false,
}: {
  produtos: ProdutoPdv[];
  clientes: { id: string; nome: string }[];
  vender: Vender;
  base: string;
  /** Na Visão geral: só a busca, o carrinho e o botão de fechar. */
  compacto?: boolean;
}) {
  const router = useRouter();
  const busca = useRef<HTMLInputElement>(null);
  const [termo, setTermo] = useState("");
  const [linhas, setLinhas] = useState<{ produto: ProdutoPdv; quantidadeMil: number }[]>([]);
  const [desconto, setDesconto] = useState("");
  const [forma, setForma] = useState<FormaPagamento | "fiado">("pix");
  const [recebido, setRecebido] = useState("");
  const [cliente, setCliente] = useState("");
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [pendente, iniciar] = useTransition();

  const encontrados = useMemo(() => {
    const t = semAcento(termo.trim());
    if (!t) return produtos.slice(0, compacto ? 6 : 12);
    return produtos.filter((p) => semAcento(p.nome).includes(t) || p.codigoBarras === termo.trim() || p.sku?.toLowerCase().startsWith(t)).slice(0, 12);
  }, [termo, produtos, compacto]);

  const adicionar = (p: ProdutoPdv, quantidadeMil = MIL) => {
    setLinhas((ls) => {
      const i = ls.findIndex((l) => l.produto.id === p.id);
      if (i < 0) return [{ produto: p, quantidadeMil }, ...ls];
      return ls.map((l, k) => (k === i ? { ...l, quantidadeMil: l.quantidadeMil + quantidadeMil } : l));
    });
    setTermo("");
    setAviso(null);
    busca.current?.focus();
  };

  // Enter: código de barras ou SKU exato entra direto; se a busca só achou um, entra esse.
  const enter = () => {
    const codigo = limparCodigo(termo);
    if (!codigo) return;
    const exato = produtos.find((p) => p.codigoBarras === codigo || p.sku === codigo);
    if (exato) return adicionar(exato);
    if (encontrados.length === 1) return adicionar(encontrados[0]);
    setAviso({ tom: "erro", texto: /^\d{8,14}$/.test(codigo) ? `Código ${codigo} não cadastrado.` : "Escolha o produto na lista." });
  };

  const mudarQtd = (id: string, delta: number) =>
    setLinhas((ls) => ls.flatMap((l) => (l.produto.id !== id ? [l] : l.quantidadeMil + delta <= 0 ? [] : [{ ...l, quantidadeMil: l.quantidadeMil + delta }])));

  const subtotal = linhas.reduce((s, l) => s + totalDoItem(l.quantidadeMil, l.produto.precoCentavos), 0);
  const descontoCentavos = Math.min(subtotal, Math.max(0, lerReais(desconto) ?? 0));
  const total = subtotal - descontoCentavos;
  const recebidoCentavos = lerReais(recebido);
  const troco = forma === "dinheiro" && recebidoCentavos != null && recebidoCentavos >= total ? recebidoCentavos - total : null;
  const faltaCliente = forma === "fiado" && !cliente;

  const fechar = () => {
    if (!linhas.length || pendente || faltaCliente) return;
    iniciar(async () => {
      const r = await vender({
        itens: linhas.map((l) => ({ produtoId: l.produto.id, quantidadeMil: l.quantidadeMil })),
        descontoCentavos,
        formaPagamento: forma === "fiado" ? "outro" : forma,
        clienteId: cliente || null,
        aReceber: forma === "fiado",
      });
      if ("erro" in r) return setAviso({ tom: "erro", texto: r.erro });
      const negativo = r.estoqueNegativo.length ? ` Atenção: ${r.estoqueNegativo.join(", ")} ficou com estoque negativo.` : "";
      setAviso({ tom: "ok", texto: `Venda de ${reais(r.totalCentavos)} registrada${troco ? ` · troco ${reais(troco)}` : ""}.${negativo}` });
      setLinhas([]);
      setDesconto("");
      setRecebido("");
      setCliente("");
      setForma("pix");
      router.refresh();
      busca.current?.focus();
    });
  };

  return (
    <div className={`pdv${compacto ? " compacto" : ""}`}>
      <div className="pdv-busca">
        <label className="pdv-campo">
          <Icone nome="busca" />
          <input
            ref={busca}
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                if (e.ctrlKey || e.metaKey) fechar();
                else enter();
              }
            }}
            placeholder="Código de barras ou nome do produto"
            aria-label="Código de barras ou nome do produto"
            autoComplete="off"
            inputMode="search"
            autoFocus={!compacto}
          />
        </label>
        {produtos.length ? (
          <ul className="pdv-resultados" aria-label={termo ? "Produtos encontrados" : "Mais vendidos"}>
            {encontrados.map((p) => {
              const acabou = p.controlaEstoque && p.saldoMil <= 0;
              return (
                <li key={p.id}>
                  <button type="button" onClick={() => adicionar(p)} className={acabou ? "acabou" : ""}>
                    <strong>{p.nome}</strong>
                    <span>{reais(p.precoCentavos)}</span>
                    <small>{p.controlaEstoque ? (acabou ? "Sem estoque" : `${formatarQuantidade(p.saldoMil, p.unidade)} em estoque`) : "Sem controle de estoque"}</small>
                  </button>
                </li>
              );
            })}
            {!encontrados.length && <li className="vazio">Nada encontrado para “{termo}”.</li>}
          </ul>
        ) : (
          <p className="vazio">
            Cadastre os produtos em{" "}
            <Link className="link" href={`${base}/estoque?novo=1`}>
              Estoque
            </Link>{" "}
            para vender pelo código de barras.
          </p>
        )}
      </div>

      <div className="pdv-carrinho" aria-live="polite">
        <header>
          <h3>Venda atual</h3>
          {linhas.length > 0 && (
            <button type="button" className="botao-texto-perigo" onClick={() => setLinhas([])}>
              Limpar
            </button>
          )}
        </header>
        <ul>
          <AnimatePresence initial={false}>
            {linhas.map((l) => {
              const fracionada = UNIDADES[l.produto.unidade].fracionada;
              const passo = fracionada ? 100 : MIL;
              return (
                <motion.li
                  key={l.produto.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, x: 24 }}
                  transition={{ type: "spring", duration: 0.35, bounce: 0.15 }}
                >
                  <span className="pdv-item">
                    <strong>{l.produto.nome}</strong>
                    <small>
                      {formatarQuantidade(l.quantidadeMil, l.produto.unidade)} × {reais(l.produto.precoCentavos)}
                    </small>
                  </span>
                  <span className="pdv-qtd">
                    <button type="button" aria-label="Menos" onClick={() => mudarQtd(l.produto.id, -passo)}>
                      −
                    </button>
                    <button type="button" aria-label="Mais" onClick={() => mudarQtd(l.produto.id, passo)}>
                      +
                    </button>
                  </span>
                  <b>{reais(totalDoItem(l.quantidadeMil, l.produto.precoCentavos))}</b>
                </motion.li>
              );
            })}
          </AnimatePresence>
          {!linhas.length && <li className="vazio">Passe o código no leitor ou toque num produto.</li>}
        </ul>

        {!compacto && linhas.length > 0 && (
          <label className="pdv-linha">
            <span>Desconto (R$)</span>
            <input value={desconto} onChange={(e) => setDesconto(e.target.value)} inputMode="decimal" placeholder="0,00" />
          </label>
        )}

        <div className="pdv-formas" role="group" aria-label="Forma de pagamento">
          {FORMAS.map((f) => (
            <button key={f.id} type="button" aria-pressed={forma === f.id} onClick={() => setForma(f.id)}>
              {f.nome}
            </button>
          ))}
        </div>
        {forma === "dinheiro" && (
          <label className="pdv-linha">
            <span>Recebido (R$)</span>
            <input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" placeholder="0,00" />
            {troco != null && <b className="pdv-troco">Troco {reais(troco)}</b>}
          </label>
        )}
        {forma === "fiado" && (
          <label className="pdv-linha">
            <span>Cliente</span>
            <select value={cliente} onChange={(e) => setCliente(e.target.value)}>
              <option value="">Escolha quem leva fiado</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="pdv-total">
          <span>{descontoCentavos ? `Subtotal ${reais(subtotal)} · desconto ${reais(descontoCentavos)}` : `${linhas.length} ${linhas.length === 1 ? "item" : "itens"}`}</span>
          <strong>{reais(total)}</strong>
        </div>
        <button type="button" className="botao pdv-fechar" disabled={!linhas.length || pendente || faltaCliente} onClick={fechar}>
          {pendente ? "Registrando…" : `Fechar venda · ${reais(total)}`}
        </button>
        <AnimatePresence>
          {aviso && (
            <motion.p
              key={aviso.texto}
              role={aviso.tom === "erro" ? "alert" : "status"}
              className={`pdv-aviso ${aviso.tom}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
            >
              {aviso.texto}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
