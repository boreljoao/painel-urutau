"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { Perfil } from "@/db/schema";
import { NOME_SECAO, itensDoRamo, telaInicialPadrao } from "@/lib/navegacao";
import { PERFIS } from "@/lib/perfis";
import { Icone } from "@/componentes/Icone";
import { type PedidoPainel, type Sugestao, criarPainel, sugerirPacote } from "./acoes";
import { agendaDoPacote, pacoteDe } from "./catalogo";

/** As áreas que a pessoa reconhece; cada uma vira um pacote (e, na saúde, uma especialidade). */
const AREAS: { id: string; nome: string; perfil: Perfil | null; especialidade?: string }[] = [
  { id: "psicologia", nome: "Psicologia", perfil: "consultorio", especialidade: "psicologia" },
  { id: "odontologia", nome: "Odontologia", perfil: "consultorio", especialidade: "odontologia" },
  { id: "saude", nome: "Clínica ou outra área da saúde", perfil: "consultorio", especialidade: "outra" },
  { id: "revenda", nome: "Revenda de veículos", perfil: "revenda_veiculos" },
  { id: "loja", nome: "Loja e varejo", perfil: "varejo" },
  { id: "alimentacao", nome: "Confeitaria, restaurante e alimentação", perfil: "alimentacao" },
  { id: "servicos", nome: "Serviço com visita (técnico, reforma, limpeza)", perfil: "servicos" },
  { id: "contabilidade", nome: "Contabilidade", perfil: "contabilidade" },
  { id: "outro", nome: "Outro: a Urutau descobre pela descrição", perfil: null },
];

const PASSOS = ["Seu negócio", "Revisar painel", "Ativar"];
const surgir = { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 }, transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] as const } };

export function CriarPainel() {
  const router = useRouter();
  const [nome, setNome] = useState("");
  const [area, setArea] = useState("psicologia");
  const [descricao, setDescricao] = useState("");
  const [primeiro, setPrimeiro] = useState<"agenda" | "inicio">("agenda");
  const [regime, setRegime] = useState<PedidoPainel["regime"]>("nao_sei");
  const [cidade, setCidade] = useState("");
  const [uf, setUf] = useState("");
  const [previa, setPrevia] = useState<{ perfil: Perfil; especialidade: string | null; sugestao?: Sugestao } | null>(null);
  const [ocultos, setOcultos] = useState<Set<string>>(new Set());
  const [erro, setErro] = useState<string>();
  const [pensando, iniciar] = useTransition();
  const [criando, criarT] = useTransition();
  const passo = previa ? (criando ? 2 : 1) : 0;

  const escolhida = AREAS.find((a) => a.id === area)!;
  const temAgenda = escolhida.perfil ? !!agendaDoPacote(escolhida.perfil) : true;

  const gerar = () =>
    iniciar(async () => {
      setErro(undefined);
      if (nome.trim().length < 2) return setErro("Escreva o nome da empresa.");
      let perfil = escolhida.perfil;
      let sugestao: Sugestao | undefined;
      if (!perfil) {
        sugestao = await sugerirPacote(`${nome}. ${descricao}`);
        perfil = sugestao.perfil;
      }
      setOcultos(new Set());
      setPrevia({ perfil, especialidade: escolhida.especialidade ?? null, sugestao });
    });

  const p = previa ? pacoteDe(previa.perfil) : null;
  const cfgAgenda = previa ? agendaDoPacote(previa.perfil, previa.especialidade)?.cfg : null;
  const telaInicial = previa ? (primeiro === "agenda" && cfgAgenda ? "agenda" : primeiro === "inicio" ? "inicio" : telaInicialPadrao(previa.perfil)) : "inicio";
  const itens = useMemo(
    () => (previa ? itensDoRamo({ perfil: previa.perfil, papel: "dono", modulos: new Set(PERFIS[previa.perfil].modulos) }) : []),
    [previa],
  );
  const principais = itens.filter((i) => i.secao !== "divulgacao" && i.id !== "inicio" && i.id !== telaInicial && !i.emBreve && !i.ocultoPadrao);
  const extras = itens.filter((i) => (i.secao === "divulgacao" || i.emBreve || i.ocultoPadrao) && i.id !== telaInicial && i.id !== "impostos");
  const nomeInicial = telaInicial === "agenda" ? (previa?.perfil === "consultorio" ? `Agenda de ${(cfgAgenda?.atendimento ?? "sessão").toLowerCase() === "sessão" ? "sessões" : "atendimentos"}` : "Agenda") : "Visão geral";

  const ativar = () =>
    criarT(async () => {
      if (!previa) return;
      setErro(undefined);
      const r = await criarPainel({ nome, perfil: previa.perfil, especialidade: previa.especialidade, regime, cidade, uf, telaInicial, ocultos: [...ocultos] });
      if (r.erro || !r.destino) return setErro(r.erro ?? "Não foi possível criar.");
      router.push(r.destino);
    });

  return (
    <div className="cp">
      <header className="cp-topo">
        <div>
          <h1>Crie o painel do seu negócio</h1>
          <p>Conte como você trabalha. A Urutau monta uma prévia para você revisar.</p>
        </div>
        <ol className="cp-passos">
          {PASSOS.map((n, i) => (
            <li key={n} className={i === passo ? "agora" : i < passo ? "feito" : ""}>
              <span>{i < passo ? <Icone nome="check" /> : i + 1}</span> {n}
            </li>
          ))}
        </ol>
      </header>

      <div className="cp-grade">
        <form
          className="cartao cp-form"
          onSubmit={(e) => {
            e.preventDefault();
            gerar();
          }}
        >
          <h2>Como funciona sua rotina?</h2>
          <label className="campo">
            <span>Nome da empresa</span>
            <input value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Consultório Horizonte" maxLength={120} required />
          </label>
          <label className="campo">
            <span>Área de atuação</span>
            <select
              value={area}
              onChange={(e) => {
                setArea(e.target.value);
                setPrevia(null);
              }}
            >
              {AREAS.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span>Descreva seu dia a dia</span>
            <textarea
              rows={3}
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder="Ex.: atendo de segunda a sexta, tenho sessões semanais, confirmo pelo WhatsApp e quero acompanhar os pagamentos."
              maxLength={600}
            />
          </label>
          <fieldset className="cp-primeiro">
            <legend>O que você precisa ver primeiro?</legend>
            {(
              [
                ["agenda", "Agenda", "agenda"],
                ["inicio", "Financeiro e vendas", "financeiro"],
              ] as const
            )
              .filter(([k]) => k !== "agenda" || temAgenda)
              .map(([k, n, ic]) => (
                <label key={k} className={primeiro === k || (!temAgenda && k === "inicio") ? "ativo" : ""}>
                  <Icone nome={ic} /> {n}
                  <input type="radio" name="primeiro" checked={primeiro === k || (!temAgenda && k === "inicio")} onChange={() => setPrimeiro(k)} />
                </label>
              ))}
          </fieldset>
          <details className="cp-mais">
            <summary>Cidade e impostos (pode deixar para depois)</summary>
            <div className="cp-linha">
              <label className="campo">
                <span>Cidade</span>
                <input value={cidade} onChange={(e) => setCidade(e.target.value)} maxLength={80} />
              </label>
              <label className="campo cp-uf">
                <span>UF</span>
                <input value={uf} onChange={(e) => setUf(e.target.value.toUpperCase())} maxLength={2} placeholder="RJ" />
              </label>
            </div>
            <label className="campo">
              <span>Como a empresa paga imposto</span>
              <select value={regime} onChange={(e) => setRegime(e.target.value as PedidoPainel["regime"])}>
                <option value="nao_sei">Não sei (começa no Simples)</option>
                <option value="mei">MEI</option>
                <option value="simples">Simples Nacional</option>
                <option value="presumido">Lucro Presumido</option>
              </select>
            </label>
          </details>
          {erro && <p className="ig-erro">{erro}</p>}
          <button className="botao cp-gerar" disabled={pensando}>
            {pensando ? "Montando a prévia…" : previa ? "Gerar de novo" : "Gerar prévia do painel"}
          </button>
        </form>

        <section className="cartao cp-previa" aria-live="polite">
          <header className="cp-previa-topo">
            <h2>Sugestão para o seu painel</h2>
            <span className="pilula">Prévia</span>
          </header>
          <AnimatePresence mode="wait">
            {!previa || !p ? (
              <motion.div key="vazio" className="cp-espera" {...surgir}>
                <Icone nome="inicio" />
                <p>Preencha ao lado e toque em “Gerar prévia”. O painel aparece aqui antes de você criar.</p>
              </motion.div>
            ) : (
              <motion.div key={`${previa.perfil}-${previa.especialidade}-${telaInicial}`} className="cp-sugestao" {...surgir}>
                {previa.sugestao && <p className="nota cp-motivo">{previa.sugestao.motivo}</p>}
                <div className="cp-item">
                  <span className="cp-item-ic">
                    <Icone nome="inicio" />
                  </span>
                  <strong>Tela inicial</strong>
                  <span>{nomeInicial}</span>
                </div>
                <div className="cp-item">
                  <span className="cp-item-ic">
                    <Icone nome="caixa" />
                  </span>
                  <strong>Módulos sugeridos</strong>
                  <span className="cp-chips">
                    {principais.map((i) => (
                      <button
                        key={i.id}
                        type="button"
                        className={`cp-chip${ocultos.has(i.id) ? " desligado" : ""}`}
                        aria-pressed={!ocultos.has(i.id)}
                        title={ocultos.has(i.id) ? "Ligar" : "Desligar"}
                        onClick={() => setOcultos((s) => (s.has(i.id) ? new Set([...s].filter((x) => x !== i.id)) : new Set(s).add(i.id)))}
                      >
                        <Icone nome={i.icone} /> {i.nome}
                      </button>
                    ))}
                  </span>
                </div>
                {extras.length > 0 && (
                  <div className="cp-item">
                    <span className="cp-item-ic">
                      <Icone nome="ajustes" />
                    </span>
                    <strong>Ativar se precisar</strong>
                    <span className="cp-chips">
                      {extras.map((i) => (
                        <span key={i.id} className="cp-chip extra">
                          <Icone nome={i.icone} /> {i.nome}
                          {i.emBreve && <small>em breve</small>}
                        </span>
                      ))}
                    </span>
                  </div>
                )}
                <Miniatura agenda={telaInicial === "agenda"} atendimento={cfgAgenda?.atendimento ?? "Horário"} />
                <p className="nota cp-secao-nota">
                  Menu em {Object.values(NOME_SECAO).join(", ").toLowerCase()}. Tudo isso muda depois em Seu pacote.
                </p>
                {erro && <p className="ig-erro">{erro}</p>}
                <button type="button" className="botao cp-ativar" onClick={ativar} disabled={criando}>
                  {criando ? "Ativando…" : "Ativar meu painel"}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      </div>
    </div>
  );
}

/** A amostra do que a pessoa vai ver ao entrar: a semana da agenda ou os números do mês. */
function Miniatura({ agenda, atendimento }: { agenda: boolean; atendimento: string }) {
  if (agenda) {
    const blocos: [number, number, number][] = [
      [0, 1, 0],
      [0, 3, 0],
      [1, 2, 1],
      [1, 5, 1],
      [2, 1, 0],
      [3, 3, 0],
      [4, 2, 1],
    ];
    return (
      <div className="cp-mini" aria-hidden>
        <div className="cp-mini-dias">
          {["Seg", "Ter", "Qua", "Qui", "Sex"].map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="cp-mini-grade">
          {blocos.map(([dia, hora, cor], i) => (
            <motion.span
              key={i}
              className={`cp-mini-bloco${cor ? " roxo" : ""}`}
              style={{ gridColumn: dia + 1, gridRow: hora }}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.05 * i }}
            >
              {atendimento}
              <small>{`${String(8 + hora).padStart(2, "0")}:00`}</small>
            </motion.span>
          ))}
        </div>
      </div>
    );
  }
  return (
    <div className="cp-mini cp-mini-numeros" aria-hidden>
      {["Faturamento", "Lucro", "Caixa"].map((n, i) => (
        <motion.span key={n} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 * i }}>
          <small>{n}</small>
          <svg viewBox="0 0 100 30" preserveAspectRatio="none">
            <polyline points={i === 0 ? "0,24 20,20 40,22 60,14 80,12 100,6" : i === 1 ? "0,22 20,24 40,16 60,18 80,10 100,9" : "0,18 20,16 40,20 60,12 80,14 100,8"} />
          </svg>
        </motion.span>
      ))}
    </div>
  );
}
