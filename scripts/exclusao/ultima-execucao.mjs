// Verificação mensal da rotina de exclusão de dados (supabase/exclusao-dados.sql).
// Só leitura (transação read only): não grava nada.
//
// Imprime, em horário de Brasília: o job do pg_cron (existe, ativo, horário),
// a última execução de cada tabela (quando, há quantas horas, origem,
// candidatas, apagadas, situação) e a última rodada do pg_cron (sucesso ou
// falha, com a mensagem do banco). A última linha é "OK" ou "ATENÇÃO: motivo".
// A decisão fica em decisao.mjs (função pura, testada em decisao.test.mjs).
//
// Código de saída: 0 em OK, 1 em ATENÇÃO (ou erro).
//
// Uso: node scripts/exclusao/ultima-execucao.mjs [--historico N]
//   --historico N: lista também as últimas N linhas do registro numa tabela.
//
// Nunca imprime a conexão (SUPABASE_DB_URL do .env.local, lida por lib.mjs).

import { conectar, limpar } from "../banco/lib.mjs";
import { montarSaida } from "./decisao.mjs";

const args = process.argv.slice(2);
let historicoN = null;
if (args.length) {
  const n = Number(args[1]);
  if (args[0] !== "--historico" || args.length !== 2 || !Number.isInteger(n) || n < 1) {
    console.error("Uso: node scripts/exclusao/ultima-execucao.mjs, opcionalmente com historico N (veja o cabeçalho do script).");
    process.exit(1);
  }
  historicoN = n;
}

const COLUNAS = `executado_em, origem, tabela, teto, candidatas, apagadas, status,
  (extract(year from prazo) * 12 + extract(month from prazo))::int prazo_meses,
  (extract(epoch from prazo) / 3600)::int prazo_horas`;

function linhaDoRegistro(r) {
  return {
    executadoEm: r.executado_em,
    origem: r.origem,
    tabela: r.tabela,
    prazoMeses: r.prazo_meses,
    prazoHoras: r.prazo_horas,
    teto: r.teto,
    candidatas: r.candidatas,
    apagadas: r.apagadas,
    status: r.status,
  };
}

const db = await conectar({ nome: "exclusao-ultima-execucao", silencioso: true });
let codigo = 1;
try {
  await db.query("begin transaction read only");
  const { rows: agoraRows } = await db.query("select now() agora");
  const agora = agoraRows[0].agora;

  const { rows: existe } = await db.query(
    "select to_regclass('cron.job') is not null cron, to_regclass('privado.exclusao_registro') is not null registro"
  );

  let job = null;
  let ultimaRodada = null;
  if (existe[0].cron) {
    const { rows } = await db.query("select jobid, schedule, active from cron.job where jobname = 'exclusao_dados_diaria'");
    if (rows.length) {
      job = { ativo: rows[0].active, horario: rows[0].schedule };
      const { rows: rodadas } = await db.query(
        "select status, return_message, start_time from cron.job_run_details where jobid = $1 order by start_time desc nulls last limit 1",
        [rows[0].jobid]
      );
      if (rodadas.length) {
        ultimaRodada = { status: rodadas[0].status, inicio: rodadas[0].start_time, mensagem: rodadas[0].return_message };
      }
    }
  }

  let registro = [];
  let historico = null;
  if (existe[0].registro) {
    const { rows } = await db.query(
      `select ${COLUNAS} from privado.exclusao_registro
       where executado_em >= now() - interval '35 days'
          or (tabela, executado_em) in (select tabela, max(executado_em) from privado.exclusao_registro group by tabela)
       order by executado_em`
    );
    registro = rows.map(linhaDoRegistro);
    if (historicoN) {
      const { rows: h } = await db.query(
        `select ${COLUNAS} from privado.exclusao_registro order by executado_em desc, tabela limit $1`,
        [historicoN]
      );
      historico = h.map(linhaDoRegistro);
    }
  } else if (historicoN) {
    historico = [];
  }

  const { linhas, veredito } = montarSaida({ agora, job, ultimaRodada, registro, historico });
  console.log(linhas.join("\n"));
  codigo = veredito === "OK" ? 0 : 1;
} catch (erro) {
  console.log(`Erro ao ler o banco: ${limpar(erro.message)}`);
  console.log("ATENÇÃO: não foi possível ler a rotina.");
} finally {
  await db.query("rollback").catch(() => {});
  await db.end();
}
process.exitCode = codigo;
