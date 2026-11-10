import type { Atividade, Perfil } from "@/db/schema";
import type { NomeIcone } from "@/componentes/Icone";
import { AGENDA_PADRAO, type ConfigAgenda } from "./agenda";

/**
 * Pacotes: o painel se molda ao tipo de negócio. O núcleo (vendas, despesas, caixa, impostos,
 * clientes, WhatsApp) é o mesmo para todos; cada pacote acrescenta as abas do ramo, troca as
 * palavras do menu e já cria as categorias que aquele negócio usa. Tudo o que acontece numa aba
 * do pacote cai no núcleo (o carro vendido vira venda, o bolo vendido baixa a farinha).
 *
 * O pacote é o `perfil` da empresa (src/lib/perfis.ts, que vem do app urutau): lá ficam os módulos
 * e as fontes de receita; aqui, o que é só do painel.
 */

export interface AbaPacote {
  id: string;
  titulo: string;
  desc: string;
  icone: NomeIcone;
  /** Caminho da tela pronta dentro da empresa; sem ele, a aba mostra o que vai ter quando ficar pronta. */
  rota?: string;
  /** O que a aba vai ter, para a tela "em construção" e para a escolha do pacote. */
  vaiTer: string[];
}

export interface Pacote {
  perfil: Perfil;
  nome: string;
  frase: string;
  /** Palavras que a pessoa costuma usar para descrever esse negócio (escolha sem IA). */
  palavras: string[];
  /** Como o menu chama vendas e clientes neste ramo. */
  vocab: { vendas: string; clientes: string };
  abas: AbaPacote[];
  /** Categorias de despesa criadas além das padrão. */
  categoriasExtras: { nome: string; comportamento: "fixo" | "variavel" }[];
  /** Ponto de partida para o imposto; a pessoa (ou o contador) confirma depois. */
  fiscal: { atividade: Atividade; anexoComercio?: "I" | "II"; anexoServicos?: "III" | "IV" | "V"; fatorR?: boolean };
  /** O que a Visão geral vai destacar para este ramo. */
  destaques: string[];
  /** Expediente e palavras da agenda, nos ramos que trabalham com horário marcado. */
  agenda?: ConfigAgenda;
}

export const PACOTES: Record<Perfil, Pacote> = {
  revenda_veiculos: {
    perfil: "revenda_veiculos",
    nome: "Revenda de veículos",
    frase: "Pátio de carros, visitas e test drive, margem por carro e comissões.",
    palavras: ["carro", "carros", "veiculo", "veiculos", "seminovo", "seminovos", "revenda", "garagem", "moto", "motos", "automovel", "concessionaria", "patio", "galpao"],
    vocab: { vendas: "Vendas", clientes: "Clientes" },
    abas: [
      {
        id: "patio",
        titulo: "Pátio",
        desc: "Os carros do galpão, um por um",
        icone: "carro",
        rota: "patio",
        vaiTer: ["Cada carro com placa, modelo, ano, km e fotos", "Custo de compra e gastos de preparação", "Preço de venda e margem do carro", "Dias parado no pátio e capital parado"],
      },
      {
        id: "visitas",
        titulo: "Calendário comercial",
        desc: "Visitas, test drives, entregas e retornos",
        icone: "agenda",
        rota: "agenda",
        vaiTer: ["Horários marcados pela equipe e pelo atendente do WhatsApp", "Qual carro cada visita quer ver", "Lembrete automático para o cliente"],
      },
    ],
    categoriasExtras: [
      { nome: "Preparação de veículos", comportamento: "variavel" },
      { nome: "Documentação e despachante", comportamento: "variavel" },
    ],
    fiscal: { atividade: "ambos", anexoComercio: "I", anexoServicos: "III" },
    destaques: ["Carros no pátio", "Margem por carro", "Dias parados"],
    agenda: { inicio: 9, fim: 18, duracao: 60, pessoa: "Cliente", atendimento: "Visita", servicos: ["Visita", "Test drive", "Avaliação do carro na troca", "Entrega do carro", "Retorno pós-venda"] },
  },
  consultorio: {
    perfil: "consultorio",
    nome: "Consultório",
    frase: "Agenda grande e fácil, pacientes, sessões e pacotes.",
    palavras: ["psicologa", "psicologo", "psicologia", "terapia", "terapeuta", "consultorio", "clinica", "paciente", "pacientes", "sessao", "sessoes", "nutricionista", "fisioterapia", "fisioterapeuta", "dentista", "medico", "fono"],
    vocab: { vendas: "Recebimentos", clientes: "Pacientes" },
    abas: [
      {
        id: "agenda",
        titulo: "Agenda",
        desc: "Atendimentos do dia e da semana",
        icone: "agenda",
        rota: "agenda",
        vaiTer: ["Agenda grande do dia e da semana", "Quem atende, paciente, horário e sala", "Confirmação e lembrete automáticos pelo WhatsApp", "Faltas e horários livres"],
      },
      {
        id: "pacotes",
        titulo: "Pacotes de sessões",
        desc: "Sessões compradas e sessões usadas",
        icone: "documento",
        vaiTer: ["Pacotes vendidos por paciente", "Sessões usadas e restantes", "Aviso quando o pacote está acabando"],
      },
    ],
    categoriasExtras: [
      { nome: "Aluguel de sala", comportamento: "fixo" },
      { nome: "Supervisão e cursos", comportamento: "fixo" },
    ],
    fiscal: { atividade: "servicos", anexoServicos: "V", fatorR: true },
    destaques: ["Atendimentos de hoje", "Horários livres", "Faltas do mês"],
    agenda: { inicio: 8, fim: 20, duracao: 50, pessoa: "Paciente", atendimento: "Sessão", servicos: ["Sessão", "Primeira consulta", "Avaliação", "Retorno", "Sessão on-line"] },
  },
  varejo: {
    perfil: "varejo",
    nome: "Loja e varejo",
    frase: "Balcão, estoque de produtos e vendas pelo WhatsApp.",
    palavras: ["loja", "varejo", "roupa", "roupas", "camisaria", "boutique", "mercado", "mercearia", "papelaria", "farmacia", "comercio", "produtos", "calcados", "acessorios", "presentes"],
    vocab: { vendas: "Vendas", clientes: "Clientes" },
    abas: [
      {
        id: "estoque",
        titulo: "Estoque",
        desc: "Produtos, entradas e baixas",
        icone: "caixa",
        rota: "estoque",
        vaiTer: ["Produtos com código de barras", "Entrada de mercadoria e baixa na venda", "Aviso de estoque baixo", "Curva ABC: o que mais vende"],
      },
      {
        id: "caixa",
        titulo: "Caixa",
        desc: "Venda no balcão em segundos",
        icone: "vendas",
        rota: "caixa",
        vaiTer: ["Leitor de código de barras ou câmera do celular", "Pix, débito, crédito, dinheiro com troco e fiado", "Comprovante pelo WhatsApp", "Fechamento do caixa do dia"],
      },
    ],
    categoriasExtras: [{ nome: "Embalagens", comportamento: "variavel" }],
    fiscal: { atividade: "comercio", anexoComercio: "I" },
    destaques: ["Produtos acabando", "Mais vendidos", "Ticket médio"],
  },
  servicos: {
    perfil: "servicos",
    nome: "Serviço com visita",
    frase: "Orçamentos, visitas marcadas e serviços feitos na casa do cliente.",
    palavras: ["servico", "servicos", "manutencao", "instalacao", "eletricista", "encanador", "reforma", "pintor", "limpeza", "jardinagem", "tecnico", "visita", "orcamento", "ar condicionado", "dedetizacao"],
    vocab: { vendas: "Serviços", clientes: "Clientes" },
    abas: [
      {
        id: "visitas",
        titulo: "Visitas",
        desc: "Onde e quando cada serviço acontece",
        icone: "agenda",
        rota: "agenda",
        vaiTer: ["Visitas do dia com endereço", "Quem da equipe vai", "Lembrete para o cliente"],
      },
      {
        id: "orcamentos",
        titulo: "Orçamentos",
        desc: "Do pedido ao serviço fechado",
        icone: "documento",
        vaiTer: ["Orçamento pronto para mandar pelo WhatsApp", "Aprovado vira serviço e receita", "Orçamentos parados há dias"],
      },
    ],
    categoriasExtras: [
      { nome: "Materiais", comportamento: "variavel" },
      { nome: "Combustível e deslocamento", comportamento: "variavel" },
    ],
    fiscal: { atividade: "servicos", anexoServicos: "III" },
    destaques: ["Visitas de hoje", "Orçamentos abertos", "Serviços a receber"],
    agenda: { inicio: 8, fim: 18, duracao: 60, pessoa: "Cliente", atendimento: "Visita", servicos: ["Visita técnica", "Orçamento", "Instalação", "Manutenção", "Retorno"] },
  },
  alimentacao: {
    perfil: "alimentacao",
    nome: "Confeitaria e alimentação",
    frase: "Matérias-primas, receitas com custo certo, encomendas e caixa.",
    palavras: ["bolo", "bolos", "doce", "doces", "confeitaria", "confeiteira", "padaria", "lanchonete", "restaurante", "comida", "marmita", "marmitas", "salgado", "salgados", "pizzaria", "hamburgueria", "cafe", "cafeteria", "acai", "sorveteria", "encomenda", "encomendas", "delivery", "brigadeiro"],
    vocab: { vendas: "Vendas", clientes: "Clientes" },
    abas: [
      {
        id: "materias-primas",
        titulo: "Matérias-primas",
        desc: "Farinha, açúcar, ovos e o quanto custam",
        icone: "caixa",
        vaiTer: ["Cada insumo com unidade e custo (kg, litro, dúzia)", "Quanto tem e quanto está acabando", "Lista de compras pronta"],
      },
      {
        id: "receitas",
        titulo: "Receitas",
        desc: "Ficha técnica e custo de cada produto",
        icone: "receita",
        vaiTer: ["Um bolo = 500 g de farinha + 300 g de açúcar + …", "Custo e margem de cada produto", "Vender baixa os insumos da receita", "Farinha mais cara atualiza o custo de tudo que usa farinha"],
      },
      {
        id: "encomendas",
        titulo: "Encomendas",
        desc: "O que entregar e quando",
        icone: "agenda",
        vaiTer: ["Encomendas por dia de entrega", "Sinal pago e quanto falta receber", "Encomendas que chegam pelo WhatsApp"],
      },
    ],
    categoriasExtras: [
      { nome: "Matérias-primas", comportamento: "variavel" },
      { nome: "Embalagens", comportamento: "variavel" },
      { nome: "Gás e energia da cozinha", comportamento: "fixo" },
    ],
    fiscal: { atividade: "comercio", anexoComercio: "I" },
    destaques: ["Encomendas da semana", "Insumos acabando", "Margem por produto"],
  },
  contabilidade: {
    perfil: "contabilidade",
    nome: "Contabilidade",
    frase: "Carteira de clientes, documentos prontos para enviar e calendário de obrigações.",
    palavras: ["contador", "contadora", "contabilidade", "contabil", "escritorio contabil", "fiscal", "declaracao", "imposto de renda", "bpo", "departamento pessoal", "abertura de empresa"],
    vocab: { vendas: "Honorários", clientes: "Clientes" },
    abas: [
      {
        id: "carteira",
        titulo: "Carteira",
        desc: "As empresas que você atende",
        icone: "clientes",
        vaiTer: ["Cada empresa com regime, CNPJ e responsável", "Honorário de cada uma", "Se a empresa usa a Urutau, os números dela direto aqui"],
      },
      {
        id: "documentos",
        titulo: "Documentos",
        desc: "Modelos salvos, prontos para enviar",
        icone: "documento",
        vaiTer: ["Relatórios, contratos, recibos e declarações salvos como modelo", "Preenchidos sozinhos com os dados do cliente", "Enviar pelo WhatsApp ou e-mail na hora"],
      },
      {
        id: "obrigacoes",
        titulo: "Obrigações",
        desc: "O que vence para cada cliente",
        icone: "agenda",
        vaiTer: ["DAS, folha e declarações por cliente", "O que vence esta semana", "Aviso automático para o cliente mandar documentos"],
      },
    ],
    categoriasExtras: [
      { nome: "Softwares contábeis", comportamento: "fixo" },
      { nome: "Certificados digitais", comportamento: "variavel" },
    ],
    fiscal: { atividade: "servicos", anexoServicos: "III" },
    destaques: ["Obrigações da semana", "Documentos para enviar", "Honorários a receber"],
  },
  financas: {
    perfil: "financas",
    nome: "Só finanças",
    frase: "Lucro, caixa, contas e impostos, para qualquer negócio.",
    palavras: [],
    vocab: { vendas: "Vendas", clientes: "Clientes" },
    abas: [],
    categoriasExtras: [],
    fiscal: { atividade: "comercio", anexoComercio: "I" },
    destaques: ["Lucro", "Caixa", "Contas a pagar"],
  },
};

export const ORDEM_PACOTES: Perfil[] = ["alimentacao", "consultorio", "revenda_veiculos", "varejo", "servicos", "contabilidade", "financas"];

export const pacoteDe = (perfil: Perfil) => PACOTES[perfil] ?? PACOTES.financas;

/** Os nomes do consultório mudam com a especialidade (odontologia: procedimento; psicologia: tipo de sessão). */
export const ESPECIALIDADES = {
  psicologia: { nome: "Psicologia", rotuloServico: "Tipo de sessão", atendimento: "Sessão", servicos: ["Sessão", "Primeira consulta", "Avaliação", "Retorno", "Sessão on-line"] },
  odontologia: {
    nome: "Odontologia",
    rotuloServico: "Procedimento",
    atendimento: "Atendimento",
    servicos: ["Avaliação inicial", "Limpeza", "Restauração", "Retorno", "Canal", "Clareamento", "Extração"],
  },
  outra: { nome: "Outra", rotuloServico: "Tipo de atendimento", atendimento: "Atendimento", servicos: ["Consulta", "Retorno", "Avaliação"] },
} as const;
export type Especialidade = keyof typeof ESPECIALIDADES;
export const especialidadeValida = (e: string | null | undefined): e is Especialidade => !!e && e in ESPECIALIDADES;

/** A aba de agenda do pacote (o título muda: Agenda, Visitas, Visitas e test drive) e o expediente. */
export function agendaDoPacote(perfil: Perfil, especialidade?: string | null) {
  const p = pacoteDe(perfil);
  const aba = p.abas.find((a) => a.rota === "agenda");
  if (!aba) return null;
  const cfg: ConfigAgenda = { ...(p.agenda ?? AGENDA_PADRAO), rotuloServico: p.agenda?.atendimento ?? "Serviço" };
  if (perfil === "consultorio") {
    const e = ESPECIALIDADES[especialidadeValida(especialidade) ? especialidade : "psicologia"];
    return { aba, cfg: { ...cfg, atendimento: e.atendimento, servicos: [...e.servicos], rotuloServico: e.rotuloServico } };
  }
  return { aba, cfg };
}

const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * Escolha sem IA: conta as palavras do ramo que aparecem na descrição. Serve quando a IA não está
 * ligada ou falha, e para conferir a escolha da IA nos testes.
 */
export function escolherPorPalavras(descricao: string): { perfil: Perfil; achou: string[] } {
  const texto = ` ${semAcento(descricao).replace(/[^a-z0-9 ]+/g, " ")} `;
  let melhor: { perfil: Perfil; achou: string[] } = { perfil: "financas", achou: [] };
  for (const perfil of ORDEM_PACOTES) {
    const achou = PACOTES[perfil].palavras.filter((p) => texto.includes(` ${p} `));
    if (achou.length > melhor.achou.length) melhor = { perfil, achou };
  }
  return melhor;
}
