// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// Ida e volta do Salvar: abre o formulário de verdade com a linha de um
// produto como ela está no banco, salva SEM tocar em nada e passa o
// FormData que o formulário produziu para a updateProduto de verdade, contra
// um Supabase simulado (nada é gravado em lugar nenhum).
//
// Regra de negócio provada: salvar um produto sem mudar nada não altera
// nenhum campo dele, nem a lista de recheios personalizados, nem a lista de
// sabores do Cento. Única exceção: atualizado_em, que o gatilho do banco move
// sempre e que não passa por aqui.
//
// "Não altera" vale de dois jeitos: a coluna nem vai no UPDATE (o banco
// guarda o que já tem) ou vai com o mesmo valor da linha. Gravar vazio, zero
// ou um valor neutro num campo que a tela esconde reprova o teste.
//
// Os valores abaixo são cópias de linhas reais de produção (lidas em
// 13/10/2026, só leitura): um produto de cada combinação de categoria, tipo,
// unidade e step.

const ID_DE_TESTE = "c7b3f34c-6f8f-4b39-a8fb-31369f1c4aee";

type LinhaProduto = {
  id: string;
  nome: string;
  preco: number;
  descricao: string;
  pedido_minimo: number;
  Categoria: string;
  prazo_producao_dias: number;
  step_quantidade: string;
  destaque: boolean;
  ativo: boolean;
  tipo: string;
  unidade_venda: string;
};

const chamadas = {
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
          select: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: { id: ID_DE_TESTE, image_url: null } }) }),
          }),
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
const { updateProduto } = await import("./actions");

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => "blob:previa");
  URL.revokeObjectURL = vi.fn();
});
beforeEach(() => {
  chamadas.update.length = 0;
  chamadas.rpc.length = 0;
  chamadas.centoDelete.length = 0;
  chamadas.centoInsert.length = 0;
});
afterEach(() => cleanup());

function linha(base: Omit<LinhaProduto, "id" | "ativo" | "destaque"> & Partial<LinhaProduto>): LinhaProduto {
  return { id: ID_DE_TESTE, ativo: true, destaque: false, ...base };
}

type Caso = {
  rotulo: string;
  produto: LinhaProduto;
  recheios?: [string, string][];
  sabores?: string[];
};

const DESC_BOLO =
  "Bolos com decoração em pasta americana serão feitos apenas com os recheios de chocolate. Mande sua foto de inspiração. Na Pingo de Mell trabalhamos com todos os temas!";

const RECHEIOS_BENTO: [string, string][] = [
  ["300b5263-1a9a-4057-86ac-b5ca0f7c3dfa", "Abacaxi com 4 leites"],
  ["c28405ad-981e-4870-a627-859464b50a0f", "Dois amores"],
  ["3e4b6f6f-33f9-45e4-b342-aac8eb0dfff2", "Morango com beijinho"],
  ["f9fa8cb0-d213-4817-815f-faac5667ffe5", "Morango com brigadeiro branco"],
  ["038e20c6-a1fd-409d-960f-7491ad8421d4", "Morango com brigadeiro preto"],
  ["9cd12346-a46f-42d1-87cf-430f6b4851f0", "Morango com dois amores"],
  ["cfb80f95-661c-47fe-955c-01ebeb931935", "Morango com prestígio"],
  ["46525bcb-6795-496a-aec6-5b0cfa3c6db9", "Ninho com morango"],
  ["e32078c4-ee56-49d4-8754-c7d54dd4f66d", "Ouro branco"],
  ["59511da5-2ff2-4384-b24a-9543f4051928", "Sonho de valsa"],
];

const RECHEIOS_GANACHE: [string, string][] = [
  ["429ebf9d-b052-4f4f-901f-39e587d160c4", "brigadeiro gourmet"],
  ["48a9a271-6252-43a6-83e5-12618220170d", "dois amores"],
  ["79b123f2-2c81-4c80-8f10-9d4ad7315ef8", "ouro branco"],
  ["13aa45f3-4abc-4589-b89d-0e42efe1a29f", "sonho de valsa"],
  ["477351a9-2615-4754-a820-4838b5168d1a", "prestígio"],
  ["6c40246c-08f5-4803-8f3b-e6058404f51b", "chiffon com brigadeiro"],
  ["94289152-6055-4bf2-8861-9357d7c5d442", "chiffon de frutas vermelhas"],
];

const CASOS: Caso[] = [
  {
    rotulo: "Bolos, tipo normal, o kg, com recheios (Bolo Ganache)",
    produto: linha({ nome: "Bolo Ganache", preco: 108, descricao: DESC_BOLO, pedido_minimo: 1, Categoria: "Bolos", prazo_producao_dias: 3, step_quantidade: "livre", tipo: "normal", unidade_venda: "o kg" }),
    recheios: RECHEIOS_GANACHE,
  },
  {
    rotulo: "Bolos, tipo normal, o kg, sem recheios (Bolo decorado em acetato)",
    produto: linha({ nome: "Bolo decorado em acetato", preco: 80, descricao: "Consultar sabores disponíveis. Bolos com decoração em pasta americana serão feitos apenas com os recheios de chocolate. Mande sua foto de inspiração. Na Pingo de Mell trabalhamos com todos os temas!", pedido_minimo: 1, Categoria: "Bolos", prazo_producao_dias: 3, step_quantidade: "livre", tipo: "normal", unidade_venda: "o kg" }),
  },
  {
    rotulo: "Bolos, tipo normal, unidade (Bolo de banana)",
    produto: linha({ nome: "Bolo de banana", preco: 35, descricao: "Bolo caseirinho de 850g", pedido_minimo: 1, Categoria: "Bolos", prazo_producao_dias: 1, step_quantidade: "livre", tipo: "normal", unidade_venda: "unidade" }),
  },
  {
    rotulo: "Bolos, tipo bolo (Bolo tradicional)",
    produto: linha({ nome: "Bolo tradicional (recheio à escolha)", preco: 65, descricao: DESC_BOLO, pedido_minimo: 1, Categoria: "Bolos", prazo_producao_dias: 3, step_quantidade: "livre", tipo: "bolo", unidade_venda: "o kg", destaque: true }),
  },
  {
    rotulo: "Bento Cake, o combo (Bento Cake com 6 doces)",
    produto: linha({ id: ID_DE_TESTE, nome: "Bento Cake com 6 doces", preco: 75, descricao: "Bento Cake mais 6 doces", pedido_minimo: 1, Categoria: "Bento Cake", prazo_producao_dias: 2, step_quantidade: "livre", tipo: "bento_cake", unidade_venda: "o combo" }),
    recheios: RECHEIOS_BENTO,
  },
  {
    rotulo: "Bento Cake, o combo, preço de dois dígitos (Bento Cake com 25 doces)",
    produto: linha({ nome: "Bento Cake com 25 doces", preco: 95, descricao: "Bento Cake 300g mais 25 doces gourmet: 5 surpresa de uva, 5 doces de leite, 5 ninho com nutella, 5 dois amores, 5 croco amendoim", pedido_minimo: 1, Categoria: "Bento Cake", prazo_producao_dias: 2, step_quantidade: "livre", tipo: "bento_cake", unidade_venda: "o combo" }),
    recheios: RECHEIOS_BENTO,
  },
  {
    rotulo: "Bento Cake, unidade (Bento Cake)",
    produto: linha({ nome: "Bento Cake", preco: 42, descricao: "300g, 10 cm de diâmetro, serve até 2 pessoas, embalagem de acetato incluída", pedido_minimo: 1, Categoria: "Bento Cake", prazo_producao_dias: 2, step_quantidade: "livre", tipo: "bento_cake", unidade_venda: "unidade" }),
    recheios: RECHEIOS_BENTO,
  },
  {
    rotulo: "Doces, normal, step livre, prazo 7 (Maçã com modelagem)",
    produto: linha({ nome: "Maçã com modelagem", preco: 16, descricao: "Maçã com modelagem. Sob encomenda, no tema da festa. Sem pedido mínimo. Encomende com 1 semana de antecedência.", pedido_minimo: 1, Categoria: "Doces", prazo_producao_dias: 7, step_quantidade: "livre", tipo: "normal", unidade_venda: "unidade" }),
  },
  {
    rotulo: "Doces, normal, múltiplos de 5, preço com centavos (Barquinha de morango)",
    produto: linha({ nome: "Barquinha de morango", preco: 2.5, descricao: "Barquinha de morango, doce fino para mesa de festa.", pedido_minimo: 10, Categoria: "Doces", prazo_producao_dias: 1, step_quantidade: "multiplos_5", tipo: "normal", unidade_venda: "unidade" }),
  },
  {
    rotulo: "Doces, normal, múltiplos de 10, preço com 2 casas (4 leites)",
    produto: linha({ nome: "4 leites (gourmet 15g)", preco: 2.35, descricao: "Docinho gourmet sabor 4 leites, 15g. Todos os docinhos são de panela, feitos com muito carinho.", pedido_minimo: 30, Categoria: "Doces", prazo_producao_dias: 1, step_quantidade: "multiplos_10", tipo: "normal", unidade_venda: "unidade" }),
  },
  {
    rotulo: "Doces, Cento, com sabores (Cento de docinhos)",
    produto: linha({ nome: "Cento de docinhos (8g)", preco: 95, descricao: "Cento de docinhos tradicionais de 8g com sabores à escolha. Todos os docinhos são de panela, feitos com muito carinho.", pedido_minimo: 1, Categoria: "Doces", prazo_producao_dias: 2, step_quantidade: "livre", tipo: "cento", unidade_venda: "o cento" }),
    sabores: ["Beijinho (8g)", "Brigadeiro (8g)", "Brigadeiro branco (8g)", "Brigadeiro de morango (8g)", "Cajuzinho (8g)", "Doce de leite (8g)", "Dois amores (8g)", "Mineirinho (8g)"],
  },
  {
    rotulo: "Salgados, normal, unidade, múltiplos de 10, destaque (Bolinha de queijo)",
    produto: linha({ nome: "Bolinha de queijo", preco: 0.9, descricao: "Bolinha de queijo frita.", pedido_minimo: 10, Categoria: "Salgados", prazo_producao_dias: 1, step_quantidade: "multiplos_10", tipo: "normal", unidade_venda: "unidade", destaque: true }),
  },
  {
    rotulo: "Salgados, normal, o cento (Bolinha de queijo congelada)",
    produto: linha({ nome: "Bolinha de queijo (congelada)", preco: 48, descricao: "Bolinha de queijo congelada. Venda por cento (100 unidades). Indicados para quem já possui experiência no preparo de salgados congelados. Após a entrega, o resultado final depende do modo de preparo, por isso não nos responsabilizamos por eventuais imprevistos.", pedido_minimo: 1, Categoria: "Salgados", prazo_producao_dias: 3, step_quantidade: "livre", tipo: "normal", unidade_venda: "o cento" }),
  },
  {
    rotulo: "Salgados, Cento, com sabores (Cento de salgados assados)",
    produto: linha({ nome: "Cento de salgados assados", preco: 160, descricao: "Cento de salgados assados com sabores à escolha", pedido_minimo: 1, Categoria: "Salgados", prazo_producao_dias: 2, step_quantidade: "livre", tipo: "cento", unidade_venda: "o cento" }),
    sabores: ["Empadinha de frango", "Empadinha de frango com requeijão", "Empadinha de palmito", "Mini pizza de calabresa", "Mini pizza de frango", "Mini pizza de queijo e presunto"],
  },
  {
    rotulo: "Kit Festa, o kit (Kit Escolar 1)",
    produto: linha({ nome: "Kit Escolar 1", preco: 400, descricao: "Contém 100 brigadeiros de chocolate (8g), 2 kg de bolo com recheio de chocolate (cerca de 20 fatias, papel arroz incluso), 100 salgados fritos, 50 gelatinas (copinho 50ml), 3 sucos de uva 1L, velinha simples", pedido_minimo: 1, Categoria: "Kit Festa", prazo_producao_dias: 4, step_quantidade: "livre", tipo: "normal", unidade_venda: "o kit" }),
  },
  {
    rotulo: "Kit Festa, o combo (Combo 100 doces personalizados)",
    produto: linha({ nome: "Combo 100 doces personalizados", preco: 530, descricao: "10 cupcakes com modelagem 2D, 10 pirulitos com modelagem, 20 bombons com modelagem, 20 tarteletes com modelagem, 15 vasinhos com idade, 15 colheres de chocolate, 10 cones recheados com trufa. Combos prontos: não fazemos alterações nos combos personalizados. Você pode mandar sua foto de inspiração, na Pingo de Mell trabalhamos com todos os temas!", pedido_minimo: 1, Categoria: "Kit Festa", prazo_producao_dias: 7, step_quantidade: "livre", tipo: "normal", unidade_venda: "o combo" }),
  },
  {
    rotulo: "Kit Festa, caixa (Festa na Caixa)",
    produto: linha({ nome: "Festa na Caixa", preco: 160, descricao: "Serve no máximo 2 pessoas. Caixa branca, cliente escolhe a cor do laço. Contém 300g de bolo Dois amores decorado com Kit Kat, 12 doces gourmet na caixinha, 15 salgados fritos, 2 ouro branco, 2 sonhos de valsa, 1 Kinder Bueno, 1 suquinho, 1 coquinha, 2 mousses de maracujá", pedido_minimo: 1, Categoria: "Kit Festa", prazo_producao_dias: 2, step_quantidade: "livre", tipo: "normal", unidade_venda: "caixa" }),
  },
  {
    rotulo: "Adicionais, o kg (Adicional nata por fora)",
    produto: linha({ nome: "Adicional nata por fora", preco: 15, descricao: "Nata por fora do bolo, valor por kg. Você pode mandar sua foto de inspiração, na Pingo de Mell trabalhamos com todos os temas!", pedido_minimo: 1, Categoria: "Adicionais", prazo_producao_dias: 1, step_quantidade: "livre", tipo: "normal", unidade_venda: "o kg" }),
  },
  {
    rotulo: "Adicionais, unidade (Adicional 1 kg de bolo com topper)",
    produto: linha({ nome: "Adicional 1 kg de bolo com topper (Kit Escolar Individual)", preco: 93, descricao: "1 kg de bolo com topper para somar ao Kit Escolar Individual. Você pode mandar sua foto de inspiração, na Pingo de Mell trabalhamos com todos os temas!", pedido_minimo: 1, Categoria: "Adicionais", prazo_producao_dias: 1, step_quantidade: "livre", tipo: "normal", unidade_venda: "unidade" }),
  },
];

// Colunas que o Salvar pode escrever em produtos (menos image_url, que só vai
// com capa nova, e atualizado_em, que é do gatilho).
const COLUNAS: [coluna: string, chave: keyof LinhaProduto][] = [
  ["nome", "nome"],
  ["preco", "preco"],
  ["descricao", "descricao"],
  ["pedido_minimo", "pedido_minimo"],
  ["Categoria", "Categoria"],
  ["unidade_venda", "unidade_venda"],
  ["prazo_producao_dias", "prazo_producao_dias"],
  ["step_quantidade", "step_quantidade"],
  ["destaque", "destaque"],
  ["ativo", "ativo"],
  ["tipo", "tipo"],
];

async function salvarSemMexer(caso: Caso) {
  const { produto } = caso;
  const candidatos = (caso.sabores ?? []).map((nome) => ({ nome, ativo: true }));
  const { container } = render(
    <ProdutoForm
      action={(anterior, dados) => updateProduto(produto.nome, anterior, dados)}
      produto={{ ...produto, slug: "x", image_url: null, criado_em: null } as never}
      produtoId={produto.id}
      submitLabel="Salvar alterações"
      produtosDisponiveis={candidatos}
      initialSubitens={caso.sabores ?? []}
      recheiosIniciais={(caso.recheios ?? []).map(([id, nome]) => ({ id, nome }))}
    />
  );
  fireEvent.submit(container.querySelector("form") as HTMLFormElement);
  await waitFor(() => expect(chamadas.update).toHaveLength(1));
  // A Server Action segue depois do UPDATE (subitens, recheios, galeria).
  await waitFor(() => expect(chamadas.centoDelete).toHaveLength(1));
  await new Promise((r) => setTimeout(r, 0));
}

describe("Salvar sem mudar nada não altera o produto", () => {
  it("cobre uma linha real de cada combinação pedida", () => {
    const combinacoes = new Set(CASOS.map(({ produto: p }) => `${p.Categoria}|${p.tipo}|${p.unidade_venda}`));
    for (const esperada of [
      "Bolos|normal|o kg",
      "Bolos|normal|unidade",
      "Bolos|bolo|o kg",
      "Bento Cake|bento_cake|o combo",
      "Bento Cake|bento_cake|unidade",
      "Doces|normal|unidade",
      "Doces|cento|o cento",
      "Salgados|normal|unidade",
      "Salgados|cento|o cento",
      "Kit Festa|normal|o kit",
      "Adicionais|normal|unidade",
    ]) {
      expect(combinacoes, esperada).toContain(esperada);
    }
  });

  describe.each(CASOS)("$rotulo", (caso) => {
    it("nenhuma coluna de produtos muda", async () => {
      await salvarSemMexer(caso);
      const payload = chamadas.update[0];
      const original = caso.produto as unknown as Record<string, unknown>;
      for (const [coluna, chave] of COLUNAS) {
        // Fora do UPDATE = o banco guarda o que já tem. Dentro, tem de ser
        // igual à linha.
        if (coluna in payload) expect(payload[coluna], coluna).toEqual(original[chave]);
      }
      // Nenhuma coluna a mais além das conhecidas (um campo novo no UPDATE
      // precisa entrar neste teste).
      expect(Object.keys(payload).filter((c) => !COLUNAS.some(([n]) => n === c))).toEqual([]);
    });

    it("os recheios personalizados voltam com os mesmos ids, ordem e nomes", async () => {
      await salvarSemMexer(caso);
      const chamadasRecheios = chamadas.rpc.filter((c) => c.nome === "salvar_produto_recheios");
      const esperado = (caso.recheios ?? []).map(([id, nome]) => ({ id, nome }));
      const aceita = caso.produto.tipo === "bento_cake" || (caso.produto.Categoria === "Bolos" && caso.produto.tipo === "normal");
      if (esperado.length === 0 && !aceita) {
        // Produto que não aceita recheios e não tem lista: nada é enviado.
        expect(chamadasRecheios).toHaveLength(0);
        return;
      }
      expect(chamadasRecheios).toHaveLength(1);
      expect(chamadasRecheios[0].args.p_produto_id).toBe(caso.produto.id);
      expect(chamadasRecheios[0].args.p_recheios).toEqual(esperado);
    });

    it("os sabores do Cento voltam os mesmos, na mesma ordem", async () => {
      await salvarSemMexer(caso);
      expect(chamadas.centoDelete).toEqual([caso.produto.nome]);
      const sabores = chamadas.centoInsert.flat();
      expect(sabores.map((s) => s.subitem_nome)).toEqual(caso.sabores ?? []);
      expect(sabores.every((s) => s.cento_nome === caso.produto.nome)).toBe(true);
      expect(sabores.map((s) => s.ordem)).toEqual(sabores.map((_, i) => sabores[0].ordem + i));
    });
  });
});
