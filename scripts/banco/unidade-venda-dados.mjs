// Prova do preenchimento de unidade_venda nos produtos de teste
// (supabase/dados-unidade-venda-teste.sql), numa transação desfeita — nada
// é gravado. Mostra, produto a produto, unidade_venda e atualizado_em antes
// e depois, e confere:
//   - só os 7 produtos do mapeamento mudam, e só na coluna unidade_venda;
//   - atualizado_em igual em todos os produtos (nenhuma data mexida);
//   - a ordem de "Os mais pedidos" (ativo + destaque, sem bebida, por
//     atualizado_em) igual antes e depois;
//   - o gatilho produtos_set_atualizado_em volta ligado e continua
//     funcionando depois (um update comum muda a data).
// Não entra em rodar-todos.mjs: depois de aplicado em produção, o
// preenchimento não muda mais nada (só preenche o que está vazio).
//
// Uso: node scripts/banco/unidade-venda-dados.mjs

import path from "node:path";
import { cenario, emTransacaoDesfeita, raiz, registrar, rodarMigracao } from "./lib.mjs";

const ARQUIVO = path.join(raiz, "supabase", "dados-unidade-venda-teste.sql");
const ESPERADO = {
  "Bolo de Chocolate com Ninho": "kg",
  "Morango Banhado": "unidade",
  "Brigadeiro Gourmet": "unidade",
  "Suco de Laranja Natural (1L)": "unidade",
  Beijinho: "unidade",
  "Cento de docinho": "unidade",
  "Cento de salgados sortidos": "unidade",
};

async function fotografar(db) {
  const { rows } = await db.query("select nome, to_jsonb(p) as linha from public.produtos p order by nome");
  return new Map(rows.map((r) => [r.nome, r.linha]));
}

async function maisPedidos(db) {
  const { rows } = await db.query(
    `select nome from public.produtos
     where ativo and destaque and "Categoria" is distinct from 'Bebidas'
     order by atualizado_em desc, nome`
  );
  return rows.map((r) => r.nome);
}

await emTransacaoDesfeita("Preenchimento de unidade_venda nos produtos de teste", async (db) => {
  const antes = await fotografar(db);
  const ordemAntes = await maisPedidos(db);

  await rodarMigracao(db, ARQUIVO);

  const depois = await fotografar(db);
  const ordemDepois = await maisPedidos(db);

  console.log("\nProduto | unidade_venda antes → depois | atualizado_em antes → depois");
  for (const [nome, linhaAntes] of antes) {
    const linhaDepois = depois.get(nome);
    console.log(
      `  ${nome} | ${linhaAntes.unidade_venda ?? "(vazio)"} → ${linhaDepois?.unidade_venda ?? "(vazio)"} | ${linhaAntes.atualizado_em} → ${linhaDepois?.atualizado_em}`
    );
  }

  const mudancas = [];
  for (const [nome, linhaAntes] of antes) {
    const linhaDepois = depois.get(nome) ?? {};
    const colunas = Object.keys({ ...linhaAntes, ...linhaDepois }).filter(
      (c) => JSON.stringify(linhaAntes[c]) !== JSON.stringify(linhaDepois[c])
    );
    if (colunas.length) mudancas.push({ nome, colunas, valor: linhaDepois.unidade_venda });
  }

  const nomesMudados = mudancas.map((m) => m.nome).sort();
  registrar(
    "dados 1. mudam exatamente os 7 produtos do mapeamento, com o valor certo",
    JSON.stringify(nomesMudados) === JSON.stringify(Object.keys(ESPERADO).sort()) &&
      mudancas.every((m) => ESPERADO[m.nome] === m.valor),
    mudancas.map((m) => `${m.nome} = ${m.valor}`).join("; ")
  );
  registrar(
    "dados 2. só a coluna unidade_venda muda (atualizado_em e o resto iguais)",
    mudancas.every((m) => m.colunas.length === 1 && m.colunas[0] === "unidade_venda"),
    mudancas.map((m) => `${m.nome}: ${m.colunas.join(",")}`).join("; ")
  );
  registrar(
    "dados 3. atualizado_em idêntico nos " + antes.size + " produtos",
    [...antes].every(([nome, l]) => l.atualizado_em === depois.get(nome)?.atualizado_em),
    `${antes.size} produtos antes, ${depois.size} depois`
  );
  registrar(
    "dados 4. 'Os mais pedidos' na mesma ordem",
    JSON.stringify(ordemAntes) === JSON.stringify(ordemDepois),
    ordemDepois.join(" > ")
  );

  const { rows: gatilho } = await db.query(
    "select tgenabled from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'produtos_set_atualizado_em'"
  );
  registrar("dados 5. gatilho produtos_set_atualizado_em religado", gatilho[0]?.tgenabled === "O", `tgenabled = ${gatilho[0]?.tgenabled}`);

  await cenario(db, async (c) => {
    const { rows: [a] } = await c.q("select atualizado_em from public.produtos where nome = 'Morango Banhado'");
    await c.q("update public.produtos set descricao = descricao where nome = 'Morango Banhado'");
    const { rows: [b] } = await c.q("select atualizado_em from public.produtos where nome = 'Morango Banhado'");
    registrar(
      "dados 6. depois, um update comum volta a mudar a data (gatilho funcionando)",
      String(a.atualizado_em) !== String(b.atualizado_em),
      `${a.atualizado_em?.toISOString?.() ?? a.atualizado_em} → ${b.atualizado_em?.toISOString?.() ?? b.atualizado_em}`
    );
  });
});
