import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { type Perfil, agendamentos, categoriasDespesa, clientes, contatosClientes, despesas, negociosImoveis, empresaPainel, empresaUsuarios, empresas, fontesReceita, usuarios, veiculos, vendas } from "@/db/schema";
import { DOMINIO_DEMO, HORAS_DEMO } from "@/lib/demo";
import { diaDaSemana, diasNoMes, hoje, mesAtual, somarDias, somarMeses } from "@/lib/datas";
import { hashSenha } from "@/lib/servidor/auth";
import { agendaDoPacote } from "@/pacotes/catalogo";
import { registrarVendaCaixa, salvarProduto } from "@/lib/servidor/estoque";
import { alugueisDoMes, fecharNegocio, moverNegocio, mudarStatusImovel, receberAluguel, repassarAluguel, salvarContrato, salvarImovel, salvarNegocio } from "@/lib/servidor/imobiliaria";
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
  imobiliaria: {
    empresa: "Orla Imóveis",
    cidade: "Maricá",
    uf: "RJ",
    regime: "simples",
    vendas: {
      "Comissão de venda": { porMes: 2, valor: [14000, 42000], formas: ["transferencia"], descricoes: ["Comissão de venda · apartamento", "Comissão de venda · casa", "Comissão de venda · terreno"] },
      "Taxa de administração": { porMes: 6, valor: [180, 440], formas: ["pix"], descricoes: ["Taxa de administração"] },
      "Comissão de locação": { porMes: 2, valor: [1800, 3600], formas: ["pix", "transferencia"], descricoes: ["Comissão de locação"] },
      "Avaliações e laudos": { porMes: 2, valor: [450, 900], formas: ["pix"], descricoes: ["Avaliação de imóvel", "Laudo para financiamento"] },
    },
    contas: [
      ["Portais de anúncio", "Planos dos portais imobiliários", 1290, 10],
      ["Comissão de corretores", "Comissões dos corretores", 9000, 5],
      ["Fotos e vídeos dos imóveis", "Fotógrafo e drone", 700, 18],
      ["contas_fixas", "Aluguel da loja", 3800, 5],
      ["marketing", "Impulsionamento no Instagram", 800, 12],
      ["funcionarios", "Secretária", 2300, 5],
      ["pro_labore", "Pró-labore", 7000, 5],
    ],
    clientes: [
      "Helena Barcelos", "Roberto Antunes", "Cláudia Menezes", "Jorge Farias", "Marlene Couto", "Otávio Pires", "Fernanda Lacerda", "Eduardo Prates", "Aline Moraes", "Gustavo Teles",
      "Viviane Rangel", "Diego Sampaio", "Patrícia Leal", "Comercial Lagoa Ltda.", "Bruno Castanheira", "Larissa Fontes",
      "Thaís Monteiro", "Rodrigo Vilela", "Natália Brandão", "André Quintela", "Clínica Vida Plena", "Família Okamoto", "Sandra Veloso", "Felipe e Carol", "Márcio Tavares", "Joana Ribas", "Leonardo Assis", "Priscila Gomes",
    ],
    agenda: { valor: 0, profissional: ["Renata", "Marcelo", "Júlia"], servicos: ["Visita ao imóvel", "Visita ao imóvel", "Visita ao imóvel", "Visita ao imóvel", "Captação", "Avaliação", "Assinatura de contrato"] },
  },
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
    .values(x.clientes.map((nome, i) => ({ empresaId, nome, telefone: `5521900000${String(100 + i).padStart(3, "0")}`, criadoPor: u.id })))
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
  const vendasGravadas = novasVendas.length ? await db.insert(vendas).values(novasVendas).returning({ id: vendas.id, data: vendas.data, valor: vendas.valorCentavos, descricao: vendas.descricao, fonte: vendas.fonteReceitaId, clienteId: vendas.clienteId }) : [];
  if (novasDespesas.length) await db.insert(despesas).values(novasDespesas);
  await montarRecuperacaoDemo(empresaId, u.id, listaClientes, vendasGravadas, hojeData);

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
  if (perfil === "varejo") await montarEstoqueDemo(empresaId, u.id);
  if (perfil === "revenda_veiculos") await montarPatioDemo(empresaId, u.id, fontes, vendasGravadas, hojeData);
  if (perfil === "imobiliaria") await montarImobiliariaDemo(empresaId, u.id, listaClientes, hojeData);
  return { usuarioId: u.id, empresaId };
}

// Imóveis da demonstração: [código, título, tipo, finalidade, bairro, cidade, área, quartos, suítes, banheiros, vagas, venda, aluguel, condomínio, destaques, situação, dias na carteira, exclusivo, corretor]
type LinhaImovel = [string, string, string, "venda" | "aluguel" | "venda_aluguel", string, string, number, number, number, number, number, number | null, number | null, number | null, string[], "disponivel" | "reservado" | "alugado", number, boolean, string];
const IMOVEIS_DEMO: LinhaImovel[] = [
  ["CO-0012", "Cobertura duplex com piscina e vista para o mar", "cobertura", "venda", "Ponta Negra", "Maricá", 210, 4, 3, 4, 3, 1_480_000, null, 1_350, ["Vista mar", "Piscina privativa", "Churrasqueira", "Varanda gourmet"], "disponivel", 38, true, "Renata"],
  ["CC-0031", "Casa em condomínio a 300 m da praia", "casa_condominio", "venda", "Itaipuaçu", "Maricá", 160, 3, 1, 3, 2, 690_000, null, 420, ["Condomínio com lazer", "Quintal", "Aceita financiamento"], "disponivel", 12, false, "Marcelo"],
  ["AP-0142", "Apartamento 3 quartos com varanda gourmet", "apartamento", "venda", "Icaraí", "Niterói", 98, 3, 1, 2, 1, 845_000, null, 1_100, ["Varanda gourmet", "Lazer completo", "A duas quadras da praia"], "reservado", 64, true, "Júlia"],
  ["CA-0088", "Casa térrea com piscina e área gourmet", "casa", "venda", "Barra de Maricá", "Maricá", 240, 4, 2, 3, 4, 980_000, null, null, ["Piscina", "Área gourmet", "Terreno de 600 m²"], "disponivel", 121, false, "Renata"],
  ["AP-0156", "Apartamento 2 quartos novo, primeira locação", "apartamento", "aluguel", "Centro", "Maricá", 62, 2, 1, 2, 1, null, 2_300, 380, ["Primeira locação", "Aceita pet", "Portaria 24h"], "disponivel", 6, false, "Marcelo"],
  ["CA-0091", "Casa 3 quartos com quintal amplo", "casa", "venda_aluguel", "São José do Imbassaí", "Maricá", 140, 3, 1, 2, 2, 420_000, 2_800, null, ["Quintal", "Aceita pet", "Rua tranquila"], "disponivel", 47, false, "Júlia"],
  ["TE-0017", "Terreno plano de 480 m² perto da Lagoa", "terreno", "venda", "Araçatiba", "Maricá", 480, 0, 0, 0, 0, 185_000, null, null, ["Plano", "Escritura ok", "Rua asfaltada"], "disponivel", 156, false, "Marcelo"],
  ["SA-0009", "Sala comercial na Rua Abreu Rangel", "sala", "aluguel", "Centro", "Maricá", 38, 0, 0, 1, 1, null, 1_900, 290, ["Recepção", "Ar-condicionado", "Vaga coberta"], "disponivel", 22, false, "Renata"],
  ["AP-0161", "Apartamento 1 quarto mobiliado perto da praia", "apartamento", "aluguel", "Piratininga", "Niterói", 48, 1, 0, 1, 1, null, 2_100, 450, ["Mobiliado", "A 2 quadras da praia"], "reservado", 9, false, "Júlia"],
  ["CC-0035", "Casa 4 suítes em condomínio fechado", "casa_condominio", "venda", "Camboinhas", "Niterói", 320, 4, 4, 5, 4, 2_350_000, null, 1_800, ["Condomínio fechado", "Piscina", "Home office", "Energia solar"], "disponivel", 29, true, "Renata"],
  // Alugados (com contrato)
  ["AP-0118", "Apartamento 2 quartos com vista para a Lagoa", "apartamento", "aluguel", "Centro", "Maricá", 70, 2, 1, 2, 1, null, 2_500, 420, ["Vista lagoa"], "alugado", 400, false, "Marcelo"],
  ["CA-0064", "Casa 3 quartos com garagem", "casa", "aluguel", "Itaipuaçu", "Maricá", 130, 3, 1, 2, 2, null, 3_200, null, ["Garagem para 2 carros"], "alugado", 520, false, "Júlia"],
  ["AP-0122", "Apartamento 3 quartos com lazer completo", "apartamento", "aluguel", "Icaraí", "Niterói", 105, 3, 1, 2, 1, null, 4_200, 1_250, ["Lazer completo"], "alugado", 610, false, "Renata"],
  ["LO-0004", "Loja de rua com 2 frentes", "loja", "aluguel", "Centro", "Maricá", 85, 0, 0, 1, 0, null, 5_500, null, ["Esquina", "Duas frentes"], "alugado", 700, false, "Marcelo"],
  ["AP-0130", "Apartamento 2 quartos perto do comércio", "apartamento", "aluguel", "Flamengo", "Maricá", 58, 2, 0, 1, 1, null, 1_800, 280, ["Perto de tudo"], "alugado", 330, false, "Júlia"],
  ["CA-0071", "Casa de praia com varanda", "casa", "aluguel", "Ponta Negra", "Maricá", 110, 3, 1, 2, 2, null, 3_600, null, ["Vista mar", "Varanda"], "alugado", 450, false, "Renata"],
];

// Contratos dos alugados: [código, inquilino (índice do cliente), proprietário, meses desde o início, meses de contrato, dia de vencimento, garantia]
const CONTRATOS_DEMO: [string, number, number, number, number, number, string][] = [
  ["AP-0118", 10, 0, 11, 30, 5, "Caução"],
  ["CA-0064", 11, 1, 22, 30, 10, "Fiador"],
  ["AP-0122", 12, 2, 28, 30, 10, "Seguro-fiança"],
  ["LO-0004", 13, 3, 34, 36, 15, "Título de capitalização"],
  ["AP-0130", 14, 4, 6, 30, 20, "Caução"],
  ["CA-0071", 15, 5, 18, 30, 25, "Fiador"],
];

// Funil: [cliente (índice), código do imóvel ou null, tipo, etapa, valor, origem, corretor, procura, próximo passo, dias até o próximo passo, motivo da perda]
const NEGOCIOS_DEMO: [number, string | null, "compra" | "locacao", "lead" | "atendimento" | "visita" | "proposta" | "fechado" | "perdido", number | null, string, string, string, string, number | null, string | null][] = [
  [16, null, "compra", "lead", 650_000, "Portal", "Marcelo", "Casa 3 quartos em Itaipuaçu, até R$ 700 mil, financiamento", "Ligar e entender o que procura", 0, null],
  [17, "AP-0156", "locacao", "lead", 2_300, "Instagram", "Júlia", "2 quartos no Centro, aceita pet", "Mandar a ficha e marcar visita", 1, null],
  [18, null, "compra", "lead", null, "WhatsApp", "Renata", "Cobertura com vista mar", "Responder no WhatsApp", -1, null],
  [19, "CC-0031", "compra", "atendimento", 690_000, "Site", "Marcelo", "Casa em condomínio perto da praia", "Simular financiamento", 2, null],
  [20, "SA-0009", "locacao", "atendimento", 1_900, "Placa", "Renata", "Sala para consultório", "Mandar planta da sala", -2, null],
  [21, "CA-0088", "compra", "visita", 950_000, "Indicação", "Renata", "Casa com piscina para a família", "Segunda visita com a esposa", 3, null],
  [22, "CO-0012", "compra", "visita", 1_480_000, "Portal", "Renata", "Cobertura para morar perto da praia", "Visita sábado 10h", 4, null],
  [23, "CA-0091", "locacao", "visita", 2_800, "Portal", "Júlia", "Casa com quintal para os cachorros", "Confirmar visita", 0, null],
  [6, "AP-0142", "compra", "proposta", 820_000, "Indicação", "Júlia", "Apartamento em Icaraí para a filha", "Resposta do proprietário à contraproposta", 1, null],
  [7, "CC-0035", "compra", "proposta", 2_200_000, "Site", "Renata", "Casa grande em condomínio", "Aguardar carta de crédito", 5, null],
  [8, "AP-0161", "locacao", "proposta", 2_100, "Instagram", "Júlia", "Apartamento mobiliado por 1 ano", "Análise do seguro-fiança", 2, null],
  [9, "TE-0017", "compra", "atendimento", 175_000, "Placa", "Marcelo", "Terreno para construir", "Levar para ver o terreno", 6, null],
  [24, "CA-0088", "compra", "perdido", 900_000, "Portal", "Renata", "Casa com piscina", "", null, "Comprou com outra imobiliária"],
  [25, null, "locacao", "perdido", 1_500, "WhatsApp", "Marcelo", "Kitnet no Centro", "", null, "Fora do orçamento"],
];

/** A imobiliária de exemplo: carteira, contratos com aluguéis do mês, funil e visitas ligadas aos imóveis. */
async function montarImobiliariaDemo(empresaId: string, usuarioId: string, lista: { id: string; nome: string }[], hojeData: string) {
  const db = obterDb();
  const cli = (i: number) => lista[i % lista.length].id;
  const ids = new Map<string, string>();
  for (const [k, l] of IMOVEIS_DEMO.entries()) {
    const [codigo, titulo, tipo, finalidade, bairro, cidade, area, quartos, suites, banheiros, vagas, venda, aluguel, condominio, destaques, , dias, exclusivo, corretor] = l;
    const id = await salvarImovel(db, empresaId, usuarioId, null, {
      codigo,
      titulo,
      tipo,
      finalidade,
      bairro,
      cidade,
      endereco: "",
      areaM2: area,
      quartos: quartos || null,
      suites: suites || null,
      banheiros: banheiros || null,
      vagas: vagas || null,
      precoVendaCentavos: venda ? R(venda) : null,
      aluguelCentavos: aluguel ? R(aluguel) : null,
      condominioCentavos: condominio ? R(condominio) : null,
      iptuCentavos: venda ? R(Math.round(venda * 0.0035)) : null,
      destaques,
      fotos: [],
      descricao: "",
      proprietarioId: cli(k % 10),
      corretor,
      comissaoPcm: 6_000,
      exclusivo,
      captadoEm: somarDias(hojeData, -dias),
    });
    ids.set(codigo, id);
    if (l[15] === "reservado") await mudarStatusImovel(db, empresaId, usuarioId, id, "reservado");
  }
  for (const [codigo, inq, prop, desde, duracao, dia, garantia] of CONTRATOS_DEMO) {
    const inicio = `${somarMeses(mesAtual(), -desde)}-${String(dia).padStart(2, "0")}`;
    const fim = `${somarMeses(mesAtual(), duracao - desde)}-${String(dia).padStart(2, "0")}`;
    const imovel = IMOVEIS_DEMO.find((i) => i[0] === codigo)!;
    await salvarContrato(db, empresaId, usuarioId, {
      imovelId: ids.get(codigo)!,
      inquilinoId: cli(inq),
      proprietarioId: cli(prop),
      inicio,
      fim,
      aluguelCentavos: R(imovel[12]!),
      taxaAdmPcm: codigo.startsWith("LO") ? 8_000 : 10_000,
      diaVencimento: dia,
      indice: codigo === "AP-0130" ? "IPCA" : "IGP-M",
      garantia,
    });
  }
  // Aluguéis do mês: os que já venceram foram pagos (e quase todos repassados), menos um atrasado.
  const dia = Number(hojeData.slice(8));
  const doMes = await alugueisDoMes(db, empresaId, mesAtual());
  let atrasou = false;
  for (const a of doMes) {
    if (a.diaVencimento > dia) continue;
    if (!atrasou && a.diaVencimento < dia) {
      atrasou = true;
      continue;
    }
    await receberAluguel(db, empresaId, usuarioId, a.aluguel.id, somarDias(hojeData, -Math.max(0, Math.min(2, dia - a.diaVencimento))));
    if (a.diaVencimento < dia - 2) await repassarAluguel(db, empresaId, usuarioId, a.aluguel.id, hojeData);
  }
  // Funil.
  for (const [c, codigo, tipo, etapa, valor, origem, corretor, procura, passo, quando, motivo] of NEGOCIOS_DEMO) {
    const id = await salvarNegocio(db, empresaId, usuarioId, null, {
      clienteId: cli(c),
      imovelId: codigo ? (ids.get(codigo) ?? null) : null,
      tipo,
      valorCentavos: valor ? R(valor) : null,
      origem,
      corretor,
      procura,
      proximoPasso: passo,
      proximoEm: quando == null ? null : somarDias(hojeData, quando),
    });
    if (etapa !== "lead") await moverNegocio(db, empresaId, usuarioId, id, etapa === "fechado" ? "proposta" : etapa, motivo);
  }
  // Cada um está na etapa há um tempo diferente (um funil de verdade não nasce todo hoje).
  await db
    .update(negociosImoveis)
    .set({ etapaDesde: sql`now() - make_interval(days => (1 + floor(random() * 20))::int)` })
    .where(eq(negociosImoveis.empresaId, empresaId));
  // Dois fechamentos recentes: uma venda (comissão de 6%) e uma locação (primeiro aluguel).
  const fechadoVenda = await salvarNegocio(db, empresaId, usuarioId, null, { clienteId: cli(26), imovelId: null, tipo: "compra", valorCentavos: R(560_000), origem: "Indicação", corretor: "Marcelo", procura: "Apartamento 2 quartos", proximoPasso: "", proximoEm: null });
  await fecharNegocio(db, empresaId, usuarioId, fechadoVenda, { valorCentavos: R(560_000), comissaoPcm: 6_000, data: somarDias(hojeData, -4), recebido: false });
  const fechadoLoc = await salvarNegocio(db, empresaId, usuarioId, null, { clienteId: cli(27), imovelId: null, tipo: "locacao", valorCentavos: R(2_400), origem: "Portal", corretor: "Júlia", procura: "Casa com quintal", proximoPasso: "", proximoEm: null });
  await fecharNegocio(db, empresaId, usuarioId, fechadoLoc, { valorCentavos: R(2_400), comissaoPcm: 100_000, data: somarDias(hojeData, -9), recebido: true });
  // As visitas da agenda ganham imóvel (os disponíveis e reservados).
  const visitaveis = IMOVEIS_DEMO.filter((i) => i[15] !== "alugado").map((i) => ids.get(i[0])!);
  const visitas = await db.select({ id: agendamentos.id }).from(agendamentos).where(and(eq(agendamentos.empresaId, empresaId), eq(agendamentos.servico, "Visita ao imóvel")));
  // Uns imóveis atraem bem mais visitas que outros (como na vida real).
  for (const v of visitas) await db.update(agendamentos).set({ imovelId: visitaveis[Math.floor(Math.random() ** 2 * visitaveis.length)] }).where(eq(agendamentos.id, v.id));
}

// Nome, categoria, preço, custo, saldo, mínimo. Alguns acabando, um zerado: o "Estoque crítico" tem o que mostrar.
const PRODUTOS_LOJA: [string, string, number, number, number, number][] = [
  ["Camiseta básica branca M", "Camisetas", 49.9, 18, 24, 6],
  ["Camiseta básica preta G", "Camisetas", 49.9, 18, 3, 6],
  ["Calça jeans skinny 38", "Calças", 159.9, 68, 9, 3],
  ["Calça jeans reta 42", "Calças", 169.9, 72, 2, 3],
  ["Vestido midi floral", "Vestidos", 189.9, 79, 7, 2],
  ["Vestido tubinho preto", "Vestidos", 149.9, 61, 0, 2],
  ["Blusa de linho off-white", "Blusas", 119.9, 47, 11, 3],
  ["Cropped canelado", "Blusas", 59.9, 21, 14, 4],
  ["Short alfaiataria bege", "Shorts", 99.9, 39, 6, 2],
  ["Sandália rasteira caramelo 36", "Calçados", 89.9, 34, 1, 2],
  ["Tênis casual branco 37", "Calçados", 219.9, 98, 5, 2],
  ["Bolsa tiracolo couro", "Acessórios", 179.9, 72, 4, 1],
  ["Cinto fivela dourada", "Acessórios", 69.9, 22, 10, 3],
  ["Brinco argola média", "Acessórios", 39.9, 11, 22, 5],
];

/**
 * Clientes para chamar: os quatro primeiros clientes param de comprar há uns dois meses (as vendas
 * recentes deles ficam sem cliente) e dois contatos já feitos mostram "Aguardando" e "Comprou".
 */
async function montarRecuperacaoDemo(
  empresaId: string,
  usuarioId: string,
  lista: { id: string; nome: string }[],
  gravadas: { id: string; data: string; clienteId: string | null }[],
  hojeData: string,
) {
  if (lista.length < 6) return;
  const db = obterDb();
  const sumidos = lista.slice(0, 4).map((c) => c.id);
  await db
    .update(vendas)
    .set({ clienteId: null })
    .where(and(eq(vendas.empresaId, empresaId), inArray(vendas.clienteId, sumidos), gte(vendas.data, somarDias(hojeData, -62))));
  const quando = (dias: number) => new Date(Date.now() - dias * 86_400_000);
  const [esperando, voltou] = [lista[4], lista[5]];
  await db.insert(contatosClientes).values({
    empresaId,
    clienteId: esperando.id,
    motivo: "ritmo",
    porque: "Comprava toda semana; já fazia 2 meses sem vir.",
    mensagem: "",
    criadoPor: usuarioId,
    criadoEm: quando(3),
  });
  // A venda que veio do contato: uma venda dele depois do dia do contato (se a demo sorteou alguma).
  const desde = somarDias(hojeData, -12);
  const venda = gravadas.filter((v) => v.clienteId === voltou.id && v.data >= desde).sort((a, b) => a.data.localeCompare(b.data))[0];
  await db.insert(contatosClientes).values({
    empresaId,
    clienteId: voltou.id,
    motivo: "sumiu",
    porque: "Comprou duas vezes; a última há 3 meses.",
    mensagem: "",
    resultado: venda ? "comprou" : "respondeu",
    vendaId: venda?.id ?? null,
    criadoPor: usuarioId,
    criadoEm: quando(12),
    resultadoEm: quando(8),
  });
}

/** Loja de exemplo: produtos com código de barras e algumas vendas no caixa de hoje. */
async function montarEstoqueDemo(empresaId: string, usuarioId: string) {
  const db = obterDb();
  const ids: string[] = [];
  for (const [i, [nome, categoria, preco, custo, saldo, minimo]] of PRODUTOS_LOJA.entries()) {
    const id = await salvarProduto(
      db,
      empresaId,
      null,
      { nome, sku: null, codigoBarras: `789100000${String(1000 + i).padStart(4, "0")}`, categoria, unidade: "un", precoCentavos: R(preco), minimoMil: minimo * 1000, controlaEstoque: true, ativo: true },
      usuarioId,
      { saldoMil: saldo * 1000, custoCentavos: R(custo) },
    );
    ids.push(id);
  }
  // Meta do mês, para a Meta do dia ter o que mostrar.
  await db.insert(empresaPainel).values({ empresaId, metaCentavos: R(42000) }).onConflictDoUpdate({ target: empresaPainel.empresaId, set: { metaCentavos: R(42000) } });
  const vendasHoje: { itens: [number, number][]; forma: "pix" | "credito" | "debito" | "dinheiro" }[] = [
    { itens: [[0, 2], [12, 1]], forma: "pix" },
    { itens: [[2, 1]], forma: "credito" },
    { itens: [[7, 1], [13, 2]], forma: "debito" },
    { itens: [[4, 1]], forma: "pix" },
    { itens: [[8, 1], [11, 1]], forma: "credito" },
  ];
  for (const v of vendasHoje)
    await registrarVendaCaixa(db, empresaId, usuarioId, {
      itens: v.itens.map(([i, q]) => ({ produtoId: ids[i], quantidadeMil: q * 1000 })),
      descontoCentavos: 0,
      formaPagamento: v.forma,
      clienteId: null,
      aReceber: false,
    });
}

const CARROS_PATIO: [string, number, number, number][] = [
  ["Onix LT 1.0 Turbo", 2021, 42_000, 69_900],
  ["HB20 Comfort 1.0", 2020, 51_000, 62_900],
  ["Corolla XEi 2.0", 2019, 68_000, 109_900],
  ["Strada Freedom 1.3", 2022, 28_000, 99_900],
  ["Compass Longitude 2.0", 2019, 74_000, 124_900],
  ["Gol 1.6 MSI", 2018, 89_000, 47_900],
  ["Kicks SV 1.6", 2021, 39_000, 96_900],
  ["T-Cross 200 TSI", 2022, 31_000, 118_900],
  ["Renegade Sport 1.8", 2018, 82_000, 76_900],
];

/** Revenda de exemplo: carros no pátio e os vendidos dos últimos dois meses, ligados às vendas. */
async function montarPatioDemo(empresaId: string, usuarioId: string, fontes: { id: string; nome: string }[], gravadas: { id: string; data: string; valor: number; descricao: string; fonte: string; clienteId: string | null }[], hojeData: string) {
  const db = obterDb();
  const fonteCarro = fontes.find((f) => f.nome === "Venda de veículos")?.id;
  const desde = somarDias(hojeData, -62);
  const vendidos = gravadas.filter((v) => v.fonte === fonteCarro && v.data >= desde);
  const status = ["disponivel", "disponivel", "reservado", "disponivel", "preparacao", "disponivel", "disponivel", "preparacao", "disponivel"] as const;
  const letras = () => Array.from({ length: 3 }, () => String.fromCharCode(65 + Math.floor(Math.random() * 26))).join("");
  const placa = () => `${letras()}${Math.floor(Math.random() * 10)}${String.fromCharCode(65 + Math.floor(Math.random() * 10))}${String(Math.floor(Math.random() * 100)).padStart(2, "0")}`;
  const linhas: (typeof veiculos.$inferInsert)[] = [
    ...CARROS_PATIO.map(([modelo, ano, km, preco], i) => {
      const custo = R(preco * entre(0.8, 0.86));
      return {
        empresaId,
        modelo,
        ano,
        km,
        placa: placa(),
        status: status[i],
        custoCompraCentavos: custo,
        custoPreparacaoCentavos: R(entre(600, 2400)),
        precoCentavos: R(preco),
        // O Gol e o Renegade estão parados há mais de 60 dias.
        entradaEm: somarDias(hojeData, i === 5 || i === 8 ? -Math.round(entre(64, 90)) : -Math.round(entre(2, 45))),
        criadoPor: usuarioId,
      };
    }),
    ...vendidos.map((v) => {
      const dias = Math.round(entre(9, 55));
      return {
        empresaId,
        modelo: v.descricao,
        ano: 2017 + Math.floor(Math.random() * 5),
        km: Math.round(entre(30_000, 90_000)),
        placa: placa(),
        status: "vendido" as const,
        custoCompraCentavos: Math.round(v.valor * entre(0.78, 0.86)),
        custoPreparacaoCentavos: R(entre(500, 2200)),
        precoCentavos: Math.round(v.valor * 1.04),
        valorVendaCentavos: v.valor,
        entradaEm: somarDias(v.data, -dias),
        vendidoEm: v.data,
        vendaId: v.id,
        clienteId: v.clienteId,
        criadoPor: usuarioId,
      };
    }),
  ];
  const carros = await db.insert(veiculos).values(linhas).returning({ id: veiculos.id, status: veiculos.status });
  // Os test drives e visitas que vêm pela frente ficam ligados a um carro do pátio.
  const doPatio = carros.filter((c) => c.status !== "vendido");
  if (doPatio.length) {
    const ids = sql.raw(`array[${doPatio.map((c) => `'${c.id}'::uuid`).join(",")}]`);
    await db
      .update(agendamentos)
      .set({ veiculoId: sql`(${ids})[1 + floor(random() * ${doPatio.length})::int]` })
      .where(and(eq(agendamentos.empresaId, empresaId), gte(agendamentos.data, hojeData)));
  }
}
