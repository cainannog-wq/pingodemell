// Inventário do que cada papel da API alcança, comparado com o esperado,
// numa transação desfeita — nada é gravado. Complementa os scripts por
// tabela: aqui a conferência é pelo catálogo do Postgres, tabela por tabela
// e função por função, e pega objeto novo que ninguém lembrou de proteger.
//
// Também repete, com as mesmas regras, os alertas de segurança do
// verificador da Supabase que dependem só do banco (0008, 0011, 0013,
// 0028, 0029). Com --com-migracao=<arquivo.sql>, isso mostra como o
// verificador vai ficar depois de aplicar a migração; o verificador de
// verdade só enxerga o que já está em produção.
//
// Tabela ou função nova em public que não esteja listada aqui faz o teste
// falhar de propósito: quem cria o objeto decide e registra o esperado.
//
// Uso: node scripts/banco/permissoes.mjs [--com-migracao=<arquivo.sql>]

import { cenario, emTransacaoDesfeita, pular, registrar } from "./lib.mjs";
import { estadoPermissoesPedidos } from "./estado-permissoes-pedidos.mjs";

const SIUD = "SIUD";
const TABELAS = {
  // tabela:            [anon, authenticated]
  produtos: ["S", SIUD],
  produto_fotos: ["S", SIUD],
  produto_cento_itens: ["S", SIUD],
  recheios: ["S", SIUD],
  dias_off: ["S", SIUD],
  segunda_reaberturas: ["S", SIUD],
  // Logado: lê e muda só o status (supabase/pedidos-permissoes.sql). Antes
  // dela: "SUD" na tabela inteira (ESPERADO_ANTES abaixo).
  pedidos: ["", "S"],
  pedidos_rate_limit: ["", ""],
  // Interruptor da gravação (supabase/pedidos-gravacao.sql): só a chave de serviço.
  pedidos_gravacao: ["", ""],
  heartbeat: ["", ""],
};

// Funções em public: quem, além do dono e da service_role, executa.
const FUNCOES = {
  salvar_produto_fotos: { anon: false, authenticated: true },
  // Removida por supabase/pedidos-permissoes.sql; fica aqui enquanto a
  // migração não for aplicada (permissões 3 confere a remoção).
  registrar_tentativa_pedido: { anon: false, authenticated: false },
  // Gravação de pedido pelo site (supabase/pedidos-gravacao.sql): só a chave de serviço.
  registrar_tentativa_pedido_v2: { anon: false, authenticated: false },
  criar_pedido: { anon: false, authenticated: false },
  rls_auto_enable: { anon: false, authenticated: false },
  produto_fotos_limite: { anon: false, authenticated: false },
  produtos_set_atualizado_em: { anon: false, authenticated: false },
  pedidos_recalcular_totais: { anon: false, authenticated: false },
  pedidos_set_status_atualizado_em: { anon: false, authenticated: false },
  // Catálogo de recheios (supabase/recheios-schema.sql): só gatilho.
  recheios_set_atualizado_em: { anon: false, authenticated: false },
  // Slug do produto (supabase/produtos-slug.sql): regra e gatilhos; ninguém
  // da API executa.
  produto_slug_base: { anon: false, authenticated: false },
  produto_slug_livre: { anon: false, authenticated: false },
  produtos_slug_no_cadastro: { anon: false, authenticated: false },
  produtos_slug_imutavel: { anon: false, authenticated: false },
};

// Sem política de propósito: só a chave de serviço acessa.
const RLS_SEM_POLITICA_ESPERADO = ["heartbeat", "pedidos_rate_limit", "pedidos_gravacao"];

// UPDATE só em algumas colunas (permissão por coluna, sem UPDATE na tabela),
// e sem REFERENCES nem TRIGGER na tabela.
const UPDATE_SO_EM = { pedidos: { authenticated: ["status"] } };

// Estado de antes de supabase/pedidos-permissoes.sql (testado só enquanto
// ela não está no banco; depois, a linha sai como "pulado").
const ESPERADO_ANTES = { pedidos: { authenticated: "SUD" } };

const PRIVS = { S: "SELECT", I: "INSERT", U: "UPDATE", D: "DELETE" };

await emTransacaoDesfeita("Permissões por papel e alertas do verificador", async (db) => {
  const { rows: tabelas } = await db.query(
    `select c.relname, c.relrowsecurity rls, r.papel,
       has_table_privilege(r.papel, c.oid, 'SELECT') s, has_table_privilege(r.papel, c.oid, 'INSERT') i,
       has_table_privilege(r.papel, c.oid, 'UPDATE') u, has_table_privilege(r.papel, c.oid, 'DELETE') d,
       has_table_privilege(r.papel, c.oid, 'TRUNCATE') t,
       has_any_column_privilege(r.papel, c.oid, 'INSERT') i_coluna,
       has_any_column_privilege(r.papel, c.oid, 'UPDATE') u_coluna,
       has_table_privilege(r.papel, c.oid, 'REFERENCES') x, has_table_privilege(r.papel, c.oid, 'TRIGGER') g,
       (select string_agg(a.attname, ',' order by a.attname) from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            and has_column_privilege(r.papel, c.oid, a.attname, 'UPDATE')) colunas_update
     from pg_class c join pg_namespace n on n.oid = c.relnamespace
     cross join (values ('anon'), ('authenticated')) r(papel)
     where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
     order by 1, 3`
  );

  const nomes = [...new Set(tabelas.map((t) => t.relname))];
  const desconhecidas = nomes.filter((n) => !(n in TABELAS));
  registrar(
    "permissões 1. toda tabela/view de public tem permissão esperada registrada neste teste",
    desconhecidas.length === 0,
    desconhecidas.length ? `sem registro: ${desconhecidas.join(", ")}` : `${nomes.length} tabelas: ${nomes.join(", ")}`
  );

  const pedidosAntes = (await estadoPermissoesPedidos(db)) === "antes";
  const mostrar = (letras) => (letras ? letras.split("").map((k) => PRIVS[k]).join(", ") : "nada");
  for (const [tabela, [esperadoAnon, esperadoLogado]] of Object.entries(TABELAS)) {
    for (const [papel, esperado] of [["anon", esperadoAnon], ["authenticated", esperadoLogado]]) {
      const t = tabelas.find((x) => x.relname === tabela && x.papel === papel);
      if (!t) {
        registrar(`permissões [${tabela}] ${papel}`, false, "tabela não encontrada");
        continue;
      }
      const tem = Object.keys(PRIVS).filter((k) => t[k.toLowerCase()]).join("");
      const antes = ESPERADO_ANTES[tabela]?.[papel];
      const soEm = UPDATE_SO_EM[tabela]?.[papel];

      if (antes !== undefined) {
        const nome = `permissões [${tabela}] ${papel}: ${mostrar(antes)} na tabela inteira, sem TRUNCATE (antes de pedidos-permissoes.sql)`;
        if (pedidosAntes) {
          const colunas = (!antes.includes("I") && t.i_coluna) || (!antes.includes("U") && t.u_coluna);
          registrar(nome, tem === antes && !t.t && !colunas, `tem: ${mostrar(tem)}${t.t ? " + TRUNCATE" : ""}${colunas ? " + permissão em colunas" : ""}`);
        } else {
          pular(nome, "pedidos-permissoes.sql já está no banco (aplicada ou por --com-migracao); simula o estado de antes dela");
        }
      }

      const nome =
        `permissões [${tabela}] ${papel}: ${mostrar(esperado)}${esperado ? "" : " (nenhuma permissão)"}` +
        `${soEm ? `, UPDATE só em ${soEm.join(", ")}, sem REFERENCES nem TRIGGER` : ""}, sem TRUNCATE`;
      if (antes !== undefined && pedidosAntes) {
        pular(nome, "pedidos-permissoes.sql não está no banco; rode com --com-migracao=supabase/pedidos-permissoes.sql");
        continue;
      }
      const colunasAceitas = soEm ? t.colunas_update === soEm.join(",") : !t.u_coluna || esperado.includes("U");
      const colunas = (!esperado.includes("I") && t.i_coluna) || !colunasAceitas;
      const extras = soEm ? t.x || t.g : false;
      registrar(
        nome,
        tem === esperado && !t.t && !colunas && !extras,
        `tem: ${mostrar(tem)}${t.t ? " + TRUNCATE" : ""}${t.colunas_update && !esperado.includes("U") ? ` + UPDATE nas colunas ${t.colunas_update}` : ""}` +
          `${soEm ? `; REFERENCES ${t.x ? "SIM" : "não"}, TRIGGER ${t.g ? "SIM" : "não"}` : ""}`
      );
    }
  }

  // Funções: tipo, search_path e quem executa.
  const { rows: funcoes } = await db.query(
    `select p.proname, p.prosecdef definer, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') authenticated,
       has_function_privilege('service_role', p.oid, 'EXECUTE') service_role
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and not exists (select 1 from pg_depend d where d.objid = p.oid and d.deptype = 'e')
     order by 1`
  );
  const funcoesDesconhecidas = funcoes.filter((f) => !(f.proname in FUNCOES)).map((f) => f.proname);
  registrar(
    "permissões 2. toda função de public tem permissão esperada registrada neste teste",
    funcoesDesconhecidas.length === 0,
    funcoesDesconhecidas.length ? `sem registro: ${funcoesDesconhecidas.join(", ")}` : `${funcoes.length} funções`
  );
  for (const f of funcoes) {
    const esperado = FUNCOES[f.proname];
    if (!esperado) continue;
    registrar(
      `permissões [${f.proname}()] anônimo ${esperado.anon ? "executa" : "não executa"}, logado ${esperado.authenticated ? "executa" : "não executa"}`,
      f.anon === esperado.anon && f.authenticated === esperado.authenticated,
      `anon: ${f.anon ? "executa" : "não"}; authenticated: ${f.authenticated ? "executa" : "não"}; service_role: ${f.service_role ? "executa" : "não"}`
    );
  }
  const registrar_ = funcoes.find((f) => f.proname === "registrar_tentativa_pedido");
  const v2 = funcoes.find((f) => f.proname === "registrar_tentativa_pedido_v2");
  if (pedidosAntes) {
    registrar(
      "permissões 3. servidor (service_role) executa registrar_tentativa_pedido (antes de pedidos-permissoes.sql)",
      registrar_?.service_role === true,
      `service_role: ${registrar_?.service_role}`
    );
    pular("permissões 3b. registrar_tentativa_pedido removida", "pedidos-permissoes.sql não está no banco; rode com --com-migracao=supabase/pedidos-permissoes.sql");
  } else {
    pular(
      "permissões 3. servidor (service_role) executa registrar_tentativa_pedido (antes de pedidos-permissoes.sql)",
      "pedidos-permissoes.sql já está no banco (aplicada ou por --com-migracao); simula o estado de antes dela"
    );
    registrar(
      "permissões 3b. registrar_tentativa_pedido removida; o servidor (service_role) executa registrar_tentativa_pedido_v2",
      !registrar_ && v2?.service_role === true,
      `antiga: ${registrar_ ? "EXISTE" : "removida"}; v2 pelo service_role: ${v2?.service_role}`
    );
  }

  const { rows: seq } = await db.query(
    `select has_sequence_privilege('anon', 'public.pedidos_numero_seq', 'USAGE') anon,
            has_sequence_privilege('authenticated', 'public.pedidos_numero_seq', 'USAGE') authenticated`
  );
  registrar("permissões 4. anônimo e logado não usam o contador de número de pedido", !seq[0].anon && !seq[0].authenticated, `anon: ${seq[0].anon}; authenticated: ${seq[0].authenticated}`);

  // Padrão para objetos novos (D5) e RLS automática em tabela nova.
  await cenario(db, async (c) => {
    await c.q("create function public.zz_prova_funcao_nova() returns int language sql set search_path = '' as 'select 1'");
    const { rows } = await c.q(
      `select has_function_privilege('anon', 'public.zz_prova_funcao_nova()', 'EXECUTE') anon,
              has_function_privilege('authenticated', 'public.zz_prova_funcao_nova()', 'EXECUTE') authenticated`
    );
    registrar(
      "permissões 5. função nova nasce sem permissão de execução para anônimo e logado",
      !rows[0].anon && !rows[0].authenticated,
      `anon: ${rows[0].anon ? "executa" : "não"}; authenticated: ${rows[0].authenticated ? "executa" : "não"}`
    );
  });
  await cenario(db, async (c) => {
    await c.q("create table public.zz_prova_tabela_nova (id int)");
    const { rows } = await c.q("select relrowsecurity from pg_class where oid = 'public.zz_prova_tabela_nova'::regclass");
    registrar("permissões 6. tabela nova nasce com RLS ligada (gatilho rls_auto_enable)", rows[0].relrowsecurity === true, `RLS: ${rows[0].relrowsecurity ? "ligada" : "DESLIGADA"}`);
  });

  // Schema privado (supabase/exclusao-dados.sql): fora da API. Nenhum papel
  // da API usa o schema, lê/grava tabela ou executa função dele, inclusive
  // objeto novo que alguém crie lá depois.
  {
    const { rows } = await db.query(
      `select r.papel, has_schema_privilege(r.papel, n.oid, 'USAGE') usa,
         (select string_agg(c.relname, ', ') from pg_class c where c.relnamespace = n.oid and c.relkind in ('r', 'p', 'v', 'm')
            and has_table_privilege(r.papel, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE')) tabelas,
         (select string_agg(p.proname, ', ') from pg_proc p where p.pronamespace = n.oid
            and has_function_privilege(r.papel, p.oid, 'EXECUTE')) funcoes
       from pg_namespace n cross join (values ('anon'), ('authenticated'), ('service_role')) r(papel)
       where n.nspname = 'privado' order by 1`
    );
    if (rows.length === 0) {
      console.log("\n(schema privado ainda não existe: supabase/exclusao-dados.sql não aplicada)");
    } else {
      const abertos = rows.filter((r) => r.usa || r.tabelas || r.funcoes);
      registrar(
        "permissões 9. schema privado: anon, authenticated e service_role não usam o schema, nem tabela, nem função",
        abertos.length === 0,
        rows.map((r) => `${r.papel}: schema ${r.usa ? "SIM" : "não"}, tabelas ${r.tabelas ?? "nenhuma"}, funções ${r.funcoes ?? "nenhuma"}`).join("; ")
      );
    }
  }

  // Storage: anônimo não tem política nenhuma em storage.objects.
  const { rows: storage } = await db.query(
    `select policyname, roles::text, cmd from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1`
  );
  const paraAnon = storage.filter((p) => /anon|public/.test(p.roles) || p.cmd === "SELECT");
  registrar(
    "permissões 7. storage: nenhuma política para anônimo nem de leitura (arquivos só pela URL pública do bucket)",
    paraAnon.length === 0,
    storage.map((p) => `${p.cmd} ${p.roles}`).join("; ")
  );

  // Alertas do verificador que dependem só do banco.
  const achados = [];
  for (const t of nomes) {
    const linha = tabelas.find((x) => x.relname === t);
    if (!linha.rls) achados.push(`ERROR 0013 RLS desligada: ${t}`);
  }
  const { rows: semPolitica } = await db.query(
    `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
       and not exists (select 1 from pg_policy p where p.polrelid = c.oid) order by 1`
  );
  for (const { relname } of semPolitica) {
    achados.push(`INFO 0008 RLS sem política: ${relname}${RLS_SEM_POLITICA_ESPERADO.includes(relname) ? " (intencional: só a chave de serviço)" : ""}`);
  }
  for (const f of funcoes) {
    if (!(f.proconfig ?? []).some((c) => c.startsWith("search_path="))) achados.push(`WARN 0011 search_path não fixo: ${f.proname}`);
    if (f.definer && f.anon) achados.push(`WARN 0028 DEFINER executável pelo anônimo: ${f.proname}`);
    if (f.definer && f.authenticated) achados.push(`WARN 0029 DEFINER executável pelo logado: ${f.proname}`);
  }
  const inesperados = achados.filter((a) => !a.includes("(intencional"));
  console.log("\nVerificador (regras de banco 0008/0011/0013/0028/0029):\n  " + (achados.join("\n  ") || "nenhum achado"));
  registrar(
    "permissões 8. verificador: só os alertas intencionais (RLS sem política em heartbeat, pedidos_rate_limit e pedidos_gravacao)",
    inesperados.length === 0,
    inesperados.length ? `inesperados: ${inesperados.join(" | ")}` : "ok"
  );
});
