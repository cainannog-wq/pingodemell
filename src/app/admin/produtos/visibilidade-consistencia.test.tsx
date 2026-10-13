// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Consistência permanente da tabela de campos (src/lib/produtos/campos.ts):
// para TODA combinação válida de categoria e tipo, o formulário, o parser e o
// UPDATE e o INSERT concordam com a tabela. A matriz sai da tabela
// (combinacoesValidas), não é mantida à mão. Campo novo na tabela entra aqui
// sem mudar o teste; campo novo FORA da tabela reprova nas duas guardas.
//
// O Supabase é simulado: o teste não prova gatilho, RLS, restrição, cast de
// enum nem NOT NULL, e o jsdom não é um navegador real.

const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";

const chamadas = { insert: [] as Record<string, unknown>[], update: [] as Record<string, unknown>[] };

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
        return { delete: () => ({ eq: async () => ({ error: null }) }), insert: async () => ({ error: null }) };
      }
      throw new Error(`tabela inesperada no mock: ${tabela}`);
    },
    rpc: async () => ({ error: null }),
  })),
}));

const { ProdutoForm } = await import("./produto-form");
const { createProduto, updateProduto } = await import("./actions");
const { parseProdutoForm } = await import("@/lib/produtos/parse");
const { CAMPOS, campoVisivel, colunasDaEdicao, colunasDoProduto, combinacoesValidas, neutrosDoCadastro } = await import(
  "@/lib/produtos/campos"
);

type CampoProduto = keyof typeof CAMPOS;
const CAMPOS_DA_TABELA = Object.keys(CAMPOS) as CampoProduto[];

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  chamadas.insert.length = 0;
  chamadas.update.length = 0;
});
afterEach(() => cleanup());

const COMBINACOES = combinacoesValidas();

function produtoDe(c: { categoria: string; tipo: string }) {
  return {
    id: ID,
    slug: "x",
    nome: `Produto ${c.categoria} ${c.tipo}`,
    preco: 12.5,
    descricao: "Descrição",
    image_url: null,
    criado_em: null,
    pedido_minimo: 3,
    Categoria: c.categoria,
    prazo_producao_dias: 2,
    step_quantidade: "multiplos_10",
    destaque: false,
    ativo: true,
    tipo: c.tipo,
    unidade_venda: "o kit",
  } as never;
}

function renderEdicao(c: { categoria: string; tipo: string }) {
  return render(
    <ProdutoForm
      action={async () => ({})}
      produto={produtoDe(c)}
      produtoId={ID}
      submitLabel="Salvar"
      produtosDisponiveis={[{ nome: "Sabor A", ativo: true }]}
      initialSubitens={c.tipo === "cento" ? ["Sabor A"] : []}
      recheiosIniciais={[{ id: "300b5263-1a9a-4057-86ac-b5ca0f7c3dfa", nome: "Doce de leite" }]}
    />
  );
}

// Todos os campos preenchidos à força, inclusive os que a tela esconde.
function tudoAForca(c: { categoria: string; tipo: string }): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id: ID,
    nome: `Produto ${c.categoria} ${c.tipo}`,
    descricao: "Descrição",
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

const VALORES_FORCADOS = { preco: 10, pedido_minimo: 3, step_quantidade: "multiplos_5", unidade_venda: "o kit" };

describe("a matriz sai da tabela", () => {
  it("são 14 combinações e o parser aceita exatamente essas", () => {
    expect(COMBINACOES).toHaveLength(14);
    const aceitas = COMBINACOES.filter((c) => parseProdutoForm(tudoAForca(c)).success);
    expect(aceitas).toHaveLength(14);
  });
});

describe.each(COMBINACOES)("combinação $categoria / $tipo", (c) => {
  const contexto = { categoria: c.categoria, tipo: c.tipo };

  it("formulário: cada campo aparece se e só se a tabela diz que é visível", () => {
    renderEdicao(c);
    for (const campo of CAMPOS_DA_TABELA) {
      for (const nome of CAMPOS[campo].nomesNoFormulario) {
        // Recheios têm os campos escondidos mesmo desligados, quando há lista salva (limpeza
        // da tabela filha); só vale a regra de visibilidade para os campos sem efeito em tabela filha.
        if (CAMPOS[campo].efeitoEmTabelaFilha && nome.startsWith("recheios_")) continue;
        const existe = document.querySelector(`[name="${nome}"]`) !== null;
        expect(existe, `${campo} (${nome})`).toBe(campoVisivel(campo, contexto));
      }
    }
  });

  it("formulário (guarda): todo atributo name renderizado está na tabela", () => {
    renderEdicao(c);
    const conhecidos = new Set(CAMPOS_DA_TABELA.flatMap((campo) => CAMPOS[campo].nomesNoFormulario));
    const renderizados = [...document.querySelectorAll("form [name]")].map((e) => e.getAttribute("name") as string);
    const fora = [...new Set(renderizados)].filter((n) => !conhecidos.has(n) && n !== "id");
    expect(fora).toEqual([]);
  });

  it("parser: o que está escondido sai neutro, o que está visível sai com o valor enviado", () => {
    const r = parseProdutoForm(tudoAForca(c));
    expect(r.success).toBe(true);
    if (!r.success) return;
    const neutros = neutrosDoCadastro(contexto) as Record<string, unknown>;
    for (const coluna of ["preco", "pedido_minimo", "step_quantidade", "unidade_venda"] as const) {
      const campo = coluna as CampoProduto;
      const esperado = campoVisivel(campo, contexto) ? VALORES_FORCADOS[coluna] : neutros[coluna];
      expect(r.data[coluna], coluna).toEqual(esperado);
    }
    expect(r.data.naoGravarNaEdicao.sort()).toEqual(
      (["preco", "pedido_minimo", "step_quantidade", "unidade_venda"] as const)
        .filter((coluna) => !campoVisivel(coluna as CampoProduto, contexto))
        .sort()
    );
    expect(r.data.subitens.length > 0).toBe(campoVisivel("subitens", contexto));
  });

  it("UPDATE leva exatamente as colunas dos campos visíveis (e só colunas da tabela)", async () => {
    await updateProduto(`Produto ${c.categoria} ${c.tipo}`, {}, tudoAForca(c));
    const chaves = Object.keys(chamadas.update[0]).sort();
    expect(chaves).toEqual([...colunasDaEdicao(contexto)].sort());
    expect(chaves.every((k) => (colunasDoProduto() as string[]).includes(k))).toBe(true);
  });

  it("INSERT leva as colunas visíveis com o valor da tela e as escondidas com o neutro (e só colunas da tabela)", async () => {
    await createProduto({}, tudoAForca(c));
    const { id, image_url, ...colunas } = chamadas.insert[0];
    expect(id).toBe(ID);
    expect(image_url).toBeNull();
    expect(Object.keys(colunas).sort()).toEqual([...colunasDoProduto()].sort());
    const visiveis = new Set<string>(colunasDaEdicao(contexto));
    const neutros = neutrosDoCadastro(contexto) as Record<string, unknown>;
    for (const coluna of colunasDoProduto()) {
      if (!visiveis.has(coluna)) expect(colunas[coluna], coluna).toEqual(neutros[coluna]);
    }
  });
});
