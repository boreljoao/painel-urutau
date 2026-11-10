"use client";

import { upload } from "@vercel/blob/client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import type { ArquivoPostInstagram, FormatoPostInstagram } from "@/db/schema";
import { FEED_VISIVEL } from "@/lib/instagram/analise";
import { NOME_FORMATO, doCampoData, paraCampoData } from "@/lib/instagram/rotulos";
import { Icone } from "@/componentes/Icone";
import { type FormularioPost, editarTexto, gerarPost, postsAoVivo, salvarRascunhoAcao } from "../acoes";
import { Conexao, Envio, Etapas, Metricas, type Post, Selo } from "../Componentes";

const PASSOS = ["Materiais", "Conteúdo", "Revisão", "Publicação"] as const;
const FORMATOS: FormatoPostInstagram[] = ["post", "carrossel", "reel", "story"];

function tipoDoArquivo(f: File): ArquivoPostInstagram["tipo"] | null {
  if (f.type.startsWith("image/")) return "imagem";
  if (f.type.startsWith("video/")) return "video";
  if (f.type === "application/pdf") return "documento";
  return null;
}

const tamanho = (b: number) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);
const nomeSeguro = (n: string) =>
  n
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .slice(-80);

export function NovoPost({
  empresaId,
  empresaNome,
  conta,
  podeLigar,
  inicial,
  objetivos,
}: {
  empresaId: string;
  empresaNome: string;
  conta: { canalNome: string } | null;
  podeLigar: boolean;
  inicial: Post | null;
  objetivos: string[];
}) {
  const router = useRouter();
  const [id, setId] = useState(inicial?.id);
  const [post, setPost] = useState<Post | null>(inicial);
  const [passo, setPasso] = useState(() => (!inicial || inicial.situacao === "rascunho" ? 0 : ["pronto", "erro"].includes(inicial.situacao) && inicial.conteudo ? 2 : inicial.conteudo ? 3 : 1));
  const [form, setForm] = useState<FormularioPost>({
    tema: inicial?.tema === "Rascunho" ? "" : (inicial?.tema ?? ""),
    objetivo: inicial?.objetivo ?? objetivos[0],
    orientacoes: inicial?.orientacoes ?? "",
    formato: inicial?.formato ?? "post",
    arquivos: inicial?.arquivos ?? [],
    modo: (inicial?.modo as "revisar" | "automatico") ?? "revisar",
    agendadoPara: inicial?.agendadoPara ? doCampoData(paraCampoData(inicial.agendadoPara)) : "",
  });
  const [subindo, setSubindo] = useState<{ nome: string; pct: number }[]>([]);
  const [erro, setErro] = useState<string>();
  const [aviso, setAviso] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const campoArquivo = useRef<HTMLInputElement>(null);
  const [aceita, setAceita] = useState("image/*,video/*,application/pdf");
  const mudar = <K extends keyof FormularioPost>(k: K, v: FormularioPost[K]) => setForm((f) => ({ ...f, [k]: v }));

  const atualizar = useCallback(async () => {
    if (!id) return;
    try {
      const todos: Post[] = JSON.parse(JSON.stringify(await postsAoVivo(empresaId)));
      const p = todos.find((x) => x.id === id);
      if (p) setPost(p);
    } catch {
      /* tenta no próximo ciclo */
    }
  }, [empresaId, id]);

  useEffect(() => {
    const t = setInterval(() => document.visibilityState === "visible" && atualizar(), 2000);
    return () => clearInterval(t);
  }, [atualizar]);

  async function enviarArquivos(lista: FileList | File[]) {
    setErro(undefined);
    const arquivos = [...lista];
    for (const f of arquivos) {
      const tipo = tipoDoArquivo(f);
      if (!tipo) {
        setErro(`${f.name}: use foto (JPG, PNG), vídeo (MP4, MOV) ou PDF.`);
        continue;
      }
      setSubindo((s) => [...s, { nome: f.name, pct: 0 }]);
      try {
        const r = await upload(`instagram/${empresaId}/${nomeSeguro(f.name)}`, f, {
          access: "public",
          handleUploadUrl: "/api/instagram/upload",
          clientPayload: JSON.stringify({ empresaId }),
          multipart: f.size > 8 * 1048576,
          onUploadProgress: ({ percentage }) => setSubindo((s) => s.map((x) => (x.nome === f.name ? { ...x, pct: percentage } : x))),
        });
        setForm((fm) => ({ ...fm, arquivos: [...fm.arquivos, { url: r.url, nome: f.name, tipo, bytes: f.size }] }));
      } catch (e) {
        setErro(`${f.name}: não foi possível enviar (${e instanceof Error ? e.message : "erro"}).`);
      } finally {
        setSubindo((s) => s.filter((x) => x.nome !== f.name));
      }
    }
  }

  const adicionarLink = () => {
    const url = prompt("Cole o link da inspiração (um post ou perfil do Instagram, por exemplo):");
    if (!url) return;
    if (!/^https?:\/\//.test(url)) return setErro("O link precisa começar com http:// ou https://");
    mudar("arquivos", [...form.arquivos, { url, nome: url.replace(/^https?:\/\/(www\.)?/, "").slice(0, 60), tipo: "link", bytes: 0 }]);
  };

  const salvar = () =>
    iniciar(async () => {
      setErro(undefined);
      const r = await salvarRascunhoAcao(empresaId, form, id);
      if (r.erro) return setErro(r.erro);
      setId(r.id);
      setAviso("Rascunho salvo.");
      setTimeout(() => setAviso(undefined), 2000);
      if (!id && r.id) router.replace(`/${empresaId}/instagram/novo?id=${r.id}`, { scroll: false });
    });

  const gerar = () =>
    iniciar(async () => {
      setErro(undefined);
      const r = await gerarPost(empresaId, form, id);
      if (r.erro) return setErro(r.erro);
      setId(r.id);
      if (!id && r.id) router.replace(`/${empresaId}/instagram/novo?id=${r.id}`, { scroll: false });
      setPost((p) => (p ? { ...p, situacao: "criando", conteudo: null, analise: null } : p));
      setPasso(1);
    });

  const temConteudo = !!post?.conteudo && !!post.analise;
  const podeIr = (i: number) => i === 0 || (i === 1 && !!id) || (i >= 2 && temConteudo);

  return (
    <div className="ig2 ig-novo">
      <header className="ig2-topo">
        <div>
          <p className="ig-trilha">
            <Link className="link" href={`/${empresaId}/instagram`}>
              Instagram
            </Link>{" "}
            / {inicial ? "Post" : "Novo post"}
          </p>
          <h1>{inicial ? "Editar post" : "Criar novo post"}</h1>
          <p>Adicione os materiais, a IA monta o conteúdo, você revisa e publica.</p>
        </div>
        <div className="ig2-topo-acoes">
          {post && <Selo situacao={post.situacao} />}
          <button type="button" className="botao-pequeno" onClick={salvar} disabled={pendente}>
            <Icone nome="documento" /> {aviso ?? "Salvar rascunho"}
          </button>
        </div>
      </header>

      <ol className="ig-passos">
        {PASSOS.map((nome, i) => (
          <li key={nome} className={i === passo ? "agora" : i < passo ? "feito" : ""}>
            <button type="button" disabled={!podeIr(i)} onClick={() => setPasso(i)}>
              <span>{i < passo ? <Icone nome="check" /> : i + 1}</span> {nome}
            </button>
          </li>
        ))}
      </ol>

      <div className="ig2-grade">
        <div className="ig2-principal">
          {passo === 0 && (
            <>
              <section className="cartao ig-materiais">
                <h2>Materiais do post</h2>
                <div
                  className="ig-solta"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    enviarArquivos(e.dataTransfer.files);
                  }}
                >
                  <Icone nome="caixa" />
                  <strong>Arraste seus arquivos aqui</strong>
                  <span className="nota">Fotos, vídeos (até 300 MB) e PDF com ficha técnica ou cardápio.</span>
                  <button
                    type="button"
                    className="botao-pequeno"
                    onClick={() => {
                      setAceita("image/*,video/*,application/pdf");
                      setTimeout(() => campoArquivo.current?.click());
                    }}
                  >
                    Selecionar arquivos
                  </button>
                  <input
                    ref={campoArquivo}
                    type="file"
                    multiple
                    accept={aceita}
                    hidden
                    onChange={(e) => {
                      if (e.target.files) enviarArquivos(e.target.files);
                      e.target.value = "";
                    }}
                  />
                </div>
                <div className="ig-tipos">
                  {(
                    [
                      ["Fotos", "image/*"],
                      ["Vídeos", "video/*"],
                      ["Documentos", "application/pdf"],
                    ] as const
                  ).map(([nome, tipo]) => (
                    <button
                      key={nome}
                      type="button"
                      className="ig-tipo"
                      onClick={() => {
                        setAceita(tipo);
                        setTimeout(() => campoArquivo.current?.click());
                      }}
                    >
                      {nome} <span aria-hidden="true">+</span>
                    </button>
                  ))}
                  <button type="button" className="ig-tipo" onClick={adicionarLink}>
                    Inspirações <span aria-hidden="true">+</span>
                  </button>
                </div>
                {(form.arquivos.length > 0 || subindo.length > 0) && (
                  <>
                    <h3>Arquivos adicionados</h3>
                    <ul className="ig-arquivos">
                      {form.arquivos.map((a) => (
                        <li key={a.url}>
                          {a.tipo === "imagem" ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={a.url} alt="" />
                          ) : (
                            <span className={`ig-arq-ic ${a.tipo}`}>{a.tipo === "video" ? "▶" : a.tipo === "documento" ? "PDF" : "↗"}</span>
                          )}
                          <span>
                            <strong>{a.nome}</strong>
                            <small>{a.tipo === "link" ? "Link externo" : tamanho(a.bytes)}</small>
                          </span>
                          <button type="button" className="link" aria-label={`Remover ${a.nome}`} onClick={() => mudar("arquivos", form.arquivos.filter((x) => x.url !== a.url))}>
                            Remover
                          </button>
                        </li>
                      ))}
                      {subindo.map((s) => (
                        <li key={s.nome} className="subindo">
                          <span className="ig-arq-ic">…</span>
                          <span>
                            <strong>{s.nome}</strong>
                            <small>Enviando {Math.round(s.pct)}%</small>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </section>

              <section className="cartao ig-briefing">
                <h2>Briefing do post</h2>
                <div className="ig-campos">
                  <label className="campo">
                    <span>Tema do post *</span>
                    <input value={form.tema} onChange={(e) => mudar("tema", e.target.value)} placeholder="Ex.: Apresentar o Toyota Corolla 2023" maxLength={600} />
                  </label>
                  <label className="campo">
                    <span>Objetivo *</span>
                    <select value={form.objetivo} onChange={(e) => mudar("objetivo", e.target.value)}>
                      {objetivos.map((o) => (
                        <option key={o}>{o}</option>
                      ))}
                    </select>
                  </label>
                  <label className="campo">
                    <span>Formato *</span>
                    <select value={form.formato} onChange={(e) => mudar("formato", e.target.value as FormatoPostInstagram)}>
                      {FORMATOS.map((f) => (
                        <option key={f} value={f}>
                          {NOME_FORMATO[f]}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="campo">
                  <span>Orientações para a IA (opcional)</span>
                  <textarea
                    rows={3}
                    value={form.orientacoes}
                    onChange={(e) => mudar("orientacoes", e.target.value)}
                    placeholder="Ex.: destacar o estado de conservação, os principais diferenciais e a disponibilidade no pátio."
                  />
                </label>
                {form.formato === "reel" && !form.arquivos.some((a) => a.tipo === "video") && <p className="nota">Reel precisa de um vídeo nos materiais.</p>}
                {form.formato === "carrossel" && form.arquivos.filter((a) => a.tipo === "imagem").length < 2 && (
                  <p className="nota">Com menos de 2 fotos, o painel monta o carrossel com artes nas cores da empresa.</p>
                )}
                {erro && <p className="ig-erro">{erro}</p>}
                <button type="button" className="botao" disabled={pendente || subindo.length > 0 || form.tema.trim().length < 3} onClick={gerar}>
                  ✦ {pendente ? "Começando…" : temConteudo ? "Gerar de novo com IA" : "Gerar conteúdo com IA"}
                </button>
              </section>
            </>
          )}

          {passo === 1 && post && <PassoConteudo empresaId={empresaId} post={post} voltar={() => setPasso(0)} seguir={() => setPasso(2)} atualizar={atualizar} />}

          {passo === 2 && post?.analise && post.conteudo && (
            <section className="cartao ig-revisao">
              <h2>Revisão</h2>
              <div className={`ig-nota ${post.analise.veredito}`}>
                <strong>{post.analise.nota}</strong>
                <span>
                  {post.analise.veredito === "forte" ? "Post forte" : post.analise.veredito === "ok" ? "Dá para postar" : "Gancho fraco: vale reescrever"}
                  <small>gancho {post.analise.gancho.nota}/100</small>
                </span>
              </div>
              <ul className="ig-checagens">
                {post.analise.gancho.pontos.map((p) => (
                  <li key={p.nome} className={p.nota >= 70 ? "ok" : "atencao"}>
                    <Icone nome={p.nota >= 70 ? "check" : "alerta"} />
                    {p.nome}
                    <small>{p.detalhe}</small>
                  </li>
                ))}
                {post.analise.checagens.map((c) => (
                  <li key={c.nome} className={c.status}>
                    <Icone nome={c.status === "ok" ? "check" : "alerta"} />
                    {c.nome}
                    <small>{c.detalhe}</small>
                  </li>
                ))}
              </ul>
              {post.analise.gancho.alertas.map((a) => (
                <p key={a} className="ig-erro">
                  {a}
                </p>
              ))}
              {post.analise.limpeza.length > 0 && (
                <p className="nota">Trocado automaticamente: {post.analise.limpeza.map((l) => `“${l.de}” → ${l.para}`).join(" · ")}</p>
              )}
              <h3>O que aparece no feed antes do “mais”</h3>
              <p className="ig-feed-corte">{post.analise.visivelNoFeed}…</p>
              <p className="nota">A nota descarta ganchos fracos; quem decide se o post vai longe é o público. Depois de publicado, o Desempenho mostra os números de verdade.</p>
              <div className="ig-acoes">
                <button type="button" className="botao-pequeno" onClick={() => setPasso(1)}>
                  Ajustar o texto
                </button>
                <button type="button" className="botao" onClick={() => setPasso(3)}>
                  Seguir para publicação
                </button>
              </div>
            </section>
          )}

          {passo === 3 && post && (
            <section className="cartao ig-publicacao">
              <h2>Publicação</h2>
              <Etapas post={post} />
              {post.situacao === "erro" && <p className="ig-erro">{post.erro}</p>}
              <Envio empresaId={empresaId} post={post} ligado={!!conta} depois={atualizar} />
              {post.situacao === "agendado" && <p className="nota">Agendado no Buffer. Ele publica sozinho na hora marcada, mesmo com o painel fechado.</p>}
              {(post.situacao === "enviado" || post.situacao === "enviando") && <p className="nota">Enviando ao Instagram pelo Buffer…</p>}
              {post.situacao === "publicado" && (
                <>
                  <p className="ig-enviado">Publicado no Instagram.</p>
                  {post.metricas && <Metricas m={post.metricas} />}
                  {post.linkInstagram && (
                    <a className="botao-pequeno" href={post.linkInstagram} target="_blank" rel="noreferrer">
                      Ver no Instagram
                    </a>
                  )}
                </>
              )}
              {!conta && <Conexao empresaId={empresaId} conta={conta} podeLigar={podeLigar} />}
              <Link className="link" href={`/${empresaId}/instagram`}>
                Voltar ao calendário
              </Link>
            </section>
          )}
        </div>

        <aside className="ig2-lado">
          <Previa empresaNome={empresaNome} conta={conta} form={form} post={post} />
          <section className="cartao ig2-lateral">
            <h2>Modo de publicação</h2>
            <div className="ig-modo" role="radiogroup">
              {(
                [
                  ["revisar", "Revisar antes de publicar", "Você confere o texto e escolhe quando sai."],
                  ["automatico", "Publicação automática", "Saiu da IA com tudo certo, vai para o Buffer sozinho."],
                ] as const
              ).map(([k, nome, desc]) => (
                <label key={k} className={form.modo === k ? "ativo" : ""}>
                  <input type="radio" name="modo" checked={form.modo === k} onChange={() => mudar("modo", k)} />
                  <span>
                    <strong>{nome}</strong>
                    <small>{desc}</small>
                  </span>
                </label>
              ))}
            </div>
            {form.modo === "automatico" && (
              <label className="campo">
                <span>Quando publicar</span>
                <input type="datetime-local" value={paraCampoData(form.agendadoPara || null)} onChange={(e) => mudar("agendadoPara", doCampoData(e.target.value))} />
                <small className="nota">Vazio: próximo horário livre da fila do Buffer.</small>
              </label>
            )}
            {form.modo === "automatico" && !conta && <p className="nota">Ligue o Instagram (Buffer) para a publicação automática funcionar.</p>}
          </section>
        </aside>
      </div>
    </div>
  );
}

function PassoConteudo({ empresaId, post, voltar, seguir, atualizar }: { empresaId: string; post: Post; voltar: () => void; seguir: () => void; atualizar: () => void }) {
  const c = post.conteudo;
  const [gancho, setGancho] = useState(c?.gancho ?? "");
  const [legenda, setLegenda] = useState(c?.legenda ?? "");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const editado = !!c && (gancho !== c.gancho || legenda !== c.legenda);
  useEffect(() => {
    if (c && !editado) {
      setGancho(c.gancho);
      setLegenda(c.legenda);
    }
    // só quando chega texto novo da IA
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c?.legenda, c?.gancho]);

  return (
    <section className="cartao ig-conteudo">
      <h2>Conteúdo</h2>
      <Etapas post={post} />
      {post.situacao === "erro" && <p className="ig-erro">{post.erro}</p>}
      {!c && post.situacao !== "erro" && <p className="nota">A IA está olhando os materiais e escrevendo o gancho, a legenda, a arte e o roteiro…</p>}
      {c && (
        <>
          <label className="campo">
            <span>Gancho (primeira frase)</span>
            <input value={gancho} onChange={(e) => setGancho(e.target.value)} />
          </label>
          <label className="campo">
            <span>Legenda completa</span>
            <textarea rows={10} value={legenda} onChange={(e) => setLegenda(e.target.value)} />
            <small className="nota">
              {legenda.length}/2.200 · as primeiras {FEED_VISIVEL} letras aparecem antes do “mais”
            </small>
          </label>
          {c.slides && c.slides.length > 0 && post.formato === "carrossel" && (
            <details className="ig-reel" open>
              <summary>Slides do carrossel</summary>
              <ol>
                <li>{c.arte.titulo} (capa)</li>
                {c.slides.map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ol>
            </details>
          )}
          <details className="ig-reel" open={post.formato === "reel"}>
            <summary>Roteiro para Reel</summary>
            <ol>
              {c.roteiroReel.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ol>
          </details>
          {erro && <p className="ig-erro">{erro}</p>}
          <div className="ig-acoes">
            <button type="button" className="botao-pequeno" onClick={voltar}>
              Voltar aos materiais
            </button>
            {editado ? (
              <button
                type="button"
                className="botao"
                disabled={pendente}
                onClick={() =>
                  iniciar(async () => {
                    setErro(undefined);
                    const r = await editarTexto(empresaId, post.id, gancho, legenda);
                    if (r.erro) return setErro(r.erro);
                    await atualizar();
                    seguir();
                  })
                }
              >
                Salvar e revisar
              </button>
            ) : (
              <button type="button" className="botao" disabled={!post.analise} onClick={seguir}>
                Revisar
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}

function Previa({ empresaNome, conta, form, post }: { empresaNome: string; conta: { canalNome: string } | null; form: FormularioPost; post: Post | null }) {
  const [aba, setAba] = useState<"feed" | "reels">(form.formato === "reel" ? "reels" : "feed");
  const [slide, setSlide] = useState(0);
  const fotos = form.arquivos.filter((a) => a.tipo === "imagem").map((a) => a.url);
  const video = form.arquivos.find((a) => a.tipo === "video")?.url;
  const artes = post?.conteudo ? [`/arte/${post.id}.png?v=${post.atualizadoEm}`, ...(form.formato === "carrossel" && fotos.length < 2 ? (post.conteudo.slides ?? []).map((_, i) => `/arte/${post.id}-${i + 1}.png?v=${post.atualizadoEm}`) : [])] : [];
  const imagens = form.formato === "carrossel" ? (fotos.length >= 2 ? fotos : artes) : fotos.length ? [fotos[0]] : artes.slice(0, 1);
  const atual = imagens[Math.min(slide, imagens.length - 1)];
  const usuario = conta?.canalNome ?? empresaNome.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const legenda = post?.conteudo?.legenda ?? (form.tema || "A legenda aparece aqui depois que a IA escrever.");

  return (
    <section className="cartao ig2-lateral ig-previa">
      <h2>Prévia do Instagram</h2>
      <div className="ig2-alternar largo" role="group">
        <button type="button" className={aba === "feed" ? "ativa" : ""} onClick={() => setAba("feed")}>
          Feed
        </button>
        <button type="button" className={aba === "reels" ? "ativa" : ""} onClick={() => setAba("reels")}>
          Reels
        </button>
      </div>
      {aba === "feed" ? (
        <div className="ig-celular">
          <div className="ig-celular-topo">
            <span className="marca-sinal">{empresaNome[0]}</span>
            <strong>@{usuario}</strong>
            <span aria-hidden="true">···</span>
          </div>
          <div className="ig-celular-midia">
            {atual ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={atual} alt="" />
            ) : video ? (
              <video src={video} muted playsInline />
            ) : (
              <span className="nota">A imagem aparece aqui</span>
            )}
            {imagens.length > 1 && (
              <>
                <button type="button" className="ig-seta esq" aria-label="Anterior" onClick={() => setSlide((s) => Math.max(0, s - 1))}>
                  ‹
                </button>
                <button type="button" className="ig-seta dir" aria-label="Próxima" onClick={() => setSlide((s) => Math.min(imagens.length - 1, s + 1))}>
                  ›
                </button>
                <span className="ig-pontos">
                  {imagens.map((u, i) => (
                    <i key={u} className={i === slide ? "ativo" : ""} />
                  ))}
                </span>
              </>
            )}
          </div>
          <div className="ig-celular-acoes" aria-hidden="true">
            ♡ ◯ ➤ <span>⌑</span>
          </div>
          <p className="ig-celular-legenda">
            <strong>{usuario}</strong> {legenda.slice(0, FEED_VISIVEL)}
            {legenda.length > FEED_VISIVEL && <span className="nota">… mais</span>}
          </p>
        </div>
      ) : (
        <div className="ig-reels">
          {video ? <video src={video} muted playsInline loop autoPlay /> : atual ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={atual} alt="" />
          ) : null}
          <div className="ig-reels-texto">
            <strong>@{usuario}</strong>
            <span>{legenda.slice(0, 90)}…</span>
          </div>
          {!video && <span className="ig-reels-aviso">Reel precisa de vídeo</span>}
        </div>
      )}
    </section>
  );
}
