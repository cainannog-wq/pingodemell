// Carga em lote dos vínculos produto -> subcategoria (13/10/2026, PR 4).
// GRAVA EM PRODUÇÃO só com --aplicar (ou --desfazer --aplicar): não é teste.
//
// Modos (sempre uma conexão e uma transação só):
//   (padrão)           ensaio: faz tudo e termina em ROLLBACK
//   --ida-e-volta      ensaio: aplica a carga, roda o desfazer e confere, ROLLBACK
//   --aplicar          faz tudo e termina em COMMIT
//   --desfazer=<json>  desfaz com o backup (ROLLBACK; com --aplicar, COMMIT)
// Opções: --csv=<arquivo>, --backup=<pasta fora do git>
//
// Ordem dentro da transação: lock_timeout de 2 s; desliga o gatilho
// produtos_set_atualizado_em (já toma o lock que barra escritas); SÓ DEPOIS
// lê o estado e gera o backup; UPDATE; provas; religa o gatilho; confere os
// quatro gatilhos; commit ou rollback. Nunca lista "Categoria" no SET (o
// gatilho produtos_limpa_subcategoria dispara nisso). Nunca sobrescreve
// vínculo existente. Produto e subcategoria casam por nome exato e por SLUG.

import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { conectar, limpar, raiz } from "../banco/lib.mjs";

const PASTA_BACKUP = "C:\\Users\\Caina\\Downloads\\subcategorias-carga-2026-10-13-backup";
const CSV_PADRAO = path.join(raiz, "scripts", "carga", "subcategorias-carga-2026-10-13.csv");
const GATILHOS = ["produtos_limpa_subcategoria", "produtos_set_atualizado_em", "produtos_slug_imutavel", "produtos_slug_no_cadastro"];
const MD5_ESPERADO = "fc2e070d4bbd6279f4ffbc3938101130";
const TOTAL_PRODUTOS = 218;
const TOTAL_SUBCATEGORIAS = 21;
// Mesma fórmula de scripts/banco/subcategorias.mjs:64.
const SQL_MD5 = `select count(*)::int n, md5(string_agg(id::text || nome || "Categoria"::text || atualizado_em::text, '|' order by id)) h from public.produtos`;

// Conversão fixa: categoria e nome do CSV -> slug (21 linhas).
const CONVERSAO = [
  ["Bolos", "Tradicional", "tradicional"],
  ["Bolos", "Caseirinhos", "caseirinhos"],
  ["Bolos", "Decorados", "decorados"],
  ["Bolos", "Smash Cake", "smash-cake"],
  ["Doces", "Tradicionais", "tradicionais"],
  ["Doces", "Gourmet", "gourmet"],
  ["Doces", "Gourmet Premium", "gourmet-premium"],
  ["Doces", "Finos", "finos"],
  ["Doces", "Personalizados", "personalizados"],
  ["Doces", "Personalizados Combo", "personalizados-combo"],
  ["Doces", "Donuts", "donuts"],
  ["Salgados", "Fritos", "fritos"],
  ["Salgados", "Assados", "assados"],
  ["Salgados", "Finos e Assados", "finos-e-assados"],
  ["Salgados", "Congelados", "congelados"],
  ["Kit Festa", "Básico", "basico"],
  ["Kit Festa", "Clássico", "classico"],
  ["Kit Festa", "Premium", "premium"],
  ["Kit Festa", "Escolar", "escolar"],
  ["Kit Festa", "Mini Wedding", "mini-wedding"],
  ["Kit Festa", "Outros", "outros"],
];
const CATEGORIAS_COM_SUB = ["Bolos", "Doces", "Salgados", "Kit Festa"];

const args = process.argv.slice(2);
const opcao = (nome) => {
  const a = args.find((x) => x === `--${nome}` || x.startsWith(`--${nome}=`));
  return a === undefined ? undefined : a.includes("=") ? a.slice(a.indexOf("=") + 1) : true;
};
const APLICAR = opcao("aplicar") === true;
const IDA_E_VOLTA = opcao("ida-e-volta") === true;
const DESFAZER = typeof opcao("desfazer") === "string" ? opcao("desfazer") : null;
const CSV = typeof opcao("csv") === "string" ? opcao("csv") : CSV_PADRAO;
const PASTA = typeof opcao("backup") === "string" ? opcao("backup") : PASTA_BACKUP;
if (APLICAR && IDA_E_VOLTA) throw new Error("--ida-e-volta é só ensaio: não combina com --aplicar.");
if (opcao("desfazer") === true) throw new Error("Use --desfazer=<arquivo de backup>.");

const sha256 = (x) => createHash("sha256").update(x).digest("hex");
const titulo = (t) => console.log(`\n== ${t} ==`);

function lerCsv(arquivo) {
  const texto = fs.readFileSync(arquivo, "utf8").replace(/^\uFEFF/, "");
  const linhas = texto.split(/\r?\n/).filter((l) => l !== "");
  const cab = linhas.shift();
  if (cab !== "categoria,produto,subcategoria,categoria_no_banco,ativo") throw new Error(`Cabeçalho inesperado: ${cab}`);
  return linhas.map((l, i) => {
    if (l.includes('"')) throw new Error(`Linha ${i + 2}: aspas não suportadas.`);
    const c = l.split(",");
    if (c.length !== 5) throw new Error(`Linha ${i + 2}: ${c.length} colunas.`);
    // categoria_no_banco (c[3]) é ignorada de propósito.
    return { categoria: c[0], produto: c[1], subcategoria: c[2], ativo: c[4] === "sim" };
  });
}

async function gatilhos(db) {
  return (await db.query(`select tgname, tgenabled::text e from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal order by 1`)).rows;
}
function conferirGatilhos(lista, rotulo, desligado = null) {
  const mapa = Object.fromEntries(lista.map((g) => [g.tgname, g.e]));
  const ruins = GATILHOS.filter((n) => mapa[n] !== (n === desligado ? "D" : "O"));
  console.log(`gatilhos ${rotulo}: ` + GATILHOS.map((n) => `${n}=${mapa[n] ?? "ausente"}`).join(", "));
  if (ruins.length || lista.length !== GATILHOS.length) throw new Error(`Gatilhos fora do esperado (${rotulo}): ${ruins.join(", ") || "quantidade diferente de 4"}.`);
}

async function lerProdutos(db) {
  return (await db.query(
    `select id::text, nome, "Categoria"::text categoria, subcategoria_id::text, atualizado_em::text, ativo from public.produtos order by id`
  )).rows;
}

async function desligar(db) { await db.query("alter table public.produtos disable trigger produtos_set_atualizado_em"); }
async function religar(db) { await db.query("alter table public.produtos enable trigger produtos_set_atualizado_em"); }

async function abrir(db) {
  await db.query("begin");
  await db.query("set local lock_timeout = '2s'");
  await db.query("set local statement_timeout = '60s'");
}

// Permissão e lock do ALTER TABLE (relato exigido antes de gravar).
async function relatarPermissaoELock(db) {
  const { rows: [p] } = await db.query(
    `select current_user u, pg_get_userbyid(c.relowner) dono, pg_has_role(current_user, c.relowner, 'USAGE') pode_alterar
       from pg_class c where c.oid = 'public.produtos'::regclass`
  );
  console.log(`permissão: usuário ${p.u}, dono da tabela ${p.dono}, herda o papel do dono (necessário para ALTER TABLE): ${p.pode_alterar}`);
  const { rows: locks } = await db.query(
    `select mode from pg_locks where relation = 'public.produtos'::regclass and pid = pg_backend_pid() and granted order by 1`
  );
  console.log(`lock tomado pelo alter table disable trigger (pg_locks, esta sessão): ${locks.map((l) => l.mode).join(", ")}`);
  if (!p.pode_alterar) throw new Error("Sem permissão para alterar produtos.");
}

function montarPlano(csv, produtos, subs) {
  const porSlug = new Map(subs.map((s) => [s.slug, s]));
  const porNome = new Map(produtos.map((p) => [p.nome, p]));
  const conv = new Map(CONVERSAO.map(([c, n, slug]) => [`${c}|${n}`, slug]));
  const gravar = [], ignorados = [], recusas = [], divergenciasAtivo = [];
  for (const l of csv) {
    const p = porNome.get(l.produto);
    if (!p) { recusas.push({ produto: l.produto, motivo: "produto não existe no banco" }); continue; }
    if (p.categoria !== l.categoria) { recusas.push({ produto: l.produto, motivo: `categoria do CSV (${l.categoria}) difere da do banco (${p.categoria})` }); continue; }
    const slug = conv.get(`${l.categoria}|${l.subcategoria}`);
    if (!slug) { recusas.push({ produto: l.produto, motivo: `subcategoria "${l.subcategoria}" fora da tabela de conversão` }); continue; }
    const s = porSlug.get(slug);
    if (!s) { recusas.push({ produto: l.produto, motivo: `slug ${slug} não existe no banco` }); continue; }
    if (!s.ativo) { recusas.push({ produto: l.produto, motivo: `subcategoria ${slug} inativa` }); continue; }
    if (s.categoria !== p.categoria) { recusas.push({ produto: l.produto, motivo: `subcategoria ${slug} é de ${s.categoria}, produto é de ${p.categoria}` }); continue; }
    if (p.ativo !== l.ativo) divergenciasAtivo.push({ produto: l.produto, csv: l.ativo, banco: p.ativo });
    if (p.subcategoria_id) { ignorados.push({ produto: l.produto, motivo: "já tem vínculo" }); continue; }
    gravar.push({ nome: l.produto, categoria: p.categoria, slug, subcategoria_id: s.id });
  }
  return { gravar, ignorados, recusas, divergenciasAtivo };
}

function contagem(lista, chave) {
  const m = new Map();
  for (const x of lista) m.set(chave(x), (m.get(chave(x)) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1));
}

function gravarBackup(estado, plano, md5Inicio, modo) {
  fs.mkdirSync(PASTA, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const arquivo = path.join(PASTA, `backup-${modo}-${stamp}.json`);
  const conteudo = JSON.stringify({
    geradoEm: new Date().toISOString(), md5Inicio,
    produtos: estado.map((p) => ({ id: p.id, nome: p.nome, Categoria: p.categoria, subcategoria_id: p.subcategoria_id, atualizado_em: p.atualizado_em })),
    plano: plano.map((x) => ({ nome: x.nome, slug: x.slug, subcategoria_id: x.subcategoria_id })),
  }, null, 1);
  fs.writeFileSync(arquivo, conteudo);
  const relido = fs.readFileSync(arquivo);
  const reg = JSON.parse(relido.toString("utf8"));
  if (reg.produtos.length !== TOTAL_PRODUTOS || reg.produtos.length !== estado.length) throw new Error("Backup relido não tem os 218 registros.");
  if (sha256(relido) !== sha256(conteudo)) throw new Error("sha256 do backup relido difere do gravado.");
  console.log(`backup: ${arquivo}\n  registros: ${reg.produtos.length}, plano: ${reg.plano.length}\n  sha256: ${sha256(relido)}`);
  return arquivo;
}

// Aplica o plano; devolve o resumo. Assume transação aberta.
async function aplicarPlano(db, csv, { gravarArquivo, modo }) {
  await desligar(db);
  console.log("gatilho produtos_set_atualizado_em desligado (dentro da transação)");
  await relatarPermissaoELock(db);
  // Só depois do lock: estado, backup e plano veem exatamente o que a carga vê.
  const estado = await lerProdutos(db);
  const { rows: subs } = await db.query(`select id::text, categoria::text, nome, slug, ordem, ativo from public.subcategorias order by categoria, ordem`);
  const { n, h: md5Inicio } = (await db.query(SQL_MD5)).rows[0];
  const gat0 = await gatilhos(db);
  titulo("Estado no início (depois do lock)");
  console.log(`produtos: ${n} (esperado ${TOTAL_PRODUTOS}); com vínculo: ${estado.filter((p) => p.subcategoria_id).length}`);
  console.log(`subcategorias: ${subs.length} (esperado ${TOTAL_SUBCATEGORIAS}), todas ativas: ${subs.every((s) => s.ativo)}; por categoria: ${contagem(subs, (s) => s.categoria).map(([c, k]) => `${c} ${k}`).join(", ")}`);
  console.log(`md5 do início: ${md5Inicio} — ${md5Inicio === MD5_ESPERADO ? "BATE com" : "NÃO BATE com"} ${MD5_ESPERADO}`);
  conferirGatilhos(gat0, "no início (o de data desligado por esta transação)", "produtos_set_atualizado_em");
  const estadoOk = n === TOTAL_PRODUTOS && subs.length === TOTAL_SUBCATEGORIAS && subs.every((s) => s.ativo) && md5Inicio === MD5_ESPERADO;
  if (!estadoOk && modo !== "ensaio" && modo !== "ida-e-volta") throw new Error("Estado do banco diferente do esperado: nada foi gravado.");

  titulo("Tabela de conversão (21 linhas)");
  for (const [c, nome, slug] of CONVERSAO) {
    const s = subs.find((x) => x.slug === slug);
    console.log(`${c.padEnd(10)} | ${nome.padEnd(20)} | ${slug.padEnd(20)} | ${s ? s.id : "NÃO EXISTE"}${s && s.nome !== nome ? ` (nome atual no banco: ${s.nome})` : ""}`);
  }

  const plano = montarPlano(csv, estado, subs);
  titulo("Plano");
  console.log(`vínculos a gravar: ${plano.gravar.length} | ignorados (já têm vínculo): ${plano.ignorados.length} | recusas: ${plano.recusas.length}`);
  for (const r of plano.recusas) console.log(`  RECUSA ${r.produto}: ${r.motivo}`);
  for (const r of plano.ignorados) console.log(`  IGNORADO ${r.produto}: ${r.motivo}`);
  console.log("por subcategoria:");
  for (const [k, v] of contagem(plano.gravar, (x) => `${x.categoria} | ${x.slug}`)) console.log(`  ${k}: ${v}`);
  console.log(`divergências informativas de ativo (CSV x banco): ${plano.divergenciasAtivo.length}`);
  for (const d of plano.divergenciasAtivo) console.log(`  ${d.produto}: CSV ${d.csv ? "sim" : "não"}, banco ${d.banco ? "sim" : "não"}`);
  const shaPlano = sha256([...plano.gravar].map((x) => `${x.nome}\t${x.slug}`).sort().join("\n"));
  console.log(`sha256 do plano (nome e slug, ordenado): ${shaPlano}`);

  titulo("Os 23 fora do CSV");
  const nomesCsv = new Set(csv.map((l) => l.produto));
  const fora = estado.filter((p) => !nomesCsv.has(p.nome));
  for (const p of fora) console.log(`  ${p.categoria.padEnd(10)} | ${p.nome} | ${p.ativo ? "ativo" : "inativo"}`);
  console.log(`total fora: ${fora.length}; por categoria: ${contagem(fora, (p) => p.categoria).map(([c, k]) => `${c} ${k}`).join(", ")}`);
  const semLinha = fora.filter((p) => CATEGORIAS_COM_SUB.includes(p.categoria));
  console.log(`produtos de Bolos, Doces, Salgados ou Kit Festa sem linha no CSV: ${semLinha.length}${semLinha.length ? " -> " + semLinha.map((p) => p.nome).join("; ") : ""}`);
  if (semLinha.length && modo !== "ensaio" && modo !== "ida-e-volta") throw new Error("Há produto das 4 categorias sem linha no CSV.");

  const arquivoBackup = gravarArquivo ? gravarBackup(estado, plano.gravar, md5Inicio, modo) : null;

  titulo("UPDATE");
  let gravados = 0;
  for (const x of plano.gravar) {
    const r = await db.query(
      `update public.produtos set subcategoria_id = $1 where nome = $2 and subcategoria_id is null and "Categoria" = $3::public.categoria_produto`,
      [x.subcategoria_id, x.nome, x.categoria]
    );
    if (r.rowCount !== 1) throw new Error(`UPDATE de "${x.nome}" afetou ${r.rowCount} linhas (esperado 1).`);
    gravados += 1;
  }
  console.log(`linhas atualizadas: ${gravados}`);

  titulo("Provas internas (antes do commit)");
  const depois = await lerProdutos(db);
  const comVinculo = depois.filter((p) => p.subcategoria_id).length;
  const ja = estado.filter((p) => p.subcategoria_id).length;
  const provas = [];
  const prova = (nome, ok, det) => { provas.push(ok); console.log(`${ok ? "OK  " : "FALHA"} ${nome}${det ? ` — ${det}` : ""}`); };
  prova("vínculos gravados = plano", comVinculo - ja === plano.gravar.length, `${comVinculo - ja} de ${plano.gravar.length}`);
  const mudouData = depois.filter((p, i) => p.atualizado_em !== estado[i].atualizado_em || p.id !== estado[i].id);
  prova("atualizado_em dos 218 igual ao do início/backup", depois.length === TOTAL_PRODUTOS && mudouData.length === 0, `${mudouData.length} diferentes`);
  const contBanco = contagem(depois.filter((p) => p.subcategoria_id), (p) => p.subcategoria_id);
  const contPlano = contagem(plano.gravar, (x) => x.subcategoria_id);
  prova("contagem por subcategoria no banco = plano (partindo de 0 vínculos)", ja !== 0 || JSON.stringify(contBanco) === JSON.stringify(contPlano));
  prova("Adicionais e Bento Cake sem vínculo", depois.filter((p) => ["Adicionais", "Bento Cake"].includes(p.categoria) && p.subcategoria_id).length === 0);
  await religar(db);
  console.log("gatilho produtos_set_atualizado_em religado");
  const gat1 = await gatilhos(db);
  conferirGatilhos(gat1, "no fim");
  const { h: md5Fim } = (await db.query(SQL_MD5)).rows[0];
  console.log(`md5 do fim: ${md5Fim}`);
  prova("md5 do fim = md5 do início", md5Fim === md5Inicio);
  if (provas.includes(false)) throw new Error("Prova interna falhou.");
  return { estado, plano, md5Inicio, md5Fim, shaPlano, arquivoBackup };
}

// Desfaz com o plano e o backup (objeto). Assume transação aberta.
async function desfazerComBackup(db, backup) {
  await desligar(db);
  console.log("gatilho produtos_set_atualizado_em desligado (dentro da transação)");
  const { n, h: md5Inicio } = (await db.query(SQL_MD5)).rows[0];
  console.log(`produtos: ${n}; md5 do início do desfazer: ${md5Inicio}`);
  const nulosNoBackup = new Set(backup.produtos.filter((p) => !p.subcategoria_id).map((p) => p.nome));
  let zerados = 0; const naoTocados = [];
  for (const x of backup.plano) {
    if (!nulosNoBackup.has(x.nome)) { naoTocados.push(`${x.nome}: o backup já tinha vínculo`); continue; }
    const r = await db.query(
      `update public.produtos set subcategoria_id = null where nome = $1 and subcategoria_id = $2`,
      [x.nome, x.subcategoria_id]
    );
    if (r.rowCount === 1) zerados += 1;
    else naoTocados.push(`${x.nome}: valor atual difere do que a carga gravou`);
  }
  console.log(`vínculos zerados: ${zerados}; não tocados: ${naoTocados.length}`);
  for (const l of naoTocados) console.log(`  NÃO TOCADO ${l}`);
  await religar(db);
  conferirGatilhos(await gatilhos(db), "depois do desfazer");
  const { h: md5Fim } = (await db.query(SQL_MD5)).rows[0];
  console.log(`md5 do fim do desfazer: ${md5Fim}`);
  const atual = await lerProdutos(db);
  const dif = atual.filter((p) => { const b = backup.produtos.find((x) => x.id === p.id); return !b || b.atualizado_em !== p.atualizado_em; });
  console.log(`atualizado_em diferente do backup: ${dif.length}`);
  return { zerados, naoTocados, md5Fim, restantes: atual.filter((p) => p.subcategoria_id).length, difData: dif.length };
}

async function main() {
  const db = await conectar({ nome: "carga-subcategorias" });
  let modo = DESFAZER ? "desfazer" : IDA_E_VOLTA ? "ida-e-volta" : APLICAR ? "aplicar" : "ensaio";
  const commit = APLICAR && (modo === "aplicar" || modo === "desfazer");
  console.log(`modo: ${modo} — termina em ${commit ? "COMMIT" : "ROLLBACK"}`);
  let ok = false;
  try {
    await abrir(db);
    if (modo === "desfazer") {
      const bruto = fs.readFileSync(DESFAZER);
      console.log(`backup lido: ${DESFAZER}\n  sha256: ${sha256(bruto)}`);
      const r = await desfazerComBackup(db, JSON.parse(bruto.toString("utf8")));
      titulo("Resumo do desfazer");
      console.log(JSON.stringify({ zerados: r.zerados, naoTocados: r.naoTocados.length, vinculosRestantes: r.restantes, md5Fim: r.md5Fim, atualizadoEmDiferente: r.difData }));
    } else {
      const csv = lerCsv(CSV);
      console.log(`CSV: ${csv.length} linhas de dados, sha256 ${sha256(fs.readFileSync(CSV))}`);
      const r = await aplicarPlano(db, csv, { gravarArquivo: true, modo });
      if (modo === "ida-e-volta") {
        titulo("Desfazer (dentro da mesma transação)");
        const backup = JSON.parse(fs.readFileSync(r.arquivoBackup, "utf8"));
        const d = await desfazerComBackup(db, backup);
        const certo = d.restantes === 0 && d.md5Fim === r.md5Inicio && d.naoTocados.length === 0 && d.zerados === r.plano.gravar.length && d.difData === 0;
        console.log(`${certo ? "OK  " : "FALHA"} ida e volta: vínculos 0 (${d.restantes}), md5 igual ao do início (${d.md5Fim === r.md5Inicio}), zerados ${d.zerados} de ${r.plano.gravar.length}`);
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
