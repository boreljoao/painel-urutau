"use client";

import { useActionState, useState, useTransition } from "react";
import type { Perfil } from "@/db/schema";
import type { EstadoForm } from "@/lib/estado-form";
import { Icone } from "@/componentes/Icone";
import { ORDEM_PACOTES, PACOTES } from "./catalogo";
import type { Sugestao } from "./acoes";

type AcaoForm = (estado: EstadoForm, fd: FormData) => Promise<EstadoForm>;

/** Os pacotes em cartões de escolha, com as abas do escolhido logo abaixo. */
function EscolhaDePacote({ perfil, setPerfil, sugerido }: { perfil: Perfil; setPerfil: (p: Perfil) => void; sugerido?: Perfil }) {
  const p = PACOTES[perfil];
  return (
    <>
      <fieldset className="pacotes">
        <legend className="oculto">Pacote</legend>
        {ORDEM_PACOTES.map((id) => (
          <label key={id} className="pacote-opcao">
            <input type="radio" name="perfil" value={id} checked={perfil === id} onChange={() => setPerfil(id)} />
            <strong>{PACOTES[id].nome}</strong>
            <span>{PACOTES[id].frase}</span>
            {sugerido === id && <em className="pilula">Sugerido para você</em>}
          </label>
        ))}
      </fieldset>
      <div className="pacote-detalhe" aria-live="polite">
        <h3>O que entra no painel de {p.nome.toLowerCase()}</h3>
        <ul className="lista-check">
          <li>
            <Icone nome="check" /> {p.vocab.vendas}, {p.vocab.clientes.toLowerCase()}, financeiro, impostos e WhatsApp
          </li>
          {p.abas.map((a) => (
            <li key={a.id}>
              <Icone nome={a.icone} />
              <span>
                <b>{a.titulo}</b>: {a.desc.toLowerCase()} <small className="em-breve">em breve</small>
              </span>
            </li>
          ))}
          {p.categoriasExtras.length > 0 && (
            <li>
              <Icone nome="check" /> Categorias prontas: {p.categoriasExtras.map((c) => c.nome).join(", ")}
            </li>
          )}
        </ul>
      </div>
    </>
  );
}

/** Criar uma empresa: a pessoa conta o que faz, a IA sugere o pacote, a pessoa confirma. */
export function Comecar({ sugerir, criar }: { sugerir: (descricao: string) => Promise<Sugestao>; criar: AcaoForm }) {
  const [etapa, setEtapa] = useState<1 | 2>(1);
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [sugestao, setSugestao] = useState<Sugestao>();
  const [perfil, setPerfil] = useState<Perfil>("financas");
  const [pensando, iniciar] = useTransition();
  const [estado, enviar, criando] = useActionState(criar, {});
  const erros = estado.erros ?? {};

  if (etapa === 1)
    return (
      <form
        className="comecar-form"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const s = await sugerir(descricao);
            setSugestao(s);
            setPerfil(s.perfil);
            setEtapa(2);
          });
        }}
      >
        <label className="campo-form">
          <span>Nome da empresa</span>
          <input id="nome-empresa" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={120} required autoFocus placeholder="Ex.: Doces da Ana" />
        </label>
        <label className="campo-form">
          <span>O que sua empresa faz?</span>
          <textarea
            id="descricao-empresa"
            value={descricao}
            onChange={(e) => setDescricao(e.target.value)}
            rows={4}
            maxLength={600}
            required
            placeholder="Conte com as suas palavras. Ex.: faço bolos e doces por encomenda e vendo no balcão da minha casa."
          />
        </label>
        <button className="botao" disabled={pensando || nome.trim().length < 2 || descricao.trim().length < 4}>
          {pensando ? "Montando o seu painel…" : "Montar meu painel"}
        </button>
      </form>
    );

  return (
    <form action={enviar} className="comecar-form">
      <input type="hidden" name="nome" value={nome} />
      {sugestao && (
        <p className="sugestao">
          <Icone nome="check" />
          <span>
            <b>{PACOTES[sugestao.perfil].nome}.</b> {sugestao.motivo}
            {!sugestao.viaIa && <span className="nota"> (escolha automática pelas palavras; confira abaixo)</span>}
          </span>
        </p>
      )}
      <EscolhaDePacote perfil={perfil} setPerfil={setPerfil} sugerido={sugestao?.perfil} />
      {erros.perfil && <em role="alert" className="erro-pequeno">{erros.perfil}</em>}

      <fieldset className="campo-form escolha">
        <legend>Como a empresa paga imposto?</legend>
        {[
          ["mei", "MEI"],
          ["simples", "Simples Nacional"],
          ["presumido", "Lucro Presumido"],
          ["nao_sei", "Não sei"],
        ].map(([v, t]) => (
          <label key={v}>
            <input type="radio" name="regime" value={v} defaultChecked={v === (estado.valores?.regime ?? "nao_sei")} /> {t}
          </label>
        ))}
        {erros.regime && <em role="alert">{erros.regime}</em>}
      </fieldset>
      <div className="duas-colunas">
        <label className="campo-form">
          <span>Cidade (opcional)</span>
          <input id="cidade-empresa" name="cidade" defaultValue={estado.valores?.cidade} maxLength={80} />
        </label>
        <label className="campo-form">
          <span>UF</span>
          <input id="uf-empresa" name="uf" defaultValue={estado.valores?.uf} maxLength={2} placeholder="RJ" />
          {erros.uf && <em role="alert">{erros.uf}</em>}
        </label>
      </div>
      {erros._ && <p className="erro-pequeno" role="alert">{erros._}</p>}
      <div className="comecar-acoes">
        <button type="button" className="botao-claro" onClick={() => setEtapa(1)}>
          Voltar
        </button>
        <button className="botao" disabled={criando}>
          {criando ? "Criando…" : "Criar meu painel"}
        </button>
      </div>
      <p className="nota">Dá para trocar de pacote depois. O imposto começa com uma estimativa: confirme com o seu contador.</p>
    </form>
  );
}

/** Na tela "Seu pacote": trocar o pacote da empresa. */
export function TrocarPacote({ atual, trocar }: { atual: Perfil; trocar: AcaoForm }) {
  const [perfil, setPerfil] = useState<Perfil>(atual);
  const [estado, enviar, pendente] = useActionState(trocar, {});
  return (
    <form action={enviar} className="comecar-form">
      <EscolhaDePacote perfil={perfil} setPerfil={setPerfil} />
      {estado.erros?.perfil && <em role="alert" className="erro-pequeno">{estado.erros.perfil}</em>}
      {estado.ok && (
        <p className="sugestao" role="status">
          <Icone nome="check" /> {estado.ok}
        </p>
      )}
      <div className="comecar-acoes">
        <button className="botao" disabled={pendente || perfil === atual}>
          {pendente ? "Trocando…" : perfil === atual ? "Este é o seu pacote" : `Trocar para ${PACOTES[perfil].nome}`}
        </button>
      </div>
      <p className="nota">Trocar não apaga nada: só acrescenta as categorias e as abas do novo ramo.</p>
    </form>
  );
}
