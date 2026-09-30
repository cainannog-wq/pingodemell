// Gravação de pedido pelo site (supabase/pedidos-gravacao.sql, PR
// confirmacao-e-gravacao), numa transação desfeita — nada é gravado.
//
// Prova:
//   - anônimo e logado não executam criar_pedido nem
//     registrar_tentativa_pedido_v2, e não alcançam pedidos_gravacao;
//   - as duas funções são SECURITY DEFINER com search_path fixo;
//   - a função REAL, com o interruptor desligado, não grava nem conta nada
//     (e o contador de número de pedido não anda);
//   - o resto (gravar, chave repetida, limite, teste, totais do gatilho) roda
//     numa CÓPIA da função sobre uma CÓPIA da tabela, criadas dentro da
//     transação: um insert na tabela real gastaria número de pedido mesmo
//     desfeito. A cópia sai do texto da função que está no banco (a de
//     produção, ou a da migração com --com-migracao), só com o nome da
//     tabela trocado;
//   - a trava por chave: duas conexões com a mesma chave não entram juntas.
//
// Uso: node scripts/banco/gravacao-pedidos.mjs [--com-migracao=supabase/pedidos-gravacao.sql]

import { readFileSync } from "node:fs";
import path from "node:path";
import { cenario, conectar, descrever, emTransacaoDesfeita, raiz, registrar, SEM_PERMISSAO } from "./lib.mjs";

const fixtura = JSON.parse(readFileSync(path.join(raiz, "src", "lib", "pedidos", "fixtura-valores.json"), "utf8"));
const rota = readFileSync(path.join(raiz, "src", "app", "api", "pedidos", "route.ts"), "utf8");
const JANELA = rota
  .match(/const JANELA_SEGUNDOS = ([\d\s*]+);/)[1]
  .split("*")
  .reduce((total, fator) => total * Number(fator.trim()), 1);
const LIMITE = Number(rota.match(/const LIMITE_POR_JANELA = (\d+)/)[1]);

const ASSINATURA = "public.criar_pedido(text, uuid, jsonb, boolean, text, integer, integer)";
const ASSINATURA_V2 = "public.registrar_tentativa_pedido_v2(text, integer, integer)";

// Itens como a rota grava (src/lib/pedidos/validacao.ts): quantidade e
// preço da linha do carrinho, sem conversão (Bolo em kg, Cento em centos).
const ITENS = fixtura.linhas.map((l) => ({
  nome: l.nome,
  variacao: null,
  quantidade: l.quantidade,
  preco_unitario: l.preco,
  produto_id: l.produtoId,
  tipo: l.tipo,
  observacao: l.observacao,
}));
function pedido(sobrescrever = {}) {
  return {
    cliente_nome: "PROVA_TRANSACAO_DESFEITA",
    cliente_whatsapp: "(41) 90000-0000",
    cliente_email: null,
    ocasiao: null,
    modo_entrega: "entrega",
    endereco: "Rua da Prova, 1, Centro, Cidade",
    data_hora_entrega: new Date(Date.now() + 5 * 86400000).toISOString(),
    forma_pagamento: "Pix",
    observacoes: null,
    itens: ITENS,
    ...sobrescrever,
  };
}
let seqChave = 0;
const novaChave = () => `00000000-0000-4000-8000-${String(++seqChave).padStart(12, "0")}`;

const CAMPOS = "r_situacao, r_numero, r_subtotal::float, r_total::float, r_retry_segundos, r_itens";
function chamada(funcao) {
  return `select ${CAMPOS} from ${funcao}($1, $2::uuid, $3::jsonb, $4, $5, $6, $7)`;
}
const args = (contexto, chave, corpo, teste, ip) => [contexto, chave, JSON.stringify(corpo), teste, ip, JANELA, LIMITE];

await emTransacaoDesfeita(`Gravação de pedido pelo site — criar_pedido (limite ${LIMITE} por IP a cada ${JANELA}s)`, async (db) => {
  // --- permissões ------------------------------------------------------
  for (const papel of ["anon", "authenticated"]) {
    await cenario(db, async (c) => {
      const { rows } = await c.q(
        `select has_function_privilege($1, '${ASSINATURA}', 'EXECUTE') criar,
                has_function_privilege($1, '${ASSINATURA_V2}', 'EXECUTE') v2,
                has_table_privilege($1, 'public.pedidos_gravacao', 'SELECT') le,
                has_table_privilege($1, 'public.pedidos_gravacao', 'UPDATE') altera,
                has_table_privilege($1, 'public.pedidos_gravacao', 'TRUNCATE') trunca`,
        [papel]
      );
      const p = rows[0];
      await c.como(papel);
      // Seguro: sem permissão, a recusa vem antes de a função rodar.
      const t1 = await c.tentar(chamada("public.criar_pedido"), args("fora_producao", novaChave(), pedido(), true, "prova"));
      const t2 = await c.tentar(`select * from ${ASSINATURA_V2.replace("(text, integer, integer)", "")}($1, $2, $3)`, ["prova", JANELA, LIMITE]);
      const t3 = await c.tentar("select * from public.pedidos_gravacao");
      const nome = papel === "anon" ? "anônimo" : "logado";
      registrar(
        `gravação 1. ${nome} NÃO executa criar_pedido nem registrar_tentativa_pedido_v2 e não alcança pedidos_gravacao`,
        !p.criar && !p.v2 && !p.le && !p.altera && !p.trunca &&
          t1.code === SEM_PERMISSAO && t2.code === SEM_PERMISSAO && t3.code === SEM_PERMISSAO,
        `criar_pedido: ${descrever(t1)}; v2: ${descrever(t2)}; pedidos_gravacao: ${descrever(t3)}`
      );
    });
  }

  const { rows: defs } = await db.query(
    `select p.proname, p.prosecdef, p.proconfig, has_function_privilege('service_role', p.oid, 'EXECUTE') servico
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname in ('criar_pedido', 'registrar_tentativa_pedido_v2') order by 1`
  );
  registrar(
    "gravação 2. criar_pedido e registrar_tentativa_pedido_v2: SECURITY DEFINER, search_path fixo, só a chave de serviço executa",
    defs.length === 2 && defs.every((f) => f.prosecdef && (f.proconfig ?? []).includes("search_path=\"\"") && f.servico),
    defs.map((f) => `${f.proname}: definer ${f.prosecdef}, ${JSON.stringify(f.proconfig)}, service_role ${f.servico}`).join("; ")
  );

  const { rows: estado } = await db.query("select contexto, ligada from public.pedidos_gravacao order by 1");
  registrar(
    "gravação 3. interruptor com as duas linhas (produção e demais ambientes)",
    estado.length === 2,
    `estado atual: ${estado.map((e) => `${e.contexto} ${e.ligada ? "LIGADA" : "desligada"}`).join(", ")}`
  );

  // --- função REAL com o interruptor desligado ------------------------
  await cenario(db, async (c) => {
    await c.q("update public.pedidos_gravacao set ligada = false");
    const { rows: antes } = await c.q("select last_value from public.pedidos_numero_seq");
    await c.como("service_role");
    const r1 = await c.tentar(chamada("public.criar_pedido"), args("producao", novaChave(), pedido(), false, "prova-desligado"));
    const r2 = await c.tentar(chamada("public.criar_pedido"), args("fora_producao", novaChave(), pedido(), true, "prova-desligado"));
    await c.dono();
    const { rows: depois } = await c.q("select last_value from public.pedidos_numero_seq");
    const { rows: tentativas } = await c.q("select count(*)::int n from public.pedidos_rate_limit where ip = 'prova-desligado'");
    registrar(
      "gravação 4. função real, interruptor desligado: 'desligado' nos dois ambientes, nada gravado nem contado, contador do número parado",
      r1.rows?.[0]?.r_situacao === "desligado" && r2.rows?.[0]?.r_situacao === "desligado" &&
        String(antes[0].last_value) === String(depois[0].last_value) && tentativas[0].n === 0,
      `produção: ${r1.rows?.[0]?.r_situacao ?? descrever(r1)}; demais: ${r2.rows?.[0]?.r_situacao ?? descrever(r2)}; contador ${antes[0].last_value} -> ${depois[0].last_value}; tentativas contadas: ${tentativas[0].n}`
    );
  });

  // --- cópia da função sobre cópia da tabela ---------------------------
  await cenario(db, async (c) => {
    await c.q("create table public.zz_prova_pedidos (like public.pedidos including all)");
    await c.q(`create trigger trg_pedidos_recalcular_totais before insert on public.zz_prova_pedidos
               for each row execute function public.pedidos_recalcular_totais()`);
    const { rows: fonte } = await c.q(`select pg_get_functiondef('${ASSINATURA}'::regprocedure) def`);
    const copia = fonte[0].def
      .replace("public.criar_pedido(", "public.zz_prova_criar_pedido(")
      .replace(/public\.pedidos(?![_\w])/g, "public.zz_prova_pedidos");
    if (/public\.pedidos(?![_\w])/.test(copia)) throw new Error("a cópia ainda aponta para a tabela real");
    await c.q(copia);
    await c.q("grant execute on function public.zz_prova_criar_pedido(text, uuid, jsonb, boolean, text, integer, integer) to service_role");
    await c.q("update public.pedidos_gravacao set ligada = true where contexto = 'fora_producao'");
    const f = chamada("public.zz_prova_criar_pedido");
    const linhas = async () => (await c.q("select count(*)::int n from public.zz_prova_pedidos")).rows[0].n;
    const contagem = async (ip) => (await c.q("select contagem from public.pedidos_rate_limit where ip = $1", [ip])).rows[0]?.contagem ?? 0;

    await c.como("service_role");
    const chave = novaChave();
    const r1 = await c.tentar(f, args("fora_producao", chave, pedido(), true, "prova-ip-1"));
    const g1 = r1.rows?.[0];
    await c.dono();
    const { rows: gravada } = await c.q("select status, valor_entrega::float, subtotal::float, total::float, teste, chave_idempotencia from public.zz_prova_pedidos");
    const esperado = fixtura.totalCentavos / 100;
    registrar(
      "gravação 5. grava: status inicial aguardando_confirmacao, entrega 0 ('a combinar'), teste = verdadeiro, chave guardada",
      g1?.r_situacao === "criado" && gravada[0]?.status === "aguardando_confirmacao" && gravada[0]?.valor_entrega === 0 &&
        gravada[0]?.teste === true && gravada[0]?.chave_idempotencia === chave,
      g1 ? `${g1.r_situacao}, número ${g1.r_numero} (contador da cópia); ${JSON.stringify(gravada[0])}` : descrever(r1)
    );
    const valoresDoBanco = (g1?.r_itens ?? []).map((i) => Math.round(Number(i.preco_unitario) * 100) * Number(i.quantidade));
    registrar(
      "gravação 6. conferência de valores (7g): total do gatilho = total da fixtura (navegador e rota), linha a linha, nos cinco tipos",
      gravada[0]?.subtotal === esperado && gravada[0]?.total === esperado && g1?.r_total === esperado &&
        valoresDoBanco.every((v, i) => v === fixtura.linhas[i].valorCentavos),
      `gatilho: subtotal ${gravada[0]?.subtotal}, total ${gravada[0]?.total}; esperado ${esperado}; linhas ${valoresDoBanco.join(", ")}`
    );

    await c.como("service_role");
    const r2 = await c.tentar(f, args("fora_producao", chave, pedido({ observacoes: "corpo diferente", itens: ITENS.slice(0, 1) }), true, "prova-ip-1"));
    await c.dono();
    registrar(
      "gravação 7. mesma chave com corpo diferente: devolve o MESMO pedido ('existente'), não grava outro e não conta no limite",
      r2.rows?.[0]?.r_situacao === "existente" && r2.rows[0].r_numero === g1?.r_numero && (await linhas()) === 1 && (await contagem("prova-ip-1")) === 1,
      `${r2.rows?.[0]?.r_situacao ?? descrever(r2)}, número ${r2.rows?.[0]?.r_numero}; linhas ${await linhas()}; tentativas do IP ${await contagem("prova-ip-1")}; itens devolvidos ${r2.rows?.[0]?.r_itens?.length}`
    );

    const direto = await c.tentar(
      `insert into public.zz_prova_pedidos (cliente_nome, cliente_whatsapp, modo_entrega, data_hora_entrega, forma_pagamento, itens, subtotal, total, chave_idempotencia)
       values ('x', 'x', 'retirada', now(), 'Pix', '[{"nome":"x","quantidade":1,"preco_unitario":1}]', 1, 1, $1)`,
      [chave]
    );
    registrar("gravação 8. índice único: a mesma chave não entra duas vezes nem por insert direto", !direto.ok && direto.code === "23505", descrever(direto));

    await c.como("service_role");
    const r3 = await c.tentar(f, args("fora_producao", novaChave(), pedido(), false, "prova-ip-2"));
    const r4 = await c.tentar(f, args("fora_producao", novaChave(), pedido(), null, "prova-ip-2"));
    await c.dono();
    const { rows: flags } = await c.q("select teste from public.zz_prova_pedidos order by numero");
    registrar(
      "gravação 9. p_teste falso grava teste = falso; nulo conta como teste (lado seguro)",
      r3.rows?.[0]?.r_situacao === "criado" && r4.rows?.[0]?.r_situacao === "criado" && flags.map((x) => x.teste).join() === "true,false,true",
      `teste por pedido: ${flags.map((x) => x.teste).join(", ")}`
    );

    await c.como("service_role");
    const respostas = [];
    for (let i = 1; i <= LIMITE + 1; i++) {
      const r = await c.tentar(f, args("fora_producao", novaChave(), pedido(), true, "prova-ip-3"));
      respostas.push(r.rows?.[0] ?? { r_situacao: descrever(r) });
    }
    await c.dono();
    const bloqueio = respostas[LIMITE];
    registrar(
      `gravação 10. limite: ${LIMITE} pedidos gravam, o ${LIMITE + 1}º é 'bloqueado' com a espera em segundos e não grava`,
      respostas.slice(0, LIMITE).every((r) => r.r_situacao === "criado") && bloqueio.r_situacao === "bloqueado" &&
        bloqueio.r_retry_segundos > 0 && bloqueio.r_retry_segundos <= JANELA && (await linhas()) === 3 + LIMITE,
      respostas.map((r, i) => `${i + 1}º ${r.r_situacao}${r.r_retry_segundos ? ` (${r.r_retry_segundos}s)` : ""}`).join(", ")
    );

    await c.q("delete from public.pedidos_gravacao where contexto = 'fora_producao'");
    await c.como("service_role");
    const r5 = await c.tentar(f, args("fora_producao", novaChave(), pedido(), true, "prova-ip-4"));
    const r6 = await c.tentar(f, args("qualquer", novaChave(), pedido(), true, "prova-ip-4"));
    await c.dono();
    registrar(
      "gravação 11. linha do interruptor ausente (ou ambiente desconhecido) conta como desligado: nada gravado nem contado",
      r5.rows?.[0]?.r_situacao === "desligado" && r6.rows?.[0]?.r_situacao === "desligado" && (await contagem("prova-ip-4")) === 0 && (await linhas()) === 3 + LIMITE,
      `sem linha: ${r5.rows?.[0]?.r_situacao ?? descrever(r5)}; ambiente desconhecido: ${r6.rows?.[0]?.r_situacao ?? descrever(r6)}`
    );
  });

  // --- trava por chave: duas conexões ----------------------------------
  // A trava da função é pg_advisory_xact_lock(hashtextextended('criar_pedido:' || chave, 0)).
  // Com esta transação segurando a trava de uma chave, outra conexão não a
  // obtém (esperaria esta terminar); outra chave passa. Nada é gravado: a
  // trava some com o rollback do fim.
  const outra = await conectar();
  try {
    const chave = "00000000-0000-4000-8000-00000000aaaa";
    const trava = "hashtextextended('criar_pedido:' || $1, 0)";
    const { rows: def } = await db.query(
      `select pg_get_functiondef('${ASSINATURA}'::regprocedure) like '%pg_advisory_xact_lock(hashtextextended(''criar_pedido:''%' ok`
    );
    await db.query(`select pg_advisory_xact_lock(${trava})`, [chave]);
    const mesma = (await outra.query(`select pg_try_advisory_lock(${trava}) ok`, [chave])).rows[0].ok;
    const diferente = (await outra.query(`select pg_try_advisory_lock(${trava}) ok`, ["00000000-0000-4000-8000-00000000bbbb"])).rows[0].ok;
    await outra.query("select pg_advisory_unlock_all()");
    registrar(
      "gravação 12. trava por chave: com uma chamada em andamento, a segunda com a MESMA chave espera; outra chave passa",
      def[0].ok && mesma === false && diferente === true,
      `função usa a trava: ${def[0].ok}; mesma chave obtida pela 2ª conexão: ${mesma}; outra chave: ${diferente}`
    );
  } finally {
    await outra.end();
  }
});
