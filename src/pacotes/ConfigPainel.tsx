"use client";

import { AnimatePresence, Reorder, motion } from "motion/react";
import { useState, useTransition } from "react";
import { Icone, type NomeIcone } from "@/componentes/Icone";
import { type FormConfigPainel, salvarConfigPainel } from "./acoes-painel";

interface ItemOpcao {
  id: string;
  nomePadrao: string;
  icone: NomeIcone;
  secao: string;
  nome: string;
  oculto: boolean;
  emBreve?: boolean;
}

/** O dono monta o próprio menu: arrasta para mudar a ordem, renomeia, esconde e escolhe onde o painel abre. */
export function ConfigPainel({
  empresaId,
  itens,
  telaInicial,
  especialidade,
  especialidades,
  meta,
  ordemPadrao,
  online,
}: {
  empresaId: string;
  itens: ItemOpcao[];
  telaInicial: string;
  especialidade: string | null;
  especialidades: { id: string; nome: string }[] | null;
  meta: string;
  ordemPadrao: string[];
  online?: { ligado: boolean; slug: string; antecedenciaHoras: number; diasOnline: number; base: string } | null;
}) {
  const [lista, setLista] = useState(itens);
  const [inicio, setInicio] = useState(telaInicial);
  const [esp, setEsp] = useState(especialidade ?? "psicologia");
  const [valorMeta, setValorMeta] = useState(meta);
  const [msg, setMsg] = useState<{ ok?: string; erro?: string }>({});
  const [ag, setAg] = useState(online ?? null);
  const [copiado, setCopiado] = useState(false);
  const linkAgenda = ag ? `${ag.base}/agendar/${ag.slug}` : "";
  const [pendente, iniciar] = useTransition();
  const mudar = (id: string, campo: Partial<ItemOpcao>) => setLista((l) => l.map((i) => (i.id === id ? { ...i, ...campo } : i)));
  const mover = (id: string, d: -1 | 1) =>
    setLista((l) => {
      const i = l.findIndex((x) => x.id === id);
      const j = i + d;
      if (j < 0 || j >= l.length) return l;
      const c = [...l];
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });

  const salvar = () =>
    iniciar(async () => {
      const dados: FormConfigPainel = {
        telaInicial: inicio,
        especialidade: especialidades ? esp : "",
        meta: valorMeta,
        online: ag ? { ligado: ag.ligado, slug: ag.slug, antecedenciaHoras: ag.antecedenciaHoras, diasOnline: ag.diasOnline } : undefined,
        menu: lista.map((i) => ({ id: i.id, nome: i.nome !== i.nomePadrao ? i.nome : undefined, oculto: i.oculto || undefined })),
      };
      setMsg(await salvarConfigPainel(empresaId, dados));
    });

  return (
    <div className="config-painel">
      <div className="config-campos">
        <label className="campo">
          <span>O painel abre em</span>
          <select value={inicio} onChange={(e) => setInicio(e.target.value)}>
            {lista
              .filter((i) => !i.emBreve && !i.oculto && !i.id.includes("impostos"))
              .map((i) => (
                <option key={i.id} value={i.id}>
                  {i.nome}
                </option>
              ))}
          </select>
        </label>
        {especialidades && (
          <label className="campo">
            <span>Especialidade</span>
            <select value={esp} onChange={(e) => setEsp(e.target.value)}>
              {especialidades.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
            <small className="nota">Troca os nomes da agenda: odontologia usa “Procedimento”; psicologia, “Tipo de sessão”.</small>
          </label>
        )}
        <label className="campo" id="meta">
          <span>Meta de vendas do mês (R$)</span>
          <input inputMode="decimal" value={valorMeta} onChange={(e) => setValorMeta(e.target.value)} placeholder="Ex.: 400.000" />
          <small className="nota">Aparece na Visão geral no lugar do ponto de equilíbrio.</small>
        </label>
      </div>

      {ag && (
        <div className="config-online" id="agendamento-online">
          <h3>Agendamento online</h3>
          <p className="nota">Um link para a bio do Instagram e o WhatsApp: o cliente vê só os horários livres e marca sozinho. O horário entra na agenda como “a confirmar”.</p>
          <label className="campo-check largo">
            <input type="checkbox" checked={ag.ligado} onChange={(e) => setAg({ ...ag, ligado: e.target.checked })} />
            <span>Receber agendamentos pela página</span>
          </label>
          <div className="config-campos">
            <label className="campo">
              <span>Endereço da página</span>
              <span className="config-endereco">
                <small>{ag.base.replace(/^https?:\/\//, "")}/agendar/</small>
                <input value={ag.slug} onChange={(e) => setAg({ ...ag, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "") })} maxLength={40} />
              </span>
            </label>
            <label className="campo">
              <span>Antecedência mínima</span>
              <select value={ag.antecedenciaHoras} onChange={(e) => setAg({ ...ag, antecedenciaHoras: Number(e.target.value) })}>
                {[0, 1, 2, 4, 12, 24, 48].map((h) => (
                  <option key={h} value={h}>
                    {h === 0 ? "Sem antecedência" : `${h} ${h === 1 ? "hora" : "horas"} antes`}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo">
              <span>Mostrar horários até</span>
              <select value={ag.diasOnline} onChange={(e) => setAg({ ...ag, diasOnline: Number(e.target.value) })}>
                {[7, 14, 21, 30, 60].map((d) => (
                  <option key={d} value={d}>
                    {d} dias à frente
                  </option>
                ))}
              </select>
            </label>
          </div>
          {online?.ligado && online.slug && (
            <div className="config-pe">
              <a className="botao-pequeno" href={`${online.base}/agendar/${online.slug}`} target="_blank" rel="noreferrer">
                Abrir a página
              </a>
              <button
                type="button"
                className="botao-pequeno"
                onClick={async () => {
                  await navigator.clipboard.writeText(linkAgenda);
                  setCopiado(true);
                  setTimeout(() => setCopiado(false), 1500);
                }}
              >
                {copiado ? "Link copiado" : "Copiar link"}
              </button>
            </div>
          )}
        </div>
      )}

      <h3>Menu</h3>
      <p className="nota">Arraste para mudar a ordem, mude os nomes ou esconda o que a empresa não usa. Quem não tem permissão continua sem ver.</p>
      <Reorder.Group axis="y" values={lista} onReorder={setLista} className="config-menu">
        <AnimatePresence initial={false}>
          {lista.map((i, n) => (
            <Reorder.Item key={i.id} value={i} className={`config-item${i.oculto ? " oculto" : ""}`} whileDrag={{ scale: 1.02, boxShadow: "0 10px 24px rgb(0 0 0 / 12%)" }}>
              <span className="config-pegar" aria-hidden>
                ⠿
              </span>
              <Icone nome={i.icone} />
              <input aria-label={`Nome de ${i.nomePadrao}`} value={i.nome} onChange={(e) => mudar(i.id, { nome: e.target.value })} maxLength={40} />
              <small className="nota">{i.secao}</small>
              <div className="config-botoes">
                <button type="button" className="botao-pequeno" aria-label="Subir" disabled={n === 0} onClick={() => mover(i.id, -1)}>
                  ↑
                </button>
                <button type="button" className="botao-pequeno" aria-label="Descer" disabled={n === lista.length - 1} onClick={() => mover(i.id, 1)}>
                  ↓
                </button>
                <label className="campo-check">
                  <input type="checkbox" checked={!i.oculto} onChange={(e) => mudar(i.id, { oculto: !e.target.checked })} />
                  <span>Mostrar</span>
                </label>
              </div>
            </Reorder.Item>
          ))}
        </AnimatePresence>
      </Reorder.Group>

      <div className="config-pe">
        <button type="button" className="botao" onClick={salvar} disabled={pendente}>
          {pendente ? "Salvando…" : "Salvar painel"}
        </button>
        <button
          type="button"
          className="link"
          onClick={() => {
            setLista([...itens].map((i) => ({ ...i, nome: i.nomePadrao, oculto: false })).sort((a, b) => ordemPadrao.indexOf(a.id) - ordemPadrao.indexOf(b.id)));
            setInicio(ordemPadrao.includes("agenda") && telaInicial === "agenda" ? "agenda" : telaInicial);
          }}
        >
          Voltar ao padrão do ramo
        </button>
        <AnimatePresence>
          {(msg.ok || msg.erro) && (
            <motion.p key={msg.ok ?? msg.erro} className={msg.erro ? "ig-erro" : "nota"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              {msg.erro ?? msg.ok}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
