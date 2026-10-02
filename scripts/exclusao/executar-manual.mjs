// Liberação manual da rotina de exclusão de dados (supabase/exclusao-dados.sql),
// para quando a rotina agendada abortar (ex.: mais pedidos vencidos que o teto).
//
// Sem argumentos: SIMULAÇÃO, numa transação só de leitura (não grava nada).
// Mostra, por tabela, quantas linhas seriam apagadas, o intervalo de DIAS das
// candidatas (nenhum dado pessoal), o teto vigente e se a rotina agendada
// abortaria.
//
// Com --executar --teto N (os dois juntos): roda privado.exclusao_manual(N),
// a mesma lógica da rotina com origem "manual". Os prazos vêm das constantes
// do banco (12 meses e 24 horas) e nunca daqui. Imprime a contagem antes e
// depois e grava a linha de registro. É o ÚNICO script deste projeto que
// apaga de verdade: só o Cainan roda, depois de ler a simulação.
//
// Uso:
//   node scripts/exclusao/executar-manual.mjs
//   node scripts/exclusao/executar-manual.mjs --executar --teto 200
//
// Nunca imprime a conexão (SUPABASE_DB_URL do .env.local, lida por lib.mjs).

import { conectar, limpar } from "../banco/lib.mjs";
import { montarSimulacao, textoStatus } from "./decisao.mjs";

const args = process.argv.slice(2);
const executar = args.includes("--executar");
const iTeto = args.indexOf("--teto");
const teto = iTeto === -1 ? null : Number(args[iTeto + 1]);
const conhecidos = new Set(["--executar", "--teto", ...(iTeto === -1 ? [] : [args[iTeto + 1]])]);

if (args.some((a) => !conhecidos.has(a))) {
  console.error("Opção desconhecida. Sem opções o script só simula; para apagar, use executar e teto juntos (veja o cabeçalho do script).");
  process.exit(1);
}
if (executar && iTeto === -1) {
  console.error("Recusado: para apagar é preciso informar o teto junto. Nada foi feito.");
  process.exit(1);
}
if (iTeto !== -1 && (!Number.isInteger(teto) || teto < 0)) {
  console.error("Recusado: o teto precisa ser um número inteiro, zero ou maior. Nada foi feito.");
  process.exit(1);
}
if (!executar && iTeto !== -1) {
  console.error("Recusado: teto sem executar. Para só simular, rode sem opções. Nada foi feito.");
  process.exit(1);
}

const TABELAS = ["public.pedidos", "public.pedidos_rate_limit", "privado.exclusao_registro"];

async function contagens(db) {
  const r = {};
  for (const t of TABELAS) {
    const { rows } = await db.query(`select count(*)::int n from ${t}`);
    r[t] = rows[0].n;
  }
  return r;
}

const prazoTexto = (tabela, meses, horas) => (tabela === "pedidos" ? `${meses} meses` : `${horas} horas`);

const db = await conectar({ nome: "exclusao-manual", silencioso: true });
try {
  if (!executar) {
    await db.query("begin transaction read only");
    const { rows: agora } = await db.query("select now() agora");
    const { rows } = await db.query(
      `select r_tabela, r_teto, r_candidatas, r_dia_mais_antigo::text antigo, r_dia_mais_recente::text recente, r_agendada_abortaria,
         (extract(year from r_prazo) * 12 + extract(month from r_prazo))::int meses, (extract(epoch from r_prazo) / 3600)::int horas
       from privado.exclusao_previa()`
    );
    // Texto montado pela função pura (decisao.mjs, testada à parte): o comando
    // de apagar de verdade só aparece no fim, com o teto desta contagem.
    const { linhas } = montarSimulacao({
      agora: agora[0].agora,
      tabelas: rows.map((r) => ({
        tabela: r.r_tabela,
        candidatas: r.r_candidatas,
        diaMaisAntigo: r.antigo,
        diaMaisRecente: r.recente,
        agendadaAbortaria: r.r_agendada_abortaria,
        prazoMeses: r.meses,
        prazoHoras: r.horas,
        teto: r.r_teto,
      })),
    });
    console.log(linhas.join("\n"));
  } else {
    await db.query("begin");
    const antes = await contagens(db);
    const { rows } = await db.query(
      `select r_tabela, r_teto, r_candidatas, r_apagadas, r_status,
         (extract(year from r_prazo) * 12 + extract(month from r_prazo))::int meses, (extract(epoch from r_prazo) / 3600)::int horas
       from privado.exclusao_manual($1)`,
      [teto]
    );
    const depois = await contagens(db);
    await db.query("commit");
    console.log(`EXECUÇÃO MANUAL com teto ${teto}: gravado.`);
    console.log("");
    console.log("Contagem antes e depois:");
    for (const t of TABELAS) console.log(`  ${t}: ${antes[t]} antes, ${depois[t]} depois`);
    console.log("");
    console.log("Linhas gravadas no registro (origem manual):");
    for (const r of rows) {
      console.log(
        `  ${r.r_tabela}: prazo ${prazoTexto(r.r_tabela, r.meses, r.horas)}, ${r.r_teto === null ? "sem teto" : `teto ${r.r_teto}`}, ` +
          `candidatas ${r.r_candidatas ?? "não contadas"}, apagadas ${r.r_apagadas}, ${textoStatus(r.r_status)}`
      );
    }
    const abortou = rows.some((r) => r.r_status !== "ok");
    console.log("");
    console.log(abortou ? "ATENÇÃO: a execução manual abortou (veja a situação acima). Nada foi apagado em pedidos." : "OK");
    if (abortou) process.exitCode = 1;
  }
} catch (erro) {
  await db.query("rollback").catch(() => {});
  console.log(`Erro: ${limpar(erro.message)}. Nada foi gravado.`);
  process.exitCode = 1;
} finally {
  if (!executar) await db.query("rollback").catch(() => {});
  await db.end();
}
