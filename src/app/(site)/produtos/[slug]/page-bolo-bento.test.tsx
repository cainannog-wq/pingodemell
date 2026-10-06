// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// Interna do Bolo, do Bento Cake e do Smash Cake com o banco simulado (nada
// real): recheios do catálogo, preço, avisos, carrinho e disponibilidade
// independente dos dois lados do catálogo.

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

class NaoEncontrado extends Error {}
const buscaDaUrl = vi.hoisted(() => ({ atual: "" }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/produtos/x",
  // A busca da URL, lida no navegador (ConfigEditavelDaUrl).
  useSearchParams: () => new URLSearchParams(buscaDaUrl.atual),
  notFound: () => {
    throw new NaoEncontrado("404");
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

const BOLO = produto({ nome: "Bolo de Chocolate", slug: "bolo-de-chocolate", Categoria: "Bolos", tipo: "bolo", preco: 45, unidade_venda: "kg", pedido_minimo: 5, destaque: true });
const SMASH = produto({ nome: "Smash Cake", slug: "smash-cake", Categoria: "Bolos", preco: 70 });
const BENTO = produto({ nome: "Bento Cake Flork", slug: "bento-flork", Categoria: "Bento Cake", tipo: "bento_cake", preco: 60, pedido_minimo: 2 });

const BRIGADEIRO = recheio({ nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros" });
const MORANGO = recheio({ nome: "Morango", vale_bolo: true, preco_kg: 95, grupo: "frutas" });
const DOCE_DE_LEITE = recheio({ nome: "Doce de leite", vale_bolo: true, preco_kg: 75, grupo: "chocolate_outros" });
const NINHO = recheio({ nome: "Ninho", vale_bento: true });
const ANTIGO = recheio({ nome: "Antigo", vale_bolo: true, vale_bento: true, preco_kg: 10, grupo: "frutas", ativo: false });

beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});

function montar(recheios: Record<string, unknown>[], papel: "anon" | "admin" = "anon") {
  banco = novoBanco({ produtos: [BOLO, SMASH, BENTO], recheios, produto_fotos: [] }, papel);
}

beforeEach(() => {
  montar([BRIGADEIRO, MORANGO, DOCE_DE_LEITE, NINHO, ANTIGO]);
  window.localStorage.clear();
  reiniciarParaTeste();
});
afterEach(cleanup);

async function renderInterna(slug: string) {
  const { default: ProdutoPage } = await import("./page");
  const ui = await ProdutoPage({ params: Promise.resolve({ slug }) });
  return render(
    <CarrinhoProvider>
      <SiteHeader />
      {ui}
    </CarrinhoProvider>
  );
}

const resumo = () => document.querySelector(".interna-resumo") as HTMLElement;
const botaoAdicionar = () => within(resumo()).getByRole("button", { name: "Adicionar ao pedido" });
const contador = () => screen.queryByTestId("contador-sacola");
const precoDoCabecalho = () => document.querySelector(".interna-preco")?.textContent?.replace(/\s+/g, " ");
const salvo = () => JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO)!).linhas;

describe("Interna — Bolo", () => {
  it("cabeçalho: 'a partir de' o menor R$/kg dos recheios ativos; sem Quantidade, mínimo nem step do cadastro", async () => {
    await renderInterna("bolo-de-chocolate");
    expect(precoDoCabecalho()).toBe("a partir de R$ 75,00 o kg");
    expect(screen.getByRole("textbox", { name: "Tamanho em kg" })).toHaveValue("1");
    expect(screen.queryByRole("textbox", { name: "Quantidade" })).toBeNull();
    expect(screen.queryByText(/Pedido mínimo/)).toBeNull();
    expect(screen.queryByText(/múltiplos/)).toBeNull();
    expect(document.body.textContent).not.toMatch(/null|undefined|NaN/);
  });

  it("recheios em dois grupos com o R$/kg; sem o inativo e sem o que vale só para Bento", async () => {
    await renderInterna("bolo-de-chocolate");
    const grupo = document.querySelector(".interna-recheio") as HTMLElement;
    expect(within(grupo).getByText("Recheio com Frutas")).toBeInTheDocument();
    expect(within(grupo).getByText("Recheio com chocolate e outros")).toBeInTheDocument();
    const nomes = within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent?.replace(/\s+/g, " "));
    expect(nomes).toEqual(["Morango R$ 95,00 o kg", "Brigadeiro R$ 80,00 o kg", "Doce de leite R$ 75,00 o kg"]);
    expect(within(grupo).queryByText("Ninho")).toBeNull();
    expect(within(grupo).queryByText("Antigo")).toBeNull();
  });

  it("o botão só liga com o recheio escolhido; preço = R$/kg do recheio × kg", async () => {
    await renderInterna("bolo-de-chocolate");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Escolha o recheio para adicionar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ }));
    expect(botaoAdicionar()).toBeEnabled();
    expect(within(resumo()).getByText("1 kg × R$ 80,00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar Tamanho em kg" }));
    fireEvent.click(screen.getByRole("button", { name: "Aumentar Tamanho em kg" }));
    expect(screen.getByRole("textbox", { name: "Tamanho em kg" })).toHaveValue("3");
    expect(within(resumo()).getByText("3 kg × R$ 80,00")).toBeInTheDocument();
    expect(within(resumo()).getByText("R$ 240,00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: /Morango/ }));
    expect(within(resumo()).getByText("R$ 285,00")).toBeInTheDocument();
  });

  it("acima de 10 kg só avisa (WhatsApp), sem bloquear; número inválido bloqueia", async () => {
    const user = userEvent.setup();
    await renderInterna("bolo-de-chocolate");
    fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ }));
    const campo = screen.getByRole("textbox", { name: "Tamanho em kg" });
    await user.clear(campo);
    await user.type(campo, "10");
    expect(screen.queryByText(/acima de 10 kg/)).toBeNull();
    await user.clear(campo);
    await user.type(campo, "12");
    expect(screen.getByText("Para bolos acima de 10 kg, combine com a gente pelo WhatsApp.")).toBeInTheDocument();
    expect(botaoAdicionar()).toBeEnabled();
    await user.clear(campo);
    await user.type(campo, "0");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Tamanho mínimo: 1 kg")).toBeInTheDocument();
    await user.tab();
    expect(campo).toHaveValue("1");
  });

  it("mostra o texto fixo da foto de referência e da decoração (nada de upload)", async () => {
    await renderInterna("bolo-de-chocolate");
    expect(screen.getByText(/Aceita foto de referência, envie pelo WhatsApp depois de confirmar\./)).toBeInTheDocument();
    expect(screen.getByText(/Decoração personalizada é orçada à parte/)).toBeInTheDocument();
    expect(document.querySelector('input[type="file"]')).toBeNull();
  });

  it("adicionar grava tipo bolo (recheio, formato, R$/kg); cada adicionar é um bolo, sem juntar", async () => {
    await renderInterna("bolo-de-chocolate");
    fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Quadrado" }));
    fireEvent.change(screen.getByRole("textbox", { name: /observação/i }), { target: { value: "tema unicórnio" } });
    fireEvent.click(botaoAdicionar());
    expect(contador()).toHaveTextContent("1");
    expect(salvo()).toMatchObject([
      {
        tipo: "bolo",
        produtoId: BOLO.id,
        quantidade: 1,
        preco: 80,
        formato: "quadrado",
        recheio: { id: BRIGADEIRO.id, nome: "Brigadeiro" },
        observacao: "tema unicórnio",
      },
    ]);
    fireEvent.click(botaoAdicionar());
    expect(contador()).toHaveTextContent("2");
    expect(salvo()).toHaveLength(2);
  });
});

describe("Interna — Bento Cake", () => {
  it("lista simples de recheios (só os de Bento, sem grupo e sem preço) e preço fixo do tema", async () => {
    await renderInterna("bento-flork");
    expect(precoDoCabecalho()).toBe("R$ 60,00");
    const grupo = document.querySelector(".interna-recheio") as HTMLElement;
    expect(within(grupo).queryByText(/Recheio com/)).toBeNull();
    const nomes = within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent?.replace(/\s+/g, " "));
    expect(nomes).toEqual(["Brigadeiro", "Ninho"]);
    expect(grupo.textContent).not.toMatch(/R\$/);
    expect(screen.queryByRole("group", { name: /Formato/ })).toBeNull();
  });

  it("quantidade começa no pedido mínimo do cadastro; o recheio não muda o preço", async () => {
    await renderInterna("bento-flork");
    expect(screen.getByText("Pedido mínimo: 2")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Quantidade" })).toHaveValue("2");
    expect(botaoAdicionar()).toBeDisabled();
    fireEvent.click(screen.getByRole("radio", { name: "Ninho" }));
    expect(within(resumo()).getByText("2 × R$ 60,00")).toBeInTheDocument();
    expect(within(resumo()).getByText("R$ 120,00")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Brigadeiro" }));
    expect(within(resumo()).getByText("R$ 120,00")).toBeInTheDocument();
  });

  it("adicionar grava tipo bento com o recheio; mesmo recheio soma, recheio diferente é outra linha", async () => {
    await renderInterna("bento-flork");
    fireEvent.click(screen.getByRole("radio", { name: "Ninho" }));
    fireEvent.click(botaoAdicionar());
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toMatchObject([{ tipo: "bento", produtoId: BENTO.id, quantidade: 4, preco: 60, recheio: { id: NINHO.id, nome: "Ninho" } }]);
    fireEvent.click(screen.getByRole("radio", { name: "Brigadeiro" }));
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toHaveLength(2);
    expect(contador()).toHaveTextContent("2");
  });
});

describe("Interna — Smash Cake", () => {
  it("é um produto normal em Bolos: tela do avulso, sem recheio nem tamanho, preço fixo do cadastro", async () => {
    await renderInterna("smash-cake");
    expect(precoDoCabecalho()).toBe("R$ 70,00");
    expect(screen.getByRole("textbox", { name: "Quantidade" })).toHaveValue("1");
    expect(screen.queryByRole("textbox", { name: "Tamanho em kg" })).toBeNull();
    expect(screen.queryByRole("radio")).toBeNull();
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toMatchObject([{ tipo: "normal", produtoId: SMASH.id, quantidade: 1, preco: 70 }]);
  });
});

describe("Interna — recheios vazios, um lado de cada vez", () => {
  it("sem recheio ativo de Bento: o Bento cai na 404 e o Bolo continua", async () => {
    montar([{ ...BRIGADEIRO, vale_bento: false }, MORANGO, DOCE_DE_LEITE]);
    await expect(renderInterna("bento-flork")).rejects.toBeInstanceOf(NaoEncontrado);
    await renderInterna("bolo-de-chocolate");
    expect(screen.getByRole("heading", { level: 1, name: "Bolo de Chocolate" })).toBeInTheDocument();
  });

  it("sem recheio ativo de Bolo: o Bolo cai na 404, o Bento continua e o Smash Cake nunca é afetado", async () => {
    montar([{ ...BRIGADEIRO, vale_bolo: false, preco_kg: null, grupo: null }, NINHO]);
    await expect(renderInterna("bolo-de-chocolate")).rejects.toBeInstanceOf(NaoEncontrado);
    await renderInterna("bento-flork");
    expect(screen.getByRole("heading", { level: 1, name: "Bento Cake Flork" })).toBeInTheDocument();
    cleanup();
    await renderInterna("smash-cake");
    expect(screen.getByRole("heading", { level: 1, name: "Smash Cake" })).toBeInTheDocument();
  });

  it("catálogo todo vazio: Bolo e Bento caem na 404, o Smash abre", async () => {
    montar([]);
    await expect(renderInterna("bolo-de-chocolate")).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(renderInterna("bento-flork")).rejects.toBeInstanceOf(NaoEncontrado);
    await renderInterna("smash-cake");
    expect(screen.getByRole("heading", { level: 1, name: "Smash Cake" })).toBeInTheDocument();
  });

  it("admin logado (que lê recheio inativo): o inativo continua fora das opções e conta como vazio", async () => {
    montar([ANTIGO], "admin");
    await expect(renderInterna("bolo-de-chocolate")).rejects.toBeInstanceOf(NaoEncontrado);
    await expect(renderInterna("bento-flork")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});
