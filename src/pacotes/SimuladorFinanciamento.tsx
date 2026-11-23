"use client";

import { useEffect, useMemo, useState } from "react";
import { BANCOS_PADRAO, COMPROMETIMENTO_MAX, type Resultado, financiamentoMaximo, simular } from "@/lib/financiamento";
import { lerReais } from "@/lib/dinheiro";
import { Campo2 } from "@/componentes/lancar";
import { Icone } from "@/componentes/Icone";
import { reais } from "@/componentes/formato";

type Banco = { nome: string; taxaAno: number };
const CHAVE_BANCOS = "urutau:bancos-financiamento";

const lerTaxa = (s: string) => {
  const n = Number(s.replace(/[^\d,.-]/g, "").replace(",", "."));
  return Number.isFinite(n) && n >= 0 && n < 100 ? n : null;
};
const taxaTexto = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const dinheiro = (s: string) => lerReais(s) ?? 0;

export interface Inicial {
  valor?: string;
  cliente?: string;
  telefone?: string;
}

/**
 * Simulador de financiamento: o corretor preenche na frente do cliente e manda a ficha no WhatsApp.
 * Tudo no navegador (nada é salvo, nada consulta CPF). As taxas dos bancos ficam guardadas aqui.
 */
export function SimuladorFinanciamento({ inicial, empresa }: { inicial: Inicial; empresa: string }) {
  const [valor, setValor] = useState(inicial.valor ?? "");
  const [entrada, setEntrada] = useState("");
  const [fgts, setFgts] = useState("");
  const [anos, setAnos] = useState("30");
  const [renda, setRenda] = useState("");
  const [idade, setIdade] = useState("");
  const [cliente, setCliente] = useState(inicial.cliente ?? "");
  const [telefone, setTelefone] = useState(inicial.telefone ?? "");
  const [bancos, setBancos] = useState<Banco[]>(BANCOS_PADRAO);
  const [escolhido, setEscolhido] = useState(0);
  const [copiado, setCopiado] = useState(false);

  // As taxas digitadas ficam no navegador para a próxima simulação.
  useEffect(() => {
    try {
      const salvos = JSON.parse(localStorage.getItem(CHAVE_BANCOS) ?? "null");
      if (Array.isArray(salvos) && salvos.length) setBancos(salvos);
    } catch {
      /* começa com as de exemplo */
    }
  }, []);
  const mudarTaxa = (k: number, texto: string) => {
    const t = lerTaxa(texto);
    if (t == null) return;
    const novos = bancos.map((b, i) => (i === k ? { ...b, taxaAno: t } : b));
    setBancos(novos);
    localStorage.setItem(CHAVE_BANCOS, JSON.stringify(novos));
  };

  const base = {
    valorImovel: dinheiro(valor),
    entrada: dinheiro(entrada),
    fgts: dinheiro(fgts),
    prazoMeses: Math.round((Number(anos.replace(",", ".")) || 0) * 12),
    renda: dinheiro(renda),
    idade: Number(idade) || 0,
  };
  const banco = bancos[escolhido] ?? bancos[0];
  const s = simular({ ...base, taxaAno: banco.taxaAno });
  const comparacao = useMemo(
    () => bancos.map((b) => ({ b, s: simular({ ...base, taxaAno: b.taxaAno }) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [bancos, valor, entrada, fgts, anos, renda, idade],
  );
  const maxPelaRenda = base.renda ? financiamentoMaximo(base.renda, banco.taxaAno, base.prazoMeses || 360) : 0;

  const ficha = s
    ? [
        `Simulação de financiamento${cliente ? ` para ${cliente.split(" ")[0]}` : ""}`,
        "",
        `Imóvel: ${reais(base.valorImovel)}`,
        `Entrada: ${reais(base.entrada)}${base.fgts ? ` + FGTS ${reais(base.fgts)}` : ""}`,
        `Financiado: ${reais(s.financiado)} em ${s.prazoMeses} meses`,
        `Taxa: ${taxaTexto(banco.taxaAno)}% ao ano (${banco.nome})`,
        "",
        `SAC: 1ª parcela ${reais(s.sac.primeira)}, caindo até ${reais(s.sac.ultima)}`,
        `Price: parcela fixa de ${reais(s.price.primeira)}`,
        `Renda mínima: ${reais(Math.min(s.sac.rendaMinima, s.price.rendaMinima))} (SAC pede ${reais(s.sac.rendaMinima)})`,
        "",
        "Valores estimados, sem seguros e tarifa. A aprovação e a taxa final são do banco.",
        empresa,
      ].join("\n")
    : "";
  const tel = telefone.replace(/\D/g, "");
  const wa = tel ? `https://wa.me/${tel.length <= 11 ? `55${tel}` : tel}?text=${encodeURIComponent(ficha)}` : `https://wa.me/?text=${encodeURIComponent(ficha)}`;

  return (
    <div className="fin-grade">
      <section className="cartao fin-dados" aria-label="Dados da simulação">
        <div className="form-lancar">
          <Campo2 rotulo="Valor do imóvel (R$)" largo>
            <input inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} placeholder="500.000,00" autoFocus={!inicial.valor} />
          </Campo2>
          <Campo2 rotulo="Entrada (R$)">
            <input inputMode="decimal" value={entrada} onChange={(e) => setEntrada(e.target.value)} placeholder="100.000,00" />
          </Campo2>
          <Campo2 rotulo="FGTS (R$)">
            <input inputMode="decimal" value={fgts} onChange={(e) => setFgts(e.target.value)} placeholder="0,00" />
          </Campo2>
          <Campo2 rotulo="Prazo (anos)">
            <input inputMode="numeric" value={anos} onChange={(e) => setAnos(e.target.value)} />
          </Campo2>
          <Campo2 rotulo="Idade do mais velho">
            <input inputMode="numeric" value={idade} onChange={(e) => setIdade(e.target.value)} placeholder="Opcional" />
          </Campo2>
          <Campo2 rotulo="Renda bruta da família (R$/mês)" largo>
            <input inputMode="decimal" value={renda} onChange={(e) => setRenda(e.target.value)} placeholder="Opcional" />
          </Campo2>
          <div className="campo-form largo">
            <span>Banco</span>
            <div className="alternar" role="radiogroup" aria-label="Banco">
              {bancos.map((b, k) => (
                <button key={b.nome} type="button" role="radio" aria-checked={k === escolhido} aria-pressed={k === escolhido} onClick={() => setEscolhido(k)}>
                  {b.nome} {taxaTexto(b.taxaAno)}%
                </button>
              ))}
            </div>
          </div>
          <Campo2 rotulo="Cliente">
            <input value={cliente} onChange={(e) => setCliente(e.target.value)} placeholder="Opcional" />
          </Campo2>
          <Campo2 rotulo="WhatsApp do cliente">
            <input inputMode="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} placeholder="21 99999-0000" />
          </Campo2>
        </div>
      </section>

      <section className="cartao fin-resultado" aria-live="polite" aria-label="Resultado">
        {s ? (
          <>
            <header className="fin-topo">
              <span>
                <small>Financiado</small>
                <strong>{reais(s.financiado)}</strong>
              </span>
              <span>
                <small>do imóvel</small>
                <strong className={s.cota > 0.8 ? "ruim" : ""}>{Math.round(s.cota * 100)}%</strong>
              </span>
              <span>
                <small>prazo</small>
                <strong>{s.prazoMeses} meses</strong>
              </span>
            </header>
            <div className="fin-sistemas">
              <Sistema titulo="SAC" dica="Começa mais alta e cai todo mês. Paga menos juros." r={s.sac} renda={base.renda} />
              <Sistema titulo="Price" dica="Parcela igual do começo ao fim." r={s.price} renda={base.renda} />
            </div>
            {s.avisos.length > 0 && (
              <ul className="fin-avisos">
                {s.avisos.map((a) => (
                  <li key={a}>
                    <Icone nome="alerta" /> {a}
                  </li>
                ))}
              </ul>
            )}
            {maxPelaRenda > 0 && (
              <p className="nota">
                Com {reais(base.renda)} de renda, dá para financiar até <b>{reais(maxPelaRenda)}</b> no Price ({Math.round(COMPROMETIMENTO_MAX * 100)}% da renda na parcela).
              </p>
            )}
            <div className="fin-acoes">
              <a className="botao" href={wa} target="_blank" rel="noreferrer">
                <Icone nome="whatsapp" /> Mandar no WhatsApp
              </a>
              <button
                type="button"
                className="botao-claro"
                onClick={() => {
                  navigator.clipboard?.writeText(ficha);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1800);
                }}
              >
                {copiado ? "Copiado" : "Copiar texto"}
              </button>
            </div>
          </>
        ) : (
          <p className="vazio">Coloque o valor do imóvel e a entrada para ver as parcelas.</p>
        )}
      </section>

      <section className="cartao fin-bancos" aria-label="Comparar bancos">
        <header className="cartao-topo">
          <h2>Comparar bancos</h2>
          <span className="nota">Taxas de exemplo: troque pelas do dia, ficam salvas neste navegador.</span>
        </header>
        <div className="tabela-rolar">
          <table className="tabela">
            <thead>
              <tr>
                <th>Banco</th>
                <th className="num">Taxa ao ano</th>
                <th className="num">1ª parcela SAC</th>
                <th className="num">Parcela Price</th>
                <th className="num">Juros no total (SAC)</th>
                <th className="num">Renda mínima (SAC)</th>
              </tr>
            </thead>
            <tbody>
              {comparacao.map(({ b, s: x }, k) => (
                <tr key={b.nome} className={k === escolhido ? "fin-escolhido" : undefined} onClick={() => setEscolhido(k)}>
                  <td>{b.nome}</td>
                  <td className="num">
                    <input
                      key={b.taxaAno}
                      className="fin-taxa"
                      inputMode="decimal"
                      defaultValue={taxaTexto(b.taxaAno)}
                      aria-label={`Taxa do ${b.nome} em % ao ano`}
                      onClick={(e) => e.stopPropagation()}
                      onBlur={(e) => mudarTaxa(k, e.target.value)}
                    />
                    %
                  </td>
                  <td className="num">{x ? reais(x.sac.primeira) : "—"}</td>
                  <td className="num">{x ? reais(x.price.primeira) : "—"}</td>
                  <td className="num">{x ? reais(x.sac.totalJuros) : "—"}</td>
                  <td className="num">{x ? reais(x.sac.rendaMinima) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="nota">
          Estimativa sem a correção pela TR. Seguros (MIP e DFI) e tarifa aparecem à parte em cada sistema. Quem aprova o crédito e define a taxa final é o banco: use o simulador dele ou o correspondente
          bancário para a análise do CPF.
        </p>
      </section>
    </div>
  );
}

function Sistema({ titulo, dica, r, renda }: { titulo: string; dica: string; r: Resultado; renda: number }) {
  const cabe = !renda || r.primeira <= renda * COMPROMETIMENTO_MAX;
  return (
    <div className={`fin-sistema${cabe ? "" : " nao-cabe"}`}>
      <h3>{titulo}</h3>
      <p className="nota">{dica}</p>
      <strong className="fin-parcela">{reais(r.primeira)}</strong>
      <small>{r.sistema === "sac" ? `1ª parcela, até ${reais(r.ultima)} na última` : "por mês"}</small>
      <dl>
        <div>
          <dt>Com seguros e tarifa</dt>
          <dd>~{reais(r.primeiraComSeguros)}</dd>
        </div>
        <div>
          <dt>Juros no total</dt>
          <dd>{reais(r.totalJuros)}</dd>
        </div>
        <div>
          <dt>Total pago</dt>
          <dd>{reais(r.totalPago)}</dd>
        </div>
        <div>
          <dt>Renda mínima</dt>
          <dd className={cabe ? "" : "ruim"}>{reais(r.rendaMinima)}</dd>
        </div>
      </dl>
    </div>
  );
}
