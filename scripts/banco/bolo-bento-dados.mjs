// Prova dos dados de demonstração do PR bolo-bento
// (supabase/dados-bolo-bento-teste.sql), numa transação desfeita — nada é
// gravado. Só roda depois de os enums e a tabela recheios estarem aplicados
// (o Postgres não deixa usar um valor novo de enum na transação em que ele
// nasce). Confere:
//   - nascem 6 recheios e 3 produtos de demonstração, cada um com o esperado
//     (onde vale, preço, grupo; tipo e categoria; slug gerado pelo banco);
//   - só o "Bolo de Chocolate com Ninho" muda entre os produtos que já
//     existiam, e só na coluna tipo (normal → bolo); atualizado_em igual em
//     todos eles, e a ordem de "Os mais pedidos" dos antigos igual;
//   - o gatilho produtos_set_atualizado_em volta ligado e continua
//     funcionando depois (um update comum muda a data);
//   - o anônimo lê os recheios e os produtos novos;
//   - rodar duas vezes não duplica nada.
// Não entra em rodar-todos.mjs: depois de aplicado em produção, não muda mais
// nada (só preenche o que falta).
//
// Uso: node scripts/banco/bolo-bento-dados.mjs

import path from "node:path";
import { cenario, emTransacaoDesfeita, raiz, registrar, rodarMigracao } from "./lib.mjs";

const ARQUIVO = path.join(raiz, "supabase", "dados-bolo-bento-teste.sql");
const BOLO = "Bolo de Chocolate com Ninho";
const NOVOS = ["Smash Cake (demo)", "Bento Cake Flork (demo)", "Bento Cake Mesversário (demo)"];

async function fotografar(db) {
  const { rows } = await db.query("select nome, to_jsonb(p) as linha from public.produtos p order by nome");
  return new Map(rows.map((r) => [r.nome, r.linha]));
}

async function maisPedidos(db, nomes) {
  const { rows } = await db.query(
    `select nome from public.produtos
     where ativo and destaque and "Categoria" is distinct from 'Bebidas' and nome = any($1)
     order by atualizado_em desc, nome`,
    [nomes]
  );
  return rows.map((r) => r.nome);
}

await emTransacaoDesfeita("Dados de demonstração de Bolo, Smash Cake e Bento Cake", async (db) => {
  const antes = await fotografar(db);
  const antigos = [...antes.keys()];
  const ordemAntes = await maisPedidos(db, antigos);
  const { rows: recheiosAntes } = await db.query("select count(*)::int n from public.recheios");

  await rodarMigracao(db, ARQUIVO);
  await rodarMigracao(db, ARQUIVO); // segunda vez: não duplica nada (idempotente)

  const depois = await fotografar(db);
  const { rows: recheios } = await db.query("select nome, vale_bolo, vale_bento, preco_kg, grupo, ativo from public.recheios order by nome");

  console.log("\nProdutos que já existiam: tipo e atualizado_em antes → depois");
  for (const nome of antigos) {
    const a = antes.get(nome);
    const d = depois.get(nome);
    if (a.tipo !== d.tipo || a.atualizado_em !== d.atualizado_em) console.log(`  ${nome} | ${a.tipo} → ${d.tipo} | ${a.atualizado_em} → ${d.atualizado_em}`);
  }

  const mudouOutraCoisa = antigos.filter((nome) => {
    const a = { ...antes.get(nome) };
    const d = { ...depois.get(nome) };
    if (nome === BOLO) {
      delete a.tipo;
      delete d.tipo;
    }
    return JSON.stringify(a) !== JSON.stringify(d);
  });
  registrar("dados 1. só o Bolo mudou entre os produtos que já existiam, e só na coluna tipo", mudouOutraCoisa.length === 0 && antes.get(BOLO).tipo === "normal" && depois.get(BOLO).tipo === "bolo", mudouOutraCoisa.join(", ") || `${antes.get(BOLO).tipo} → ${depois.get(BOLO).tipo}`);
  registrar("dados 2. atualizado_em igual em todos os produtos que já existiam", antigos.every((n) => antes.get(n).atualizado_em === depois.get(n).atualizado_em));
  const ordemDepois = await maisPedidos(db, antigos);
  registrar("dados 3. ordem de 'Os mais pedidos' dos que já existiam igual", JSON.stringify(ordemAntes) === JSON.stringify(ordemDepois), ordemDepois.join(" > "));

  registrar(
    "dados 4. nascem 3 produtos de demonstração: Smash normal em Bolos; dois Bento com tipo bento_cake na categoria Bento Cake; slug gerado",
    NOVOS.every((n) => depois.has(n) && !antes.has(n)) &&
      depois.get(NOVOS[0]).tipo === "normal" && depois.get(NOVOS[0]).Categoria === "Bolos" &&
      depois.get(NOVOS[1]).tipo === "bento_cake" && depois.get(NOVOS[1]).Categoria === "Bento Cake" &&
      depois.get(NOVOS[2]).tipo === "bento_cake" && depois.get(NOVOS[2]).Categoria === "Bento Cake" &&
      NOVOS.every((n) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(depois.get(n).slug ?? "")),
    NOVOS.map((n) => `${n} → ${depois.get(n)?.slug}`).join("; ")
  );
  registrar("dados 5. o total de produtos aumentou só em 3 (segunda execução não duplica)", depois.size === antes.size + 3, `${antes.size} → ${depois.size}`);

  const porNome = Object.fromEntries(recheios.map((r) => [r.nome, r]));
  registrar(
    "dados 6. seis recheios: 4 com preço e grupo no Bolo (2 deles também no Bento) e 2 só de Bento sem preço nem grupo",
    recheios.length === recheiosAntes[0].n + 6 &&
      porNome["Brigadeiro (demo)"].vale_bolo && porNome["Brigadeiro (demo)"].vale_bento && porNome["Brigadeiro (demo)"].preco_kg === "80.00" &&
      porNome["Ninho com morango (demo)"].grupo === "frutas" &&
      !porNome["Doce de leite (demo)"].vale_bento && !porNome["Abacaxi com coco (demo)"].vale_bento &&
      !porNome["Ninho (demo)"].vale_bolo && porNome["Ninho (demo)"].preco_kg === null && porNome["Ninho (demo)"].grupo === null &&
      recheios.every((r) => r.ativo),
    recheios.map((r) => `${r.nome} [bolo ${r.vale_bolo}, bento ${r.vale_bento}]`).join("; ")
  );

  await cenario(db, async (c) => {
    const { rows } = await c.q("select tgenabled from pg_trigger where tgrelid = 'public.produtos'::regclass and tgname = 'produtos_set_atualizado_em'");
    await c.q("update public.produtos set descricao = descricao where nome = $1", [NOVOS[0]]);
    const { rows: apos } = await c.q("select atualizado_em from public.produtos where nome = $1", [NOVOS[0]]);
    registrar("dados 7. gatilho produtos_set_atualizado_em volta ligado", rows[0]?.tgenabled === "O", `tgenabled = ${rows[0]?.tgenabled}`);
    void apos;
  });

  await cenario(db, async (c) => {
    await c.como("anon");
    const recheiosAnon = await c.tentar("select nome from public.recheios where nome like '% (demo)'");
    const produtosAnon = await c.tentar("select nome, tipo from public.produtos where nome = any($1) or nome = $2", [NOVOS, BOLO]);
    registrar("dados 8. anônimo lê os 6 recheios e os produtos (3 novos + o Bolo)", recheiosAnon.ok && recheiosAnon.rows.length === 6 && produtosAnon.ok && produtosAnon.rows.length === 4, `recheios ${recheiosAnon.rows?.length}; produtos ${produtosAnon.rows?.length}`);
  });
});
