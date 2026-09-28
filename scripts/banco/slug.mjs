// Slug do produto (URL amigável), numa transação desfeita — nada é
// gravado. Prova a regra (casos de borda), a colisão (-2, -3), o cadastro
// no formato do admin (sem slug), a edição e a renomeação mantendo o slug
// (inclusive a cascata do Cento), a troca de slug recusada, o slug enviado
// (só para restaurar backup), as permissões das funções e a ordem dos
// gatilhos de edição.
//
// Precisa da etapa 1 no banco: antes de aplicá-la, rode com
//   node scripts/banco/slug.mjs --com-migracao=supabase/produtos-slug.sql
// Depois de aplicada, rode sem.
//
// A etapa 2 (supabase/produtos-slug-obrigatorio.sql), a preservação do
// atualizado_em dos produtos existentes e o SQL de desfazer ficam em
// scripts/banco/slug-migracao.mjs.

import { cenario, descrever, emTransacaoDesfeita, registrar, SEM_PERMISSAO } from "./lib.mjs";

const VIOLOU_CHECK = "23514";
const VIOLOU_UNICO = "23505";

// Casos de borda da regra: [nome, slug esperado].
const CASOS_REGRA = [
  ["Pão de Mel Açucarado", "pao-de-mel-acucarado"],
  ["ÉCLAIR DE LIMÃO", "eclair-de-limao"],
  ["Crème Brûlée", "creme-brulee"],
  ["Jalapeño", "jalapeno"],
  ["áàâãä éèêë íìîï óòôõö úùûü ç ñ", "aaaaa-eeee-iiii-ooooo-uuuu-c-n"],
  ["ÁÀÂÃÄ ÉÈÊË ÍÌÎÏ ÓÒÔÕÖ ÚÙÛÜ Ç Ñ", "aaaaa-eeee-iiii-ooooo-uuuu-c-n"],
  ["Coca-cola 2L", "coca-cola-2l"],
  ["Suco de Laranja Natural (1L)", "suco-de-laranja-natural-1l"],
  ["Torta (fatia)", "torta-fatia"],
  ["Salgado 1/2 cento", "salgado-1-2-cento"],
  ["Bolo - Chocolate -- Ninho", "bolo-chocolate-ninho"],
  ["  Bolo    de   Pote  ", "bolo-de-pote"],
  ["-Bolo-", "bolo"],
  ["Bolo 🎂 de Aniversário", "bolo-de-aniversario"],
  ["!!!", "produto"],
  ["🎂🎉", "produto"],
  ["", "produto"],
  ["Brigadeiro Gourmet (unidade)", "brigadeiro-gourmet-unidade"],
  [
    "Bolo de chocolate com morango, ninho, nutella, brigadeiro, granulado e muito recheio cremoso extra especial",
    "bolo-de-chocolate-com-morango-ninho-nutella-brigadeiro-granulado-e-muito-recheio",
  ],
  // Corte em 80 caindo logo depois de um hífen: o hífen do fim sai.
  [`${"a".repeat(79)} b`, "a".repeat(79)],
];

const FUNCOES = [
  "public.produto_slug_base(text)",
  "public.produto_slug_livre(text)",
  "public.produtos_slug_no_cadastro()",
  "public.produtos_slug_imutavel()",
];

// Cadastro exatamente como o Salvar do admin (src/app/admin/produtos/actions.ts,
// igual na main e na lote): lista de colunas explícita, sem slug.
async function cadastrarComoAdmin(c, nome, { ativo = true } = {}) {
  return c.tentar(
    `insert into public.produtos
       (id, nome, preco, descricao, pedido_minimo, "Categoria", prazo_producao_dias, step_quantidade, destaque, ativo, tipo, image_url)
     values (gen_random_uuid(), $1, 10, null, 1, 'Doces', 1, 'livre', false, $2, 'normal', null)
     returning id, nome, slug`,
    [nome, ativo]
  );
}

async function slugDe(c, nome) {
  const { rows } = await c.q("select slug from public.produtos where nome = $1", [nome]);
  return rows[0]?.slug ?? null;
}

await emTransacaoDesfeita("Slug do produto — regra, gatilhos e permissões", async (db) => {
  const { rows: coluna } = await db.query(
    `select is_nullable from information_schema.columns
     where table_schema = 'public' and table_name = 'produtos' and column_name = 'slug'`
  );
  if (coluna.length === 0) {
    registrar("slug 0. etapa 1 presente no banco", false, "a coluna slug não existe: rode com --com-migracao=supabase/produtos-slug.sql");
    return;
  }

  // --- 1. regra ------------------------------------------------------
  const erradas = [];
  for (const [nome, esperado] of CASOS_REGRA) {
    const { rows } = await db.query("select public.produto_slug_base($1) s", [nome]);
    const ok = rows[0].s === esperado;
    if (!ok) erradas.push(`"${nome}" -> "${rows[0].s}" (esperado "${esperado}")`);
    console.log(`       ${ok ? "ok  " : "ERRO"} ${JSON.stringify(nome).padEnd(48).slice(0, 48)} -> ${rows[0].s}`);
  }
  registrar(`slug 1. regra: ${CASOS_REGRA.length} casos de borda (acentos, ç, ñ, maiúsculas, números, parênteses, barra, hífen, espaços, símbolos, emoji, nome longo)`, erradas.length === 0, erradas.join(" | ") || "todos iguais ao esperado");

  // --- 2. cadastro no formato do admin (logado), sem slug ------------
  await cenario(db, async (c) => {
    await c.como("authenticated");
    const r = await cadastrarComoAdmin(c, "PROVA Slug Ação");
    registrar(
      "slug 2. admin logado cadastra sem enviar slug e o banco gera (formato do admin antigo e do novo)",
      r.ok && r.rows[0].slug === "prova-slug-acao",
      r.ok ? `"${r.rows[0].nome}" -> ${r.rows[0].slug}` : descrever(r)
    );
    await c.como("service_role");
    const s = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA Carga Sem Slug', 1, 1) returning slug");
    registrar(
      "slug 3. chave de serviço (script de carga) cadastra sem slug e lê o slug gerado",
      s.ok && s.rows[0].slug === "prova-carga-sem-slug",
      s.ok ? `slug lido depois de gravar: ${s.rows[0].slug}` : descrever(s)
    );
  });

  // --- 3. colisão -2, -3, contra produto inativo ---------------------
  await cenario(db, async (c) => {
    await c.como("authenticated");
    const a = await cadastrarComoAdmin(c, "PROVA Colisão Slug", { ativo: false });
    const b = await cadastrarComoAdmin(c, "PROVA COLISÃO SLUG");
    const d = await cadastrarComoAdmin(c, "Prova colisao slug!");
    const slugs = [a, b, d].map((r) => (r.ok ? r.rows[0].slug : descrever(r)));
    registrar(
      "slug 4. colisão: o primeiro (inativo) fica com a base, os seguintes ganham -2 e -3",
      slugs.join(",") === "prova-colisao-slug,prova-colisao-slug-2,prova-colisao-slug-3",
      slugs.join(" | ")
    );
  });

  // Prova pedida com os nomes reais: "Coxinha de frango" (inativa em
  // produção) já tem coxinha-de-frango.
  await cenario(db, async (c) => {
    const { rows: base } = await c.q("select nome, ativo from public.produtos where slug = 'coxinha-de-frango'");
    const { rows: livres } = await c.q("select count(*)::int n from public.produtos where slug in ('coxinha-de-frango-2', 'coxinha-de-frango-3')");
    if (base.length === 0 || livres[0].n > 0) {
      console.log("\n[----] slug 5. pulado: o banco não tem mais coxinha-de-frango livre de -2/-3 (o slug 4 cobre a regra)");
      return;
    }
    await c.como("authenticated");
    const b = await cadastrarComoAdmin(c, "COXINHA DE FRANGO");
    const d = await cadastrarComoAdmin(c, "Coxinha de frango!");
    registrar(
      `slug 5. "COXINHA DE FRANGO" e "Coxinha de frango!" com "${base[0].nome}" (${base[0].ativo ? "ativo" : "inativo"}) já no banco`,
      b.ok && d.ok && b.rows[0].slug === "coxinha-de-frango-2" && d.rows[0].slug === "coxinha-de-frango-3",
      `${b.ok ? b.rows[0].slug : descrever(b)} | ${d.ok ? d.rows[0].slug : descrever(d)}`
    );
  });

  // --- 4. edição e renomeação mantêm o slug --------------------------
  await cenario(db, async (c) => {
    await c.q("insert into public.produtos (nome, preco, pedido_minimo, atualizado_em) values ('PROVA Renomear', 1, 1, '2000-01-01')");
    await c.como("authenticated");
    // Edição no formato do admin (updateProduto): colunas explícitas, sem slug.
    const edita = await c.tentar(
      `update public.produtos set nome = 'PROVA Renomeado 2', preco = 12, descricao = 'x', pedido_minimo = 1, "Categoria" = 'Doces',
         prazo_producao_dias = 1, step_quantidade = 'livre', destaque = true, ativo = true, tipo = 'normal'
       where nome = 'PROVA Renomear'`
    );
    const ativo = await c.tentar("update public.produtos set ativo = false where nome = 'PROVA Renomeado 2'");
    await c.dono();
    const { rows } = await c.q("select slug, atualizado_em > '2000-01-02' editado from public.produtos where nome = 'PROVA Renomeado 2'");
    registrar(
      "slug 6. editar e renomear pelo admin mantém o slug (e o atualizado_em continua andando na edição)",
      edita.ok && ativo.ok && rows[0]?.slug === "prova-renomear" && rows[0]?.editado === true,
      `edição ${descrever(edita)}; toggle ativo ${descrever(ativo)}; slug depois: ${rows[0]?.slug}; atualizado_em mudou: ${rows[0]?.editado}`
    );
  });

  // --- 5. Cento: renomear um sabor mantém a cascata e o slug ---------
  await cenario(db, async (c) => {
    await c.q(
      `insert into public.produtos (nome, preco, pedido_minimo, tipo, atualizado_em) values
         ('PROVA Sabor', 1, 1, 'normal', '2000-01-01'), ('PROVA Cento', 1, 1, 'cento', '2000-01-01')`
    );
    await c.q("insert into public.produto_cento_itens (cento_nome, subitem_nome, ordem) values ('PROVA Cento', 'PROVA Sabor', 0)");
    const { rows: antes } = await c.q("select nome, slug, atualizado_em from public.produtos where nome in ('PROVA Sabor', 'PROVA Cento') order by nome");
    await c.como("authenticated");
    const r = await c.tentar("update public.produtos set nome = 'PROVA Sabor Novo' where nome = 'PROVA Sabor'");
    await c.dono();
    const { rows: itens } = await c.q("select subitem_nome from public.produto_cento_itens where cento_nome = 'PROVA Cento'");
    const sabor = await slugDe(c, "PROVA Sabor Novo");
    const { rows: cento } = await c.q("select slug, atualizado_em from public.produtos where nome = 'PROVA Cento'");
    const centoAntes = antes.find((p) => p.nome === "PROVA Cento");
    registrar(
      "slug 7. renomear um sabor: a cascata leva o nome novo ao Cento, o slug do sabor não muda e o Cento não é tocado",
      r.ok &&
        itens.length === 1 &&
        itens[0].subitem_nome === "PROVA Sabor Novo" &&
        sabor === "prova-sabor" &&
        cento[0].slug === centoAntes.slug &&
        cento[0].atualizado_em.getTime() === centoAntes.atualizado_em.getTime(),
      `update ${descrever(r)}; item do Cento: ${itens.map((i) => i.subitem_nome).join(",")}; slug do sabor: ${sabor}; Cento: ${cento[0].slug}, atualizado_em igual: ${cento[0].atualizado_em.getTime() === centoAntes.atualizado_em.getTime()}`
    );
  });

  // --- 6. troca direta de slug recusada, para qualquer papel ----------
  await cenario(db, async (c) => {
    await c.q("insert into public.produtos (nome, preco, pedido_minimo) values ('PROVA Trava', 1, 1)");
    const tentativas = [];
    for (const papel of ["authenticated", "service_role", null]) {
      if (papel) await c.como(papel);
      else await c.dono();
      const r = await c.tentar("update public.produtos set slug = 'outro-endereco' where nome = 'PROVA Trava'");
      const nulo = await c.tentar("update public.produtos set slug = null where nome = 'PROVA Trava'");
      tentativas.push({ papel: papel ?? "dono (postgres)", r, nulo });
    }
    await c.dono();
    const slug = await slugDe(c, "PROVA Trava");
    registrar(
      "slug 8. trocar ou apagar o slug é recusado com erro claro (logado, chave de serviço e dono)",
      tentativas.every((t) => !t.r.ok && t.r.code === VIOLOU_CHECK && !t.nulo.ok && t.nulo.code === VIOLOU_CHECK) && slug === "prova-trava",
      tentativas.map((t) => `${t.papel}: ${descrever(t.r)}`).join(" | ") + ` | slug continua: ${slug}`
    );
  });

  // --- 7. slug enviado no cadastro (só restauração de backup) --------
  await cenario(db, async (c) => {
    await c.como("service_role");
    const valido = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, slug) values ('PROVA Restaurado', 1, 1, 'endereco-original-9') returning slug");
    const repetido = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, slug) values ('PROVA Restaurado 2', 1, 1, 'endereco-original-9')");
    const invalido = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, slug) values ('PROVA Restaurado 3', 1, 1, 'Endereço Inválido')");
    const vazio = await c.tentar("insert into public.produtos (nome, preco, pedido_minimo, slug) values ('PROVA Vazio', 1, 1, '') returning slug");
    registrar(
      "slug 9. slug enviado: aceito se válido e livre (restauração de backup); repetido e fora do formato recusados; vazio é gerado",
      valido.ok && valido.rows[0].slug === "endereco-original-9" &&
        !repetido.ok && repetido.code === VIOLOU_UNICO &&
        !invalido.ok && invalido.code === VIOLOU_CHECK &&
        vazio.ok && vazio.rows[0].slug === "prova-vazio",
      `válido ${valido.ok ? valido.rows[0].slug : descrever(valido)}; repetido ${descrever(repetido)}; inválido ${descrever(invalido)}; vazio -> ${vazio.ok ? vazio.rows[0].slug : descrever(vazio)}`
    );
  });

  // --- 8. permissões das funções ---------------------------------------
  const { rows: privs } = await db.query(
    `select f, has_function_privilege('anon', f, 'EXECUTE') anon, has_function_privilege('authenticated', f, 'EXECUTE') logado
     from unnest($1::text[]) f`,
    [FUNCOES]
  );
  registrar(
    "slug 10. nenhuma das 4 funções é executável pelo anônimo nem pelo logado",
    privs.every((p) => !p.anon && !p.logado),
    privs.map((p) => `${p.f}: anon ${p.anon ? "executa" : "não"}, logado ${p.logado ? "executa" : "não"}`).join("; ")
  );
  await cenario(db, async (c) => {
    await c.como("anon");
    const base = await c.tentar("select public.produto_slug_base('x')");
    const livre = await c.tentar("select public.produto_slug_livre('x')");
    await c.como("authenticated");
    const logado = await c.tentar("select public.produto_slug_livre('x')");
    registrar(
      "slug 11. anônimo e logado chamando as funções direto: recusado",
      [base, livre, logado].every((r) => !r.ok && r.code === SEM_PERMISSAO),
      `anon base ${descrever(base)}; anon livre ${descrever(livre)}; logado livre ${descrever(logado)}`
    );
  });
  const { rows: seg } = await db.query(
    `select proname, prosecdef from pg_proc where oid = any(array[${FUNCOES.map((f) => `'${f}'::regprocedure`).join(",")}]) order by proname`
  );
  registrar(
    "slug 12. só o gatilho de cadastro é SECURITY DEFINER (busca de colisão enxerga todos os produtos)",
    seg.every((f) => f.prosecdef === (f.proname === "produtos_slug_no_cadastro")),
    seg.map((f) => `${f.proname}: ${f.prosecdef ? "DEFINER" : "INVOKER"}`).join("; ")
  );

  // --- 9. ordem dos gatilhos de edição --------------------------------
  // O Postgres roda gatilhos do mesmo momento em ordem alfabética de nome.
  // Na etapa 1, produtos_slug_imutavel precisa rodar DEPOIS de
  // produtos_set_atualizado_em (devolve o atualizado_em antigo no
  // preenchimento). Se alguém renomear ou acrescentar um gatilho BEFORE
  // UPDATE, este teste falha.
  const { rows: gatilhos } = await db.query(
    `select tgname from pg_trigger
     where tgrelid = 'public.produtos'::regclass and not tgisinternal
       and (tgtype & 2) = 2 and (tgtype & 16) = 16 and (tgtype & 1) = 1
     order by tgname collate "C"`
  );
  const ordem = gatilhos.map((g) => g.tgname).join(" -> ");
  registrar(
    "slug 13. gatilhos de edição, na ordem em que rodam: produtos_set_atualizado_em -> produtos_slug_imutavel",
    ordem === "produtos_set_atualizado_em -> produtos_slug_imutavel",
    ordem
  );

  // --- 10. preenchimento (vazio -> preenchido) não conta como edição --
  // Só existe na etapa 1 (a etapa 2 torna o slug obrigatório).
  if (coluna[0].is_nullable === "YES") {
    await cenario(db, async (c) => {
      // Produto sem slug, como os 15 antes do preenchimento: o gatilho de
      // cadastro fica desligado só dentro deste cenário desfeito.
      await c.q("alter table public.produtos disable trigger produtos_slug_no_cadastro");
      await c.q("insert into public.produtos (nome, preco, pedido_minimo, atualizado_em) values ('PROVA Sem Slug', 1, 1, '2001-02-03 04:05:06+00')");
      await c.q("alter table public.produtos enable trigger produtos_slug_no_cadastro");
      await c.q("update public.produtos set slug = public.produto_slug_livre(nome) where nome = 'PROVA Sem Slug'");
      const { rows: p } = await c.q("select slug, atualizado_em from public.produtos where nome = 'PROVA Sem Slug'");
      await c.q("update public.produtos set preco = 2 where nome = 'PROVA Sem Slug'");
      const { rows: e } = await c.q("select atualizado_em from public.produtos where nome = 'PROVA Sem Slug'");
      registrar(
        "slug 14. preencher o slug vazio mantém o atualizado_em; uma edição de verdade depois atualiza",
        p[0].slug === "prova-sem-slug" && p[0].atualizado_em.toISOString() === "2001-02-03T04:05:06.000Z" && e[0].atualizado_em.toISOString() !== "2001-02-03T04:05:06.000Z",
        `slug ${p[0].slug}; atualizado_em depois de preencher: ${p[0].atualizado_em.toISOString()}; depois de editar: ${e[0].atualizado_em.toISOString()}`
      );
    });
  } else {
    console.log("\n[----] slug 14. pulado: etapa 2 aplicada (slug obrigatório, sem preenchimento)");
  }
});
