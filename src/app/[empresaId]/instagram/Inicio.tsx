"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { ETIQUETA, LEGENDA_CALENDARIO, NOME_FORMATO, dataCurta, dataNoCalendario, diaDe, horaDe, numero, tituloDo } from "@/lib/instagram/rotulos";
import { Icone } from "@/componentes/Icone";
import { planejarSemanaAcao, postsAoVivo } from "./acoes";
import { CartaoPost, Conexao, Metricas, Miniatura, type Post, Selo } from "./Componentes";

type Aba = "calendario" | "conteudos" | "desempenho";
const DIAS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

/** Soma dias a "AAAA-MM-DD" sem passar por fuso. */
function somar(dia: string, n: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const diaDaSemana = (dia: string) => new Date(`${dia}T12:00:00Z`).getUTCDay();

export function Inicio({ empresaId, inicial, conta, podeLigar }: { empresaId: string; inicial: Post[]; conta: { canalNome: string } | null; podeLigar: boolean }) {
  const [posts, setPosts] = useState<Post[]>(inicial);
  const [aba, setAba] = useState<Aba>("calendario");
  const hoje = diaDe(new Date());
  const [visao, setVisao] = useState<"mes" | "semana">("mes");
  const [foco, setFoco] = useState(hoje);

  const atualizar = useCallback(async () => {
    try {
      setPosts(JSON.parse(JSON.stringify(await postsAoVivo(empresaId))));
    } catch {
      /* sem rede por um instante */
    }
  }, [empresaId]);

  useEffect(() => {
    atualizar();
    const t = setInterval(() => document.visibilityState === "visible" && atualizar(), 3000);
    return () => clearInterval(t);
  }, [atualizar]);

  const numeros = useMemo(() => {
    const soma = (k: "visualizacoes" | "curtidas") => posts.reduce((s, p) => s + (p.metricas?.[k] ?? 0), 0);
    return {
      gerados: posts.filter((p) => p.conteudo).length,
      publicados: posts.filter((p) => p.situacao === "publicado").length,
      visualizacoes: soma("visualizacoes"),
      curtidas: soma("curtidas"),
    };
  }, [posts]);

  return (
    <div className="ig2">
      <header className="ig2-topo">
        <div>
          <h1>Instagram</h1>
          <p>Planeje, acompanhe e publique os conteúdos da empresa.</p>
        </div>
        <div className="ig2-topo-acoes">
          <Conexao empresaId={empresaId} conta={conta} podeLigar={podeLigar} />
          <Link className="botao" href={`/${empresaId}/instagram/novo`}>
            <span aria-hidden="true">+</span> Novo post
          </Link>
        </div>
      </header>

      <nav className="ig2-abas" aria-label="Seções do Instagram">
        {(
          [
            ["calendario", "Calendário", "agenda"],
            ["conteudos", "Conteúdos", "caixa"],
            ["desempenho", "Desempenho", "financeiro"],
          ] as const
        ).map(([k, nome, icone]) => (
          <button key={k} type="button" className={aba === k ? "ativa" : ""} aria-pressed={aba === k} onClick={() => setAba(k)}>
            <Icone nome={icone} /> {nome}
          </button>
        ))}
      </nav>

      <div className="ig2-grade">
        <div className="ig2-principal">
          <section className="ig2-numeros" aria-label="Resumo">
            <Numero icone="instagram" nome="Posts gerados" valor={numeros.gerados} />
            <Numero icone="enviar" nome="Publicados" valor={numeros.publicados} />
            <Numero icone="busca" nome="Visualizações" valor={numeros.visualizacoes} />
            <Numero icone="check" nome="Curtidas" valor={numeros.curtidas} />
          </section>

          {aba === "calendario" && <Calendario empresaId={empresaId} posts={posts} hoje={hoje} visao={visao} setVisao={setVisao} foco={foco} setFoco={setFoco} />}
          {aba === "conteudos" && <Conteudos empresaId={empresaId} posts={posts} ligado={!!conta} atualizar={atualizar} />}
          {aba === "desempenho" && <Desempenho posts={posts} />}
        </div>

        <aside className="ig2-lado">
          <AcoesRapidas empresaId={empresaId} irPara={setAba} atualizar={atualizar} />
          <AtividadeAoVivo posts={posts} />
          <Engajamento posts={posts} />
        </aside>
      </div>
    </div>
  );
}

function Numero({ icone, nome, valor }: { icone: Parameters<typeof Icone>[0]["nome"]; nome: string; valor: number }) {
  return (
    <div className="cartao ig2-numero">
      <span className="ig2-numero-ic">
        <Icone nome={icone} />
      </span>
      <div>
        <p>{nome}</p>
        <strong>{numero(valor)}</strong>
      </div>
    </div>
  );
}

function Calendario({
  empresaId,
  posts,
  hoje,
  visao,
  setVisao,
  foco,
  setFoco,
}: {
  empresaId: string;
  posts: Post[];
  hoje: string;
  visao: "mes" | "semana";
  setVisao: (v: "mes" | "semana") => void;
  foco: string;
  setFoco: (d: string) => void;
}) {
  const porDia = useMemo(() => {
    const m = new Map<string, Post[]>();
    for (const p of posts) {
      if (p.situacao === "rascunho") continue;
      const d = diaDe(dataNoCalendario(p));
      m.set(d, [...(m.get(d) ?? []), p]);
    }
    for (const lista of m.values()) lista.sort((a, b) => dataNoCalendario(a).localeCompare(dataNoCalendario(b)));
    return m;
  }, [posts]);

  const primeiro = `${foco.slice(0, 7)}-01`;
  const dias =
    visao === "mes"
      ? (() => {
          const inicio = somar(primeiro, -diaDaSemana(primeiro));
          const lista: string[] = [];
          for (let d = inicio; lista.length < 42; d = somar(d, 1)) lista.push(d);
          while (lista.length > 35 && lista.slice(-7).every((d) => d.slice(0, 7) !== foco.slice(0, 7))) lista.splice(-7);
          return lista;
        })()
      : Array.from({ length: 7 }, (_, i) => somar(foco, i - diaDaSemana(foco)));
  const mover = (n: number) => {
    if (visao === "semana") return setFoco(somar(foco, n * 7));
    const d = new Date(`${primeiro}T12:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + n);
    setFoco(d.toISOString().slice(0, 10));
  };
  const titulo = `${MESES[Number(foco.slice(5, 7)) - 1]} ${foco.slice(0, 4)}`;

  return (
    <section className="cartao ig2-calendario">
      <div className="ig2-cal-topo">
        <h2>Calendário de conteúdo</h2>
        <div className="ig2-cal-controles">
          <button type="button" className="botao-pequeno" aria-label="Anterior" onClick={() => mover(-1)}>
            ‹
          </button>
          <span className="ig2-cal-titulo">{visao === "semana" ? `Semana de ${dias[0].slice(8)}/${dias[0].slice(5, 7)}` : titulo}</span>
          <button type="button" className="botao-pequeno" aria-label="Próximo" onClick={() => mover(1)}>
            ›
          </button>
          <button type="button" className="botao-pequeno" onClick={() => setFoco(hoje)}>
            Hoje
          </button>
          <div className="ig2-alternar" role="group" aria-label="Visão">
            <button type="button" className={visao === "mes" ? "ativa" : ""} onClick={() => setVisao("mes")}>
              Mês
            </button>
            <button type="button" className={visao === "semana" ? "ativa" : ""} onClick={() => setVisao("semana")}>
              Semana
            </button>
          </div>
        </div>
      </div>
      <ul className="ig2-legenda">
        {LEGENDA_CALENDARIO.map((l) => (
          <li key={l.nome}>
            <span className={`ig2-bola ${l.tom}`} /> {l.nome}
          </li>
        ))}
      </ul>
      <div className={`ig2-mes${visao === "semana" ? " semana" : ""}`}>
        {DIAS.map((d) => (
          <div key={d} className="ig2-dia-nome">
            {d}
          </div>
        ))}
        {dias.map((d) => {
          const lista = porDia.get(d) ?? [];
          const max = visao === "semana" ? 8 : 2;
          return (
            <div key={d} className={`ig2-dia${d === hoje ? " hoje" : ""}${visao === "mes" && d.slice(0, 7) !== foco.slice(0, 7) ? " fora" : ""}`}>
              <span className="ig2-dia-num">{Number(d.slice(8))}</span>
              {lista.slice(0, max).map((p) => {
                const e = ETIQUETA[p.situacao];
                return (
                  <Link key={p.id} href={`/${empresaId}/instagram/novo?id=${p.id}`} className={`ig2-item ${e.tom}`} title={p.tema}>
                    <Miniatura post={p} />
                    <span>
                      <strong>{tituloDo(p)}</strong>
                      <small>
                        {e.nome}
                        {p.situacao === "publicado" || p.agendadoPara ? ` · ${horaDe(dataNoCalendario(p))}` : ""}
                      </small>
                    </span>
                  </Link>
                );
              })}
              {lista.length > max && (
                <button type="button" className="ig2-mais" onClick={() => { setFoco(d); setVisao("semana"); }}>
                  +{lista.length - max}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

const FILTROS = [
  ["todos", "Todos"],
  ["rascunho", "Rascunhos"],
  ["gerado", "Gerados"],
  ["agendado", "Agendados"],
  ["publicado", "Publicados"],
] as const;

function Conteudos({ empresaId, posts, ligado, atualizar }: { empresaId: string; posts: Post[]; ligado: boolean; atualizar: () => void }) {
  const [filtro, setFiltro] = useState<(typeof FILTROS)[number][0]>("todos");
  const lista = posts.filter((p) => {
    if (filtro === "todos") return true;
    if (filtro === "gerado") return ["criando", "analisando", "pronto"].includes(p.situacao);
    if (filtro === "agendado") return ["agendado", "enviando", "enviado"].includes(p.situacao);
    return p.situacao === filtro;
  });
  return (
    <section className="ig2-conteudos">
      <div className="ig-ideias" role="group" aria-label="Filtrar">
        {FILTROS.map(([k, nome]) => (
          <button key={k} type="button" className={`pilula${filtro === k ? " ativa" : ""}`} onClick={() => setFiltro(k)}>
            {nome}
          </button>
        ))}
      </div>
      {lista.length ? (
        <ul className="ig-lista">
          {lista.map((p) => (
            <CartaoPost key={p.id} post={p} empresaId={empresaId} ligado={ligado} atualizar={atualizar} />
          ))}
        </ul>
      ) : (
        <p className="nota centro">Nada aqui ainda.</p>
      )}
    </section>
  );
}

function Desempenho({ posts }: { posts: Post[] }) {
  const publicados = posts.filter((p) => p.situacao === "publicado").sort((a, b) => (b.publicadoEm ?? "").localeCompare(a.publicadoEm ?? ""));
  if (!publicados.length)
    return <p className="cartao nota centro">Os números aparecem aqui quando o primeiro post sair. O painel pergunta ao Buffer a cada poucas horas.</p>;
  const comNota = publicados.filter((p) => p.analise && p.metricas?.visualizacoes != null);
  const media = (lista: Post[]) => (lista.length ? Math.round(lista.reduce((s, p) => s + (p.metricas?.visualizacoes ?? 0), 0) / lista.length) : null);
  const fortes = media(comNota.filter((p) => p.analise!.nota >= 70));
  const fracos = media(comNota.filter((p) => p.analise!.nota < 70));
  return (
    <section className="cartao ig2-desempenho">
      {fortes != null && fracos != null && (
        <p className="nota">
          Posts com nota 70 ou mais tiveram em média <strong>{numero(fortes)}</strong> visualizações; os outros, <strong>{numero(fracos)}</strong>.
        </p>
      )}
      <div className="tabela-rolagem">
        <table className="ig2-tabela">
          <thead>
            <tr>
              <th>Post</th>
              <th>Formato</th>
              <th>Nota</th>
              <th>Visualizações</th>
              <th>Curtidas</th>
              <th>Comentários</th>
              <th>Salvos</th>
            </tr>
          </thead>
          <tbody>
            {publicados.map((p) => (
              <tr key={p.id}>
                <td>
                  <span className="ig2-tabela-post">
                    <Miniatura post={p} />
                    <span>
                      {p.linkInstagram ? (
                        <a className="link" href={p.linkInstagram} target="_blank" rel="noreferrer">
                          {tituloDo(p)}
                        </a>
                      ) : (
                        tituloDo(p)
                      )}
                      <small>{p.publicadoEm && dataCurta(p.publicadoEm)}</small>
                    </span>
                  </span>
                </td>
                <td>{NOME_FORMATO[p.formato]}</td>
                <td>{p.analise?.nota ?? "—"}</td>
                <td>{p.metricas?.visualizacoes != null ? numero(p.metricas.visualizacoes) : "—"}</td>
                <td>{p.metricas?.curtidas != null ? numero(p.metricas.curtidas) : "—"}</td>
                <td>{p.metricas?.comentarios != null ? numero(p.metricas.comentarios) : "—"}</td>
                <td>{p.metricas?.salvos != null ? numero(p.metricas.salvos) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function AcoesRapidas({ empresaId, irPara, atualizar }: { empresaId: string; irPara: (a: Aba) => void; atualizar: () => void }) {
  const [planejando, setPlanejando] = useState(false);
  const [contexto, setContexto] = useState("");
  const [msg, setMsg] = useState<string>();
  const [pendente, iniciar] = useTransition();
  return (
    <section className="cartao ig2-lateral">
      <h2>Ações rápidas</h2>
      <ul className="ig2-atalhos">
        <li>
          <Link href={`/${empresaId}/instagram/novo`}>
            <Icone nome="instagram" /> Criar post <span aria-hidden="true">›</span>
          </Link>
        </li>
        <li>
          <button type="button" onClick={() => setPlanejando((v) => !v)} aria-expanded={planejando}>
            <Icone nome="agenda" /> Planejar a semana com IA <span aria-hidden="true">›</span>
          </button>
        </li>
        <li>
          <button type="button" onClick={() => irPara("conteudos")}>
            <Icone nome="caixa" /> Ver posts gerados <span aria-hidden="true">›</span>
          </button>
        </li>
      </ul>
      {planejando && (
        <form
          className="ig2-planejar"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              setMsg(undefined);
              const r = await planejarSemanaAcao(empresaId, contexto);
              if (r.erro) return setMsg(r.erro);
              setMsg(`${r.quantos} posts entraram no calendário. A IA está escrevendo cada um; você aprova antes de sair.`);
              setContexto("");
              atualizar();
            });
          }}
        >
          <label className="campo">
            <span>O que aconteceu na semana ou o que quer destacar?</span>
            <textarea rows={3} value={contexto} onChange={(e) => setContexto(e.target.value)} placeholder="Ex.: chegaram 2 Corollas 2023, promoção de revisão grátis até sexta" />
          </label>
          <button className="botao" disabled={pendente}>
            {pendente ? "Planejando…" : "Montar a semana"}
          </button>
          {msg && <p className="nota">{msg}</p>}
        </form>
      )}
    </section>
  );
}

function AtividadeAoVivo({ posts }: { posts: Post[] }) {
  const recentes = [...posts].sort((a, b) => b.atualizadoEm.localeCompare(a.atualizadoEm)).slice(0, 5);
  const frase = (p: Post) =>
    ({
      rascunho: "Rascunho salvo",
      criando: "IA escrevendo",
      analisando: "Analisando o post",
      pronto: "Arte e legenda geradas",
      enviando: "Publicando agora",
      enviado: "Publicando agora",
      agendado: "Post agendado",
      publicado: "Publicado",
      erro: "Precisa de atenção",
    })[p.situacao];
  return (
    <section className="cartao ig2-lateral">
      <h2>
        Atividade ao vivo <span className="ig-ponto" aria-hidden="true" />
      </h2>
      {recentes.length ? (
        <ol className="ig2-linha">
          {recentes.map((p) => (
            <li key={p.id} className={ETIQUETA[p.situacao].tom}>
              <strong>{frase(p)}</strong>
              <span>
                {tituloDo(p)}
                {p.situacao === "agendado" && p.agendadoPara ? ` · ${dataCurta(p.agendadoPara)}` : ""}
              </span>
              {["criando", "analisando", "enviando", "enviado"].includes(p.situacao) && <span className="ig2-progresso" aria-hidden="true" />}
            </li>
          ))}
        </ol>
      ) : (
        <p className="nota">Crie o primeiro post: cada etapa aparece aqui na hora, em todas as telas abertas.</p>
      )}
    </section>
  );
}

function Engajamento({ posts }: { posts: Post[] }) {
  const melhor = posts
    .filter((p) => p.situacao === "publicado" && p.metricas)
    .sort((a, b) => (b.metricas?.visualizacoes ?? 0) - (a.metricas?.visualizacoes ?? 0))[0];
  return (
    <section className="cartao ig2-lateral">
      <h2>Engajamento recente</h2>
      {melhor ? (
        <div className="ig2-destaque">
          <div className="ig2-destaque-topo">
            <Miniatura post={melhor} />
            <div>
              <strong>{tituloDo(melhor)}</strong>
              <Selo situacao={melhor.situacao} />
            </div>
          </div>
          <Metricas m={melhor.metricas!} />
        </div>
      ) : (
        <p className="nota">Quando os posts saírem, aqui aparece o que mais rendeu: visualizações, curtidas, comentários e salvos.</p>
      )}
    </section>
  );
}
