"use client";

/**
 * Caixa (PDV) do painel. O leitor de código de barras "digita" o código e aperta Enter: o produto
 * entra no carrinho na hora. Também dá para buscar pelo nome ou tocar nos mais vendidos.
 * O preço que vale é o do cadastro (o servidor recalcula); aqui é só a conta para a tela.
 */
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { FormaPagamento, Unidade } from "@/db/schema";
import { lerReais } from "@/lib/dinheiro";
import { MIL, UNIDADES, formatarQuantidade, lerQuantidade, limparCodigo, totalDoItem } from "@/lib/estoque";
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

type Resultado = { erro: string } | { vendaId: string; totalCentavos: number; trocoCentavos: number | null; estoqueNegativo: string[]; repetida?: boolean };
type Vender = (v: {
  itens: { produtoId: string | null; quantidadeMil: number }[];
  descontoCentavos: number;
  formaPagamento: FormaPagamento;
  clienteId: string | null;
  aReceber: boolean;
  valorEntregueCentavos: number | null;
  chave: string;
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
  buscar,
  base,
  compacto = false,
}: {
  produtos: ProdutoPdv[];
  clientes: { id: string; nome: string }[];
  vender: Vender;
  /** Busca no catálogo inteiro (o caixa só carrega os que mais saem). */
  buscar?: (termo: string) => Promise<ProdutoPdv[]>;
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
  // Uma chave por carrinho: se o envio se repetir (clique duplo, rede caiu), o servidor devolve a mesma venda.
  const chave = useRef("");
  const [doServidor, setDoServidor] = useState<{ termo: string; lista: ProdutoPdv[] } | null>(null);

  const locais = useMemo(() => {
    const t = semAcento(termo.trim());
    if (!t) return produtos.slice(0, compacto ? 6 : 12);
    return produtos.filter((p) => semAcento(p.nome).includes(t) || p.codigoBarras === termo.trim() || p.sku?.toLowerCase().startsWith(t)).slice(0, 12);
  }, [termo, produtos, compacto]);
  // O que não está entre os carregados é buscado no servidor (catálogo grande).
  const encontrados = useMemo(() => {
    if (!termo.trim() || doServidor?.termo !== termo.trim()) return locais;
    const ids = new Set(locais.map((p) => p.id));
    return [...locais, ...doServidor.lista.filter((p) => !ids.has(p.id))].slice(0, 12);
  }, [locais, doServidor, termo]);
  useEffect(() => {
    const t = termo.trim();
    if (!buscar || t.length < 2 || locais.length >= 6) return;
    const espera = setTimeout(() => buscar(t).then((lista) => setDoServidor({ termo: t, lista })), 250);
    return () => clearTimeout(espera);
  }, [termo, locais.length, buscar]);

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
  const enter = async () => {
    const codigo = limparCodigo(termo);
    if (!codigo) return;
    const exato = produtos.find((p) => p.codigoBarras === codigo || p.sku === codigo);
    if (exato) return adicionar(exato);
    if (encontrados.length === 1) return adicionar(encontrados[0]);
    if (buscar) {
      const lista = await buscar(codigo);
      const achado = lista.find((p) => p.codigoBarras === codigo || p.sku === codigo) ?? (lista.length === 1 ? lista[0] : null);
      if (achado) return adicionar(achado);
      setDoServidor({ termo: termo.trim(), lista });
      if (lista.length) return setAviso({ tom: "erro", texto: "Escolha o produto na lista." });
    }
    setAviso({ tom: "erro", texto: /^\d{8,14}$/.test(codigo) ? `Código ${codigo} não cadastrado.` : "Escolha o produto na lista." });
  };

  const mudarQtd = (id: string, delta: number) =>
    setLinhas((ls) => ls.flatMap((l) => (l.produto.id !== id ? [l] : l.quantidadeMil + delta <= 0 ? [] : [{ ...l, quantidadeMil: l.quantidadeMil + delta }])));
  // Quantidade digitada (12 camisetas de uma vez, 0,350 kg de queijo). Inválida volta ao que era.
  const definirQtd = (id: string, texto: string) => {
    setLinhas((ls) =>
      ls.flatMap((l) => {
        if (l.produto.id !== id) return [l];
        const q = lerQuantidade(texto, l.produto.unidade);
        if (q === 0) return [];
        return [q && q > 0 ? { ...l, quantidadeMil: q } : l];
      }),
    );
  };

  const subtotal = linhas.reduce((s, l) => s + totalDoItem(l.quantidadeMil, l.produto.precoCentavos), 0);
  const descontoCentavos = Math.min(subtotal, Math.max(0, lerReais(desconto) ?? 0));
  const total = subtotal - descontoCentavos;
  // Dinheiro: "Entregue" é o que o cliente deu. Vazio = valor exato. Menos que o total não fecha.
  const entregue = forma === "dinheiro" && recebido.trim() ? lerReais(recebido) : null;
  const entregueInvalido = forma === "dinheiro" && recebido.trim() !== "" && (entregue == null || entregue < 0);
  const falta = entregue != null && entregue < total ? total - entregue : 0;
  const troco = entregue != null && entregue >= total ? entregue - total : null;
  const faltaCliente = forma === "fiado" && !cliente;
  const bloqueio = faltaCliente ? "Escolha o cliente do fiado." : entregueInvalido ? "Valor entregue inválido. Exemplo: 50,00" : falta ? `Faltam ${reais(falta)} para fechar.` : null;

  const fechar = () => {
    if (!linhas.length || pendente || bloqueio) return;
    if (!chave.current) chave.current = crypto.randomUUID();
    iniciar(async () => {
      const r = await vender({
        itens: linhas.map((l) => ({ produtoId: l.produto.id, quantidadeMil: l.quantidadeMil })),
        descontoCentavos,
        formaPagamento: forma === "fiado" ? "outro" : forma,
        clienteId: cliente || null,
        aReceber: forma === "fiado",
        valorEntregueCentavos: entregue,
        chave: chave.current,
      });
      // Erro: o carrinho fica como está para corrigir e tentar de novo (com a mesma chave).
      if ("erro" in r) return setAviso({ tom: "erro", texto: r.erro });
      const negativo = r.estoqueNegativo.length ? ` Atenção: ${r.estoqueNegativo.join(", ")} ficou com estoque negativo.` : "";
      setAviso({ tom: "ok", texto: `Venda de ${reais(r.totalCentavos)} registrada${r.trocoCentavos ? ` · troco ${reais(r.trocoCentavos)}` : ""}.${negativo}` });
      chave.current = "";
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
    <MotionConfig reducedMotion="user">
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
                else void enter();
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
            <button
              type="button"
              className="botao-texto-perigo"
              onClick={() => {
                setLinhas([]);
                chave.current = "";
              }}
            >
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
                      {UNIDADES[l.produto.unidade].curto} × {reais(l.produto.precoCentavos)}
                    </small>
                  </span>
                  <span className="pdv-qtd">
                    <button type="button" aria-label={`Diminuir quantidade de ${l.produto.nome}`} onClick={() => mudarQtd(l.produto.id, -passo)}>
                      −
                    </button>
                    <input
                      key={l.quantidadeMil}
                      defaultValue={formatarQuantidade(l.quantidadeMil, l.produto.unidade, false)}
                      inputMode={fracionada ? "decimal" : "numeric"}
                      aria-label={`Quantidade de ${l.produto.nome}`}
                      onFocus={(e) => e.target.select()}
                      onBlur={(e) => definirQtd(l.produto.id, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          e.currentTarget.blur();
                          busca.current?.focus();
                        }
                      }}
                    />
                    <button type="button" aria-label={`Aumentar quantidade de ${l.produto.nome}`} onClick={() => mudarQtd(l.produto.id, passo)}>
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
            <span>Entregue pelo cliente (R$)</span>
            <input value={recebido} onChange={(e) => setRecebido(e.target.value)} inputMode="decimal" placeholder={`${(total / 100).toFixed(2).replace(".", ",")} (exato)`} aria-invalid={!!falta || entregueInvalido} />
            {troco != null && <b className="pdv-troco">Troco {reais(troco)}</b>}
            {falta > 0 && <b className="pdv-falta">Faltam {reais(falta)}</b>}
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
        <button type="button" className="botao pdv-fechar" disabled={!linhas.length || pendente || !!bloqueio} onClick={fechar} aria-describedby={bloqueio ? "pdv-bloqueio" : undefined}>
          {pendente ? "Registrando…" : `Fechar venda · ${reais(total)}`}
        </button>
        {linhas.length > 0 && bloqueio && (
          <p id="pdv-bloqueio" className="pdv-bloqueio">
            {bloqueio}
          </p>
        )}
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
    </MotionConfig>
  );
}
