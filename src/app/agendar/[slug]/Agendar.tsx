"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { marcarOnline } from "../acoes";

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const diaSemana = (d: string) => DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const turno = (h: string) => (Number(h.slice(0, 2)) < 12 ? "Manhã" : Number(h.slice(0, 2)) < 18 ? "Tarde" : "Noite");
const passo = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.22, ease: [0.23, 1, 0.32, 1] as const } };

export function Agendar({
  slug,
  empresa,
  atendimento,
  rotuloServico,
  servicos,
  duracao,
  dias,
}: {
  slug: string;
  empresa: { nome: string; cidade: string | null };
  atendimento: string;
  rotuloServico: string;
  servicos: string[];
  duracao: number;
  dias: { data: string; horas: string[] }[];
}) {
  const router = useRouter();
  const [servico, setServico] = useState(servicos.length === 1 ? servicos[0] : "");
  const [dia, setDia] = useState(dias[0]?.data ?? "");
  const [hora, setHora] = useState("");
  const [nome, setNome] = useState("");
  const [telefone, setTelefone] = useState("");
  const [site, setSite] = useState("");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const horas = dias.find((d) => d.data === dia)?.horas ?? [];
  const turnos = [...new Set(horas.map(turno))];

  const enviar = () =>
    iniciar(async () => {
      setErro(undefined);
      const r = await marcarOnline(slug, { servico, data: dia, hora, nome, telefone, site });
      if (r.erro || !r.token) return setErro(r.erro ?? "Não foi possível marcar.");
      router.push(`/confirmar/${r.token}?novo=1`);
    });

  return (
    <section className="pub-cartao">
      <header className="pub-topo">
        <span className="marca-sinal">{empresa.nome[0]}</span>
        <div>
          <h1>{empresa.nome}</h1>
          <p>
            Marque {atendimento.toLowerCase().match(/(ão|a)$/) ? "sua" : "seu"} {atendimento.toLowerCase()}
            {empresa.cidade ? ` · ${empresa.cidade}` : ""} · {duracao} min
          </p>
        </div>
      </header>

      {!dias.length ? (
        <p className="pub-vazio">Sem horários livres nos próximos dias. Fale direto com a {empresa.nome}.</p>
      ) : (
        <>
          {servicos.length > 1 && (
            <div className="pub-bloco">
              <h2>{rotuloServico}</h2>
              <div className="pub-opcoes">
                {servicos.map((s) => (
                  <button key={s} type="button" className={servico === s ? "ativo" : ""} aria-pressed={servico === s} onClick={() => setServico(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          <AnimatePresence mode="wait" initial={false}>
            {servico && (
              <motion.div key="dia" className="pub-bloco" {...passo}>
                <h2>Dia</h2>
                <div className="pub-dias" role="listbox" aria-label="Dia">
                  {dias.map((d) => (
                    <button
                      key={d.data}
                      type="button"
                      role="option"
                      aria-selected={dia === d.data}
                      className={dia === d.data ? "ativo" : ""}
                      onClick={() => {
                        setDia(d.data);
                        setHora("");
                      }}
                    >
                      <small>{diaSemana(d.data)}</small>
                      <strong>{Number(d.data.slice(8))}</strong>
                      <small>{MESES[Number(d.data.slice(5, 7)) - 1]}</small>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {servico && dia && (
            <motion.div key={dia} className="pub-bloco" {...passo}>
              <h2>Horário</h2>
              {turnos.map((t) => (
                <div key={t} className="pub-turno">
                  <small>{t}</small>
                  <div className="pub-horas">
                    {horas
                      .filter((h) => turno(h) === t)
                      .map((h) => (
                        <button key={h} type="button" className={hora === h ? "ativo" : ""} aria-pressed={hora === h} onClick={() => setHora(h)}>
                          {h}
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </motion.div>
          )}

          <AnimatePresence>
            {hora && (
              <motion.form
                key="dados"
                className="pub-bloco pub-dados"
                {...passo}
                onSubmit={(e) => {
                  e.preventDefault();
                  enviar();
                }}
              >
                <h2>Seus dados</h2>
                <label className="campo">
                  <span>Nome</span>
                  <input value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" required maxLength={80} />
                </label>
                <label className="campo">
                  <span>WhatsApp</span>
                  <input value={telefone} onChange={(e) => setTelefone(e.target.value)} type="tel" inputMode="tel" autoComplete="tel" placeholder="(21) 99999-8888" required />
                </label>
                <label className="pub-isca" aria-hidden>
                  Site <input tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
                </label>
                {erro && <p className="pub-erro">{erro}</p>}
                <button className="botao pub-confirmar" disabled={pendente}>
                  {pendente ? "Marcando…" : `Marcar ${diaSemana(dia)} ${Number(dia.slice(8))}/${dia.slice(5, 7)} às ${hora}`}
                </button>
                <p className="pub-nota">Você recebe o link para confirmar, remarcar ou cancelar.</p>
              </motion.form>
            )}
          </AnimatePresence>
        </>
      )}
    </section>
  );
}
