// Auditoria de segurança (B13/B6): pedido que passa na validação da rota mas
// estoura numeric(10,2) no gatilho de totais. Numa CÓPIA da função sobre uma
// CÓPIA da tabela, dentro da transação desfeita — nada real é gravado e o
// contador real de pedidos não anda.
//
// Prova:
//   - uma linha de R$ 50.000,00 x 9.999 (aceita por validarPedido) faz o
//     insert falhar com 22003 (numeric field overflow);
//   - a falha desfaz a contagem do limite por IP (a tentativa não fica
//     registrada) e, ainda assim, o número do pedido é gasto: a próxima
//     gravação válida vem com número pulado.
//
// Uso: node scripts/banco/estouro-valor-pedido.mjs

import { emTransacaoDesfeita, registrar } from "./lib.mjs";

const ASSINATURA = "public.criar_pedido(text, uuid, jsonb, boolean, text, integer, integer)";

function pedido(itens) {
  return {
    cliente_nome: "PROVA_TRANSACAO_DESFEITA",
    cliente_whatsapp: "(41) 90000-0000",
    cliente_email: null,
    ocasiao: null,
    modo_entrega: "retirada",
    endereco: null,
    data_hora_entrega: new Date(Date.now() + 5 * 86400000).toISOString(),
    forma_pagamento: "Pix",
    observacoes: null,
    itens,
  };
}
const linha = (preco, quantidade) => ({
  nome: "Prova", variacao: null, quantidade, preco_unitario: preco,
  produto_id: "00000000-0000-4000-8000-000000000001", tipo: "normal", observacao: null,
});

await emTransacaoDesfeita("Estouro de valor em criar_pedido (cópia, transação desfeita)", async (db) => {
  await db.query("create table public.zz_prova_pedidos (like public.pedidos including all)");
  await db.query(`create trigger trg_pedidos_recalcular_totais before insert on public.zz_prova_pedidos
                  for each row execute function public.pedidos_recalcular_totais()`);
  const { rows: fonte } = await db.query(`select pg_get_functiondef('${ASSINATURA}'::regprocedure) def`);
  const copia = fonte[0].def
    .replace("public.criar_pedido(", "public.zz_prova_criar_pedido(")
    .replace(/public\.pedidos(?![_\w])/g, "public.zz_prova_pedidos");
  if (/public\.pedidos(?![_\w])/.test(copia)) throw new Error("a cópia ainda aponta para a tabela real");
  await db.query(copia);
  await db.query("update public.pedidos_gravacao set ligada = true where contexto = 'fora_producao'");

  const chamar = (chave, itens) =>
    db.query("select r_situacao, r_numero from public.zz_prova_criar_pedido($1, $2::uuid, $3::jsonb, true, $4, 3600, 8)", [
      "fora_producao", chave, JSON.stringify(pedido(itens)), "ip-prova",
    ]);

  const antes = (await db.query("select count(*)::int n from public.pedidos_rate_limit where ip = 'ip-prova'")).rows[0].n;

  await db.query("savepoint s1");
  let codigo = null;
  try {
    await chamar("00000000-0000-4000-8000-0000000000a1", [linha(50000, 9999)]);
  } catch (e) {
    codigo = e.code;
  }
  await db.query("rollback to savepoint s1");

  const depois = (await db.query("select count(*)::int n from public.pedidos_rate_limit where ip = 'ip-prova'")).rows[0].n;
  const ok = (await chamar("00000000-0000-4000-8000-0000000000a2", [linha(10, 1)])).rows[0];

  registrar(
    "estouro 1. linha aceita pela validação (R$ 50.000 x 9.999) estoura numeric(10,2) no gatilho",
    codigo === "22003",
    `código do erro: ${codigo}`
  );
  registrar(
    "estouro 2. a falha NÃO deixa tentativa registrada no limite por IP (tentativa válida e fracassada é ilimitada)",
    antes === 0 && depois === 0,
    `linhas do IP antes ${antes}, depois da falha ${depois}`
  );
  registrar(
    "estouro 3. a falha gasta número de pedido (a próxima gravação válida vem com número pulado)",
    ok.r_situacao === "criado" && ok.r_numero > 1,
    `próximo número gravado: ${ok.r_numero} (1 = nada gasto)`
  );
});
