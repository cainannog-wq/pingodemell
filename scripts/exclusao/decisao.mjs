// Decisão OK ou ATENÇÃO de scripts/exclusao/ultima-execucao.mjs, e a
// formatação de horário em Brasília dos dois scripts de exclusão. Funções
// puras: recebem tudo pronto (inclusive "agora"), não leem banco nem relógio.
// Testes em decisao.test.mjs, com dados fictícios.
//
// Texto impresso sem hífen, travessão nem seta (pedido do Cainan): dois
// pontos, vírgula e ponto.

export const TABELAS = ["pedidos", "pedidos_rate_limit"];
export const LIMITE_HORAS = 26;
export const DIAS_ABORTO = 35;

const FUSO = "America/Sao_Paulo";
const partes = new Intl.DateTimeFormat("pt-BR", {
  timeZone: FUSO,
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function pedacos(instante) {
  const p = Object.fromEntries(partes.formatToParts(instante).map((x) => [x.type, x.value]));
  return p;
}

// Date -> "14/11/2026 às 03:00:01" (Brasília).
export function formatarInstante(instante) {
  const p = pedacos(instante);
  return `${p.day}/${p.month}/${p.year} às ${p.hour}:${p.minute}:${p.second}`;
}

// Date -> "14/11" (Brasília).
export function diaMes(instante) {
  const p = pedacos(instante);
  return `${p.day}/${p.month}`;
}

// "2026-11-14" (data de calendário vinda do banco como texto) -> "14/11/2026".
export function dataBr(iso) {
  const [ano, mes, dia] = iso.split("-");
  return `${dia}/${mes}/${ano}`;
}

export function horasDesde(instante, agora) {
  return Math.floor((agora.getTime() - instante.getTime()) / 3600000);
}

export function textoStatus(status) {
  if (status === "ok") return "ok";
  if (status === "abortado_teto") return "abortado por teto";
  if (status === "abortado_prazo_invalido") return "abortado por prazo inválido";
  return status;
}

export function textoPrazo(linha) {
  return linha.tabela === "pedidos" ? `${linha.prazoMeses} meses` : `${linha.prazoHoras} horas`;
}

export function textoLinha(linha, agora) {
  return (
    `${linha.tabela}: ${formatarInstante(linha.executadoEm)} (há ${horasDesde(linha.executadoEm, agora)} horas), ` +
    `origem ${linha.origem}, prazo ${textoPrazo(linha)}, ${linha.teto === null ? "sem teto" : `teto ${linha.teto}`}, ` +
    `candidatas ${linha.candidatas ?? "não contadas"}, apagadas ${linha.apagadas}, ${textoStatus(linha.status)}`
  );
}

// Entrada:
//   agora: Date
//   job: null (não existe) | { ativo: boolean, horario: string }
//   ultimaRodada: null (nunca rodou) | { status: string, inicio: Date, mensagem: string | null }
//   registro: linhas { executadoEm: Date, origem, tabela, status, ... }, com
//     pelo menos as dos últimos 35 dias e a mais recente de cada tabela.
// Saída: { veredito: "OK" | "ATENÇÃO", motivos: string[], informativos: string[] }
// ATENÇÃO quando: o job não existe ou está inativo; falta execução de alguma
// tabela; a última execução tem mais de 26 horas; o status MAIS RECENTE de
// alguma tabela é abortado; a última rodada do pg_cron falhou. Um aborto já
// seguido de execução ok vira só a linha informativa "aborto resolvido em
// DD/MM".
export function avaliar({ agora, job, ultimaRodada, registro }) {
  const motivos = [];
  const informativos = [];

  if (!job) motivos.push("o job exclusao_dados_diaria não existe");
  else if (!job.ativo) motivos.push("o job exclusao_dados_diaria está inativo");

  const porTabela = new Map(TABELAS.map((t) => [t, []]));
  for (const linha of registro) porTabela.get(linha.tabela)?.push(linha);
  for (const linhas of porTabela.values()) linhas.sort((a, b) => a.executadoEm - b.executadoEm);

  const ultimas = [];
  for (const [tabela, linhas] of porTabela) {
    if (linhas.length === 0) {
      motivos.push(`nenhuma execução registrada para ${tabela}`);
      continue;
    }
    const ultima = linhas[linhas.length - 1];
    ultimas.push(ultima);
    if (ultima.status !== "ok") {
      motivos.push(`a execução mais recente de ${tabela} ${ultima.status === "abortado_teto" ? "abortou por teto" : "abortou por prazo inválido"}, em ${diaMes(ultima.executadoEm)}, e espera liberação manual`);
    }
    // Abortos dos últimos 35 dias já seguidos de uma execução ok.
    const limite = agora.getTime() - DIAS_ABORTO * 86400000;
    linhas.forEach((linha, i) => {
      if (linha.status === "ok" || linha.executadoEm.getTime() < limite) return;
      const resolvida = linhas.slice(i + 1).find((l) => l.status === "ok");
      if (resolvida) {
        informativos.push(
          `${tabela}: ${textoStatus(linha.status)} em ${diaMes(linha.executadoEm)}, aborto resolvido em ${diaMes(resolvida.executadoEm)}`
        );
      }
    });
  }

  if (ultimas.length) {
    const maisAntiga = ultimas.reduce((a, b) => (a.executadoEm < b.executadoEm ? a : b));
    const horas = horasDesde(maisAntiga.executadoEm, agora);
    if (horas > LIMITE_HORAS) motivos.push(`a última execução foi há ${horas} horas (limite ${LIMITE_HORAS} horas)`);
  }

  if (ultimaRodada && ultimaRodada.status === "failed") {
    motivos.push(`a última rodada do pg_cron falhou, em ${formatarInstante(ultimaRodada.inicio)}`);
  }

  return { veredito: motivos.length ? "ATENÇÃO" : "OK", motivos, informativos };
}

// Última linha da saída.
export function linhaFinal({ veredito, motivos }) {
  return veredito === "OK" ? "OK" : `ATENÇÃO: ${motivos.join("; ")}.`;
}

function textoRodada(r) {
  if (!r) return "o pg_cron ainda não rodou este job";
  if (r.status === "succeeded") return `${formatarInstante(r.inicio)}, sucesso`;
  if (r.status === "failed") return `${formatarInstante(r.inicio)}, FALHOU. Mensagem do banco: ${r.mensagem ?? "sem mensagem"}`;
  return `${formatarInstante(r.inicio)}, situação ${r.status}`;
}

function colunas(linhas) {
  const larguras = linhas[0].map((_, i) => Math.max(...linhas.map((l) => String(l[i]).length)));
  return linhas.map((l) => "  " + l.map((v, i) => String(v).padEnd(larguras[i])).join("  ").trimEnd());
}

// Saída inteira do ultima-execucao.mjs, linha a linha. historico: linhas do
// registro para --historico N (ou null).
export function montarSaida({ agora, job, ultimaRodada, registro, historico = null }) {
  const resultado = avaliar({ agora, job, ultimaRodada, registro });
  const saida = [];
  saida.push("Rotina de exclusão de dados (horários de Brasília)");
  saida.push(`Consulta em ${formatarInstante(agora)}`);
  saida.push("");
  saida.push(
    job
      ? `Job exclusao_dados_diaria: existe, ${job.ativo ? "ativo" : "INATIVO"}, horário "${job.horario}" (06:00 UTC, 03:00 de Brasília)`
      : "Job exclusao_dados_diaria: NÃO EXISTE"
  );
  saida.push(`Última rodada do pg_cron: ${textoRodada(ultimaRodada)}`);
  saida.push("");
  saida.push("Última execução por tabela:");
  for (const tabela of TABELAS) {
    const linhas = registro.filter((l) => l.tabela === tabela).sort((a, b) => a.executadoEm - b.executadoEm);
    saida.push(linhas.length ? `  ${textoLinha(linhas[linhas.length - 1], agora)}` : `  ${tabela}: nenhuma execução registrada`);
  }
  const abortos = registro.filter((l) => l.status !== "ok" && l.executadoEm.getTime() >= agora.getTime() - DIAS_ABORTO * 86400000);
  saida.push(`Abortos nos últimos ${DIAS_ABORTO} dias: ${abortos.length || "nenhum"}`);
  for (const info of resultado.informativos) saida.push(`  ${info}`);

  if (historico) {
    saida.push("");
    saida.push(`Histórico (${historico.length} linhas, mais recentes primeiro):`);
    if (historico.length) {
      saida.push(
        ...colunas([
          ["Quando", "Origem", "Tabela", "Prazo", "Teto", "Candidatas", "Apagadas", "Situação"],
          ...historico.map((l) => [
            formatarInstante(l.executadoEm),
            l.origem,
            l.tabela,
            textoPrazo(l),
            l.teto ?? "sem teto",
            l.candidatas ?? "não contadas",
            l.apagadas,
            textoStatus(l.status),
          ]),
        ])
      );
    }
  }

  saida.push("");
  saida.push(linhaFinal(resultado));
  return { linhas: saida, veredito: resultado.veredito };
}
