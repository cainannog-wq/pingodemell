// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Teste de caracterização da visibilidade dos campos do produto.
//
// Escrito ANTES da refatoração da tabela única de campos
// (src/lib/produtos/campos.ts): registra, para cada uma das 14 combinações
// válidas de categoria e tipo, o que o código de hoje faz em três camadas:
//   - formulário: quais campos, rótulos, seções e textos aparecem (edição e
//     cadastro por interação) e o que ele envia;
//   - parser (parseProdutoForm): o que lê e o que devolve;
//   - actions (createProduto e updateProduto): quais colunas vão no INSERT
//     e no UPDATE, e se há chamada a recheios e a sabores do Cento.
// O instantâneo (__snapshots__) é o comportamento atual. A refatoração não
// pode mudá-lo: se este teste falhar depois dela, o código novo está errado,
// nunca o instantâneo.
//
// O Supabase é simulado: não prova gatilho, RLS, restrição, cast de enum nem
// NOT NULL, e o jsdom não é um navegador real.

const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";
const RECHEIO_ID = "300b5263-1a9a-4057-86ac-b5ca0f7c3dfa";

const chamadas = {
  insert: [] as Record<string, unknown>[],
  update: [] as Record<string, unknown>[],
  rpc: [] as { nome: string; args: Record<string, unknown> }[],
  centoDelete: [] as string[],
  centoInsert: [] as { cento_nome: string; subitem_nome: string; ordem: number }[][],
};

vi.mock("@/lib/supabase/dal", () => ({ requireAuth: vi.fn().mockResolvedValue({ id: "user-1" }) }));
vi.mock("@/lib/galeria/storage-servidor", () => ({
  verificarArquivosNovos: vi.fn(async () => null),
  limparArquivosSemLinha: vi.fn(async () => 0),
  apagarPastaDoProduto: vi.fn(async () => 0),
  criarEnviosAssinados: vi.fn(async () => []),
  criarEnvioCapa: vi.fn(),
  verificarCapaNova: vi.fn(async () => null),
  urlDaCapa: vi.fn(),
  limparPastaDaCapa: vi.fn(async () => 0),
  apagarCapaAntiga: vi.fn(async () => "sem-capa"),
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ storage: { from: () => ({ uploadToSignedUrl: vi.fn() }) } }),
}));
vi.mock("@/lib/galeria/reduzir", () => ({ reduzirFoto: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      if (tabela === "produtos") {
        return {
          // select("id, image_url") é a leitura do produto na edição; select("nome")
          // é a conferência de nome repetido (nada encontrado).
          select: (colunas: string) => ({
            eq: () => ({
              maybeSingle: async () => ({ data: colunas.startsWith("id") ? { id: ID, image_url: null } : null }),
            }),
          }),
          insert: async (payload: Record<string, unknown>) => {
            chamadas.insert.push(payload);
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              chamadas.update.push(payload);
              return { error: null };
            },
          }),
        };
      }
      if (tabela === "produto_fotos") {
        return { select: () => ({ eq: () => ({ order: async () => ({ data: [], error: null }) }) }) };
      }
      if (tabela === "produto_cento_itens") {
        return {
          delete: () => ({
            eq: async (_coluna: string, valor: string) => {
              chamadas.centoDelete.push(valor);
              return { error: null };
            },
          }),
          insert: async (linhas: { cento_nome: string; subitem_nome: string; ordem: number }[]) => {
            chamadas.centoInsert.push(linhas);
            return { error: null };
          },
        };
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    },
    rpc: async (nome: string, args: Record<string, unknown>) => {
      chamadas.rpc.push({ nome, args });
      return { error: null };
    },
  })),
}));

const { ProdutoForm } = await import("./produto-form");
const { createProduto, updateProduto } = await import("./actions");
const { parseProdutoForm } = await import("@/lib/produtos/parse");

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  chamadas.insert.length = 0;
  chamadas.update.length = 0;
  chamadas.rpc.length = 0;
  chamadas.centoDelete.length = 0;
  chamadas.centoInsert.length = 0;
});
afterEach(() => cleanup());

// As 14 combinações que o parser aceita (escritas à mão de propósito: a
// matriz gerada pela tabela nova só existe depois da refatoração).
type Combinacao = { categoria: string; tipo: string };
const SEIS = ["Bolos", "Doces", "Salgados", "Bebidas", "Kit Festa", "Adicionais"];
const COMBINACOES: Combinacao[] = [
  ...SEIS.map((categoria) => ({ categoria, tipo: "normal" })),
  ...SEIS.map((categoria) => ({ categoria, tipo: "cento" })),
  { categoria: "Bolos", tipo: "bolo" },
  { categoria: "Bento Cake", tipo: "bento_cake" },
];
const nomeDe = ({ categoria, tipo }: Combinacao) => `${categoria} / ${tipo}`;

// Hoje só Bolos de tipo normal e Bento Cake aceitam recheios personalizados.
const aceitaRecheios = ({ categoria, tipo }: Combinacao) =>
  (categoria === "Bolos" && tipo === "normal") || tipo === "bento_cake";

// Linha de produto como a edição a recebe. Os valores dos campos que a tela
// esconde (por exemplo o step de um Bento Cake) são de propósito diferentes
// dos neutros, para um vazamento aparecer no instantâneo.
function produtoDe({ categoria, tipo }: Combinacao) {
  return {
    id: ID,
    slug: "x",
    nome: `Produto ${categoria} ${tipo}`,
    preco: 12.5,
    descricao: "Descrição de teste",
    image_url: null,
    criado_em: null,
    pedido_minimo: 3,
    Categoria: categoria,
    prazo_producao_dias: 2,
    step_quantidade: "multiplos_10",
    destaque: false,
    ativo: true,
    tipo,
    unidade_venda: "o kit",
  };
}

const CANDIDATOS = [
  { nome: "Sabor A", ativo: true },
  { nome: "Sabor B", ativo: true },
];

type OpcoesEdicao = { sabores?: string[]; recheios?: boolean };

function renderEdicao(c: Combinacao, { sabores, recheios }: OpcoesEdicao = {}) {
  const saboresIniciais = sabores ?? (c.tipo === "cento" ? ["Sabor A"] : []);
  const recheiosIniciais = (recheios ?? aceitaRecheios(c)) ? [{ id: RECHEIO_ID, nome: "Doce de leite" }] : [];
  return render(
    <ProdutoForm
      action={async () => ({})}
      produto={produtoDe(c) as never}
      produtoId={ID}
      submitLabel="Salvar alterações"
      produtosDisponiveis={CANDIDATOS}
      initialSubitens={saboresIniciais}
      recheiosIniciais={recheiosIniciais}
    />
  );
}

function renderCadastro() {
  return render(
    <ProdutoForm action={async () => ({})} produtoId={ID} submitLabel="Cadastrar produto" produtosDisponiveis={CANDIDATOS} />
  );
}

const selectCategoria = () => document.querySelector("#f-categoria") as HTMLSelectElement;
const selectTipo = () => document.querySelector("#f-tipo") as HTMLSelectElement;
const escolherTipo = (valor: string) => fireEvent.change(selectTipo(), { target: { value: valor } });
const escolherCategoria = (valor: string) => fireEvent.change(selectCategoria(), { target: { value: valor } });

function formElement() {
  return document.querySelector("form") as HTMLFormElement;
}

function dadosDoFormulario(): FormData {
  return new FormData(formElement());
}

// O que o formulário mostra e envia neste instante.
function retrato() {
  const form = formElement();
  const campos: Record<string, string[]> = {};
  for (const [chave, valor] of dadosDoFormulario().entries()) (campos[chave] ??= []).push(String(valor));
  return {
    secoes: [...form.querySelectorAll(".produto-form-band")].map((e) => e.textContent),
    rotulos: [...form.querySelectorAll("label")].map((e) => (e.textContent ?? "").trim()),
    avisos: [...form.querySelectorAll(".produto-form-aviso")].map((e) => e.textContent),
    categoria: { valor: selectCategoria().value, desabilitada: selectCategoria().disabled },
    tipo: selectTipo().value,
    camposEnviados: Object.fromEntries(Object.entries(campos).sort(([a], [b]) => a.localeCompare(b))),
    textoDoFormulario: form.textContent,
  };
}

function aVista(dados: FormData) {
  const saida: Record<string, string[]> = {};
  for (const chave of [...new Set(dados.keys())].sort()) saida[chave] = dados.getAll(chave).map(String);
  return saida;
}

// Todos os campos preenchidos à força, inclusive os que a tela esconde.
function tudoAForca(c: Combinacao): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id: ID,
    nome: `Produto ${c.categoria} ${c.tipo}`,
    descricao: "Descrição de teste",
    preco: "10,00",
    pedido_minimo: "3",
    categoria: c.categoria,
    prazo_producao_dias: "2",
    step_quantidade: "multiplos_5",
    tipo: c.tipo,
    unidade_venda: "o kit",
    destaque: "on",
    ativo: "on",
    subitem_nome: "Sabor A",
    galeria: "[]",
  })) {
    f.set(k, v);
  }
  return f;
}

// FormData que o formulário de edição gera, com o id do produto e a galeria
// vazia que o envio de verdade acrescenta, para o cadastro aceitar.
function dadosParaCadastro(): FormData {
  const f = dadosDoFormulario();
  f.set("id", ID);
  f.set("galeria", "[]");
  return f;
}

function desfecho(retorno: unknown) {
  return {
    retorno,
    insert: chamadas.insert.map((p) => ({ colunas: Object.keys(p).sort(), valores: p })),
    update: chamadas.update.map((p) => ({ colunas: Object.keys(p).sort(), valores: p })),
    recheios: chamadas.rpc.filter((c) => c.nome === "salvar_produto_recheios").map((c) => c.args),
    saboresApagados: chamadas.centoDelete,
    saboresGravados: chamadas.centoInsert.flat().map((s) => s.subitem_nome),
  };
}

function resultadoDoParser(dados: FormData) {
  const r = parseProdutoForm(dados);
  return r.success ? { ok: true, dados: r.data } : { ok: false, erro: r.error };
}

describe("caracterização — formulário", () => {
  describe.each(COMBINACOES)("edição: $categoria / $tipo", (c) => {
    it("campos, rótulos, seções, textos e envio", () => {
      renderEdicao(c);
      expect(retrato()).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("edição sem nada salvo de recheios e sabores: $categoria / $tipo", (c) => {
    it("campos e envio", () => {
      renderEdicao(c, { sabores: [], recheios: false });
      const { camposEnviados, secoes } = retrato();
      expect({ camposEnviados, secoes }).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("cadastro por interação: $categoria / $tipo", (c) => {
    it("campos, rótulos, seções, textos e envio", () => {
      renderCadastro();
      escolherTipo(c.tipo);
      if (c.tipo === "normal" || c.tipo === "cento") escolherCategoria(c.categoria);
      expect(retrato()).toMatchSnapshot();
    });
  });

  describe("trocas dentro do formulário", () => {
    it("cadastro: normal -> bolo -> normal", () => {
      renderCadastro();
      const passos = [{ passo: "abre", ...retrato() }];
      escolherTipo("bolo");
      passos.push({ passo: "tipo bolo", ...retrato() });
      escolherTipo("normal");
      passos.push({ passo: "volta a normal", ...retrato() });
      expect(passos).toMatchSnapshot();
    });

    it("cadastro: normal -> bento_cake -> normal (a categoria volta a vazio)", () => {
      renderCadastro();
      escolherTipo("bento_cake");
      const comBento = retrato();
      escolherTipo("normal");
      expect([comBento, retrato()]).toMatchSnapshot();
    });

    it("cadastro: escolher a categoria Bento Cake põe o tipo em Bento Cake", () => {
      renderCadastro();
      escolherCategoria("Bento Cake");
      expect(retrato()).toMatchSnapshot();
    });

    it("cadastro: Bolos normal (recheios) -> Doces -> Bolos", () => {
      renderCadastro();
      escolherTipo("normal");
      escolherCategoria("Bolos");
      const bolos = retrato();
      escolherCategoria("Doces");
      const doces = retrato();
      escolherCategoria("Bolos");
      expect([bolos, doces, retrato()]).toMatchSnapshot();
    });

    it("cadastro: cento em Bolos -> bolo -> cento", () => {
      renderCadastro();
      escolherTipo("cento");
      escolherCategoria("Bolos");
      const cento = retrato();
      escolherTipo("bolo");
      const bolo = retrato();
      escolherTipo("cento");
      expect([cento, bolo, retrato()]).toMatchSnapshot();
    });

    it("cadastro: cento -> bento_cake -> cento", () => {
      renderCadastro();
      escolherTipo("cento");
      escolherCategoria("Doces");
      const cento = retrato();
      escolherTipo("bento_cake");
      const bento = retrato();
      escolherTipo("cento");
      expect([cento, bento, retrato()]).toMatchSnapshot();
    });

    it("edição Doces normal: o preço digitado some ao passar por Bolo e volta ao valor salvo", () => {
      renderEdicao({ categoria: "Doces", tipo: "normal" });
      const antes = aVista(dadosDoFormulario()).preco;
      const preco = document.querySelector("#f-preco") as HTMLInputElement;
      fireEvent.change(preco, { target: { value: "9900" } });
      const digitado = aVista(dadosDoFormulario()).preco;
      escolherTipo("bolo");
      const emBolo = aVista(dadosDoFormulario()).preco;
      escolherTipo("normal");
      expect({ antes, digitado, emBolo, depois: aVista(dadosDoFormulario()).preco }).toMatchSnapshot();
    });

    it("edição Bolos normal com recheios salvos: passar para Doces esconde a seção e manda a lista vazia", () => {
      renderEdicao({ categoria: "Bolos", tipo: "normal" });
      const antes = retrato();
      escolherCategoria("Doces");
      expect([antes, retrato()]).toMatchSnapshot();
    });

    it("edição Bento Cake com recheios salvos: passar para normal solta a categoria e esconde a seção", () => {
      renderEdicao({ categoria: "Bento Cake", tipo: "bento_cake" });
      escolherTipo("normal");
      expect(retrato()).toMatchSnapshot();
    });

    it("edição Cento com sabores salvos: passar para normal tira os campos de sabor", () => {
      renderEdicao({ categoria: "Doces", tipo: "cento" });
      const antes = retrato();
      escolherTipo("normal");
      expect([antes, retrato()]).toMatchSnapshot();
    });

    it("edição Bolos bolo: passar para normal destrava a categoria e devolve os campos", () => {
      renderEdicao({ categoria: "Bolos", tipo: "bolo" });
      escolherTipo("normal");
      expect(retrato()).toMatchSnapshot();
    });
  });
});

describe("caracterização — parser", () => {
  describe.each(COMBINACOES)("com o que o formulário envia: $categoria / $tipo", (c) => {
    it("devolve", () => {
      renderEdicao(c);
      expect(resultadoDoParser(dadosDoFormulario())).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("com todos os campos preenchidos à força: $categoria / $tipo", (c) => {
    it("devolve", () => {
      expect(resultadoDoParser(tudoAForca(c))).toMatchSnapshot();
    });
  });

  describe("combinações recusadas", () => {
    const recusadas: Combinacao[] = [
      { categoria: "Bento Cake", tipo: "normal" },
      { categoria: "Bento Cake", tipo: "cento" },
      { categoria: "Doces", tipo: "bolo" },
      { categoria: "Doces", tipo: "bento_cake" },
      { categoria: "Bolos", tipo: "bento_cake" },
      { categoria: "Bento Cake", tipo: "bolo" },
      { categoria: "Doces", tipo: "desconhecido" },
    ];
    it.each(recusadas)("$categoria / $tipo", (c) => {
      expect(resultadoDoParser(tudoAForca(c))).toMatchSnapshot();
    });
  });
});

describe("caracterização — actions", () => {
  describe.each(COMBINACOES)("UPDATE com o que o formulário envia: $categoria / $tipo", (c) => {
    it("grava", async () => {
      renderEdicao(c);
      const retorno = await updateProduto(produtoDe(c).nome, {}, dadosDoFormulario());
      expect(desfecho(retorno)).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("UPDATE com todos os campos preenchidos à força: $categoria / $tipo", (c) => {
    it("grava", async () => {
      const retorno = await updateProduto(`Produto ${c.categoria} ${c.tipo}`, {}, tudoAForca(c));
      expect(desfecho(retorno)).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("INSERT com o que o formulário envia: $categoria / $tipo", (c) => {
    it("grava", async () => {
      renderEdicao(c);
      const retorno = await createProduto({}, dadosParaCadastro());
      expect(desfecho(retorno)).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("INSERT com todos os campos preenchidos à força: $categoria / $tipo", (c) => {
    it("grava", async () => {
      const retorno = await createProduto({}, tudoAForca(c));
      expect(desfecho(retorno)).toMatchSnapshot();
    });
  });

  describe.each(COMBINACOES)("recheios enviados à força (interruptor ligado): $categoria / $tipo", (c) => {
    it("UPDATE aceita ou recusa", async () => {
      const dados = tudoAForca(c);
      dados.set("recheios_ligados", "1");
      dados.set("recheios_produto", JSON.stringify([{ nome: "Doce de leite" }]));
      const retorno = await updateProduto(`Produto ${c.categoria} ${c.tipo}`, {}, dados);
      expect(desfecho(retorno)).toMatchSnapshot();
    });
  });

  describe("limpeza ao trocar de tipo ou de categoria no formulário (tabelas filhas)", () => {
    it("Bolos normal com recheios, passa para Doces: a lista é apagada", async () => {
      renderEdicao({ categoria: "Bolos", tipo: "normal" });
      escolherCategoria("Doces");
      const retorno = await updateProduto(produtoDe({ categoria: "Bolos", tipo: "normal" }).nome, {}, dadosDoFormulario());
      expect(desfecho(retorno)).toMatchSnapshot();
    });

    it("Cento com sabores, passa para normal: os sabores são apagados e nada é regravado", async () => {
      renderEdicao({ categoria: "Doces", tipo: "cento" });
      escolherTipo("normal");
      const retorno = await updateProduto(produtoDe({ categoria: "Doces", tipo: "cento" }).nome, {}, dadosDoFormulario());
      expect(desfecho(retorno)).toMatchSnapshot();
    });

    it("Bento Cake com recheios, passa para normal: o formulário fica sem categoria e o Salvar é recusado", async () => {
      renderEdicao({ categoria: "Bento Cake", tipo: "bento_cake" });
      escolherTipo("normal");
      const retorno = await updateProduto(produtoDe({ categoria: "Bento Cake", tipo: "bento_cake" }).nome, {}, dadosDoFormulario());
      expect(desfecho(retorno)).toMatchSnapshot();
    });

    it("Bolo tradicional, passa para normal em Bolos: os campos de preço voltam a ser enviados", async () => {
      renderEdicao({ categoria: "Bolos", tipo: "bolo" });
      escolherTipo("normal");
      const retorno = await updateProduto(produtoDe({ categoria: "Bolos", tipo: "bolo" }).nome, {}, dadosDoFormulario());
      expect(desfecho(retorno)).toMatchSnapshot();
    });
  });
});

describe("caracterização — a matriz está completa", () => {
  it("são 14 combinações e o parser aceita exatamente essas", () => {
    expect(COMBINACOES).toHaveLength(14);
    const todas: Combinacao[] = [];
    for (const tipo of ["normal", "cento", "bolo", "bento_cake"]) {
      for (const categoria of [...SEIS, "Bento Cake"]) todas.push({ categoria, tipo });
    }
    const aceitas = todas.filter((c) => resultadoDoParser(tudoAForca(c)).ok).map(nomeDe);
    expect(aceitas.sort()).toEqual(COMBINACOES.map(nomeDe).sort());
  });
});
