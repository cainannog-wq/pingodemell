// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { escreverCarrinho, type LinhaCarrinho } from "@/lib/carrinho/regras";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";
import { AVISO_VIROU_ITEM_NOVO } from "./_interna/edicao";

// Modo edição da interna de Cento e de Bolo (?editar={id da linha}), aberto
// pelo ícone de editar do carrinho, com o banco simulado (nada real). A linha
// só é trocada quando a edição é confirmada, na mesma posição e sem juntar com
// outra; se o vínculo se perde, confirmar vira adição comum.

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} src={props.src as string} />;
  },
}));

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
const buscaDaUrl = vi.hoisted(() => ({ atual: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  usePathname: () => "/produtos/x",
  // A busca da URL, lida no navegador (ConfigEditavelDaUrl).
  useSearchParams: () => new URLSearchParams(buscaDaUrl.atual),
  notFound: () => {
    throw new Error("404");
  },
}));

let banco: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({ createPublicClient: vi.fn(() => clienteSimulado(banco)) }));

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, "0")}`,
    slug: `produto-${seq}`,
    nome: `Produto ${seq}`,
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

let seqRecheio = 0;
function recheio(parcial: Record<string, unknown>) {
  seqRecheio += 1;
  return {
    id: `rrrrrrrr-0000-4000-8000-${String(seqRecheio).padStart(12, "0")}`,
    nome: `Recheio ${seqRecheio}`,
    vale_bolo: false,
    vale_bento: false,
    preco_kg: null,
    grupo: null,
    ativo: true,
    ...parcial,
  };
}

const BOLO = produto({ nome: "Bolo de Chocolate", slug: "bolo-de-chocolate", Categoria: "Bolos", tipo: "bolo", preco: 45, unidade_venda: "kg" });
const OUTRO_BOLO = produto({ nome: "Bolo de Cenoura", slug: "bolo-de-cenoura", Categoria: "Bolos", tipo: "bolo", preco: 45, unidade_venda: "kg" });
const SMASH = produto({ nome: "Smash Cake", slug: "smash-cake", Categoria: "Bolos", preco: 70 });
const EMPADA = produto({ nome: "Empada de palmito", slug: "empada", Categoria: "Salgados", preco: 4.5 });
const RISOLE = produto({ nome: "Risole de carne", slug: "risole", Categoria: "Salgados", preco: 4.5 });
const CENTO = produto({ nome: "Cento de salgados sortidos", slug: "cento-de-salgados", Categoria: "Salgados", tipo: "cento", preco: 95.99 });

const BRIGADEIRO = recheio({ nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros" });
const MORANGO = recheio({ nome: "Morango", vale_bolo: true, preco_kg: 95, grupo: "frutas" });
const ANTIGO = recheio({ nome: "Antigo", vale_bolo: true, preco_kg: 10, grupo: "frutas", ativo: false });

beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});

beforeEach(() => {
  banco = novoBanco(
    {
      produtos: [BOLO, OUTRO_BOLO, SMASH, EMPADA, RISOLE, CENTO],
      recheios: [BRIGADEIRO, MORANGO, ANTIGO],
      produto_cento_itens: [
        { cento_nome: CENTO.nome, subitem_nome: RISOLE.nome, ordem: 0 },
        { cento_nome: CENTO.nome, subitem_nome: EMPADA.nome, ordem: 1 },
      ],
      produto_fotos: [],
    },
    "anon"
  );
  window.localStorage.clear();
  reiniciarParaTeste();
  push.mockClear();
});
afterEach(cleanup);

// --- linhas do carrinho como a interna grava ---------------------------------

const avulso: LinhaCarrinho = {
  id: "l-smash",
  tipo: "normal",
  produtoId: SMASH.id,
  slug: SMASH.slug,
  nome: SMASH.nome,
  preco: 70,
  unidade_venda: null,
  quantidade: 2,
  pedidoMinimo: 1,
  step: "livre",
  foto: null,
  observacao: null,
};
function linhaBolo(id: string, parcial: Partial<Extract<LinhaCarrinho, { tipo: "bolo" }>> = {}): LinhaCarrinho {
  return {
    id,
    tipo: "bolo",
    produtoId: BOLO.id,
    slug: BOLO.slug,
    nome: BOLO.nome,
    preco: 80,
    quantidade: 3,
    recheio: { id: BRIGADEIRO.id as string, nome: "Brigadeiro" },
    formato: "quadrado",
    foto: null,
    observacao: "tema unicórnio",
    ...parcial,
  };
}
function linhaCento(
  id: string,
  sabores: [string, number][] = [["Risole de carne", 120], ["Empada de palmito", 80]],
  quantidade = 2,
  observacao: string | null = "sem cebola"
): LinhaCarrinho {
  return {
    id,
    tipo: "cento",
    produtoId: CENTO.id,
    slug: CENTO.slug,
    nome: CENTO.nome,
    preco: 95.99,
    quantidade,
    sabores: sabores.map(([nome, q]) => ({ nome, quantidade: q })),
    foto: null,
    observacao,
  };
}

function gravar(linhas: LinhaCarrinho[]) {
  window.localStorage.setItem(CHAVE_CARRINHO, escreverCarrinho(linhas));
}
const salvo = (): LinhaCarrinho[] => JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO)!).linhas;

async function renderInterna(slug: string, editar?: string) {
  const { default: ProdutoPage } = await import("./page");
  // O ?editar= é lido no navegador (useSearchParams), não pelo servidor.
  buscaDaUrl.atual = editar ? `editar=${encodeURIComponent(editar)}` : "";
  const ui = await ProdutoPage({ params: Promise.resolve({ slug }) });
  reiniciarParaTeste();
  return render(<CarrinhoProvider>{ui}</CarrinhoProvider>);
}

const resumo = () => document.querySelector(".interna-resumo") as HTMLElement;
const botaoSalvar = () => within(resumo()).getByRole("button", { name: "Salvar alteração" });
const botaoAdicionar = () => within(resumo()).getByRole("button", { name: "Adicionar ao pedido" });
const kg = () => screen.getByRole("textbox", { name: "Tamanho em kg" });
const observacao = () => screen.getByRole("textbox", { name: /observação/i });
function valorDoSabor(nome: string): string {
  const item = screen.getByText(nome, { selector: ".interna-sabor-nome" }).closest("li") as HTMLElement;
  return (item.querySelector(".site-seletor-valor") as HTMLElement).textContent!.replace(`${nome}: `, "");
}
// Só o grupo de recheio (o de formato sempre tem um marcado).
const recheioMarcado = () =>
  within(document.querySelector(".interna-recheio") as HTMLElement).queryByRole("radio", { checked: true });
const aviso = (texto: RegExp) => screen.queryByText(texto);
const TEXTO_EDITANDO = /Você está editando um item do seu pedido\. Ele só muda quando você salvar\./;
const TEXTO_PERDIDO = /Esse item não está mais no seu pedido\. Ao confirmar, ele entra como item novo\./;

describe("Editar Bolo — abrir pré-preenchido", () => {
  it("kg, formato, recheio e observação vêm do que está gravado; o carrinho não muda e o botão é 'Salvar alteração'", async () => {
    const lista = [avulso, linhaBolo("l-bolo")];
    gravar(lista);
    await renderInterna("bolo-de-chocolate", "l-bolo");

    expect(kg()).toHaveValue("3");
    expect(screen.getByRole("radio", { name: /Brigadeiro/ })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Quadrado" })).toBeChecked();
    expect(observacao()).toHaveValue("tema unicórnio");
    expect(aviso(TEXTO_EDITANDO)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Cancelar e voltar ao carrinho" })).toHaveAttribute("href", "/carrinho");
    expect(botaoSalvar()).toBeEnabled();
    expect(within(resumo()).queryByRole("button", { name: "Adicionar ao pedido" })).toBeNull();
    expect(within(resumo()).getByText("3 kg × R$ 80,00")).toBeInTheDocument();
    expect(salvo()).toEqual(lista);
  });

  it("sem ?editar= a interna é a de sempre: sem faixa, começa vazia e o botão é 'Adicionar ao pedido'", async () => {
    gravar([linhaBolo("l-bolo")]);
    await renderInterna("bolo-de-chocolate");
    expect(aviso(TEXTO_EDITANDO)).toBeNull();
    expect(aviso(TEXTO_PERDIDO)).toBeNull();
    expect(kg()).toHaveValue("1");
    expect(botaoAdicionar()).toBeDisabled();
  });

  it("recheio que saiu do catálogo do Bolo não vem escolhido: a cliente escolhe de novo", async () => {
    gravar([linhaBolo("l-bolo", { recheio: { id: ANTIGO.id as string, nome: "Antigo" } })]);
    await renderInterna("bolo-de-chocolate", "l-bolo");
    expect(aviso(TEXTO_EDITANDO)).toBeInTheDocument();
    expect(recheioMarcado()).toBeNull();
    expect(botaoSalvar()).toBeDisabled();
    expect(within(resumo()).getByText("Escolha o recheio para adicionar.")).toBeInTheDocument();
  });
});

describe("Editar Bolo — confirmar troca a linha", () => {
  it("troca na mesma posição, com o mesmo id, sem mudar o tamanho da lista, e leva ao carrinho", async () => {
    const outro = linhaBolo("l-outro", { quantidade: 8, formato: "redondo", observacao: null });
    gravar([avulso, linhaBolo("l-bolo"), outro]);
    await renderInterna("bolo-de-chocolate", "l-bolo");

    fireEvent.change(kg(), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("radio", { name: /Morango/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Redondo" }));
    fireEvent.change(observacao(), { target: { value: "sem topo" } });
    expect(salvo()[1]).toEqual(linhaBolo("l-bolo")); // ainda nada mudou
    fireEvent.click(botaoSalvar());

    const linhas = salvo();
    expect(linhas.map((l) => l.id)).toEqual(["l-smash", "l-bolo", "l-outro"]);
    expect(linhas[1]).toMatchObject({
      id: "l-bolo",
      tipo: "bolo",
      quantidade: 5,
      preco: 95,
      formato: "redondo",
      observacao: "sem topo",
      recheio: { id: MORANGO.id, nome: "Morango" },
    });
    expect(linhas[0]).toEqual(avulso);
    expect(linhas[2]).toEqual(outro);
    expect(push).toHaveBeenCalledWith("/carrinho");
  });

  it("editar um Bolo até ficar igual a outro Bolo não junta: continuam duas linhas", async () => {
    const outro = linhaBolo("l-outro", { observacao: null });
    gravar([linhaBolo("l-bolo", { quantidade: 2, formato: "redondo" }), outro]);
    await renderInterna("bolo-de-chocolate", "l-bolo");
    fireEvent.change(kg(), { target: { value: "3" } });
    fireEvent.click(screen.getByRole("radio", { name: "Quadrado" }));
    fireEvent.change(observacao(), { target: { value: "" } });
    fireEvent.click(botaoSalvar());
    const linhas = salvo();
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.id)).toEqual(["l-bolo", "l-outro"]);
    expect(linhas[0]).toMatchObject({ quantidade: 3, formato: "quadrado", observacao: null });
  });
});

describe("Editar Bolo — desistir e perder o vínculo", () => {
  it("voltar, navegar ou fechar sem confirmar deixa a linha original exatamente como estava", async () => {
    const lista = [avulso, linhaBolo("l-bolo")];
    gravar(lista);
    const { unmount } = await renderInterna("bolo-de-chocolate", "l-bolo");
    fireEvent.change(kg(), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("radio", { name: /Morango/ }));
    unmount();
    expect(salvo()).toEqual(lista);
    expect(push).not.toHaveBeenCalled();
  });

  it("atualizar a interna antes de confirmar: continua editando, campos voltam ao gravado e o carrinho não muda", async () => {
    const lista = [linhaBolo("l-bolo")];
    gravar(lista);
    const { unmount } = await renderInterna("bolo-de-chocolate", "l-bolo");
    fireEvent.change(kg(), { target: { value: "9" } });
    unmount();

    await renderInterna("bolo-de-chocolate", "l-bolo"); // "F5": a URL guarda o vínculo
    expect(aviso(TEXTO_EDITANDO)).toBeInTheDocument();
    expect(kg()).toHaveValue("3");
    expect(salvo()).toEqual(lista);
  });

  it("id que não existe no carrinho (removida em outra aba, endereço mexido): aviso, interna vazia e confirmar vira adição nova no fim", async () => {
    const lista = [linhaBolo("l-bolo"), avulso];
    gravar(lista);
    await renderInterna("bolo-de-chocolate", "nao-existe");

    expect(aviso(TEXTO_PERDIDO)).toBeInTheDocument();
    expect(aviso(TEXTO_EDITANDO)).toBeNull();
    expect(kg()).toHaveValue("1");
    expect(recheioMarcado()).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Morango/ }));
    fireEvent.click(botaoAdicionar());

    const linhas = salvo();
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toEqual(lista[0]);
    expect(linhas[1]).toEqual(lista[1]);
    expect(linhas[2]).toMatchObject({ tipo: "bolo", quantidade: 1, recheio: { nome: "Morango" } });
    // Fora do modo edição é a adição comum, que leva ao carrinho (07/10/2026).
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/carrinho");
  });

  it("linha de outro produto ou de outro tipo não serve de vínculo", async () => {
    gravar([linhaBolo("l-bolo"), linhaCento("l-cento")]);
    await renderInterna("bolo-de-cenoura", "l-bolo"); // outro Bolo
    expect(aviso(TEXTO_PERDIDO)).toBeInTheDocument();
    cleanup();
    await renderInterna("bolo-de-chocolate", "l-cento"); // é um Cento
    expect(aviso(TEXTO_PERDIDO)).toBeInTheDocument();
    cleanup();
    await renderInterna("bolo-de-chocolate", "l-smash"); // avulso
    expect(aviso(TEXTO_PERDIDO)).toBeInTheDocument();
  });

  it("a linha some em outra aba depois de abrir: confirmar não troca nada em silêncio, entra como item novo e avisa", async () => {
    const outro = linhaBolo("l-outro", { observacao: null });
    gravar([linhaBolo("l-bolo"), outro]);
    await renderInterna("bolo-de-chocolate", "l-bolo");
    expect(aviso(TEXTO_EDITANDO)).toBeInTheDocument();

    gravar([outro]); // outra aba removeu a linha
    fireEvent.change(kg(), { target: { value: "6" } });
    fireEvent.click(botaoSalvar());

    const linhas = salvo();
    expect(linhas.map((l) => l.id)).toContain("l-outro");
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual(outro);
    expect(linhas[1]).toMatchObject({ tipo: "bolo", quantidade: 6 });
    expect(linhas[1].id).not.toBe("l-bolo");
    expect(push).not.toHaveBeenCalled();
    expect(screen.getAllByText(AVISO_VIROU_ITEM_NOVO).length).toBeGreaterThan(0);
    expect(within(resumo()).getByRole("button", { name: "Adicionar ao pedido" })).toBeInTheDocument();
  });

  it("a linha muda em outra aba depois de abrir: a versão de lá fica intacta e a edição entra como item novo", async () => {
    gravar([linhaBolo("l-bolo")]);
    await renderInterna("bolo-de-chocolate", "l-bolo");

    const mexida = linhaBolo("l-bolo", { quantidade: 10 });
    gravar([mexida]);
    fireEvent.change(kg(), { target: { value: "6" } });
    fireEvent.click(botaoSalvar());

    const linhas = salvo();
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual(mexida);
    expect(linhas[1]).toMatchObject({ tipo: "bolo", quantidade: 6 });
    expect(linhas[1].id).not.toBe("l-bolo");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("Editar Cento", () => {
  it("abre com centos, distribuição e observação do que está gravado; o carrinho não muda", async () => {
    const lista = [linhaCento("l-cento"), avulso];
    gravar(lista);
    await renderInterna("cento-de-salgados", "l-cento");

    expect(aviso(TEXTO_EDITANDO)).toBeInTheDocument();
    expect(document.querySelector(".interna-quantidade")).toHaveTextContent("número de centos: 2");
    expect(document.querySelector(".interna-quantidade")).toHaveTextContent("centos · 200 unidades");
    expect(valorDoSabor("Risole de carne")).toBe("120");
    expect(valorDoSabor("Empada de palmito")).toBe("80");
    expect(screen.getByText("200 de 200 selecionados")).toBeInTheDocument();
    expect(observacao()).toHaveValue("sem cebola");
    expect(botaoSalvar()).toBeEnabled();
    expect(salvo()).toEqual(lista);
  });

  it("confirmar troca na mesma posição com a nova distribuição e leva ao carrinho", async () => {
    const outro = linhaCento("l-outro", [["Risole de carne", 100]], 1, null);
    gravar([avulso, linhaCento("l-cento"), outro]);
    await renderInterna("cento-de-salgados", "l-cento");

    fireEvent.click(screen.getByRole("button", { name: "Diminuir Risole de carne" }));
    fireEvent.click(screen.getByRole("button", { name: "Aumentar Empada de palmito" }));
    fireEvent.click(botaoSalvar());

    const linhas = salvo();
    expect(linhas.map((l) => l.id)).toEqual(["l-smash", "l-cento", "l-outro"]);
    expect(linhas[1]).toMatchObject({
      id: "l-cento",
      quantidade: 2,
      sabores: [
        { nome: "Risole de carne", quantidade: 110 },
        { nome: "Empada de palmito", quantidade: 90 },
      ],
      observacao: "sem cebola",
    });
    expect(linhas[2]).toEqual(outro);
    expect(push).toHaveBeenCalledWith("/carrinho");
  });

  it("editar até a composição ficar idêntica à de outro Cento NÃO soma as linhas: é troca de um por um", async () => {
    const igual = linhaCento("l-outro", [["Risole de carne", 60], ["Empada de palmito", 40]], 1, null);
    gravar([linhaCento("l-cento", [["Risole de carne", 60], ["Empada de palmito", 40]], 1, "sem cebola"), igual]);
    await renderInterna("cento-de-salgados", "l-cento");
    fireEvent.change(observacao(), { target: { value: "" } });
    fireEvent.click(botaoSalvar());

    const linhas = salvo();
    expect(linhas).toHaveLength(2);
    expect(linhas.map((l) => l.id)).toEqual(["l-cento", "l-outro"]);
    expect(linhas[0]).toMatchObject({ quantidade: 1, observacao: null });
    expect(linhas[1]).toEqual(igual);
  });

  it("desistir sem confirmar mantém a linha original; sabor que saiu do catálogo não entra e a soma pede para completar", async () => {
    const lista = [linhaCento("l-cento", [["Risole de carne", 100], ["Kibe", 100]])];
    gravar(lista);
    const { unmount } = await renderInterna("cento-de-salgados", "l-cento");
    expect(valorDoSabor("Risole de carne")).toBe("100");
    expect(screen.getByText("100 de 200 selecionados")).toBeInTheDocument();
    expect(botaoSalvar()).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar Empada de palmito" }));
    unmount();
    expect(salvo()).toEqual(lista);
    expect(push).not.toHaveBeenCalled();
  });

  it("vínculo perdido: interna vazia com aviso e confirmar entra como item novo, sem tocar nas outras linhas", async () => {
    const lista = [linhaCento("l-cento")];
    gravar(lista);
    await renderInterna("cento-de-salgados", "outra-linha");
    expect(aviso(TEXTO_PERDIDO)).toBeInTheDocument();
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByRole("button", { name: "Aumentar Risole de carne" }));
    fireEvent.click(botaoAdicionar());
    const linhas = salvo();
    expect(linhas).toHaveLength(2);
    expect(linhas[0]).toEqual(lista[0]);
    expect(linhas[1]).toMatchObject({ tipo: "cento", quantidade: 1 });
    // Fora do modo edição é a adição comum, que leva ao carrinho (07/10/2026).
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/carrinho");
  });
});

// PR perf/vitrine-consultas-cache: a interna fica em cache na borda e o
// ?editar= é lido no navegador. Com ele na URL, a configuração comum (com
// "Adicionar ao pedido") nunca chega a aparecer no navegador: nem por um
// instante antes de o modo edição entrar, então não há como adicionar uma
// linha nova por engano.
describe("?editar= lido no navegador (interna em cache)", () => {
  for (const [rotulo, slug, linha] of [
    ["Bolo", "bolo-de-chocolate", () => linhaBolo("l-bolo")],
    ["Cento", "cento-de-salgados", () => linhaCento("l-cento")],
  ] as const) {
    it(`${rotulo}: com ?editar=, o botão 'Adicionar ao pedido' não aparece em nenhum momento`, async () => {
      gravar([linha(), avulso]);
      const vistos: string[] = [];
      const observador = new MutationObserver(() => {
        for (const b of document.querySelectorAll("button")) vistos.push(b.textContent ?? "");
      });
      observador.observe(document.body, { childList: true, subtree: true, characterData: true });
      await renderInterna(slug, rotulo === "Bolo" ? "l-bolo" : "l-cento");
      observador.disconnect();
      expect(vistos.some((t) => t.includes("Salvar alteração"))).toBe(true);
      expect(vistos.some((t) => t.includes("Adicionar ao pedido"))).toBe(false);
      expect(botaoSalvar()).toBeInTheDocument();
    });
  }
});
