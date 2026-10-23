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
// real): recheios do catálogo (Bolo tradicional), recheios personalizados do
// próprio produto (Bento Cake e Bolos de tipo normal), preço, avisos, carrinho
// e disponibilidade.

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
// Bolo de tipo normal (Ganache, Kit Kat...) com recheios personalizados, e outro sem.
const GANACHE = produto({ nome: "Bolo Ganache", slug: "bolo-ganache", Categoria: "Bolos", preco: 108, unidade_venda: "o kg" });
const BANANA = produto({ nome: "Bolo de banana", slug: "bolo-de-banana", Categoria: "Bolos", preco: 35 });

const BRIGADEIRO = recheio({ nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros" });
const MORANGO = recheio({ nome: "Morango", vale_bolo: true, preco_kg: 95, grupo: "frutas" });
const DOCE_DE_LEITE = recheio({ nome: "Doce de leite", vale_bolo: true, preco_kg: 75, grupo: "chocolate_outros" });
const NINHO = recheio({ nome: "Ninho", vale_bento: true });
const ANTIGO = recheio({ nome: "Antigo", vale_bolo: true, vale_bento: true, preco_kg: 10, grupo: "frutas", ativo: false });

beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});

// Lista própria do Bento Cake Flork (ids do catálogo de antes: a cópia da
// migração reaproveita o id) e do Ganache.
const RECHEIOS_DO_BENTO = [
  { produto_id: BENTO.id, id: BRIGADEIRO.id, nome: "Brigadeiro", posicao: 1 },
  { produto_id: BENTO.id, id: NINHO.id, nome: "Ninho", posicao: 2 },
];
const RECHEIOS_DO_GANACHE = [
  { produto_id: GANACHE.id, id: "gggggggg-0000-4000-8000-000000000002", nome: "Sonho de valsa", posicao: 2 },
  { produto_id: GANACHE.id, id: "gggggggg-0000-4000-8000-000000000001", nome: "Dois amores", posicao: 1 },
];

function montar(
  recheios: Record<string, unknown>[],
  papel: "anon" | "admin" = "anon",
  produtoRecheios: Record<string, unknown>[] = [...RECHEIOS_DO_BENTO, ...RECHEIOS_DO_GANACHE]
) {
  banco = novoBanco(
    { produtos: [BOLO, SMASH, BENTO, GANACHE, BANANA], recheios, produto_fotos: [], produto_recheios: produtoRecheios },
    papel
  );
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

describe("Interna — barra de subtotal no desktop", () => {
  it("Bolo e Bento Cake têm a barra fixa do desktop (data-desktop) e a caixa de subtotal escondida", async () => {
    await renderInterna("bolo-de-chocolate");
    expect(document.querySelector(".interna-barra[data-desktop]")).not.toBeNull();
    expect(document.querySelector(".interna-resumo[data-escondido-desktop]")).not.toBeNull();
    cleanup();
    await renderInterna("bento-flork");
    expect(document.querySelector(".interna-barra[data-desktop]")).not.toBeNull();
    expect(document.querySelector(".interna-resumo[data-escondido-desktop]")).not.toBeNull();
  });
});

describe("Interna — Bolo", () => {
  it("cabeçalho: 'a partir de' o menor R$/kg dos recheios ativos; sem Quantidade, mínimo nem step do cadastro", async () => {
    await renderInterna("bolo-de-chocolate");
    expect(precoDoCabecalho()).toBe("A partir de R$ 75,00 o kg");
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
    expect(nomes).toEqual(["Morango R$ 95,00 o kg", "Doce de leite R$ 75,00 o kg", "Brigadeiro R$ 80,00 o kg"]);
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

  it("peso por formato: redondo de 1 a 4 kg, retangular de 2 a 5 kg; fora da faixa bloqueia com mensagem", async () => {
    const user = userEvent.setup();
    await renderInterna("bolo-de-chocolate");
    fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ }));
    const campo = screen.getByRole("textbox", { name: "Tamanho em kg" });
    // Redondo (padrão): 1 a 4.
    await user.clear(campo);
    await user.type(campo, "4");
    expect(botaoAdicionar()).toBeEnabled();
    await user.clear(campo);
    await user.type(campo, "5");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Tamanho máximo para bolo redondo: 4 kg")).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "0");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Tamanho mínimo para bolo redondo: 1 kg")).toBeInTheDocument();
    await user.tab();
    expect(campo).toHaveValue("1");
    // Retangular: 2 a 5. O 1 kg já escolhido sobe para 2 e a cliente é avisada.
    fireEvent.click(screen.getByRole("radio", { name: "Retangular" }));
    expect(campo).toHaveValue("2");
    expect(screen.getByText("Bolo retangular aceita de 2 a 5 kg. Ajustamos o tamanho para 2 kg.")).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "6");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Tamanho máximo para bolo retangular: 5 kg")).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "5");
    expect(botaoAdicionar()).toBeEnabled();
    // Volta ao redondo com 5 kg: desce para 4 e avisa.
    fireEvent.click(screen.getByRole("radio", { name: "Redondo" }));
    expect(campo).toHaveValue("4");
    expect(screen.getByText("Bolo redondo aceita de 1 a 4 kg. Ajustamos o tamanho para 4 kg.")).toBeInTheDocument();
    // Peso que cabe nos dois formatos não muda nem avisa.
    fireEvent.click(screen.getByRole("radio", { name: "Retangular" }));
    expect(campo).toHaveValue("4");
    expect(screen.queryByText(/Ajustamos o tamanho/)).toBeNull();
  });

  it("só oferece Redondo e Retangular (nunca Quadrado)", async () => {
    await renderInterna("bolo-de-chocolate");
    expect(screen.getByRole("radio", { name: "Redondo" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Retangular" })).toBeInTheDocument();
    expect(screen.queryByRole("radio", { name: "Quadrado" })).toBeNull();
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
    fireEvent.click(screen.getByRole("radio", { name: "Retangular" }));
    fireEvent.change(screen.getByRole("textbox", { name: /observação/i }), { target: { value: "tema unicórnio" } });
    fireEvent.click(botaoAdicionar());
    expect(contador()).toHaveTextContent("1");
    expect(salvo()).toMatchObject([
      {
        tipo: "bolo",
        produtoId: BOLO.id,
        quantidade: 2, // 1 kg não cabe no retangular: o tamanho subiu para o mínimo
        preco: 80,
        formato: "retangular",
        recheio: { id: BRIGADEIRO.id, nome: "Brigadeiro" },
        observacao: "tema unicórnio",
      },
    ]);
    // Adicionar leva ao carrinho; um segundo bolo é uma volta à interna.
    cleanup();
    await renderInterna("bolo-de-chocolate");
    fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ }));
    fireEvent.click(screen.getByRole("radio", { name: "Retangular" }));
    fireEvent.change(screen.getByRole("textbox", { name: /observação/i }), { target: { value: "tema unicórnio" } });
    fireEvent.click(botaoAdicionar());
    expect(contador()).toHaveTextContent("2");
    expect(salvo()).toHaveLength(2);
  });
});

describe("Interna — Bento Cake", () => {
  it("lista simples de recheios (a lista do próprio produto, sem grupo e sem preço) e preço fixo do tema", async () => {
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
    // Adicionar leva ao carrinho; cada adição seguinte é uma volta à interna.
    cleanup();
    await renderInterna("bento-flork");
    fireEvent.click(screen.getByRole("radio", { name: "Ninho" }));
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toMatchObject([{ tipo: "bento", produtoId: BENTO.id, quantidade: 4, preco: 60, recheio: { id: NINHO.id, nome: "Ninho" } }]);
    cleanup();
    await renderInterna("bento-flork");
    fireEvent.click(screen.getByRole("radio", { name: "Brigadeiro" }));
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toHaveLength(2);
    expect(contador()).toHaveTextContent("2");
  });
});

describe("Interna — Bolo de tipo normal com recheios personalizados", () => {
  it("seletor na ordem do admin, preço fixo do produto e sem preço por recheio", async () => {
    await renderInterna("bolo-ganache");
    expect(precoDoCabecalho()).toBe("R$ 108,00 o kg");
    const grupo = document.querySelector(".interna-recheio") as HTMLElement;
    const nomes = within(grupo).getAllByRole("radio").map((r) => r.closest("label")?.textContent?.replace(/\s+/g, " "));
    expect(nomes).toEqual(["Dois amores", "Sonho de valsa"]);
    expect(grupo.textContent).not.toMatch(/R\$/);
  });

  it("adicionar fica bloqueado, com aviso, até escolher o recheio; o preço não muda", async () => {
    await renderInterna("bolo-ganache");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Escolha o recheio para adicionar.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Sonho de valsa" }));
    expect(botaoAdicionar()).toBeEnabled();
    expect(within(resumo()).getByText("R$ 108,00")).toBeInTheDocument();
  });

  it("a linha do carrinho guarda o recheio; recheios diferentes são linhas diferentes e o mesmo soma", async () => {
    await renderInterna("bolo-ganache");
    fireEvent.click(screen.getByRole("radio", { name: "Dois amores" }));
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toMatchObject([{ tipo: "normal", produtoId: GANACHE.id, quantidade: 1, preco: 108, recheio: { id: "gggggggg-0000-4000-8000-000000000001", nome: "Dois amores" } }]);
    cleanup();
    await renderInterna("bolo-ganache");
    fireEvent.click(screen.getByRole("radio", { name: "Dois amores" }));
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toHaveLength(1);
    expect(salvo()[0].quantidade).toBe(2);
    cleanup();
    await renderInterna("bolo-ganache");
    fireEvent.click(screen.getByRole("radio", { name: "Sonho de valsa" }));
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toHaveLength(2);
  });

  it("bolo de tipo normal sem lista de recheios funciona como hoje (avulso, sem seletor)", async () => {
    await renderInterna("bolo-de-banana");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(botaoAdicionar()).toBeEnabled();
    fireEvent.click(botaoAdicionar());
    expect(salvo()[0]).toMatchObject({ tipo: "normal", produtoId: BANANA.id });
    expect(salvo()[0]).not.toHaveProperty("recheio");
  });

  it("a leitura pública só traz recheios de produto ativo (produto inativo cai na 404)", async () => {
    banco = novoBanco(
      { produtos: [{ ...GANACHE, ativo: false }], recheios: [], produto_fotos: [], produto_recheios: RECHEIOS_DO_GANACHE },
      "anon"
    );
    await expect(renderInterna("bolo-ganache")).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("falha ao ler os recheios do produto não derruba em silêncio: a página lança erro", async () => {
    montar([BRIGADEIRO]);
    banco.falhas.add("produto_recheios");
    await expect(renderInterna("bolo-ganache")).rejects.toThrow();
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
  it("catálogo sem recheio de Bento: não muda nada (o Bento usa a lista do produto)", async () => {
    montar([{ ...BRIGADEIRO, vale_bento: false }, MORANGO, DOCE_DE_LEITE]);
    await renderInterna("bento-flork");
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["Brigadeiro", "Ninho"]);
    cleanup();
    await renderInterna("bolo-de-chocolate");
    expect(screen.getByRole("heading", { level: 1, name: "Bolo de Chocolate" })).toBeInTheDocument();
  });

  it("Bento Cake sem lista de recheios vira avulso: sem seletor de recheio, adiciona como avulso", async () => {
    montar([BRIGADEIRO, MORANGO, DOCE_DE_LEITE], "anon", []);
    await renderInterna("bento-flork");
    expect(screen.queryByRole("radio")).toBeNull();
    expect(botaoAdicionar()).toBeEnabled();
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toMatchObject([{ tipo: "normal", produtoId: BENTO.id, quantidade: 2, preco: 60 }]);
    expect(salvo()[0]).not.toHaveProperty("recheio");
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

  it("catálogo todo vazio: só o Bolo tradicional cai na 404; Bento (lista própria) e Smash abrem", async () => {
    montar([]);
    await expect(renderInterna("bolo-de-chocolate")).rejects.toBeInstanceOf(NaoEncontrado);
    await renderInterna("bento-flork");
    expect(screen.getByRole("heading", { level: 1, name: "Bento Cake Flork" })).toBeInTheDocument();
    cleanup();
    await renderInterna("smash-cake");
    expect(screen.getByRole("heading", { level: 1, name: "Smash Cake" })).toBeInTheDocument();
  });

  it("admin logado (que lê recheio inativo): o inativo continua fora das opções e conta como vazio", async () => {
    montar([ANTIGO], "admin");
    await expect(renderInterna("bolo-de-chocolate")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});
