# Auditoria de 11/11/2026 — o que foi feito e o que falta

Referência: `auditoria-painel-urutau.md` (fora do repositório), analisada no commit `9056608`.

## Onde corrigir (A01)

- `src/db` e `src/lib` do painel são **cópias** do app-urutau. Mudança ali vai primeiro para o app
  (que tem os testes e as migrations) e chega aqui com `npm run sincronizar`.
- O script não apaga mais nada que só existe no painel e **para** se algum arquivo copiado foi
  mexido aqui desde a última cópia (`scripts/sincronizado.json`). `--conferir` mostra o que mudaria.
- Ordem de publicação: app primeiro (aplica as migrations), painel depois.

## Feito

| ID | O que mudou | Prova |
|---|---|---|
| F01 | Dinheiro entregue menor que o total é recusado no servidor; troco e valor entregue gravados (`vendas.valor_entregue_centavos`, `troco_centavos`). O caixa mostra "Faltam R$ …" e trava o botão. | `banco-estoque.test.ts` (auditoria F01); conferido no caixa local |
| F02 | Excluir venda pelo financeiro segue a origem: caixa devolve estoque (só dono/gerente), agenda solta o atendimento, pátio devolve o carro. Restaurar refaz o vínculo só se estiver livre; venda do caixa não volta. Valor de venda do caixa/pátio não muda no editor genérico. | `banco-ciclo-venda.test.ts`; conferido no painel local |
| F03 | Desconto da venda rateado nos itens em centavos (maiores restos); `venda_itens.total_centavos` passa a ser receita líquida, com `desconto_venda_centavos`. | testes de rateio e "R$ 100 → R$ 80" |
| F04 | Chave de idempotência por carrinho (`vendas.chave_idempotencia` + índice único); mesma chave devolve a mesma venda, com outro carrinho é conflito. Baixa em ordem de id. | 20 envios simultâneos = 1 venda |
| F05 | Agenda pública: fila por empresa e dia (`pg_advisory_xact_lock`) e conferência dentro da transação; link do paciente só muda horário ainda marcado/confirmado. | — (falta teste concorrente no painel, ver A02) |
| F06 | Receber atendimento e vender carro travam o registro (FOR UPDATE) e conferem dentro da transação. | — |
| F07 | Totais do estoque em SQL sobre o catálogo inteiro; lista paginada (200) com "Mostrando X de N"; caixa carrega 400 mais vendidos e busca o resto no servidor. | teste F13 + conferido |
| F08 | Caixa do dia separa "Vendido", "Pago na hora" e "Fiado"; aviso de que pix/cartão não é confirmação do banco. | teste do fechamento |
| F10 | `venda_itens.custo_total_centavos` calculado uma vez (backfill na migration 0026); relatórios usam ele. | teste F01/F03 |
| F11 | Servidor recusa produto desativado, meia unidade em `un/cx/pct` e troca de unidade depois de movimento. | teste F11 |
| F12 | CSV: coluna ausente não vira zero, preço negativo/unidade desconhecida/fração indivisível recusados; planilha só de preço não mexe no saldo. | 4 contratos da auditoria passam |
| F13 | "Para repor" = abaixo do mínimo + zerados, igual ao filtro; cartão leva ao filtro. | 4 = 4 no painel local |
| F14 | Agenda não liga cliente pelo nome; telefone só completa o cadastro escolhido. | — |
| F15 | "Abrir WhatsApp" não marca como enviado; só "Enviei". | — |
| S01 | Freio no banco (`limites_uso`), atômico e entre servidores: login (IP e conta, senha > 200 recusada antes do Argon2), cadastro, demonstração, agenda pública. | `banco-limites.test.ts` |
| S02 | Conta de demonstração não gera IA, não publica, não liga Buffer, não sobe arquivo (bloqueio na ação). IA com 40 posts/dia por empresa; upload 150/dia e 25 MB (vídeo 200 MB). Telefones da demo viraram números de teste. | — |
| I02 | Envio só passa de pronto/erro para enviando uma vez (update condicional); apagar post agendado cancela no Buffer antes e não apaga se o Buffer não confirmar; publicado avisa que continua no Instagram; queda de conexão vira "confira no Buffer antes de reenviar". | — |
| I03 | Mesma conferência (`motivoParaNaoEnviar`) no botão e no modo automático. | — |

## Dados antigos (não alterados automaticamente)

Vendas do caixa feitas **antes** da migration 0026 com desconto na venda inteira têm itens somando
mais que a venda. Diagnóstico (só leitura):

```sql
select v.id, v.data, v.valor_centavos, sum(i.total_centavos) as soma_itens
from vendas v join venda_itens i on i.venda_id = v.id
where v.excluido_em is null
group by v.id having sum(i.total_centavos) <> v.valor_centavos;
```

Correção proposta, se o dono aprovar: ratear `soma_itens - valor_centavos` nos itens dessa venda
com a mesma regra de `ratearDesconto`, gravando em `desconto_venda_centavos`.

## Falta (próximas etapas)

- **F09** CMV × despesa na compra (`tratamentoMercadorias`): precisa de decisão com o contador.
- **F05** também no "Marcar" interno da equipe e na série recorrente (hoje só a página pública entra na fila).
- **S03** capacidades separadas (vender, desconto, estorno, custo, publicar…); **S04** recuperação de
  senha e troca de senha provisória; **S05** mídia com dono e privada; **S06** chaves compostas
  restantes; **S07** advisory do zod transitivo.
- **I01** fila durável no lugar de `after()`; **I04** mostrar o que a IA leu; **I05** kit de marca.
- **A02** suíte de testes no painel (hoje os testes ficam no app); **A03** versão por empresa para o
  "ao vivo"; **A04** paginação nas outras listas.
- Seção 10 (UX tela a tela) e seção 11 (novidades).
