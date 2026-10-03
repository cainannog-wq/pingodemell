// Rotinas de exclusão de dados (supabase/exclusao-dados.sql, PR
// exclusao-dados, item 7b), numa transação desfeita: nada é gravado.
//
// Roda contra as funções IMPLANTADAS (ou as da migração, com
// --com-migracao=supabase/exclusao-dados.sql antes de aplicar), nunca uma
// cópia. Os pedidos e IPs antigos são fabricados dentro da transação:
//   - pedidos entram na public.pedidos real com número NEGATIVO explícito
//     (overriding system value), então o contador de número de pedido não
//     anda (scripts/banco/rodar-todos.mjs confere);
//   - todo dado fictício leva a marca PROVA_EXCLUSAO; IPs são "prova ip ...".
// A rotina apaga também os candidatos REAIS dentro da transação (desfeito no
// fim). Por isso o script imprime antes quantos pedidos reais já são
// candidatos e soma isso nas contas.
//
// Travas: recusa rodar fora de transação e entre 05:55 e 06:05 UTC (o job
// roda às 06:00 UTC).
//
// Uso: node scripts/banco/exclusao-dados.mjs [--com-migracao=supabase/exclusao-dados.sql]

import { readFileSync } from "node:fs";
import path from "node:path";
import { cenario, descrever, emTransacaoDesfeita, raiz, registrar, rodarMigracao, SEM_PERMISSAO } from "./lib.mjs";
import { estadoPermissoesPedidos, MIGRACAO_PERMISSOES_PEDIDOS } from "./estado-permissoes-pedidos.mjs";

const rota = readFileSync(path.join(raiz, "src", "app", "api", "pedidos", "route.ts"), "utf8");
const JANELA = rota
  .match(/const JANELA_SEGUNDOS = ([\d\s*]+);/)[1]
  .split("*")
  .reduce((total, fator) => total * Number(fator.trim()), 1);
const LIMITE = Number(rota.match(/const LIMITE_POR_JANELA = (\d+)/)[1]);

const MARCA = "PROVA_EXCLUSAO";
const FUNCOES = [
  "privado.exclusao_constantes()",
  "privado.pedido_ultimo_dia_de_guarda(timestamptz, integer)",
  "privado.executar_exclusao(text, integer, interval, integer)",
  "privado.exclusao_agendada()",
  "privado.exclusao_manual(integer)",
  "privado.exclusao_previa()",
];
const CHAMADAS = {
  "privado.exclusao_agendada()": "select privado.exclusao_agendada()",
  "privado.executar_exclusao(...)": "select * from privado.executar_exclusao('manual', 12, interval '24 hours', 150)",
  "privado.exclusao_manual(150)": "select * from privado.exclusao_manual(150)",
  "privado.exclusao_previa()": "select * from privado.exclusao_previa()",
};
const SEM_RELACAO = [
  "produtos",
  "produto_fotos",
  "produto_cento_itens",
  "recheios",
  "dias_off",
  "segunda_reaberturas",
  "pedidos_gravacao",
  "heartbeat",
];
const STATUS = ["aguardando_confirmacao", "em_producao", "entregue", "cancelado"];

let numeroLivre = -500000;

// Fabrica n pedidos com dado pessoal fictício em TODAS as colunas que guardam
// dado de cliente (nome, WhatsApp, email, ocasião, endereço, observações, e a
// observação de cada item). criado_em = dia (YYYY-MM-DD) + hora no relógio de
// Brasília. Devolve os números usados.
async function fabricarPedidos(c, { n = 1, dia, hora = "12:00", status = "aguardando_confirmacao", teste = true, entregaDia = null }) {
  const inicio = numeroLivre;
  numeroLivre -= n;
  await c.q(
    `insert into public.pedidos (
       numero, cliente_nome, cliente_whatsapp, cliente_email, ocasiao, modo_entrega, endereco,
       data_hora_entrega, forma_pagamento, observacoes, itens, subtotal, valor_entrega, total,
       status, criado_em, status_atualizado_em, teste, chave_idempotencia)
     overriding system value
     select $1::int - g + 1,
       '${MARCA} Nome ' || g, '41900000000', 'prova.exclusao' || g || '@exemplo.invalid', '${MARCA} ocasiao',
       'entrega', '${MARCA} Rua da Prova ' || g,
       ((coalesce($6::date, $2::date) + time '15:00') at time zone 'America/Sao_Paulo'), 'Pix', '${MARCA} observacao',
       jsonb_build_array(jsonb_build_object('nome', '${MARCA} item', 'quantidade', 1, 'preco_unitario', 10,
         'observacao', '${MARCA} observacao do item')),
       0, 0, 0,
       $3::public.pedido_status,
       (($2::date + $4::time) at time zone 'America/Sao_Paulo'),
       (($2::date + $4::time) at time zone 'America/Sao_Paulo'),
       $5, gen_random_uuid()
     from generate_series(1, $7::int) g`,
    [inicio, dia, status, hora, teste, entregaDia, n]
  );
  return Array.from({ length: n }, (_, i) => inicio - i);
}

async function fabricarIps(c, linhas) {
  for (const { ip, horasAtras, contagem = 1 } of linhas) {
    await c.q(
      "insert into public.pedidos_rate_limit (ip, janela_inicio, contagem) values ($1, now() - make_interval(secs => $2), $3)",
      [ip, Math.round(horasAtras * 3600), contagem]
    );
  }
}

async function datas(c) {
  const { rows } = await c.q(
    `select (now() at time zone 'America/Sao_Paulo')::date::text hoje,
            ((now() at time zone 'America/Sao_Paulo')::date - interval '1 day')::date::text ontem,
            ((now() at time zone 'America/Sao_Paulo')::date - interval '12 months')::date::text d12,
            ((now() at time zone 'America/Sao_Paulo')::date - interval '12 months' - interval '1 day')::date::text d12m1`
  );
  return rows[0];
}

async function existentes(c, numeros) {
  const { rows } = await c.q("select numero from public.pedidos where numero = any($1::int[])", [numeros]);
  return new Set(rows.map((r) => r.numero));
}

async function contar(c, tabela) {
  const { rows } = await c.q(`select count(*)::int n from ${tabela}`);
  return rows[0].n;
}

async function ultimasLinhas(c, n = 2) {
  const { rows } = await c.q(
    `select executado_em, origem, tabela, prazo::text prazo, teto, candidatas, apagadas, status
     from privado.exclusao_registro order by executado_em desc, tabela limit $1`,
    [n]
  );
  return rows;
}

const linhaTexto = (l) =>
  `${l.tabela}: origem ${l.origem}, prazo ${l.prazo}, teto ${l.teto ?? "sem"}, candidatas ${l.candidatas ?? "não contadas"}, apagadas ${l.apagadas}, status ${l.status}`;

await emTransacaoDesfeita("Exclusão de dados: pedidos com mais de 12 meses e IP do limite por pedidos", async (db) => {
  // --- travas ----------------------------------------------------------
  // SAVEPOINT só existe dentro de transação: fora dela o Postgres recusa.
  await db.query("savepoint trava_transacao");
  await db.query("release savepoint trava_transacao");
  const { rows: relogio } = await db.query(
    "select to_char(now() at time zone 'UTC', 'HH24:MI') utc, extract(hour from now() at time zone 'UTC') * 60 + extract(minute from now() at time zone 'UTC') minutos"
  );
  const minutos = Number(relogio[0].minutos);
  if (minutos >= 5 * 60 + 55 && minutos <= 6 * 60 + 5) {
    throw new Error(`São ${relogio[0].utc} UTC: o job da exclusão roda às 06:00 UTC. Rode depois das 06:05 UTC.`);
  }
  console.log(`Dentro de transação (savepoint aceito). Relógio do banco: ${relogio[0].utc} UTC.`);

  const { rows: previa } = await db.query("select r_tabela, r_candidatas from privado.exclusao_previa()");
  const reais = Object.fromEntries(previa.map((p) => [p.r_tabela, p.r_candidatas]));
  const REAIS = reais.pedidos;
  console.log(
    `Candidatos REAIS hoje (apagados só dentro desta transação, que é desfeita): pedidos ${REAIS}, linhas de IP ${reais.pedidos_rate_limit}.`
  );

  const { rows: constantes } = await db.query(
    "select meses_pedidos, extract(epoch from prazo_ip)::int prazo_ip_seg, teto_pedidos from privado.exclusao_constantes()"
  );
  const K = constantes[0];

  // --- 0. constantes e janela do limite ---------------------------------
  registrar(
    "exclusão 0a. constantes num lugar só: 12 meses, 24 horas, teto 150",
    K.meses_pedidos === 12 && K.prazo_ip_seg === 24 * 3600 && K.teto_pedidos === 150,
    `meses ${K.meses_pedidos}, prazo do IP ${K.prazo_ip_seg / 3600} h, teto ${K.teto_pedidos}`
  );
  registrar(
    "exclusão 0b. a janela do limite por IP (route.ts) é menor que o prazo do IP",
    JANELA < K.prazo_ip_seg,
    `janela ${JANELA / 3600} h, prazo ${K.prazo_ip_seg / 3600} h`
  );

  // --- a. borda de calendário, de ponta a ponta com o hoje real ---------
  await cenario(db, async (c) => {
    const d = await datas(c);
    const [sobrevive] = await fabricarPedidos(c, { dia: d.d12 });
    const [some] = await fabricarPedidos(c, { dia: d.d12m1 });
    const [noiteBrasilia] = await fabricarPedidos(c, { dia: d.d12m1, hora: "23:30" });
    const [entregaHoje] = await fabricarPedidos(c, { dia: d.d12, entregaDia: d.hoje });
    const [entregaOntem] = await fabricarPedidos(c, { dia: d.d12m1, entregaDia: d.ontem });
    const { rows: noite } = await c.q(
      "select (criado_em at time zone 'UTC')::date::text dia_utc, to_char(criado_em at time zone 'UTC', 'HH24:MI') hora_utc from public.pedidos where numero = $1",
      [noiteBrasilia]
    );
    await c.q("select privado.exclusao_agendada()");
    const ficou = await existentes(c, [sobrevive, some, noiteBrasilia, entregaHoje, entregaOntem]);

    console.log(`\n  hoje em Brasília ${d.hoje}; 12 meses atrás ${d.d12}; 12 meses e 1 dia atrás ${d.d12m1}`);
    registrar(
      "exclusão a1. criado há 12 meses exatos (Brasília) sobrevive; há 12 meses e 1 dia some",
      ficou.has(sobrevive) && !ficou.has(some),
      `criado em ${d.d12}: ${ficou.has(sobrevive) ? "ficou" : "SUMIU"}; criado em ${d.d12m1}: ${ficou.has(some) ? "FICOU" : "sumiu"}`
    );
    registrar(
      "exclusão a2. criado às 23:30 de Brasília conta no dia de Brasília, não no dia UTC",
      !ficou.has(noiteBrasilia) && noite[0].dia_utc === d.d12,
      `criado em ${d.d12m1} 23:30 Brasília = ${noite[0].dia_utc} ${noite[0].hora_utc} UTC; pelo dia UTC sobreviveria, pelo de Brasília ${ficou.has(noiteBrasilia) ? "FICOU" : "sumiu"}`
    );
    registrar(
      "exclusão a3. entrega 12 meses depois da criação: sobrevive no dia da entrega, some no dia seguinte",
      ficou.has(entregaHoje) && !ficou.has(entregaOntem),
      `criado em ${d.d12} com entrega hoje (${d.hoje}): ${ficou.has(entregaHoje) ? "ficou" : "SUMIU"}; criado em ${d.d12m1} com entrega ontem (${d.ontem}): ${ficou.has(entregaOntem) ? "FICOU" : "sumiu"}`
    );
  });

  // --- a. 29/02 e 23:30 pela função do último dia de guarda ------------
  await cenario(db, async (c) => {
    const casos = [
      ["2028-02-29 10:00", "2029-02-28"],
      ["2028-02-28 10:00", "2029-02-28"],
      ["2028-03-01 10:00", "2029-03-01"],
      ["2027-02-28 10:00", "2028-02-28"],
      ["2025-09-30 23:30", "2026-09-30"],
    ];
    const linhas = [];
    let ok = true;
    for (const [criado, esperado] of casos) {
      const { rows } = await c.q(
        `select privado.pedido_ultimo_dia_de_guarda(($1::timestamp at time zone 'America/Sao_Paulo'), 12)::text ultimo,
                privado.pedido_ultimo_dia_de_guarda(($1::timestamp at time zone 'America/Sao_Paulo'), 12) < $2::date apagaria_no_ultimo_dia,
                privado.pedido_ultimo_dia_de_guarda(($1::timestamp at time zone 'America/Sao_Paulo'), 12) < ($2::date + 1) apagaria_no_dia_seguinte`,
        [criado, esperado]
      );
      const r = rows[0];
      ok = ok && r.ultimo === esperado && !r.apagaria_no_ultimo_dia && r.apagaria_no_dia_seguinte;
      linhas.push(`${criado} Brasília: último dia ${r.ultimo}, nesse dia ${r.apagaria_no_ultimo_dia ? "APAGA" : "fica"}, no seguinte ${r.apagaria_no_dia_seguinte ? "apaga" : "FICA"}`);
    }
    registrar("exclusão a4. 29/02 nos dois lados da borda do ano seguinte (e 28/02, 01/03, 23:30)", ok, linhas.join("\n       "));
  });

  // --- b. abrangência e nada sobra ------------------------------------
  await cenario(db, async (c) => {
    const d = await datas(c);
    const numeros = [];
    for (const status of STATUS) {
      for (const teste of [true, false]) numeros.push(...(await fabricarPedidos(c, { dia: d.d12m1, status, teste })));
    }
    const antes = {};
    for (const t of SEM_RELACAO) antes[t] = await contar(c, `public.${t}`);
    const pedidosAntes = await contar(c, "public.pedidos");
    await c.q("select privado.exclusao_agendada()");
    const ficou = await existentes(c, numeros);
    const pedidosDepois = await contar(c, "public.pedidos");
    registrar(
      "exclusão b1. some em qualquer dos 4 status, com teste verdadeiro e falso",
      ficou.size === 0 && pedidosAntes - pedidosDepois === numeros.length + REAIS,
      `${numeros.length} fabricados (4 status x teste sim/não), sobraram ${ficou.size}; pedidos ${pedidosAntes} antes, ${pedidosDepois} depois (${REAIS} reais candidatos)`
    );

    // Varre TODA tabela de public (e o registro) atrás da marca do dado fictício.
    const { rows: tabelas } = await c.q(
      `select n.nspname || '.' || c.relname nome from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname in ('public', 'privado') and c.relkind in ('r', 'p') order by 1`
    );
    const comMarca = [];
    for (const { nome } of tabelas) {
      const [esquema, tabela] = nome.split(".");
      const { rows } = await c.q(`select count(*)::int n from ${esquema}.${JSON.stringify(tabela)} t where t::text like '%' || $1 || '%'`, [MARCA]);
      if (rows[0].n) comMarca.push(`${nome}: ${rows[0].n}`);
    }
    registrar(
      "exclusão b2. depois da exclusão, nenhuma tabela guarda dado pessoal do pedido apagado",
      comMarca.length === 0,
      comMarca.length ? `com a marca: ${comMarca.join(", ")}` : `${tabelas.length} tabelas varridas (${tabelas.map((t) => t.nome).join(", ")}): nenhuma com a marca ${MARCA}`
    );

    const diferencas = [];
    for (const t of SEM_RELACAO) {
      const depois = await contar(c, `public.${t}`);
      if (depois !== antes[t]) diferencas.push(`${t} ${antes[t]} para ${depois}`);
    }
    registrar(
      "exclusão b3. tabelas sem relação com pedidos mantêm a contagem",
      diferencas.length === 0,
      diferencas.length ? diferencas.join(", ") : SEM_RELACAO.map((t) => `${t} ${antes[t]}`).join(", ")
    );
  });

  // --- c. teto ---------------------------------------------------------
  for (const total of [K.teto_pedidos + 1, K.teto_pedidos]) {
    await cenario(db, async (c) => {
      const d = await datas(c);
      const fabricar = total - REAIS;
      if (fabricar < 0) {
        registrar(`exclusão c. teto com ${total} candidatas`, false, `já há ${REAIS} candidatos reais, acima de ${total}`);
        return;
      }
      if (fabricar) await fabricarPedidos(c, { n: fabricar, dia: d.d12m1 });
      const antes = await contar(c, "public.pedidos");
      await c.q("select privado.exclusao_agendada()");
      const depois = await contar(c, "public.pedidos");
      const [ped] = (await ultimasLinhas(c)).filter((l) => l.tabela === "pedidos");
      if (total > K.teto_pedidos) {
        registrar(
          `exclusão c1. ${total} candidatas: não apaga nenhuma e registra abortado por teto com ${total}`,
          antes === depois && ped?.status === "abortado_teto" && ped.candidatas === total && ped.apagadas === 0,
          `pedidos ${antes} antes, ${depois} depois; registro: ${ped ? linhaTexto(ped) : "SEM LINHA"}`
        );
      } else {
        registrar(
          `exclusão c2. exatamente ${total} candidatas: apaga as ${total}`,
          antes - depois === total && ped?.status === "ok" && ped.candidatas === total && ped.apagadas === total,
          `pedidos ${antes} antes, ${depois} depois; registro: ${ped ? linhaTexto(ped) : "SEM LINHA"}`
        );
      }
    });
  }

  // --- d. piso ---------------------------------------------------------
  for (const [nome, meses, prazoIp] of [
    ["prazo de pedidos de 11 meses", 11, "24 hours"],
    ["prazo de IP de 30 minutos", 12, "30 minutes"],
  ]) {
    await cenario(db, async (c) => {
      const d = await datas(c);
      await fabricarPedidos(c, { n: 2, dia: d.d12m1 });
      await fabricarIps(c, [{ ip: "prova ip piso", horasAtras: 48 }]);
      const antes = [await contar(c, "public.pedidos"), await contar(c, "public.pedidos_rate_limit")];
      const r = await c.tentar("select * from privado.executar_exclusao('manual', $1, $2::interval, 150)", [meses, prazoIp]);
      const depois = [await contar(c, "public.pedidos"), await contar(c, "public.pedidos_rate_limit")];
      const linhas = await ultimasLinhas(c);
      registrar(
        `exclusão d. ${nome}: aborta, registra e não apaga nada`,
        r.ok && antes.join() === depois.join() && linhas.length === 2 && linhas.every((l) => l.status === "abortado_prazo_invalido" && l.apagadas === 0 && l.candidatas === null),
        `chamada ${descrever(r)}; pedidos ${antes[0]} e ${depois[0]}, IPs ${antes[1]} e ${depois[1]}; registro:\n       ${linhas.map(linhaTexto).join("\n       ")}`
      );
    });
  }

  // --- e. IP -----------------------------------------------------------
  await cenario(db, async (c) => {
    await fabricarIps(c, [
      { ip: "prova ip 25h", horasAtras: 25, contagem: 3 },
      { ip: "prova ip 23h", horasAtras: 23, contagem: 3 },
      { ip: "prova ip ativa", horasAtras: 10 / 60, contagem: 3 },
    ]);
    await c.q(
      `insert into public.pedidos_rate_limit (ip, janela_inicio, contagem)
       select 'prova ip velho ' || g, now() - interval '48 hours', 2 from generate_series(1, 1000) g`
    );
    await c.q("select privado.exclusao_agendada()");
    const { rows } = await c.q("select ip, contagem from public.pedidos_rate_limit where ip like 'prova ip %'");
    const ips = new Map(rows.map((r) => [r.ip, r.contagem]));
    const velhos = rows.filter((r) => r.ip.startsWith("prova ip velho")).length;
    const [linhaIp] = (await ultimasLinhas(c)).filter((l) => l.tabela === "pedidos_rate_limit");
    registrar(
      "exclusão e1. IP com janela iniciada há 25 h some; há 23 h e janela ativa ficam",
      !ips.has("prova ip 25h") && ips.has("prova ip 23h") && ips.has("prova ip ativa"),
      `25 h: ${ips.has("prova ip 25h") ? "FICOU" : "sumiu"}; 23 h: ${ips.has("prova ip 23h") ? "ficou" : "SUMIU"}; ativa: ${ips.has("prova ip ativa") ? "ficou" : "SUMIU"}`
    );
    registrar(
      "exclusão e2. mil linhas antigas são apagadas sem aborto (IP não tem teto)",
      velhos === 0 && linhaIp?.status === "ok" && linhaIp.apagadas === 1001 + reais.pedidos_rate_limit,
      `velhas que sobraram: ${velhos}; registro: ${linhaIp ? linhaTexto(linhaIp) : "SEM LINHA"} (${reais.pedidos_rate_limit} reais)`
    );

    await c.como("service_role");
    const chamar = "select permitido, contagem from public.registrar_tentativa_pedido_v2($1, $2, $3)";
    const ativa = await c.tentar(chamar, ["prova ip ativa", JANELA, LIMITE]);
    const apagado = await c.tentar(chamar, ["prova ip 25h", JANELA, LIMITE]);
    registrar(
      "exclusão e3. depois da limpeza o limite continua certo: janela ativa mantém o contador, IP apagado recomeça em 1",
      ativa.ok && ativa.rows[0].contagem === 4 && apagado.ok && apagado.rows[0].contagem === 1 && apagado.rows[0].permitido,
      `IP ativo (3 antes): ${ativa.ok ? `contagem ${ativa.rows[0].contagem}` : descrever(ativa)}; IP apagado: ${apagado.ok ? `contagem ${apagado.rows[0].contagem}` : descrever(apagado)}`
    );
  });

  // --- f. registro -----------------------------------------------------
  await cenario(db, async (c) => {
    await c.q("select privado.exclusao_agendada()");
    const primeira = await ultimasLinhas(c);
    await c.q("select privado.exclusao_agendada()");
    const segunda = await ultimasLinhas(c);
    await c.q("select * from privado.exclusao_manual(150)");
    const manual = await ultimasLinhas(c);
    const total = await contar(c, "privado.exclusao_registro");
    const mesmaHora = (ls) => ls.length === 2 && ls[0].executado_em.getTime() === ls[1].executado_em.getTime();
    registrar(
      "exclusão f1. uma linha por tabela em toda execução, inclusive com zero apagadas, com o mesmo instante nas duas",
      [primeira, segunda, manual].every(mesmaHora) && new Set([primeira, segunda, manual].map((l) => l[0].executado_em.getTime())).size === 3,
      `3 execuções; linhas no registro desta transação: ${total}`
    );
    registrar(
      "exclusão f2. duas execuções seguidas: a segunda apaga zero",
      segunda.every((l) => l.apagadas === 0 && l.status === "ok"),
      segunda.map(linhaTexto).join("\n       ")
    );
    registrar(
      "exclusão f3. origem agendada e manual",
      primeira.every((l) => l.origem === "agendada") && manual.every((l) => l.origem === "manual"),
      `${primeira[0].origem}, ${manual[0].origem}`
    );
    const { rows: colunas } = await c.q(
      `select string_agg(column_name || ' ' || data_type, ', ' order by ordinal_position) lista
       from information_schema.columns where table_schema = 'privado' and table_name = 'exclusao_registro'`
    );
    const esperado =
      "executado_em timestamp with time zone, origem text, tabela text, prazo interval, teto integer, candidatas integer, apagadas integer, status text";
    registrar("exclusão f4. colunas do registro (catálogo): só contagens, nenhum dado pessoal", colunas[0].lista === esperado, colunas[0].lista);
  });

  // --- g. permissões ---------------------------------------------------
  {
    const { rows } = await db.query(
      `select p.oid::regprocedure::text nome, p.prosecdef definer, p.proconfig
       from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'privado' order by 1`
    );
    const ruins = rows.filter((f) => !f.definer || !(f.proconfig ?? []).includes("search_path=\"\""));
    registrar(
      "exclusão g1. as 6 funções são SECURITY DEFINER com search_path fixo (vazio)",
      rows.length === 6 && ruins.length === 0,
      rows.map((f) => `${f.nome}: ${f.definer ? "definer" : "INVOKER"}, ${(f.proconfig ?? []).join(" ")}`).join("\n       ")
    );
  }
  for (const papel of ["anon", "authenticated", "service_role"]) {
    await cenario(db, async (c) => {
      const { rows } = await c.q(
        `select has_schema_privilege($1, 'privado', 'USAGE') usa_schema,
                has_table_privilege($1, 'privado.exclusao_registro', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE') tabela,
                ${FUNCOES.map((f, i) => `has_function_privilege($1, '${f}', 'EXECUTE') f${i}`).join(", ")}`,
        [papel]
      );
      const p = rows[0];
      const algumaFuncao = FUNCOES.some((_, i) => p[`f${i}`]);
      await c.como(papel);
      const tentativas = [];
      for (const [nome, sql] of Object.entries(CHAMADAS)) tentativas.push([nome, await c.tentar(sql)]);
      tentativas.push(["ler o registro", await c.tentar("select * from privado.exclusao_registro")]);
      tentativas.push([
        "gravar no registro",
        await c.tentar(
          "insert into privado.exclusao_registro values (now(), 'manual', 'pedidos', interval '1 day', 0, 0, 0, 'ok')"
        ),
      ]);
      const recusadas = tentativas.every(([, r]) => !r.ok && r.code === SEM_PERMISSAO);
      registrar(
        `exclusão g2. ${papel} é recusado: funções agendada, interna, manual e prévia, e ler ou gravar o registro`,
        !p.usa_schema && !p.tabela && !algumaFuncao && recusadas,
        `uso do schema: ${p.usa_schema ? "SIM" : "não"}; tabela: ${p.tabela ? "SIM" : "não"}; execução de função: ${algumaFuncao ? "SIM" : "não"}\n       ` +
          tentativas.map(([nome, r]) => `${nome}: ${descrever(r)}`).join("\n       ")
      );
    });
  }
  {
    const { rows } = await db.query(
      `select c.relrowsecurity rls, (select count(*)::int from pg_policy where polrelid = c.oid) politicas
       from pg_class c where c.oid = 'privado.exclusao_registro'::regclass`
    );
    registrar("exclusão g3. registro com RLS ligada e nenhuma política", rows[0].rls && rows[0].politicas === 0, `RLS ${rows[0].rls ? "ligada" : "DESLIGADA"}, ${rows[0].politicas} política(s)`);
  }

  // Job no pg_cron (o da migração, dentro da transação, ou o de produção).
  {
    const { rows } = await db.query("select schedule, command, active, username from cron.job where jobname = 'exclusao_dados_diaria'");
    const j = rows[0];
    registrar(
      "exclusão g4. job exclusao_dados_diaria: 0 6 * * *, ativo, chama a função agendada sem parâmetro, roda como postgres",
      rows.length === 1 && j.schedule === "0 6 * * *" && j.active && j.command === "select privado.exclusao_agendada()" && j.username === "postgres",
      j ? `horário "${j.schedule}", ${j.active ? "ativo" : "INATIVO"}, comando "${j.command}", papel ${j.username}` : "job não encontrado"
    );
  }

  // --- h. saída manual e simulação -------------------------------------
  for (const [teto, espera] of [
    [REAIS + 3 + 1, "ok"],
    [REAIS + 3 - 1, "abortado_teto"],
  ]) {
    await cenario(db, async (c) => {
      const d = await datas(c);
      await fabricarPedidos(c, { n: 3, dia: d.d12m1 });
      const antes = await contar(c, "public.pedidos");
      const r = await c.tentar("select * from privado.exclusao_manual($1)", [teto]);
      const depois = await contar(c, "public.pedidos");
      const [ped] = (await ultimasLinhas(c)).filter((l) => l.tabela === "pedidos");
      const ok =
        r.ok &&
        ped?.origem === "manual" &&
        ped.status === espera &&
        (espera === "ok" ? antes - depois === REAIS + 3 : antes === depois);
      registrar(
        `exclusão h${espera === "ok" ? 1 : 2}. manual com teto ${teto} e ${REAIS + 3} candidatas: ${espera === "ok" ? "apaga e registra origem manual" : "aborta"}`,
        ok,
        `pedidos ${antes} antes, ${depois} depois; registro: ${ped ? linhaTexto(ped) : "SEM LINHA"}`
      );
    });
  }
  await cenario(db, async (c) => {
    const d = await datas(c);
    await fabricarPedidos(c, { n: 3, dia: d.d12m1 });
    await fabricarIps(c, [{ ip: "prova ip simulacao", horasAtras: 30 }]);
    const tabelas = ["public.pedidos", "public.pedidos_rate_limit", "privado.exclusao_registro"];
    const antes = [];
    for (const t of tabelas) antes.push(await contar(c, t));
    const { rows } = await c.q("select r_tabela, r_candidatas, r_agendada_abortaria from privado.exclusao_previa()");
    const depois = [];
    for (const t of tabelas) depois.push(await contar(c, t));
    const { rows: vol } = await c.q("select provolatile from pg_proc where oid = 'privado.exclusao_previa()'::regprocedure");
    const p = Object.fromEntries(rows.map((r) => [r.r_tabela, r.r_candidatas]));
    registrar(
      "exclusão h3. a simulação (prévia) conta as candidatas e não altera nenhuma contagem",
      antes.join() === depois.join() && p.pedidos === REAIS + 3 && p.pedidos_rate_limit === reais.pedidos_rate_limit + 1 && vol[0].provolatile === "s",
      `${tabelas.map((t, i) => `${t} ${antes[i]} antes, ${depois[i]} depois`).join("; ")}; prévia: pedidos ${p.pedidos}, IPs ${p.pedidos_rate_limit}; função STABLE (não pode gravar): ${vol[0].provolatile === "s" ? "sim" : "NÃO"}`
    );
  });

  // --- i. a rotina não depende do papel logado --------------------------
  // supabase/pedidos-permissoes.sql tira o DELETE de authenticated em
  // pedidos. A rotina é SECURITY DEFINER do postgres, dono da tabela, e a
  // RLS de pedidos não é forçada: continua apagando. Sem a migração no
  // banco, ela é aplicada dentro deste cenário (desfeito).
  await cenario(db, async (c) => {
    if ((await estadoPermissoesPedidos(c)) === "antes") await rodarMigracao(db, MIGRACAO_PERMISSOES_PEDIDOS);
    const { rows: p } = await c.q("select has_table_privilege('authenticated', 'public.pedidos', 'DELETE') apaga");
    const d = await datas(c);
    const [candidato] = await fabricarPedidos(c, { dia: d.d12m1 });
    const antes = await existentes(c, [candidato]);
    await c.q("select privado.exclusao_agendada()");
    const depois = await existentes(c, [candidato]);
    const [ped] = (await ultimasLinhas(c)).filter((l) => l.tabela === "pedidos");
    registrar(
      "exclusão i1. sem DELETE para o logado em pedidos (pedidos-permissoes.sql), a função agendada ainda apaga o pedido candidato",
      p[0].apaga === false && antes.has(candidato) && !depois.has(candidato) && ped?.origem === "agendada" && ped.status === "ok",
      `logado tem DELETE em pedidos: ${p[0].apaga ? "SIM" : "não"}; candidato ${antes.has(candidato) ? "existia" : "NÃO EXISTIA"} e ${depois.has(candidato) ? "FICOU" : "sumiu"}; registro: ${ped ? linhaTexto(ped) : "SEM LINHA"}`
    );
  });
  {
    const { rows } = await db.query(
      `select relname, relrowsecurity rls, relforcerowsecurity forca, pg_get_userbyid(relowner) dono
       from pg_class where oid in ('public.pedidos'::regclass, 'public.pedidos_rate_limit'::regclass) order by relname`
    );
    registrar(
      "exclusão i2. pedidos e pedidos_rate_limit: RLS não forçada e dono postgres (a rotina, que roda como o dono, não passa pela RLS)",
      rows.length === 2 && rows.every((r) => r.forca === false && r.dono === "postgres"),
      rows.map((r) => `${r.relname}: RLS ${r.rls ? "ligada" : "desligada"}, forçada ${r.forca ? "SIM" : "não"}, dono ${r.dono}`).join("; ")
    );
  }
});
