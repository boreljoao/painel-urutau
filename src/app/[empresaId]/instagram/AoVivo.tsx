"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { AnalisePostInstagram, ConteudoPostInstagram, SituacaoPostInstagram } from "@/db/schema";
import { Icone } from "@/componentes/Icone";
import { buscarCanais, criarPost, desligarBuffer, enviarPost, excluirPost, ligarBuffer, postsAoVivo } from "./acoes";

interface Post {
  id: string;
  tema: string;
  situacao: SituacaoPostInstagram;
  conteudo: ConteudoPostInstagram | null;
  analise: AnalisePostInstagram | null;
  envio: string | null;
  erro: string | null;
  atualizadoEm: string;
}

const ETAPAS: { chave: SituacaoPostInstagram; nome: string }[] = [
  { chave: "criando", nome: "Criando" },
  { chave: "analisando", nome: "Analisando" },
  { chave: "pronto", nome: "Pronto" },
  { chave: "enviando", nome: "Enviando" },
  { chave: "enviado", nome: "Enviado" },
];

const IDEIAS = ["Bastidores de um dia de trabalho", "Uma dica rápida para nossos clientes", "O erro mais comum que vemos no nosso ramo", "Novidade da semana"];

function etapaDe(p: Post) {
  if (p.situacao !== "erro") return ETAPAS.findIndex((e) => e.chave === p.situacao);
  if (p.envio) return 3;
  return p.conteudo ? 2 : 0;
}

export function InstagramAoVivo({ empresaId, inicial, conta, podeLigar }: { empresaId: string; inicial: Post[]; conta: { canalNome: string } | null; podeLigar: boolean }) {
  const [posts, setPosts] = useState<Post[]>(inicial);
  const [tema, setTema] = useState("");
  const [erro, setErro] = useState<string>();
  const [criando, iniciar] = useTransition();

  const atualizar = useCallback(async () => {
    try {
      setPosts(JSON.parse(JSON.stringify(await postsAoVivo(empresaId))));
    } catch {
      /* sem rede por um instante: tenta no próximo ciclo */
    }
  }, [empresaId]);

  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") atualizar();
    }, 2000);
    return () => clearInterval(t);
  }, [atualizar]);

  const enviar = (texto: string) =>
    iniciar(async () => {
      setErro(undefined);
      const r = await criarPost(empresaId, texto);
      if (r.erro) return setErro(r.erro);
      setTema("");
      await atualizar();
    });

  return (
    <div className="ig">
      <section className="cartao ig-criar">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            enviar(tema);
          }}
        >
          <label className="campo">
            <span>Sobre o que é o post?</span>
            <textarea
              value={tema}
              onChange={(e) => setTema(e.target.value)}
              rows={3}
              maxLength={600}
              placeholder="Ex.: fechamos 3 contratos esta semana com o atendimento 24h no WhatsApp"
            />
          </label>
          <div className="ig-ideias">
            {IDEIAS.map((i) => (
              <button key={i} type="button" className="pilula" onClick={() => setTema(i)}>
                {i}
              </button>
            ))}
          </div>
          {erro && <p className="ig-erro">{erro}</p>}
          <button className="botao" disabled={criando || tema.trim().length < 3}>
            {criando ? "Começando…" : "Criar post com IA"}
          </button>
        </form>
        <Conexao empresaId={empresaId} conta={conta} podeLigar={podeLigar} />
      </section>

      {posts.length === 0 ? (
        <p className="nota centro">Nenhum post ainda. O primeiro aparece aqui, ao vivo, em todas as telas abertas nesta empresa.</p>
      ) : (
        <ul className="ig-lista">
          {posts.map((p) => (
            <CartaoPost key={p.id} post={p} empresaId={empresaId} ligado={!!conta} atualizar={atualizar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Conexao({ empresaId, conta, podeLigar }: { empresaId: string; conta: { canalNome: string } | null; podeLigar: boolean }) {
  const [aberto, setAberto] = useState(false);
  const [chave, setChave] = useState("");
  const [canais, setCanais] = useState<{ id: string; nome: string }[]>();
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();

  if (conta)
    return (
      <div className="ig-conexao ligado">
        <span className="ig-ponto" aria-hidden="true" />
        <p>
          Enviando para <strong>{conta.canalNome}</strong> pelo Buffer.
        </p>
        {podeLigar && (
          <button type="button" className="link" onClick={() => iniciar(async () => { await desligarBuffer(empresaId); location.reload(); })} disabled={pendente}>
            Desligar
          </button>
        )}
      </div>
    );

  if (!podeLigar) return <p className="nota ig-conexao">O dono da empresa precisa ligar o Buffer para os posts saírem. Dá para criar e analisar assim mesmo.</p>;

  if (!aberto)
    return (
      <div className="ig-conexao">
        <p className="nota">Para publicar de verdade, ligue o Instagram da empresa pelo Buffer. Sem isso, os posts ficam prontos para copiar.</p>
        <button type="button" className="botao-pequeno" onClick={() => setAberto(true)}>
          Ligar Instagram
        </button>
      </div>
    );

  return (
    <div className="ig-conexao aberta">
      <ol className="nota">
        <li>
          No Buffer, ligue o Instagram da empresa (conta comercial ou de criador).
        </li>
        <li>
          Gere uma chave em{" "}
          <a className="link" href="https://publish.buffer.com/settings/api" target="_blank" rel="noreferrer">
            publish.buffer.com/settings/api
          </a>{" "}
          e cole abaixo.
        </li>
      </ol>
      <label className="campo">
        <span>Chave da API do Buffer</span>
        <input type="password" autoComplete="off" value={chave} onChange={(e) => setChave(e.target.value)} />
      </label>
      {canais && (
        <div className="ig-canais">
          {canais.map((c) => (
            <button
              key={c.id}
              type="button"
              className="botao-pequeno"
              disabled={pendente}
              onClick={() =>
                iniciar(async () => {
                  const r = await ligarBuffer(empresaId, chave, c.id);
                  if (r.erro) return setErro(r.erro);
                  location.reload();
                })
              }
            >
              Usar {c.nome}
            </button>
          ))}
        </div>
      )}
      {erro && <p className="ig-erro">{erro}</p>}
      {!canais && (
        <button
          type="button"
          className="botao-pequeno"
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
    </div>
  );
}

function CartaoPost({ post, empresaId, ligado, atualizar }: { post: Post; empresaId: string; ligado: boolean; atualizar: () => Promise<void> }) {
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState<string>();
  const [copiado, setCopiado] = useState(false);
  const etapa = etapaDe(post);
  const c = post.conteudo;
  const a = post.analise;
  const trabalhando = post.situacao === "criando" || post.situacao === "analisando" || post.situacao === "enviando";
  const podeEnviar = !!c && !!a && (post.situacao === "pronto" || (post.situacao === "erro" && !!post.envio));

  const mandar = (agora: boolean) =>
    iniciar(async () => {
      setErro(undefined);
      const r = await enviarPost(empresaId, post.id, agora);
      if (r.erro) setErro(r.erro);
      await atualizar();
    });

  return (
    <li className={`cartao ig-post${trabalhando ? " trabalhando" : ""}`}>
      <ol className="ig-etapas" aria-label="Etapas do post">
        {ETAPAS.map((e, i) => (
          <li key={e.chave} className={i < etapa || post.situacao === "enviado" ? "feita" : i === etapa ? (post.situacao === "erro" ? "falhou" : "agora") : ""}>
            <span>{i < etapa || post.situacao === "enviado" ? <Icone nome="check" /> : i + 1}</span>
            {e.nome}
          </li>
        ))}
      </ol>
      <p className="ig-tema">{post.tema}</p>
      {post.situacao === "erro" && <p className="ig-erro">{post.erro}</p>}
      {post.situacao === "criando" && <p className="nota">A IA está escrevendo o gancho, a legenda, a arte e o roteiro do Reel…</p>}

      {c && (
        <div className="ig-corpo">
          {a ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img className="ig-arte" src={`/arte/${post.id}.png?v=${encodeURIComponent(post.atualizadoEm)}`} alt={c.textoAlternativo} width={1080} height={1350} />
          ) : (
            <div className="ig-arte ig-arte-espera" aria-hidden="true" />
          )}
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
            {!c.legenda.startsWith(c.gancho.replace(/[.!?]+$/, "")) && <p className="ig-gancho">{c.gancho}</p>}
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
            {a && (
              <>
                <ul className="ig-checagens">
                  {a.gancho.pontos.map((p) => (
                    <li key={p.nome} className={p.nota >= 70 ? "ok" : "atencao"} title={p.detalhe}>
                      <Icone nome={p.nota >= 70 ? "check" : "alerta"} />
                      {p.nome}
                      <small>{p.detalhe}</small>
                    </li>
                  ))}
                  {a.checagens.map((ch) => (
                    <li key={ch.nome} className={ch.status}>
                      <Icone nome={ch.status === "ok" ? "check" : "alerta"} />
                      {ch.nome}
                      <small>{ch.detalhe}</small>
                    </li>
                  ))}
                </ul>
                {a.gancho.alertas.map((al) => (
                  <p key={al} className="ig-erro">
                    {al}
                  </p>
                ))}
                {a.limpeza.length > 0 && (
                  <p className="nota">
                    Limpeza: {a.limpeza.map((l) => `“${l.de}” → ${l.para}`).join(" · ")}
                  </p>
                )}
                <details className="ig-reel">
                  <summary>Roteiro para Reel</summary>
                  <ol>
                    {c.roteiroReel.map((f) => (
                      <li key={f}>{f}</li>
                    ))}
                  </ol>
                </details>
              </>
            )}
          </div>
        </div>
      )}

      {erro && <p className="ig-erro">{erro}</p>}
      <div className="ig-acoes">
        {podeEnviar && ligado && (
          <>
            <button type="button" className="botao" disabled={pendente} onClick={() => mandar(true)}>
              <Icone nome="enviar" /> Publicar agora
            </button>
            <button type="button" className="botao-pequeno" disabled={pendente} onClick={() => mandar(false)}>
              Pôr na fila do Buffer
            </button>
          </>
        )}
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
        {c && a && (
          <a className="botao-pequeno" href={`/arte/${post.id}.png`} download={`post-${post.id.slice(0, 8)}.png`}>
            Baixar arte
          </a>
        )}
        {post.situacao === "enviado" && <span className="ig-enviado">{post.envio === "fila" ? "Na fila do Buffer" : "Publicado pelo Buffer"}</span>}
        {!trabalhando && (
          <button type="button" className="link ig-excluir" disabled={pendente} onClick={() => iniciar(async () => { await excluirPost(empresaId, post.id); await atualizar(); })}>
            Excluir
          </button>
        )}
      </div>
    </li>
  );
}
