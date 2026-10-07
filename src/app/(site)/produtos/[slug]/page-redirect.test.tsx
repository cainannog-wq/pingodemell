// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { reiniciarAnaliticaParaTeste } from "@/lib/analitica/gtag";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { VERSAO_POLITICA } from "@/lib/site/politica-versao";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// Ida da interna ao carrinho depois de adicionar (PR de ajustes visuais,
// 07/10/2026), nos cinco tipos de linha (avulso, Cento, Bolo, Smash Cake e
// Bento Cake), com o banco simulado (nada real) e o GA4 com ID de mentira:
// - sucesso navega para /carrinho uma vez, e a linha já está gravada no
//   localStorage quando a navegação é pedida;
// - validação que falha não navega e não grava;
// - duplo clique adiciona uma vez só, e o botão fica desligado;
// - add_to_cart sai uma vez por adição, com o mesmo conteúdo de antes.

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

// O que estava gravado no carrinho no instante em que a navegação foi pedida.
const navegacao = vi.hoisted(() => ({ destinos: [] as string[], carrinhoNaHora: [] as unknown[] }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: (destino: string) => {
      navegacao.destinos.push(destino);
      const texto = window.localStorage.getItem("pdm-carrinho-v1");
      navegacao.carrinhoNaHora.push(texto ? JSON.parse(texto).linhas : null);
    },
  }),
  usePathname: () => "/produtos/x",
  useSearchParams: () => new URLSearchParams(),
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

const AVULSO = produto({ nome: "Morango Banhado", slug: "morango-banhado", preco: 2.5, pedido_minimo: 10, unidade_venda: "unidade" });
const EMPADA = produto({ nome: "Empada de palmito", slug: "empada", Categoria: "Salgados", preco: 4.5 });
const RISOLE = produto({ nome: "Risole de carne", slug: "risole", Categoria: "Salgados", preco: 4.5 });
const CENTO = produto({ nome: "Cento de salgados", slug: "cento-de-salgados", Categoria: "Salgados", tipo: "cento", preco: 95.99 });
const BOLO = produto({ nome: "Bolo de Chocolate", slug: "bolo-de-chocolate", Categoria: "Bolos", tipo: "bolo", preco: 45 });
const SMASH = produto({ nome: "Smash Cake", slug: "smash-cake", Categoria: "Bolos", preco: 70 });
const BENTO = produto({ nome: "Bento Cake Flork", slug: "bento-flork", Categoria: "Bento Cake", tipo: "bento_cake", preco: 60, pedido_minimo: 2 });
const BRIGADEIRO = { id: "rrrrrrrr-0000-4000-8000-000000000001", nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros", ativo: true };

beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});

beforeEach(() => {
  banco = novoBanco({
    produtos: [AVULSO, EMPADA, RISOLE, CENTO, BOLO, SMASH, BENTO],
    produto_cento_itens: [
      { cento_nome: CENTO.nome, subitem_nome: RISOLE.nome, ordem: 0 },
      { cento_nome: CENTO.nome, subitem_nome: EMPADA.nome, ordem: 1 },
    ],
    recheios: [BRIGADEIRO],
    produto_fotos: [],
  });
  navegacao.destinos = [];
  navegacao.carrinhoNaHora = [];
  window.localStorage.clear();
  reiniciarParaTeste();
  reiniciarConsentimentoParaTeste();
  reiniciarAnaliticaParaTeste();
  vi.stubEnv("GA4_ID", "G-TESTE00000");
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
  window.localStorage.setItem(
    CHAVE_CONSENTIMENTO,
    JSON.stringify({ versao: 1, escolha: "aceito", data: "2026-10-05", versaoPolitica: VERSAO_POLITICA })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
  reiniciarAnaliticaParaTeste();
});

async function renderInterna(slug: string) {
  const { default: ProdutoPage } = await import("./page");
  const ui = await ProdutoPage({ params: Promise.resolve({ slug }) });
  return render(<CarrinhoProvider>{ui}</CarrinhoProvider>);
}

const resumo = () => document.querySelector(".interna-resumo") as HTMLElement;
const botaoAdicionar = () => within(resumo()).getByRole("button", { name: "Adicionar ao pedido" });
const botaoDaBarra = () => within(document.querySelector(".interna-barra") as HTMLElement).getByRole("button", { name: "Adicionar" });
const salvo = () => {
  const texto = window.localStorage.getItem(CHAVE_CARRINHO);
  return texto ? JSON.parse(texto).linhas : [];
};
function addToCart(): unknown[] {
  return (window.dataLayer ?? [])
    .map((a) => Array.from(a as ArrayLike<unknown>))
    .filter((c) => c[0] === "event" && c[1] === "add_to_cart")
    .map((c) => c[2]);
}

// Cada tipo: abre a interna, deixa a configuração válida e devolve o tipo
// de linha esperado.
const TIPOS: [string, string, () => void, string][] = [
  ["Avulso", AVULSO.slug!, () => {}, "normal"],
  [
    "Cento",
    CENTO.slug!,
    () => {
      for (let i = 0; i < 12; i++) fireEvent.click(screen.getByRole("button", { name: "Aumentar Risole de carne" }));
      for (let i = 0; i < 8; i++) fireEvent.click(screen.getByRole("button", { name: "Aumentar Empada de palmito" }));
    },
    "cento",
  ],
  ["Bolo", BOLO.slug!, () => fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ })), "bolo"],
  ["Smash Cake", SMASH.slug!, () => {}, "normal"],
  ["Bento Cake", BENTO.slug!, () => fireEvent.click(screen.getByRole("radio", { name: "Brigadeiro" })), "bento"],
];

describe.each(TIPOS)("%s: adicionar leva ao carrinho", (_, slug, preparar, tipo) => {
  it("sucesso: grava antes de navegar, navega uma vez para /carrinho, um add_to_cart com slug e nome", async () => {
    await renderInterna(slug);
    preparar();
    fireEvent.click(botaoAdicionar());

    expect(navegacao.destinos).toEqual(["/carrinho"]);
    expect(navegacao.carrinhoNaHora).toHaveLength(1);
    expect(navegacao.carrinhoNaHora[0]).toEqual(salvo());
    expect(salvo()).toHaveLength(1);
    expect(salvo()[0]).toMatchObject({ tipo, slug });
    const nome = salvo()[0].nome;
    expect(addToCart()).toEqual([{ items: [{ item_id: slug, item_name: nome }] }]);
  });

  it("duplo clique (caixa e barra do celular): uma linha, uma navegação, um evento; botões desligados", async () => {
    await renderInterna(slug);
    preparar();
    const botao = botaoAdicionar();
    fireEvent.click(botao);
    const depoisDoPrimeiro = salvo();
    fireEvent.click(botao);
    fireEvent.click(botaoDaBarra());

    // A linha não somou nem duplicou.
    expect(salvo()).toEqual(depoisDoPrimeiro);
    expect(salvo()).toHaveLength(1);
    expect(navegacao.destinos).toEqual(["/carrinho"]);
    expect(addToCart()).toHaveLength(1);
    expect(botaoAdicionar()).toBeDisabled();
    expect(botaoDaBarra()).toBeDisabled();
  });

  it("voltar à interna (página montada de novo) não adiciona sozinho, e o botão volta a funcionar", async () => {
    await renderInterna(slug);
    preparar();
    fireEvent.click(botaoAdicionar());
    cleanup();

    await renderInterna(slug);
    expect(salvo()).toHaveLength(1);
    expect(addToCart()).toHaveLength(1);
    expect(navegacao.destinos).toEqual(["/carrinho"]);
    preparar();
    expect(botaoAdicionar()).toBeEnabled();
  });
});

describe("validação que falha: fica na interna, sem gravar, sem navegar e sem evento", () => {
  it.each([
    ["Avulso abaixo do mínimo", AVULSO.slug!, () => fireEvent.change(screen.getByRole("textbox", { name: "Quantidade" }), { target: { value: "3" } }), "Quantidade mínima: 10"],
    ["Cento incompleto", CENTO.slug!, () => fireEvent.click(screen.getByRole("button", { name: "Aumentar Risole de carne" })), "Complete as 100 unidades para adicionar."],
    ["Bolo sem recheio", BOLO.slug!, () => {}, "Escolha o recheio para adicionar."],
    ["Bento sem recheio", BENTO.slug!, () => {}, "Escolha o recheio para adicionar."],
  ])("%s", async (_, slug, preparar, mensagem) => {
    await renderInterna(slug);
    preparar();
    expect(within(resumo()).getByText(mensagem)).toBeInTheDocument();
    expect(botaoAdicionar()).toBeDisabled();
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toEqual([]);
    expect(navegacao.destinos).toEqual([]);
    expect(addToCart()).toEqual([]);
  });

  it("Bolo acima de 10 kg só avisa (regra de sempre): adiciona e vai ao carrinho", async () => {
    await renderInterna(BOLO.slug!);
    fireEvent.click(screen.getByRole("radio", { name: /Brigadeiro/ }));
    fireEvent.change(screen.getByRole("textbox", { name: "Tamanho em kg" }), { target: { value: "12" } });
    expect(screen.getByText("Para bolos acima de 10 kg, combine com a gente pelo WhatsApp.")).toBeInTheDocument();
    fireEvent.click(botaoAdicionar());
    expect(salvo()).toMatchObject([{ tipo: "bolo", quantidade: 12 }]);
    expect(navegacao.destinos).toEqual(["/carrinho"]);
  });
});
