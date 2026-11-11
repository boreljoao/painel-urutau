"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import type { AnalisePostInstagram, ArquivoPostInstagram, ConteudoPostInstagram, FormatoPostInstagram, MetricasPostInstagram, SituacaoPostInstagram } from "@/db/schema";
import { ETIQUETA, NOME_FORMATO, dataCurta, doCampoData, miniatura, numero } from "@/lib/instagram/rotulos";
import { Icone } from "@/componentes/Icone";
import { buscarCanais, desligarBuffer, enviarPost, excluirPost, ligarBuffer } from "./acoes";

export interface Post {
  id: string;
  tema: string;
  objetivo: string | null;
  orientacoes: string | null;
  formato: FormatoPostInstagram;
  arquivos: ArquivoPostInstagram[];
  modo: string;
  situacao: SituacaoPostInstagram;
  conteudo: ConteudoPostInstagram | null;
  analise: AnalisePostInstagram | null;
  envio: string | null;
  bufferPostId: string | null;
  agendadoPara: string | null;
  publicadoEm: string | null;
  linkInstagram: string | null;
  metricas: MetricasPostInstagram | null;
  erro: string | null;
  criadoEm: string;
  atualizadoEm: string;
}

export function Selo({ situacao }: { situacao: SituacaoPostInstagram }) {
  const e = ETIQUETA[situacao];
  return <span className={`ig-selo ${e.tom}`}>{e.nome}</span>;
}

export function Miniatura({ post, grande = false }: { post: Pick<Post, "id" | "arquivos" | "conteudo" | "formato">; grande?: boolean }) {
  const src = miniatura(post);
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={`ig-mini${grande ? " grande" : ""}`} src={src} alt="" loading="lazy" />
  ) : (
    <span className={`ig-mini vazia${grande ? " grande" : ""}`} aria-hidden="true">
      <Icone nome="instagram" />
    </span>
  );
}

/** Ligação com o Buffer: conferir a chave, escolher o perfil, desligar. */
export function Conexao({ empresaId, conta, podeLigar, compacta = false }: { empresaId: string; conta: { canalNome: string } | null; podeLigar: boolean; compacta?: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState("");
  const [canais, setCanais] = useState<{ id: string; nome: string }[]>();
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  if (conta)
    return (
      <span className="ig-conectado" title={`Enviando para ${conta.canalNome} pelo Buffer`}>
        <span className="ig-ponto" aria-hidden="true" /> Buffer conectado · @{conta.canalNome}
        {podeLigar && !compacta && (
          <button type="button" className="link" disabled={pendente} onClick={() => iniciar(async () => { await desligarBuffer(empresaId); location.reload(); })}>
            Desligar
          </button>
        )}
      </span>
    );

  if (!podeLigar) return <span className="ig-conectado desligado">Buffer não conectado</span>;

  if (!aberto)
    return (
      <button type="button" className="botao-pequeno" onClick={() => setAberto(true)}>
        <Icone nome="instagram" /> Ligar Instagram
      </button>
    );

  return (
    <div className="cartao ig-ligar">
      <h2>Ligar o Instagram da empresa</h2>
      <ol className="nota">
        <li>No Buffer, ligue o Instagram da empresa (conta comercial ou de criador).</li>
        <li>
          Gere uma chave em{" "}
          <a className="link" href="https://publish.buffer.com/settings/api" target="_blank" rel="noreferrer">
            publish.buffer.com/settings/api
          </a>{" "}
          e cole abaixo. Ela fica guardada cifrada.
        </li>
      </ol>
      <label className="campo">
        <span>Chave da API do Buffer</span>
        <input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} />
      </label>
      {erro && <p className="ig-erro">{erro}</p>}
      <div className="ig-acoes">
        {canais ? (
          canais.map((c) => (
            <button
              key={c.id}
              type="button"
              className="botao"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await ligarBuffer(empresaId, chave, c.id);
                  if (r.erro) return setErro(r.erro);
                  location.reload();
                })
              }
            >
              Usar @{c.nome}
            </button>
          ))
        ) : (
          <button
            type="button"
            className="botao"
            disabled={pendente || chave.trim().length < 10}
            onClick={() =>
              iniciar(async () => {
                setErro(undefined);
                const r = await buscarCanais(empresaId, chave);
                if ("erro" in r) return setErro(r.erro);
                setCanais(r.canais);
              })
            }
          >
            {pendente ? "Conferindo…" : "Conferir chave"}
          </button>
        )}
        <button type="button" className="link" onClick={() => setAberto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

/** Publicar agora, pôr na fila ou marcar data e hora. */
export function Envio({ empresaId, post, ligado, depois }: { empresaId: string; post: Post; ligado: boolean; depois?: () => void }) {
  const [quando, setQuando] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const pode = !!post.conteudo && !!post.analise && (post.situacao === "pronto" || (post.situacao === "erro" && !!post.conteudo));
  if (!pode) return null;
  if (!ligado) return <p className="nota">Ligue o Instagram (Buffer) no topo da página para publicar. Enquanto isso, copie a legenda e baixe a arte.</p>;

  const mandar = (q: Parameters<typeof enviarPost>[2]) =>
    iniciar(async () => {
      setErro(undefined);
      const r = await enviarPost(empresaId, post.id, q);
      if (r.erro) return setErro(r.erro);
      depois?.();
    });

  return (
    <div className="ig-envio">
      <div className="ig-acoes">
        <button type="button" className="botao" disabled={pendente} onClick={() => mandar({ tipo: "agora" })}>
          <Icone nome="enviar" /> Publicar agora
        </button>
        <button type="button" className="botao-pequeno" disabled={pendente} onClick={() => mandar({ tipo: "fila" })}>
          Próximo horário da fila
        </button>
      </div>
      <div className="ig-agendar">
        <label className="campo">
          <span>Ou agende</span>
          <input type="datetime-local" value={quando} onChange={(e) => setQuando(e.target.value)} />
        </label>
        <button type="button" className="botao-pequeno" disabled={pendente || !quando} onClick={() => mandar({ tipo: "data", em: doCampoData(quando) })}>
          <Icone nome="agenda" /> Agendar
        </button>
      </div>
      {erro && <p className="ig-erro">{erro}</p>}
    </div>
  );
}

const ETAPAS: { chave: SituacaoPostInstagram[]; nome: string }[] = [
  { chave: ["criando"], nome: "Criando" },
  { chave: ["analisando"], nome: "Analisando" },
  { chave: ["pronto"], nome: "Pronto" },
  { chave: ["enviando", "enviado", "agendado"], nome: "Enviando" },
  { chave: ["publicado"], nome: "Publicado" },
];

function etapaDe(p: Post) {
  if (p.situacao === "rascunho") return -1;
  if (p.situacao !== "erro") return ETAPAS.findIndex((e) => e.chave.includes(p.situacao));
  if (p.envio) return 3;
  return p.conteudo ? 2 : 0;
}

export function Etapas({ post }: { post: Post }) {
  const etapa = etapaDe(post);
  const trabalhando = ["criando", "analisando", "enviando", "enviado"].includes(post.situacao);
  return (
    <ol className={`ig-etapas${trabalhando ? " trabalhando" : ""}`} aria-label="Etapas do post">
      {ETAPAS.map((e, i) => {
        const feita = i < etapa || post.situacao === "publicado";
        return (
          <li key={e.nome} className={feita ? "feita" : i === etapa ? (post.situacao === "erro" ? "falhou" : "agora") : ""}>
            <span>{feita ? <Icone nome="check" /> : i + 1}</span>
            {i === 3 && post.situacao === "agendado" ? "Agendado" : e.nome}
          </li>
        );
      })}
    </ol>
  );
}

/** O cartão completo de um post: etapas, arte, nota, legenda, conferência e envio. */
export function CartaoPost({ post, empresaId, ligado, atualizar }: { post: Post; empresaId: string; ligado: boolean; atualizar: () => void }) {
  const [pendente, iniciar] = useTransition();
  const [copiado, setCopiado] = useState(false);
  const c = post.conteudo;
  const a = post.analise;
  const trabalhando = ["criando", "analisando", "enviando", "enviado"].includes(post.situacao);

  return (
    <li className="cartao ig-post">
      <div className="ig-post-topo">
        <Selo situacao={post.situacao} />
        <span className="pilula">{NOME_FORMATO[post.formato]}</span>
        <span className="nota">
          {post.publicadoEm ? `Publicado ${dataCurta(post.publicadoEm)}` : post.agendadoPara ? `Agendado para ${dataCurta(post.agendadoPara)}` : `Criado ${dataCurta(post.criadoEm)}`}
        </span>
        <Link className="link ig-editar" href={`instagram/novo?id=${post.id}`}>
          Abrir
        </Link>
      </div>
      <Etapas post={post} />
      <p className="ig-tema">{post.tema}</p>
      {post.situacao === "erro" && <p className="ig-erro">{post.erro}</p>}
      {post.situacao === "criando" && <p className="nota">A IA está olhando os materiais e escrevendo o post…</p>}

      {c && (
        <div className="ig-corpo">
          {a ? <Miniatura post={post} grande /> : <div className="ig-arte ig-arte-espera" aria-hidden="true" />}
          <div className="ig-texto">
            {a && (
              <div className={`ig-nota ${a.veredito}`}>
                <strong>{a.nota}</strong>
                <span>
                  {a.veredito === "forte" ? "Post forte" : a.veredito === "ok" ? "Dá para postar" : "Gancho fraco"}
                  <small>gancho {a.gancho.nota}/100</small>
                </span>
              </div>
            )}
            <div className="ig-legenda">
              {a ? (
                <>
                  <mark title="O que aparece no feed antes do “mais”">{a.visivelNoFeed}</mark>
                  {c.legenda.slice(a.visivelNoFeed.length)}
                </>
              ) : (
                c.legenda
              )}
            </div>
            {post.metricas && <Metricas m={post.metricas} />}
          </div>
        </div>
      )}

      <Envio empresaId={empresaId} post={post} ligado={ligado} depois={atualizar} />
      <div className="ig-acoes">
        {c && a && (
          <button
            type="button"
            className="botao-pequeno"
            onClick={async () => {
              await navigator.clipboard.writeText(c.legenda);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 1500);
            }}
          >
            {copiado ? "Copiado" : "Copiar legenda"}
          </button>
        )}
        {c && a && !post.arquivos.some((x) => x.tipo === "imagem") && (
          <a className="botao-pequeno" href={`/arte/${post.id}.png`} download>
            Baixar arte
          </a>
        )}
        {post.linkInstagram && (
          <a className="botao-pequeno" href={post.linkInstagram} target="_blank" rel="noreferrer">
            Ver no Instagram
          </a>
        )}
        {!trabalhando && (
          <button type="button" className="link ig-excluir" disabled={pendente} onClick={() => {
              const aviso =
                post.situacao === "agendado"
                  ? "Cancelar o agendamento no Buffer e apagar este post?"
                  : post.situacao === "publicado" || post.situacao === "enviado"
                    ? "Apagar daqui? O post continua no Instagram: para tirar de lá, apague pelo app do Instagram."
                    : "Apagar este post?";
              if (!window.confirm(aviso)) return;
              iniciar(async () => {
                const r = await excluirPost(empresaId, post.id);
                if (r.erro) window.alert(r.erro);
                atualizar();
              });
            }}>
            Excluir
          </button>
        )}
      </div>
    </li>
  );
}

export function Metricas({ m }: { m: MetricasPostInstagram }) {
  const itens = [
    ["Visualizações", m.visualizacoes],
    ["Alcance", m.alcance],
    ["Curtidas", m.curtidas],
    ["Comentários", m.comentarios],
    ["Salvos", m.salvos],
    ["Compartilhados", m.compartilhamentos],
  ].filter(([, v]) => v != null) as [string, number][];
  if (!itens.length) return null;
  return (
    <dl className="ig-metricas">
      {itens.map(([n, v]) => (
        <div key={n}>
          <dt>{n}</dt>
          <dd>{numero(v)}</dd>
        </div>
      ))}
    </dl>
  );
}
