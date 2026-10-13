// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { SubcategoriaOpcao } from "@/lib/subcategorias/types";

// Subcategoria no formulário de produto e no Salvar (PR 3): regra do campo
// visível por vínculo, restauração ao voltar à categoria salva e validação do
// servidor. O Supabase é simulado: o teste não prova gatilho, chave composta,
// RLS nem NOT NULL (isso é de scripts/banco/subcategorias.mjs), e o jsdom não
// é um navegador real.

const ID = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";
const SUB_DOCES_A = "5d0c1b7e-2a4f-4c66-9a53-0f1d6e8b7a21";
const SUB_DOCES_B = "6e1d2c8f-3b5a-4d77-8b64-1a2e7f9c8b32";
const SUB_DOCES_INATIVA = "9a1e44c0-7b3d-4d2f-8e60-1c2b3a4d5e6f";
const SUB_BOLOS = "7f2e3d9a-4c6b-4e88-9c75-2b3f8a0d9c43";
const SUB_SALGADOS_INATIVA = "8a3f4e0b-5d7c-4f99-8d86-3c4a9b1e0d54";

type Linha = SubcategoriaOpcao;
const TODAS: Linha[] = [
  { id: SUB_DOCES_A, categoria: "Doces", nome: "Gourmet", ativo: true, ordem: 10 },
  { id: SUB_DOCES_B, categoria: "Doces", nome: "Finos", ativo: true, ordem: 20 },
  { id: SUB_DOCES_INATIVA, categoria: "Doces", nome: "Antiga", ativo: false, ordem: 30 },
  { id: SUB_BOLOS, categoria: "Bolos", nome: "Tradicional", ativo: true, ordem: 10 },
  { id: SUB_SALGADOS_INATIVA, categoria: "Salgados", nome: "Fritos", ativo: false, ordem: 10 },
];

const estado = {
  atual: { id: ID, image_url: null } as Record<string, unknown>,
  linhas: TODAS,
  consultas: 0,
  erroConsulta: false,
  insert: [] as Record<string, unknown>[],
  update: [] as Record<string, unknown>[],
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
          // select("id, ...") é a leitura do produto na edição; select("nome") é a
          // conferência de nome repetido (nada encontrado).
          select: (colunas: string) => ({
            eq: () => ({ maybeSingle: async () => ({ data: colunas.startsWith("id") ? estado.atual : null }) }),
          }),
          insert: async (payload: Record<string, unknown>) => {
            estado.insert.push(payload);
            return { error: null };
          },
          update: (payload: Record<string, unknown>) => ({
            eq: async () => {
              estado.update.push(payload);
              return { error: null };
            },
          }),
        };
      }
      if (tabela === "subcategorias") {
        return {
          select: () => ({
            eq: async (_coluna: string, categoria: string) => {
              estado.consultas += 1;
              if (estado.erroConsulta) return { data: null, error: { code: "XX000", message: "falha" } };
              return { data: estado.linhas.filter((l) => l.categoria === categoria), error: null };
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

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  estado.atual = { id: ID, image_url: null, Categoria: "Doces", subcategoria_id: null };
  estado.linhas = TODAS;
  estado.consultas = 0;
  estado.erroConsulta = false;
  estado.insert.length = 0;
  estado.update.length = 0;
});
afterEach(() => cleanup());

function produto(categoria: string, subcategoria_id: string | null) {
  return {
    id: ID,
    slug: "x",
    nome: "Produto de teste",
    preco: 5,
    descricao: "Descrição",
    image_url: null,
    criado_em: null,
    pedido_minimo: 10,
    Categoria: categoria,
    prazo_producao_dias: 2,
    step_quantidade: "livre",
    destaque: false,
    ativo: true,
    tipo: "normal",
    unidade_venda: "unidade",
    subcategoria_id,
  } as never;
}

function abrir(categoria: string, subcategoria_id: string | null, linhas: Linha[] = TODAS) {
  const r = render(
    <ProdutoForm
      action={async () => ({})}
      produto={produto(categoria, subcategoria_id)}
      produtoId={ID}
      submitLabel="Salvar"
      subcategorias={linhas}
    />
  );
  const campo = () => document.querySelector("#f-subcategoria") as HTMLSelectElement | null;
  const trocar = (nova: string) =>
    fireEvent.change(document.querySelector("#f-categoria") as HTMLSelectElement, { target: { value: nova } });
  return { ...r, campo, trocar };
}

describe("seletor de subcategoria: quando aparece", () => {
  it("categoria com subcategoria ativa: lista só as ativas dela, mais 'Sem subcategoria'", () => {
    const { campo } = abrir("Doces", null);
    const opcoes = [...campo()!.options].map((o) => [o.value, o.textContent]);
    expect(opcoes).toEqual([
      ["", "Sem subcategoria"],
      [SUB_DOCES_A, "Gourmet"],
      [SUB_DOCES_B, "Finos"],
    ]);
    expect(campo()!.value).toBe("");
  });

  it("a subcategoria atual inativa aparece marcada '(inativa)' e fica selecionada", () => {
    const { campo } = abrir("Doces", SUB_DOCES_INATIVA);
    const opcoes = [...campo()!.options].map((o) => o.textContent);
    expect(opcoes).toContain("Antiga (inativa)");
    expect(campo()!.value).toBe(SUB_DOCES_INATIVA);
  });

  it("categoria sem nenhuma subcategoria ativa e produto sem vínculo: o campo não existe", () => {
    const { campo } = abrir("Salgados", null);
    expect(campo()).toBeNull();
  });

  it("categoria só com subcategoria inativa, mas o produto está ligado a ela: o campo continua visível e dá para escolher 'Sem subcategoria'", () => {
    const { campo } = abrir("Salgados", SUB_SALGADOS_INATIVA);
    expect(campo()).not.toBeNull();
    expect(campo()!.value).toBe(SUB_SALGADOS_INATIVA);
    expect([...campo()!.options].map((o) => o.textContent)).toEqual(["Sem subcategoria", "Fritos (inativa)"]);
    fireEvent.change(campo()!, { target: { value: "" } });
    expect(campo()!.value).toBe("");
  });

  it("o vínculo só conta na categoria salva: trocar para outra categoria só com inativas esconde o campo", () => {
    const { campo, trocar } = abrir("Doces", SUB_DOCES_INATIVA);
    trocar("Salgados");
    expect(campo()).toBeNull();
  });

  it("Adicionais (sem nenhuma subcategoria): o campo não aparece", () => {
    const { campo } = abrir("Adicionais", null);
    expect(campo()).toBeNull();
  });

  it("sem a lista de subcategorias (falha de leitura): o campo não aparece", () => {
    const { campo } = abrir("Doces", SUB_DOCES_A, []);
    expect(campo()).toBeNull();
  });
});

describe("seletor de subcategoria: troca de categoria", () => {
  it("trocar de categoria zera o seletor", () => {
    const { campo, trocar } = abrir("Doces", SUB_DOCES_A);
    expect(campo()!.value).toBe(SUB_DOCES_A);
    trocar("Bolos");
    expect(campo()!.value).toBe("");
    expect([...campo()!.options].map((o) => o.textContent)).toEqual(["Sem subcategoria", "Tradicional"]);
  });

  it("voltar à categoria salva restaura a subcategoria salva (inclusive inativa)", () => {
    const { campo, trocar } = abrir("Doces", SUB_DOCES_INATIVA);
    trocar("Bolos");
    expect(campo()!.value).toBe("");
    trocar("Doces");
    expect(campo()!.value).toBe(SUB_DOCES_INATIVA);
  });

  it("passando por uma categoria sem subcategoria (campo escondido) e voltando, restaura", () => {
    const { campo, trocar } = abrir("Doces", SUB_DOCES_A);
    trocar("Adicionais");
    expect(campo()).toBeNull();
    trocar("Doces");
    expect(campo()!.value).toBe(SUB_DOCES_A);
  });

  it("a escolha manual vale até a próxima troca: ao voltar, vale a salva, não a manual", () => {
    const { campo, trocar } = abrir("Doces", SUB_DOCES_A);
    fireEvent.change(campo()!, { target: { value: SUB_DOCES_B } });
    expect(campo()!.value).toBe(SUB_DOCES_B);
    trocar("Bolos");
    trocar("Doces");
    expect(campo()!.value).toBe(SUB_DOCES_A);
  });

  it("trocar o tipo para Bolo leva a categoria a Bolos e zera; voltar o tipo não restaura a categoria antiga", () => {
    const { campo } = abrir("Doces", SUB_DOCES_A);
    fireEvent.change(document.querySelector("#f-tipo") as HTMLSelectElement, { target: { value: "bolo" } });
    expect(campo()!.value).toBe("");
    expect([...campo()!.options].map((o) => o.textContent)).toEqual(["Sem subcategoria", "Tradicional"]);
  });

  it("trocar o tipo sem mudar a categoria não mexe na escolha", () => {
    const { campo } = abrir("Doces", SUB_DOCES_A);
    fireEvent.change(campo()!, { target: { value: SUB_DOCES_B } });
    fireEvent.change(document.querySelector("#f-tipo") as HTMLSelectElement, { target: { value: "cento" } });
    expect(campo()!.value).toBe(SUB_DOCES_B);
  });
});

// FormData do que o formulário enviaria (produto normal de Doces).
function dados(extras: Record<string, string>, categoria = "Doces"): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries({
    id: ID,
    nome: "Produto de teste",
    descricao: "Descrição",
    preco: "5,00",
    pedido_minimo: "10",
    categoria,
    prazo_producao_dias: "2",
    step_quantidade: "livre",
    tipo: "normal",
    unidade_venda: "unidade",
    ativo: "on",
    galeria: "[]",
    ...extras,
  })) {
    f.set(k, v);
  }
  return f;
}

describe("validação do servidor (updateProduto)", () => {
  it("sem o campo no envio: nenhuma consulta, a coluna fica fora do UPDATE e o produto é salvo", async () => {
    estado.atual = { id: ID, image_url: null, Categoria: "Doces", subcategoria_id: SUB_DOCES_A };
    await updateProduto("Produto de teste", {}, dados({}));
    expect(estado.consultas).toBe(0);
    expect(estado.update).toHaveLength(1);
    expect("subcategoria_id" in estado.update[0]).toBe(false);
  });

  it("com o campo: uma consulta, e a subcategoria ativa da categoria vai ao UPDATE", async () => {
    await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_DOCES_B }));
    expect(estado.consultas).toBe(1);
    expect(estado.update[0].subcategoria_id).toBe(SUB_DOCES_B);
  });

  it("'' vira null", async () => {
    estado.atual = { id: ID, image_url: null, Categoria: "Doces", subcategoria_id: SUB_DOCES_A };
    await updateProduto("Produto de teste", {}, dados({ subcategoria_id: "" }));
    expect(estado.update[0].subcategoria_id).toBeNull();
  });

  it("recusa subcategoria de outra categoria e não grava nada", async () => {
    const r = await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_BOLOS }));
    expect(r.error).toMatch(/não pertence à categoria/);
    expect(estado.update).toHaveLength(0);
  });

  it("recusa subcategoria inativa que o produto ainda não tinha", async () => {
    const r = await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_DOCES_INATIVA }));
    expect(r.error).toMatch(/desativada/);
    expect(estado.update).toHaveLength(0);
  });

  it("aceita a subcategoria inativa que o produto já tem", async () => {
    estado.atual = { id: ID, image_url: null, Categoria: "Doces", subcategoria_id: SUB_DOCES_INATIVA };
    const r = await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_DOCES_INATIVA }));
    expect(r?.error).toBeUndefined();
    expect(estado.update[0].subcategoria_id).toBe(SUB_DOCES_INATIVA);
  });

  it("o vínculo antigo não vale depois de trocar de categoria: em Salgados (só inativas) o campo é escondido", async () => {
    estado.atual = { id: ID, image_url: null, Categoria: "Doces", subcategoria_id: SUB_DOCES_INATIVA };
    const r = await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_SALGADOS_INATIVA }, "Salgados"));
    // Salgados só tem inativa e o produto não estava em Salgados: o campo é escondido
    // pelo servidor, o valor é ignorado e a coluna não vai ao UPDATE.
    expect(r?.error).toBeUndefined();
    expect("subcategoria_id" in estado.update[0]).toBe(false);
  });

  it("campo enviado em categoria sem subcategoria para escolher: o servidor ignora o valor", async () => {
    await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_BOLOS }, "Adicionais"));
    expect(estado.consultas).toBe(1);
    expect("subcategoria_id" in estado.update[0]).toBe(false);
  });

  it("valor que não é um id: recusado sem gravar", async () => {
    const r = await updateProduto("Produto de teste", {}, dados({ subcategoria_id: "abc" }));
    expect(r.error).toMatch(/subcategoria válida/);
    expect(estado.update).toHaveLength(0);
  });

  it("falha ao consultar as subcategorias: mensagem em português e nada gravado", async () => {
    estado.erroConsulta = true;
    const r = await updateProduto("Produto de teste", {}, dados({ subcategoria_id: SUB_DOCES_A }));
    expect(r.error).toMatch(/conferir as subcategorias/);
    expect(estado.update).toHaveLength(0);
  });
});

describe("validação do servidor (createProduto)", () => {
  it("com a subcategoria ativa da categoria: o INSERT leva a coluna", async () => {
    await createProduto({}, dados({ subcategoria_id: SUB_DOCES_A }));
    expect(estado.insert[0].subcategoria_id).toBe(SUB_DOCES_A);
  });

  it("sem o campo: nenhuma consulta e o INSERT não leva a coluna (nasce nula)", async () => {
    await createProduto({}, dados({}));
    expect(estado.consultas).toBe(0);
    expect("subcategoria_id" in estado.insert[0]).toBe(false);
  });

  it("subcategoria de outra categoria ou inativa: recusada e nada gravado", async () => {
    const outra = await createProduto({}, dados({ subcategoria_id: SUB_BOLOS }));
    const inativa = await createProduto({}, dados({ subcategoria_id: SUB_DOCES_INATIVA }));
    expect(outra.error).toMatch(/não pertence/);
    expect(inativa.error).toMatch(/desativada/);
    expect(estado.insert).toHaveLength(0);
  });
});
