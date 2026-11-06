import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, inArray, like, lt, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { type Perfil, agendamentos, categoriasDespesa, clientes, despesas, empresaUsuarios, empresas, fontesReceita, usuarios, vendas } from "@/db/schema";
import { DOMINIO_DEMO, HORAS_DEMO } from "@/lib/demo";
import { diaDaSemana, diasNoMes, hoje, mesAtual, somarDias, somarMeses } from "@/lib/datas";
import { hashSenha } from "@/lib/servidor/auth";
import { agendaDoPacote } from "@/pacotes/catalogo";
import { montarEmpresa } from "./empresa-nova";

type Forma = "pix" | "credito" | "debito" | "dinheiro" | "boleto" | "transferencia";

interface Exemplo {
  empresa: string;
  cidade: string;
  uf: string;
  regime: "mei" | "simples";
  /** Por fonte de receita (pelo nome que o pacote cria): vendas no mês e valor de cada uma, em reais. */
  vendas: Record<string, { porMes: number; valor: [number, number]; formas: Forma[]; descricoes: string[] }>;
  /** Contas do mês: categoria (nome da extra do pacote ou chave padrão), descrição, valor em reais, dia do vencimento. */
  contas: [string, string, number, number][];
  clientes: string[];
  agenda?: { valor: number; profissional: string[]; servicos: string[] };
}

const R = (n: number) => Math.round(n * 100);

/** Um exemplo por ramo: números de uma empresa pequena plausível, sem nada de real. */
const EXEMPLOS: Partial<Record<Perfil, Exemplo>> = {
  consultorio: {
    empresa: "Consultório Ana Lima",
    cidade: "Niterói",
    uf: "RJ",
    regime: "simples",
    vendas: {
      Sessões: { porMes: 46, valor: [180, 180], formas: ["pix", "pix", "transferencia", "debito"], descricoes: ["Sessão"] },
      Pacotes: { porMes: 3, valor: [640, 720], formas: ["pix", "credito"], descricoes: ["Pacote de 4 sessões"] },
    },
    contas: [
      ["Aluguel de sala", "Aluguel da sala", 1400, 5],
      ["Supervisão e cursos", "Supervisão clínica", 480, 12],
      ["contas_fixas", "Internet e telefone", 140, 10],
      ["contas_fixas", "Plataforma de vídeo", 60, 15],
      ["pro_labore", "Pró-labore", 4500, 5],
    ],
    clientes: ["Mariana Costa", "Rafael Duarte", "Beatriz Nogueira", "Lucas Andrade", "Camila Rocha", "Pedro Henrique Sá", "Juliana Prado", "Thiago Moreira"],
    agenda: { valor: 180, profissional: ["Ana Lima"], servicos: ["Sessão", "Sessão", "Sessão", "Sessão on-line", "Primeira consulta"] },
  },
  alimentacao: {
    empresa: "Doces da Clara",
    cidade: "Maricá",
    uf: "RJ",
    regime: "mei",
    vendas: {
      Balcão: { porMes: 60, valor: [12, 45], formas: ["pix", "dinheiro", "debito"], descricoes: ["Fatia de bolo e café", "Caixa de brigadeiros", "Brownie", "Torta de limão (fatia)"] },
      Delivery: { porMes: 22, valor: [40, 90], formas: ["pix", "credito"], descricoes: ["Pedido pelo app", "Kit festa pequeno", "Bolo no pote (6)"] },
      WhatsApp: { porMes: 14, valor: [120, 320], formas: ["pix"], descricoes: ["Bolo de aniversário 2 kg", "Encomenda de 100 docinhos", "Bolo de pote para revenda", "Torta para festa"] },
    },
    contas: [
      ["Matérias-primas", "Mercado: farinha, açúcar, manteiga, ovos", 1650, 8],
      ["Embalagens", "Caixas e fitas", 280, 12],
      ["Gás e energia da cozinha", "Gás e energia", 340, 10],
      ["contas_fixas", "Aluguel da cozinha", 900, 5],
      ["marketing", "Impulsionamento no Instagram", 120, 20],
    ],
    clientes: ["Fernanda Lopes", "Bruno Teixeira", "Patrícia Gomes", "Escola Pequeno Mundo", "Renata Alves", "Carlos Eduardo Lima", "Aline Martins", "Café da Praça"],
  },
  servicos: {
    empresa: "Refrigeração Silva",
    cidade: "São Gonçalo",
    uf: "RJ",
    regime: "simples",
    vendas: {
      Serviços: { porMes: 26, valor: [180, 650], formas: ["pix", "pix", "credito", "dinheiro"], descricoes: ["Instalação de split 12 mil", "Limpeza de ar-condicionado", "Troca de capacitor", "Recarga de gás", "Manutenção preventiva"] },
    },
    contas: [
      ["Materiais", "Tubos, gás e peças", 1900, 10],
      ["Combustível e deslocamento", "Combustível", 950, 15],
      ["contas_fixas", "Celular e internet", 160, 10],
      ["contas_fixas", "Seguro do carro", 260, 20],
      ["pro_labore", "Pró-labore", 4000, 5],
    ],
    clientes: ["Condomínio Mar Azul", "Sandra Ribeiro", "Padaria Estrela", "Jorge Matos", "Clínica Bem-Estar", "Luciana Freitas", "Marcelo Pinto", "Escritório Cunha & Reis"],
    agenda: { valor: 280, profissional: ["Zé Silva", "Diego"], servicos: ["Visita técnica", "Instalação", "Manutenção", "Orçamento"] },
  },
  varejo: {
    empresa: "Loja Estação Moda",
    cidade: "Itaboraí",
    uf: "RJ",
    regime: "simples",
    vendas: {
      "Loja física": { porMes: 70, valor: [60, 260], formas: ["credito", "debito", "pix", "dinheiro"], descricoes: ["Vestido", "Calça jeans", "Blusa e acessório", "Conjunto", "Sandália"] },
      WhatsApp: { porMes: 28, valor: [80, 220], formas: ["pix"], descricoes: ["Pedido pelo WhatsApp", "Kit presente", "Peça da nova coleção"] },
      Site: { porMes: 6, valor: [90, 200], formas: ["credito", "pix"], descricoes: ["Pedido do site"] },
    },
    contas: [
      ["mercadorias", "Compra de mercadorias", 5200, 15],
      ["contas_fixas", "Aluguel da loja", 2200, 5],
      ["contas_fixas", "Energia", 380, 12],
      ["Embalagens", "Sacolas e embalagens", 220, 20],
      ["funcionarios", "Vendedora", 1900, 5],
      ["juros_tarifas", "Taxa da maquininha", 410, 2],
    ],
    clientes: ["Gabriela Souza", "Tatiane Ramos", "Vanessa Lima", "Priscila Moura", "Daniela Castro", "Elaine Barros", "Roberta Dias", "Kátia Fernandes"],
  },
  revenda_veiculos: {
    empresa: "Garagem Litoral Veículos",
    cidade: "Maricá",
    uf: "RJ",
    regime: "simples",
    vendas: {
      "Venda de veículos": { porMes: 4, valor: [38000, 72000], formas: ["transferencia", "pix"], descricoes: ["Onix 2019 1.0", "HB20 2020 Comfort", "Corolla 2017 XEi", "Strada 2021 Freedom", "Gol 2018 1.6", "Compass 2018 Longitude"] },
      "Comissão de financiamento": { porMes: 3, valor: [900, 1800], formas: ["transferencia"], descricoes: ["Retorno do banco"] },
      "Despachante e documentação": { porMes: 4, valor: [350, 600], formas: ["pix"], descricoes: ["Transferência de documento"] },
    },
    contas: [
      ["mercadorias", "Compra de carros para o pátio", 140000, 8],
      ["Preparação de veículos", "Polimento, higienização e reparos", 2600, 12],
      ["Documentação e despachante", "Vistorias e taxas", 900, 18],
      ["contas_fixas", "Aluguel do galpão", 3500, 5],
      ["marketing", "Anúncios nos portais", 600, 10],
      ["funcionarios", "Vendedor", 2400, 5],
    ],
    clientes: ["Ricardo Mendes", "Sérgio Albuquerque", "Paula Cardoso", "Leandro Siqueira", "Marta Figueiredo", "Hugo Batista", "Simone Araújo", "Fábio Nunes"],
    agenda: { valor: 0, profissional: ["Wellington", "Bianca"], servicos: ["Visita", "Test drive", "Avaliação do carro na troca"] },
  },
  contabilidade: {
    empresa: "Contábil Ribeiro",
    cidade: "Niterói",
    uf: "RJ",
    regime: "simples",
    vendas: {
      "Honorários mensais": { porMes: 24, valor: [450, 1200], formas: ["boleto", "pix"], descricoes: ["Honorário mensal"] },
      "Serviços avulsos": { porMes: 4, valor: [300, 1500], formas: ["pix"], descricoes: ["Abertura de empresa", "Declaração de IR", "Alteração contratual"] },
    },
    contas: [
      ["Softwares contábeis", "Sistema contábil", 890, 10],
      ["Certificados digitais", "Renovação de certificados", 360, 18],
      ["contas_fixas", "Aluguel da sala", 1800, 5],
      ["funcionarios", "Assistente contábil", 2600, 5],
      ["pro_labore", "Pró-labore", 6000, 5],
    ],
    clientes: ["Mercado Bom Preço", "Oficina do Toninho", "Studio Pilates Leve", "Pet Shop Amigo Fiel", "Restaurante Sabor Caseiro", "Ótica Visão", "Academia Força", "Papelaria Central"],
  },
};

export const RAMOS_DEMO = Object.keys(EXEMPLOS) as Perfil[];
export const nomeDoExemplo = (perfil: Perfil) => EXEMPLOS[perfil]?.empresa ?? "";

const sortear = <T,>(lista: T[]) => lista[Math.floor(Math.random() * lista.length)];
const entre = (min: number, max: number) => min + Math.random() * (max - min);

/** Apaga as demonstrações com mais de um dia: as empresas (e tudo dentro delas) e as contas. */
export async function limparDemos() {
  const db = obterDb();
  const velhas = db
    .select({ id: usuarios.id })
    .from(usuarios)
    .where(and(like(usuarios.email, `%@${DOMINIO_DEMO}`), lt(usuarios.criadoEm, sql`now() - make_interval(hours => ${HORAS_DEMO})`)));
  await db.delete(empresas).where(inArray(empresas.id, db.select({ id: empresaUsuarios.empresaId }).from(empresaUsuarios).where(inArray(empresaUsuarios.usuarioId, velhas))));
  await db.delete(usuarios).where(inArray(usuarios.id, velhas));
}

/** Cria uma conta de visitante com uma empresa de exemplo do ramo, cheia de lançamentos. */
export async function criarDemo(perfil: Perfil): Promise<{ usuarioId: string; empresaId: string }> {
  const x = EXEMPLOS[perfil];
  if (!x) throw new Error(`Sem exemplo para ${perfil}`);
  const db = obterDb();
  const [u] = await db
    .insert(usuarios)
    .values({ nome: "Visitante", email: `visitante-${randomBytes(6).toString("hex")}@${DOMINIO_DEMO}`, senhaHash: await hashSenha(randomBytes(24).toString("base64url")) })
    .returning({ id: usuarios.id });
  const criada = await montarEmpresa(u.id, { nome: x.empresa, perfil, regime: x.regime, cidade: x.cidade, uf: x.uf });
  if ("erro" in criada) throw new Error(criada.erro);
  const empresaId = criada.id;

  const [fontes, cats] = await Promise.all([
    db.select().from(fontesReceita).where(eq(fontesReceita.empresaId, empresaId)),
    db.select().from(categoriasDespesa).where(eq(categoriasDespesa.empresaId, empresaId)),
  ]);
  const cat = (ref: string) => (cats.find((c) => c.nome === ref) ?? cats.find((c) => c.chaveSistema === ref) ?? cats.find((c) => c.chaveSistema === "outras")!).id;

  const listaClientes = await db
    .insert(clientes)
    .values(x.clientes.map((nome, i) => ({ empresaId, nome, telefone: `55219${String(87_000_000 + i * 1_371_113 + Math.floor(Math.random() * 1000)).slice(0, 8)}`, criadoPor: u.id })))
    .returning({ id: clientes.id, nome: clientes.nome });

  const hojeData = hoje();
  const atual = mesAtual();
  const novasVendas: (typeof vendas.$inferInsert)[] = [];
  const novasDespesas: (typeof despesas.$inferInsert)[] = [];
  // Doze meses fechados e o mês corrente até hoje, crescendo um pouco a cada mês.
  for (let k = 12; k >= 0; k--) {
    const mes = somarMeses(atual, -k);
    const ultimoDia = k === 0 ? Number(hojeData.slice(8)) : diasNoMes(mes);
    const fator = 0.78 + (12 - k) * 0.018 + (Math.random() - 0.5) * 0.08;
    const dia = (d: number) => `${mes}-${String(Math.min(d, diasNoMes(mes))).padStart(2, "0")}`;
    for (const f of fontes) {
      const v = x.vendas[f.nome];
      if (!v) continue;
      const quantas = Math.max(1, Math.round(((v.porMes * ultimoDia) / diasNoMes(mes)) * fator));
      for (let j = 0; j < quantas; j++) {
        const data = dia(1 + Math.floor(Math.random() * ultimoDia));
        const forma = sortear(v.formas);
        const prazo = forma === "credito" ? 30 : forma === "boleto" ? 10 : 0;
        const receber = somarDias(data, prazo);
        const cliente = Math.random() < 0.6 ? sortear(listaClientes) : null;
        novasVendas.push({
          empresaId,
          data,
          valorCentavos: R(entre(v.valor[0], v.valor[1])),
          descricao: sortear(v.descricoes),
          fonteReceitaId: f.id,
          formaPagamento: forma,
          status: receber <= hojeData ? "recebido" : "a_receber",
          dataRecebimento: receber,
          clienteId: cliente?.id ?? null,
          criadoPor: u.id,
        });
      }
    }
    // No mês corrente, a primeira conta que já venceu fica sem pagar: a "Precisa de você hoje" tem o que mostrar.
    const atrasada = k === 0 ? x.contas.find((c) => dia(c[3]) < hojeData)?.[1] : undefined;
    for (const [ref, descricao, valor, venc] of x.contas) {
      const vencimento = dia(venc);
      const pago = vencimento <= hojeData && descricao !== atrasada;
      novasDespesas.push({
        empresaId,
        data: dia(1),
        valorCentavos: R(valor * (ref === "mercadorias" || ref === "Matérias-primas" || ref === "Materiais" ? fator : 1)),
        descricao,
        categoriaId: cat(ref),
        vencimento,
        status: pago ? "pago" : "a_pagar",
        pagoEm: pago ? vencimento : null,
        criadoPor: u.id,
      });
    }
  }
  if (novasVendas.length) await db.insert(vendas).values(novasVendas);
  if (novasDespesas.length) await db.insert(despesas).values(novasDespesas);

  const daAgenda = agendaDoPacote(perfil);
  if (daAgenda && x.agenda) {
    const { cfg } = daAgenda;
    const marcados: (typeof agendamentos.$inferInsert)[] = [];
    // A semana passada (com atendidos e alguma falta) e as duas próximas.
    for (let d = -7; d <= 14; d++) {
      const data = somarDias(hojeData, d);
      const semana = diaDaSemana(data);
      if (semana === 0 || semana === 6) continue;
      const chance = d < 0 ? 0.55 : d < 4 ? 0.5 : 0.3;
      const horas = Array.from({ length: cfg.fim - cfg.inicio }, (_, i) => cfg.inicio + i).filter(() => Math.random() < chance);
      for (const h of horas) {
        const cliente = sortear(listaClientes);
        marcados.push({
          empresaId,
          data,
          hora: `${String(h).padStart(2, "0")}:00`,
          duracaoMin: cfg.duracao,
          clienteId: cliente.id,
          nome: cliente.nome,
          servico: sortear(x.agenda.servicos),
          profissional: sortear(x.agenda.profissional),
          valorCentavos: x.agenda.valor ? R(x.agenda.valor) : null,
          status: d < 0 ? (Math.random() < 0.1 ? "faltou" : "atendido") : d === 0 || Math.random() < 0.5 ? "confirmado" : "marcado",
          criadoPor: u.id,
        });
      }
    }
    if (marcados.length) await db.insert(agendamentos).values(marcados);
  }
  return { usuarioId: u.id, empresaId };
}
