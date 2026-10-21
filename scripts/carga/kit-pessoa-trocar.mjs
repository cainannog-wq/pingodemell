// Troca dos kits: ativa os 3 Kit Festa por pessoa e desativa os 31 kits antigos por
// tamanho, num passo só (uma conexão, uma transação). GRAVA EM PRODUÇÃO só com
// --aplicar: não é teste.
//
//   (padrão)    ensaio: faz tudo e termina em ROLLBACK
//   --aplicar   COMMIT; exige --md5=<hex> do ensaio e que a produção já tenha a tela do kit
//   --desfazer  (com --aplicar) volta ao estado de antes: desativa os 3 e reativa os 31
//   --sem-guarda-de-deploy  só para o ensaio
//
// Guarda de deploy: a rota /previa/{slug} só existe no código novo. Se a produção
// responde 404 nela, o código com a tela do kit NÃO está no ar, e ativar um produto
// do tipo kit_pessoa faria o site antigo vendê-lo como avulso, sem composição. O
// --aplicar recusa nesse caso.
//
// Preserva `atualizado_em` dos 31 antigos (gatilho produtos_set_atualizado_em desligado
// dentro da transação). Os 3 novos mantêm o `atualizado_em` da carga (os mais novos
// de todos, então o Básico, que é destaque, abre "Os mais pedidos"). Os outros
// produtos não são tocados (o md5 deles é conferido antes e depois).

import { createHash } from "node:crypto";
import { conectar, limpar } from "../banco/lib.mjs";

const args = process.argv.slice(2);
const tem = (n) => args.includes(`--${n}`);
const valor = (n) => args.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3) ?? null;
const APLICAR = tem("aplicar");
const DESFAZER = tem("desfazer");
const MD5 = valor("md5")?.toLowerCase() ?? null;
const SITE = process.env.SITE_PRODUCAO ?? "https://pingodemell.netlify.app";
const NOVOS = ["kit-festa-basico", "kit-festa-classico", "kit-festa-premium"];
const ANTIGOS = "^Kit Festa (Básico|Clássico|Premium) [0-9]+ pessoas$";
const GATILHOS = ["produtos_limpa_subcategoria", "produtos_set_atualizado_em", "produtos_slug_imutavel", "produtos_slug_no_cadastro"];
const SQL_MD5 = `select count(*)::int n, md5(string_agg(id::text || nome || "Categoria"::text || atualizado_em::text || ativo::text, '|' order by id)) h from public.produtos where not (slug = any($1::text[]) or nome ~ $2)`;

async function guardaDeDeploy() {
  const r = await fetch(`${SITE}/previa/kit-festa-basico`, { redirect: "manual" });
  return r.status === 307 || r.status === 308 || r.status === 200;
}

async function gatilhos(db) {
  return Object.fromEntries((await db.query(`select tgname, tgenabled::text e from pg_trigger where tgrelid = 'public.produtos'::regclass and not tgisinternal`)).rows.map((g) => [g.tgname, g.e]));
}

async function main() {
  if (APLICAR && !DESFAZER && !MD5) throw new Error("--aplicar exige --md5=<hex> (o do ensaio).");
  console.log(`modo: ${DESFAZER ? "desfazer" : "trocar"}; termina em ${APLICAR ? "COMMIT" : "ROLLBACK"}`);
  if (APLICAR && !DESFAZER && !tem("sem-guarda-de-deploy")) {
    const ok = await guardaDeDeploy();
    console.log(`guarda de deploy (${SITE}/previa/...): ${ok ? "a rota existe, o código do kit está no ar" : "404: o código do kit NÃO está no ar"}`);
    if (!ok) throw new Error("A produção ainda não tem a tela do kit (rota /previa ausente): ativar agora faria o site antigo vender o kit como avulso. Mergeie e publique os PRs primeiro.");
  }
  const db = await conectar({ nome: "trocar-kits" });
  let ok = false;
  try {
    await db.query("begin");
    await db.query("set local lock_timeout = '2s'");
    await db.query("set local statement_timeout = '60s'");
    await db.query("alter table public.produtos disable trigger produtos_set_atualizado_em");

    const antes = (await db.query(SQL_MD5, [NOVOS, ANTIGOS])).rows[0];
    console.log(`outros produtos: ${antes.n}; md5 (com ativo) do início: ${antes.h}`);
    if (MD5 && !DESFAZER && antes.h !== MD5) throw new Error(`md5 do início (${antes.h}) difere do informado (${MD5}): nada foi gravado.`);

    const novos = (await db.query(`select slug, nome, ativo, tipo::text, destaque from public.produtos where slug = any($1::text[]) order by slug`, [NOVOS])).rows;
    const antigos = (await db.query(`select id::text, nome, ativo from public.produtos where nome ~ $1 order by nome`, [ANTIGOS])).rows;
    console.log(`novos: ${novos.map((n) => `${n.slug}(${n.ativo ? "ativo" : "inativo"}, ${n.tipo})`).join(", ")}`);
    const ativosAntigos = antigos.filter((a) => a.ativo);
    console.log(`antigos: ${antigos.length} no total, ${ativosAntigos.length} ativos`);
    if (novos.length !== 3 || novos.some((n) => n.tipo !== "kit_pessoa")) throw new Error("Os 3 kits novos (tipo kit_pessoa) não estão todos no banco.");

    const alvoNovos = DESFAZER ? false : true;
    const alvoAntigos = DESFAZER ? true : false;
    if (!DESFAZER && ativosAntigos.length !== 31) throw new Error(`Esperava 31 kits antigos ativos, achei ${ativosAntigos.length}.`);
    if (!DESFAZER) {
      const { rows: [c] } = await db.query(`select count(*)::int n from public.kit_tamanhos t join public.produtos p on p.id = t.produto_id where p.slug = any($1::text[])`, [NOVOS]);
      if (c.n !== 31) throw new Error(`Esperava 31 tamanhos nos 3 kits novos, achei ${c.n}.`);
      const { rows: semCapa } = await db.query(`select slug from public.produtos where slug = any($1::text[]) and image_url is null`, [NOVOS]);
      if (semCapa.length) console.log(`AVISO: sem capa (o card usa o desenho da marca): ${semCapa.map((s) => s.slug).join(", ")}`);
    }

    const r1 = await db.query(`update public.produtos set ativo = $2 where slug = any($1::text[]) and ativo <> $2`, [NOVOS, alvoNovos]);
    const r2 = await db.query(`update public.produtos set ativo = $2 where nome ~ $1 and not (slug = any($3::text[])) and ativo <> $2`, [ANTIGOS, alvoAntigos, NOVOS]);
    console.log(`ativo mudou em: ${r1.rowCount} novos e ${r2.rowCount} antigos`);

    await db.query("alter table public.produtos enable trigger produtos_set_atualizado_em");
    const g = await gatilhos(db);
    console.log(`gatilhos: ${GATILHOS.map((n) => `${n}=${g[n] ?? "ausente"}`).join(", ")}`);
    if (GATILHOS.some((n) => g[n] !== "O")) throw new Error("Gatilho fora do esperado.");

    const depois = (await db.query(SQL_MD5, [NOVOS, ANTIGOS])).rows[0];
    const provas = [];
    const prova = (nome, cond, det) => { provas.push(cond); console.log(`${cond ? "OK  " : "FALHA"} ${nome}${det ? ` (${det})` : ""}`); };
    prova("os outros produtos ficaram idênticos (inclusive ativo e atualizado_em)", depois.h === antes.h && depois.n === antes.n);
    const { rows: [e] } = await db.query(`select count(*) filter (where ativo)::int ativos, count(*)::int total, count(*) filter (where ativo and "Categoria"::text = 'Kit Festa')::int kit_festa_ativos from public.produtos`);
    console.log(`depois: ${e.ativos} produtos ativos de ${e.total}; Kit Festa ativos: ${e.kit_festa_ativos}`);
    const { rows: [t] } = await db.query(`select count(*) filter (where ativo)::int a from public.produtos where slug = any($1::text[])`, [NOVOS]);
    const { rows: [o] } = await db.query(`select count(*) filter (where ativo)::int a from public.produtos where nome ~ $1 and not (slug = any($2::text[]))`, [ANTIGOS, NOVOS]);
    prova(DESFAZER ? "3 novos inativos e 31 antigos ativos" : "3 novos ativos e 31 antigos inativos", DESFAZER ? t.a === 0 && o.a === 31 : t.a === 3 && o.a === 0, `novos ativos ${t.a}, antigos ativos ${o.a}`);
    if (provas.includes(false)) throw new Error("Prova interna falhou.");
    console.log(`md5 do ensaio para o --aplicar: ${antes.h}`);

    await db.query(APLICAR ? "commit" : "rollback");
    ok = true;
    console.log(`\n${APLICAR ? "COMMIT feito" : "ROLLBACK feito: nada foi gravado"}.`);
  } catch (e) {
    await db.query("rollback").catch(() => {});
    console.error(`\nERRO (rollback feito, nada gravado): ${limpar(e.message)}`);
  } finally {
    await db.end().catch(() => {});
  }
  process.exit(ok ? 0 : 1);
}

void createHash;
main().catch((e) => { console.error(`ERRO: ${e.message}`); process.exit(1); });
