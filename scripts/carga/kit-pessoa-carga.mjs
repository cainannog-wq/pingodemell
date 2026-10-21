// Carga dos Kits Festa por pessoa. GRAVA EM PRODUÇÃO só com --aplicar: não é teste.
// A leitura e as regras ficam em kit-pessoa-lib.mjs (testadas); aqui só há banco.
//
// Entrada: pasta com listas.csv, produtos.csv, grupos.csv, tamanhos.csv e
// quantidades.csv (formato no cabeçalho de kit-pessoa-lib.mjs).
//   --pasta=<pasta>      (padrão: scripts/carga/kit-pessoa-exemplo, fictício)
//   --backup=<pasta>     onde fica o registro da carga (fora do git)
//
// Modos (sempre uma conexão e uma transação só):
//   (padrão)           ensaio: faz tudo e termina em ROLLBACK
//   --ida-e-volta      ensaio: aplica, roda o desfazer e confere que voltou ao início, ROLLBACK
//   --aplicar          faz tudo e termina em COMMIT; exige --plano-sha=<hex> e --md5=<hex> do ensaio
//   --com-migracao=<a.sql,b.sql>  só ensaio: roda as migrações dentro da transação desfeita antes da carga
//                      (enquanto não foram aplicadas); com isso o tipo do produto vira normal (o valor novo
//                      do enum não pode ser usado na transação que o cria)
//   --desfazer=<json>  desfaz com o registro da carga (ROLLBACK; com --aplicar, COMMIT)
//
// O que a carga faz: cria listas e opções que faltam (nunca altera a que existe),
// e cria cada kit INATIVO, sem capa, com tipo kit_pessoa, categoria Kit Festa,
// unidade "a pessoa", step livre e pedido_minimo = o MENOR tamanho. O kit nunca
// sobrescreve produto: nome que já existe é erro. O slug é do banco. Não mexe em
// nenhum produto que já existe (o md5 deles é conferido antes e depois).
// A migração de tipo e a de tabelas precisam estar aplicadas: sem o valor
// kit_pessoa no enum, o ensaio é parcial (usa o tipo normal só para provar o
// resto) e --aplicar recusa.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { MIGRACOES, conectar, limpar, raiz, rodarMigracao } from "../banco/lib.mjs";
import { ARQUIVOS, lerCsv, menorTamanho, montarPlano, relatorio } from "./kit-pessoa-lib.mjs";

const args = process.argv.slice(2);
const opcao = (nome) => {
  const a = args.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  return a === undefined ? undefined : a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const PASTA = typeof opcao("pasta") === "string" ? opcao("pasta") : path.join(raiz, "scripts", "carga", "kit-pessoa-exemplo");
const PASTA_REGISTRO = typeof opcao("backup") === "string" ? opcao("backup") : "C:\\Users\\Caina\\Downloads\\kit-pessoa-carga-backup";
const APLICAR = opcao("aplicar") === true;
const IDA_E_VOLTA = opcao("ida-e-volta") === true;
const DESFAZER = typeof opcao("desfazer") === "string" ? opcao("desfazer") : null;
const PLANO_SHA = typeof opcao("plano-sha") === "string" ? opcao("plano-sha").toLowerCase() : null;
const MD5_INFORMADO = typeof opcao("md5") === "string" ? opcao("md5").toLowerCase() : null;
if (opcao("desfazer") === true) throw new Error("Use --desfazer=<arquivo de registro>.");
if (APLICAR && MIGRACOES.length) throw new Error("--com-migracao é só ensaio: não combina com --aplicar (o commit aplicaria as migrações).");
if (APLICAR && IDA_E_VOLTA) throw new Error("--ida-e-volta é só ensaio: não combina com --aplicar.");
if (APLICAR && !DESFAZER && (!PLANO_SHA || !MD5_INFORMADO)) throw new Error("--aplicar exige --plano-sha=<hex> e --md5=<hex> (os do ensaio).");

const sha256 = (x) => createHash("sha256").update(x).digest("hex");
const titulo = (t) => console.log(`\n== ${t} ==`);
const SQL_MD5 = `select count(*)::int n, md5(string_agg(id::text || nome || "Categoria"::text || atualizado_em::text, '|' order by id)) h from public.produtos`;
const TABELAS = ["kit_listas", "kit_lista_itens", "kit_grupos", "kit_tamanhos", "kit_quantidades"];

async function contagens(db) {
  const saida = {};
  for (const t of TABELAS) saida[t] = (await db.query(`select count(*)::int n from public.${t}`)).rows[0].n;
  return saida;
}

async function abrir(db) {
  await db.query("begin");
  await db.query("set local lock_timeout = '2s'");
  await db.query("set local statement_timeout = '60s'");
}

function lerPasta(pasta) {
  const dados = {};
  const hashes = [];
  for (const [nome, cab] of Object.entries(ARQUIVOS)) {
    const bruto = fs.readFileSync(path.join(pasta, `${nome}.csv`));
    hashes.push(`${nome}:${sha256(bruto)}`);
    dados[nome] = lerCsv(bruto.toString("utf8"), cab, `${nome}.csv`);
  }
  return { dados, sha: sha256(hashes.join("\n")) };
}

async function aplicar(db, plano, modo) {
  titulo("Estado do banco");
  for (const t of TABELAS) {
    if (!(await db.query(`select to_regclass('public.${t}') r`)).rows[0].r) throw new Error(`Tabela ${t} não existe: aplique a migração kit-pessoa-schema.sql antes.`);
  }
  const enumOk = (await db.query(`select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'produto_tipo' and e.enumlabel = 'kit_pessoa'`)).rowCount === 1;
  // Valor de enum criado nesta mesma transação (--com-migracao) não pode ser usado (55P04).
  const enumNaTransacao = MIGRACOES.some((m) => m.includes("produto-tipo-kit-pessoa"));
  const tipo = enumOk && !enumNaTransacao ? "kit_pessoa" : "normal";
  console.log(`tipo kit_pessoa no enum: ${tipo === "kit_pessoa" ? "sim" : "NÃO (ensaio parcial: os produtos entram como normal; --aplicar recusa)"}`);
  if (tipo !== "kit_pessoa" && modo === "aplicar") throw new Error("O valor kit_pessoa não está no enum produto_tipo: aplique produto-tipo-kit-pessoa.sql antes.");
  const categoria = (await db.query(`select e.enumlabel l from pg_enum e join pg_type t on t.oid = e.enumtypid where t.typname = 'categoria_produto' and e.enumlabel in ('Kits','Kit Festa')`)).rows[0].l;
  console.log(`categoria do kit no banco: ${categoria}`);

  const inicio = (await db.query(SQL_MD5)).rows[0];
  const contInicio = await contagens(db);
  console.log(`produtos: ${inicio.n}; md5 do início: ${inicio.h}`);
  console.log(`tabelas do kit no início: ${JSON.stringify(contInicio)}`);

  const subs = (await db.query(`select id::text, slug, ativo from public.subcategorias where categoria = $1::public.categoria_produto`, [categoria])).rows;
  const existentes = (await db.query(`select id::text, nome, destaque from public.produtos`)).rows;
  const porNome = new Map(existentes.map((p) => [p.nome.toLowerCase(), p]));
  const listasBanco = (await db.query(`select l.id::text, l.nome, coalesce(json_agg(json_build_object('id', i.id::text, 'nome', i.nome, 'descricao', i.descricao, 'posicao', i.posicao) order by i.posicao) filter (where i.id is not null), '[]') itens
      from public.kit_listas l left join public.kit_lista_itens i on i.lista_id = l.id group by l.id`)).rows;

  const problemas = [];
  for (const p of plano.produtos) {
    if (porNome.has(p.nome.toLowerCase())) problemas.push(`produto "${p.nome}" já existe no banco (a carga nunca sobrescreve).`);
    const s = subs.find((x) => x.slug === p.subcategoria);
    if (!s) problemas.push(`subcategoria "${p.subcategoria}" não existe em ${categoria}.`);
    else if (!s.ativo) problemas.push(`subcategoria "${p.subcategoria}" está inativa.`);
    if (p.herdaDestaqueDe && !porNome.has(p.herdaDestaqueDe.toLowerCase())) problemas.push(`herda_destaque_de: "${p.herdaDestaqueDe}" não existe.`);
  }
  if (problemas.length) throw new Error(`Plano recusado:\n  ${problemas.join("\n  ")}`);

  const registro = { criadoEm: new Date().toISOString(), md5Inicio: inicio.h, contagensInicio: contInicio, listasCriadas: [], itensCriados: [], produtosCriados: [] };

  titulo("Listas");
  const idLista = new Map();
  const idItem = new Map();
  for (const l of plano.listas) {
    let existente = listasBanco.find((x) => x.nome.toLowerCase() === l.nome.toLowerCase());
    if (!existente) {
      const id = (await db.query(`insert into public.kit_listas (nome) values ($1) returning id::text`, [l.nome])).rows[0].id;
      registro.listasCriadas.push(id);
      existente = { id, nome: l.nome, itens: [] };
      console.log(`lista criada: ${l.nome}`);
    } else console.log(`lista já existe, reaproveitada: ${l.nome} (${existente.itens.length} opções)`);
    idLista.set(l.nome, existente.id);
    let proxima = existente.itens.reduce((m, i) => Math.max(m, i.posicao), 0) + 1;
    for (const item of l.itens) {
      const ja = existente.itens.find((i) => i.nome.toLowerCase() === item.nome.toLowerCase());
      if (ja) {
        idItem.set(`${l.nome}|${item.nome}`, ja.id);
        if ((ja.descricao ?? null) !== item.descricao) console.log(`  AVISO ${l.nome}/${item.nome}: a descrição do banco difere do CSV (não alterada).`);
        continue;
      }
      const id = (await db.query(`insert into public.kit_lista_itens (lista_id, nome, descricao, posicao) values ($1, $2, $3, $4) returning id::text`, [existente.id, item.nome, item.descricao, proxima])).rows[0].id;
      proxima += 1;
      registro.itensCriados.push(id);
      idItem.set(`${l.nome}|${item.nome}`, id);
      console.log(`  opção criada: ${l.nome}/${item.nome}`);
    }
  }

  titulo("Produtos");
  for (const p of plano.produtos) {
    const destaque = p.herdaDestaqueDe ? porNome.get(p.herdaDestaqueDe.toLowerCase()).destaque : p.destaque;
    const subId = subs.find((x) => x.slug === p.subcategoria).id;
    const { rows: [novo] } = await db.query(
      `insert into public.produtos (nome, descricao, preco, pedido_minimo, "Categoria", prazo_producao_dias, step_quantidade, destaque, ativo, tipo, unidade_venda, subcategoria_id)
       values ($1, $2, $3, $4, $5::public.categoria_produto, $6, 'livre', $7, false, $8::public.produto_tipo, 'a pessoa', $9) returning id::text, slug`,
      [p.nome, p.descricao || null, p.preco, menorTamanho(p), categoria, p.prazo, destaque, tipo, subId]
    );
    registro.produtosCriados.push({ id: novo.id, nome: p.nome, slug: novo.slug });
    console.log(`${p.nome}: slug ${novo.slug} (do banco), inativo, destaque ${destaque}${p.herdaDestaqueDe ? ` (herdado de "${p.herdaDestaqueDe}")` : ""}, pedido_minimo ${menorTamanho(p)}`);
    const idGrupo = new Map();
    for (const g of p.grupos) {
      const id = (await db.query(
        `insert into public.kit_grupos (produto_id, chave, rotulo, modo, lista_id, passo, posicao) values ($1,$2,$3,$4,$5,$6,$7) returning id::text`,
        [novo.id, g.chave, g.rotulo, g.modo, g.lista ? idLista.get(g.lista) : null, g.passo, g.posicao]
      )).rows[0].id;
      idGrupo.set(g.chave, { id, lista: g.lista });
    }
    for (const t of p.tamanhos) {
      await db.query(`insert into public.kit_tamanhos (produto_id, pessoas, bolo_kg, descartaveis) values ($1,$2,$3,$4)`, [novo.id, t.pessoas, t.boloKg, t.descartaveis]);
    }
    for (const q of p.quantidades) {
      const g = idGrupo.get(q.grupo);
      const opcao = q.opcao ? idItem.get(`${g.lista}|${q.opcao}`) : null;
      await db.query(
        `insert into public.kit_quantidades (produto_id, pessoas, grupo_id, lista_id, opcao_id, total, max_sabores, rotulo) values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [novo.id, q.pessoas, g.id, opcao ? idLista.get(g.lista) : null, opcao, q.total, q.maxSabores, q.rotulo]
      );
    }
  }

  titulo("Provas internas (antes do commit)");
  const provas = [];
  const prova = (nome, ok, det) => { provas.push(ok); console.log(`${ok ? "OK  " : "FALHA"} ${nome}${det ? ` (${det})` : ""}`); };
  const fim = await contagens(db);
  const esperado = {
    kit_listas: contInicio.kit_listas + registro.listasCriadas.length,
    kit_lista_itens: contInicio.kit_lista_itens + registro.itensCriados.length,
    kit_grupos: contInicio.kit_grupos + plano.produtos.reduce((s, p) => s + p.grupos.length, 0),
    kit_tamanhos: contInicio.kit_tamanhos + plano.produtos.reduce((s, p) => s + p.tamanhos.length, 0),
    kit_quantidades: contInicio.kit_quantidades + plano.produtos.reduce((s, p) => s + p.quantidades.length, 0),
  };
  prova("contagem de cada tabela do kit = início + plano", JSON.stringify(fim) === JSON.stringify(esperado), JSON.stringify(fim));
  const novos = registro.produtosCriados.map((p) => p.id);
  const { rows: [n] } = await db.query(`select count(*)::int n, count(*) filter (where ativo)::int ativos from public.produtos where id = any($1::uuid[])`, [novos]);
  prova("todos os kits novos existem e nenhum está ativo", n.n === plano.produtos.length && n.ativos === 0);
  const exist = (await db.query(`select count(*)::int n, md5(string_agg(id::text || nome || "Categoria"::text || atualizado_em::text, '|' order by id)) h from public.produtos where id <> all($1::uuid[])`, [novos])).rows[0];
  prova("md5 dos produtos que já existiam = o do início", exist.h === inicio.h && exist.n === inicio.n, exist.h);
  if (provas.includes(false)) throw new Error("Prova interna falhou.");
  return { registro, inicio, contInicio, tipo };
}

// Desfaz com o registro. Assume transação aberta. Nunca apaga kit ativo.
async function desfazer(db, registro) {
  const ids = registro.produtosCriados.map((p) => p.id);
  const { rows: ativos } = await db.query(`select nome from public.produtos where id = any($1::uuid[]) and ativo`, [ids]);
  if (ativos.length) throw new Error(`Kit ativo não é desfeito pela carga: ${ativos.map((a) => a.nome).join(", ")}. Desative antes.`);
  const apagados = (await db.query(`delete from public.produtos where id = any($1::uuid[])`, [ids])).rowCount;
  const itens = (await db.query(`delete from public.kit_lista_itens where id = any($1::uuid[])`, [registro.itensCriados])).rowCount;
  const listas = (await db.query(`delete from public.kit_listas l where l.id = any($1::uuid[]) and not exists (select 1 from public.kit_lista_itens i where i.lista_id = l.id)`, [registro.listasCriadas])).rowCount;
  console.log(`desfeito: ${apagados} produtos (a composição sai em cascata), ${itens} opções, ${listas} listas`);
  const md5 = (await db.query(SQL_MD5)).rows[0].h;
  const cont = await contagens(db);
  console.log(`md5 dos produtos depois: ${md5}; tabelas do kit: ${JSON.stringify(cont)}`);
  return { md5, cont, apagados };
}

async function main() {
  const modo = DESFAZER ? "desfazer" : IDA_E_VOLTA ? "ida-e-volta" : APLICAR ? "aplicar" : "ensaio";
  const commit = APLICAR;
  console.log(`modo: ${modo}; termina em ${commit ? "COMMIT" : "ROLLBACK"}`);
  let plano = null;
  let shaPlano = null;
  if (modo !== "desfazer") {
    const { dados, sha } = lerPasta(PASTA);
    const r = montarPlano(dados);
    plano = r.plano;
    titulo("Relatório da carga");
    console.log(relatorio({ plano, avisos: r.avisos }));
    if (r.erros.length) {
      console.error(`\nERRO: ${r.erros.length} problema(s) nos CSV, nada foi feito:\n  ${r.erros.join("\n  ")}`);
      process.exit(1);
    }
    shaPlano = sha256(`${sha}\n${JSON.stringify(plano)}`);
    console.log(`sha256 do plano (arquivos e plano): ${shaPlano}`);
    if (PLANO_SHA && shaPlano !== PLANO_SHA) { console.error(`ERRO: sha256 do plano difere do informado (${PLANO_SHA}); nada foi gravado.`); process.exit(1); }
  }

  const db = await conectar({ nome: "carga-kit-pessoa" });
  let ok = false;
  try {
    await abrir(db);
    for (const m of MIGRACOES) await rodarMigracao(db, m);
    if (modo === "desfazer") {
      const bruto = fs.readFileSync(DESFAZER);
      console.log(`registro lido: ${DESFAZER}\n  sha256: ${sha256(bruto)}`);
      const registro = JSON.parse(bruto.toString("utf8"));
      const d = await desfazer(db, registro);
      console.log(`${d.md5 === registro.md5Inicio ? "OK  " : "FALHA"} md5 dos produtos = o de antes da carga`);
      if (d.md5 !== registro.md5Inicio || JSON.stringify(d.cont) !== JSON.stringify(registro.contagensInicio)) throw new Error("O desfazer não voltou ao estado de antes da carga.");
    } else {
      const r = await aplicar(db, plano, modo);
      if (MD5_INFORMADO && r.inicio.h !== MD5_INFORMADO) throw new Error(`md5 do início (${r.inicio.h}) difere do informado (${MD5_INFORMADO}): nada foi gravado.`);
      if (modo === "aplicar") {
        fs.mkdirSync(PASTA_REGISTRO, { recursive: true });
        const arquivo = path.join(PASTA_REGISTRO, `registro-${r.registro.criadoEm.replace(/[:.]/g, "-")}.json`);
        fs.writeFileSync(arquivo, JSON.stringify({ ...r.registro, shaPlano }, null, 2));
        console.log(`registro da carga gravado: ${arquivo} (para --desfazer)`);
      }
      if (modo === "ida-e-volta") {
        titulo("Desfazer (dentro da mesma transação)");
        const d = await desfazer(db, r.registro);
        const certo = d.md5 === r.inicio.h && JSON.stringify(d.cont) === JSON.stringify(r.contInicio);
        console.log(`${certo ? "OK  " : "FALHA"} ida e volta: md5 e contagens iguais às do início`);
        if (!certo) throw new Error("Ida e volta falhou.");
      }
    }
    await db.query(commit ? "commit" : "rollback");
    ok = true;
    console.log(`\n${commit ? "COMMIT feito" : "ROLLBACK feito: nada foi gravado"}.`);
  } catch (erro) {
    await db.query("rollback").catch(() => {});
    console.error(`\nERRO (rollback feito, nada gravado): ${limpar(erro.message)}`);
    if (/lock timeout|canceling statement due to lock/i.test(erro.message)) console.error("Lock estourou. Não tente de novo sozinho; relate.");
  } finally {
    await db.end().catch(() => {});
  }
  process.exit(ok ? 0 : 1);
}

main();
