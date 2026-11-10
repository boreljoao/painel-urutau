import "server-only";
import { randomBytes } from "node:crypto";
import { and, eq, gte, inArray, like, lt, sql } from "drizzle-orm";
import { obterDb } from "@/db";
import { type Perfil, agendamentos, categoriasDespesa, clientes, despesas, empresaPainel, empresaUsuarios, empresas, fontesReceita, usuarios, veiculos, vendas } from "@/db/schema";
import { DOMINIO_DEMO, HORAS_DEMO } from "@/lib/demo";
import { diaDaSemana, diasNoMes, hoje, mesAtual, somarDias, somarMeses } from "@/lib/datas";
import { hashSenha } from "@/lib/servidor/auth";
import { agendaDoPacote } from "@/pacotes/catalogo";
import { registrarVendaCaixa, salvarProduto } from "@/lib/servidor/estoque";
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
  const vendasGravadas = novasVendas.length ? await db.insert(vendas).values(novasVendas).returning({ id: vendas.id, data: vendas.data, valor: vendas.valorCentavos, descricao: vendas.descricao, fonte: vendas.fonteReceitaId, clienteId: vendas.clienteId }) : [];
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
  if (perfil === "varejo") await montarEstoqueDemo(empresaId, u.id);
  if (perfil === "revenda_veiculos") await montarPatioDemo(empresaId, u.id, fontes, vendasGravadas, hojeData);
  return { usuarioId: u.id, empresaId };
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
