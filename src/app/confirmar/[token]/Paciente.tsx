"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { remarcarPaciente, responderPaciente } from "../../agendar/acoes";

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];
const nomeDia = (d: string) => DIAS[new Date(`${d}T12:00:00Z`).getUTCDay()];
const fim = (h: string, min: number) => {
  const t = Number(h.slice(0, 2)) * 60 + Number(h.slice(3)) + min;
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`;
};

const SITUACAO: Record<string, { texto: string; tom: string }> = {
  marcado: { texto: "Aguardando sua confirmação", tom: "alerta" },
  confirmado: { texto: "Confirmado", tom: "bom" },
  cancelado: { texto: "Cancelado", tom: "ruim" },
  atendido: { texto: "Atendido", tom: "bom" },
  faltou: { texto: "Não compareceu", tom: "ruim" },
  bloqueado: { texto: "Indisponível", tom: "ruim" },
};

export function Paciente({
  token,
  novo,
  empresa,
  horario,
  passou,
  podeRemarcar,
  dias,
}: {
  token: string;
  novo: boolean;
  empresa: { nome: string; cidade: string | null };
  horario: { nome: string; data: string; hora: string; duracao: number; servico: string; status: string };
  passou: boolean;
  podeRemarcar: boolean;
  dias: { data: string; horas: string[] }[];
}) {
  const router = useRouter();
  const [remarcando, setRemarcando] = useState(false);
  const [dia, setDia] = useState(dias[0]?.data ?? "");
  const [erro, setErro] = useState<string>();
  const [pendente, iniciar] = useTransition();
  const s = SITUACAO[horario.status] ?? SITUACAO.marcado;
  const aberto = !passou && (horario.status === "marcado" || horario.status === "confirmado");
  const primeiro = horario.nome.split(" ")[0];
  const agir = (fn: () => Promise<{ erro?: string }>) =>
    iniciar(async () => {
      setErro(undefined);
      const r = await fn();
      if (r.erro) return setErro(r.erro);
      setRemarcando(false);
      router.refresh();
    });

  return (
    <section className="pub-cartao">
      <header className="pub-topo">
        <span className="marca-sinal">{empresa.nome[0]}</span>
        <div>
          <h1>{empresa.nome}</h1>
          <p>{empresa.cidade ?? "Seu horário"}</p>
        </div>
      </header>

      {novo && horario.status === "marcado" && (
        <motion.p className="pub-sucesso" initial={{ opacity: 0, scale: 0.97 }} animate={{ opacity: 1, scale: 1 }}>
          Pronto, {primeiro}! Seu horário foi marcado. Guarde este link: por ele você confirma, remarca ou cancela.
        </motion.p>
      )}

      <motion.div key={`${horario.status}-${horario.data}-${horario.hora}`} className="pub-horario" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
        <span className={`pub-status ${s.tom}`}>{s.texto}</span>
        <strong>
          {nomeDia(horario.data)}, {horario.data.slice(8)}/{horario.data.slice(5, 7)}
        </strong>
        <span>
          {horario.hora} às {fim(horario.hora, horario.duracao)} · {horario.servico}
        </span>
        <span>{horario.nome}</span>
      </motion.div>

      {erro && <p className="pub-erro">{erro}</p>}

      {aberto && !remarcando && (
        <div className="pub-acoes">
          {horario.status === "marcado" && (
            <button type="button" className="botao pub-confirmar" disabled={pendente} onClick={() => agir(() => responderPaciente(token, "confirmar"))}>
              Confirmar presença
            </button>
          )}
          {podeRemarcar && (
            <button type="button" className="botao-pequeno" disabled={pendente} onClick={() => setRemarcando(true)}>
              Remarcar
            </button>
          )}
          <button
            type="button"
            className="link pub-cancelar"
            disabled={pendente}
            onClick={() => {
              if (confirm("Cancelar este horário?")) agir(() => responderPaciente(token, "cancelar"));
            }}
          >
            Cancelar horário
          </button>
        </div>
      )}

      <AnimatePresence>
        {remarcando && (
          <motion.div className="pub-bloco" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}>
            <h2>Escolha o novo horário</h2>
            {dias.length ? (
              <>
                <div className="pub-dias">
                  {dias.map((d) => (
                    <button key={d.data} type="button" className={dia === d.data ? "ativo" : ""} onClick={() => setDia(d.data)}>
                      <small>{nomeDia(d.data).slice(0, 3)}</small>
                      <strong>{Number(d.data.slice(8))}</strong>
                    </button>
                  ))}
                </div>
                <div className="pub-horas">
                  {(dias.find((d) => d.data === dia)?.horas ?? []).map((h) => (
                    <button key={h} type="button" disabled={pendente} onClick={() => agir(() => remarcarPaciente(token, dia, h))}>
                      {h}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <p className="pub-vazio">Sem horários livres nos próximos dias. Fale com a {empresa.nome}.</p>
            )}
            <button type="button" className="link" onClick={() => setRemarcando(false)}>
              Voltar
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {horario.status === "confirmado" && !passou && <p className="pub-nota">Te esperamos! Se mudar algo, é só voltar a este link.</p>}
      {horario.status === "cancelado" && <p className="pub-nota">Quer marcar outro dia? Fale com a {empresa.nome}.</p>}
    </section>
  );
}
