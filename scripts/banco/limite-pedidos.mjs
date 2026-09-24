// Limite de pedidos por IP (função registrar_tentativa_pedido e tabela
// pedidos_rate_limit), numa transação desfeita — nada é gravado.
// Substitui a parte de banco de scripts/test-rate-limit-pedidos.mjs e
// scripts/test-rate-limit-netlify.mjs, que gravavam pedidos de verdade.
// A parte da rota (IP vindo do cabeçalho da Netlify, X-Forwarded-For
// ignorado em produção, resposta 429) fica em src/app/api/pedidos/route.test.ts.
//
// A janela e o limite são lidos de src/app/api/pedidos/route.ts, para o
// teste acompanhar a rota se os números mudarem.
//
// Uso: node scripts/banco/limite-pedidos.mjs [--com-migracao]

import { readFileSync } from "node:fs";
import path from "node:path";
import { cenario, descrever, emTransacaoDesfeita, raiz, registrar, SEM_PERMISSAO } from "./lib.mjs";

const rota = readFileSync(path.join(raiz, "src", "app", "api", "pedidos", "route.ts"), "utf8");
// "10 * 60" -> 600
const JANELA = rota
  .match(/const JANELA_SEGUNDOS = ([\d\s*]+);/)[1]
  .split("*")
  .reduce((total, fator) => total * Number(fator.trim()), 1);
const LIMITE = Number(rota.match(/const LIMITE_POR_JANELA = (\d+)/)[1]);

const IP = "prova-transacao-desfeita";
const chamar = "select permitido, contagem from public.registrar_tentativa_pedido($1, $2, $3)";

await emTransacaoDesfeita(`Limite por IP — ${LIMITE} pedidos a cada ${JANELA}s (valores da rota)`, async (db) => {
  for (const papel of ["anon", "authenticated"]) {
    await cenario(db, async (c) => {
      const { rows } = await c.q(
        "select has_function_privilege($1, 'public.registrar_tentativa_pedido(text, integer, integer)', 'EXECUTE') pode",
        [papel]
      );
      await c.como(papel);
      const r = await c.tentar(chamar, [IP, JANELA, LIMITE]);
      const nome = papel === "anon" ? "anônimo" : "logado";
      registrar(
        `limite 1. ${nome} NÃO chama registrar_tentativa_pedido`,
        !rows[0].pode && !r.ok && r.code === SEM_PERMISSAO,
        `permissão de execução: ${rows[0].pode ? "sim" : "não"}; chamada ${descrever(r)}`
      );
    });
  }

  await cenario(db, async (c) => {
    await c.como("anon");
    const le = await c.tentar("select * from public.pedidos_rate_limit");
    const grava = await c.tentar("insert into public.pedidos_rate_limit (ip) values ($1)", [IP]);
    registrar(
      "limite 2. anônimo não lê nem grava a tabela de tentativas",
      (!le.ok || le.rowCount === 0) && !grava.ok,
      `leitura ${descrever(le)}; gravação ${descrever(grava)}`
    );
  });

  await cenario(db, async (c) => {
    await c.como("service_role");
    const respostas = [];
    for (let i = 1; i <= LIMITE + 1; i++) {
      const r = await c.tentar(chamar, [IP, JANELA, LIMITE]);
      respostas.push(r.ok ? r.rows[0] : { erro: descrever(r) });
    }
    const passaram = respostas.slice(0, LIMITE).every((r) => r.permitido === true);
    const bloqueou = respostas[LIMITE]?.permitido === false;
    registrar(
      `limite 3. servidor: ${LIMITE} tentativas passam e a ${LIMITE + 1}ª é bloqueada`,
      passaram && bloqueou,
      respostas.map((r, i) => `${i + 1}ª: ${r.erro ?? (r.permitido ? "passa" : "BLOQUEADA")}`).join(", ")
    );

    const outroIp = await c.tentar(chamar, ["prova-outro-ip", JANELA, LIMITE]);
    registrar("limite 4. o bloqueio de um IP não afeta outro IP", outroIp.ok && outroIp.rows[0].permitido === true, descrever(outroIp));

    await c.dono();
    await c.q("update public.pedidos_rate_limit set janela_inicio = now() - make_interval(secs => $2 + 1) where ip = $1", [IP, JANELA]);
    await c.como("service_role");
    const depois = await c.tentar(chamar, [IP, JANELA, LIMITE]);
    registrar(
      "limite 5. passada a janela, o contador do IP recomeça",
      depois.ok && depois.rows[0].permitido === true && depois.rows[0].contagem === 1,
      depois.ok ? `contagem ${depois.rows[0].contagem}, permitido ${depois.rows[0].permitido}` : descrever(depois)
    );
  });
});
