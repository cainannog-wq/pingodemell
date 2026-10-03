// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_URL } from "@/lib/site/url";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { SiteHeader } from "@/components/site/SiteHeader";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";

// Interna do produto com o banco simulado (nada real). Os casos de Cento
// com 1 e 0 sabor ativo usam dado simulado; nenhum produto real é
// desativado.

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
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/produtos/x",
  notFound: () => {
    throw new NaoEncontrado("404");
  },
}));

let banco: BancoSimulado;
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(async () => clienteSimulado(banco)) }));

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

const MORANGO = produto({
  nome: "Morango Banhado",
  slug: "morango-banhado",
  preco: 2.5,
  pedido_minimo: 10,
  unidade_venda: "unidade",
  image_url: "https://x/capa.jpg",
  destaque: true,
});
const BRIGADEIRO = produto({ nome: "Brigadeiro (unidade)", slug: "brigadeiro-unidade", preco: 3.5, pedido_minimo: 10 });
const BEIJINHO = produto({ nome: "Beijinho", slug: "beijinho", preco: 5, pedido_minimo: 12, step_quantidade: "multiplos_5" });
const KIT = produto({ nome: "Kit Festa Sortido", slug: "kit-festa-sortido", preco: 150, Categoria: null });
const TORTA = produto({ nome: "Torta de Limão", slug: "torta-de-limao", ativo: false });
const EMPADA = produto({ nome: "Empada de palmito", slug: "empada", Categoria: "Salgados", preco: 4.5, destaque: true });
const RISOLE = produto({ nome: "Risole de carne", slug: "risole", Categoria: "Salgados", preco: 4.5 });
const CENTO = produto({ nome: "Cento de salgados sortidos", slug: "cento-de-salgados", Categoria: "Salgados", tipo: "cento", preco: 95.99, pedido_minimo: 20, step_quantidade: "multiplos_5", destaque: true });
const CENTO_UM = produto({ nome: "Cento Um Sabor", slug: "cento-um", tipo: "cento", preco: 100 });
const CENTO_ZERO = produto({ nome: "Cento Zero", slug: "cento-zero", tipo: "cento", preco: 100, destaque: true });

// O jsdom não implementa <dialog> (menu do cabeçalho).
beforeAll(() => {
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});

beforeEach(() => {
  banco = novoBanco(
    {
      produtos: [MORANGO, BRIGADEIRO, BEIJINHO, KIT, TORTA, EMPADA, RISOLE, CENTO, CENTO_UM, CENTO_ZERO],
      produto_cento_itens: [
        { cento_nome: CENTO.nome, subitem_nome: RISOLE.nome, ordem: 0 },
        { cento_nome: CENTO.nome, subitem_nome: EMPADA.nome, ordem: 1 },
        { cento_nome: CENTO_UM.nome, subitem_nome: EMPADA.nome, ordem: 0 },
        { cento_nome: CENTO_UM.nome, subitem_nome: TORTA.nome, ordem: 1 },
        { cento_nome: CENTO_ZERO.nome, subitem_nome: TORTA.nome, ordem: 0 },
      ],
      produto_fotos: [
        { produto_id: MORANGO.id, caminho: "galeria/m/b.webp", posicao: 2 },
        { produto_id: MORANGO.id, caminho: "galeria/m/a.webp", posicao: 1 },
      ],
    },
    "admin"
  );
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
const semTextoQuebrado = () => expect(document.body.textContent).not.toMatch(/null|undefined|None|NaN/);

describe("Interna — 404", () => {
  it("produto inativo cai na 404 (mesmo com a sessão do admin, que lê inativos)", async () => {
    await expect(renderInterna("torta-de-limao")).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("Cento com 0 sabor ativo (simulado) cai na 404, como produto inativo", async () => {
    await expect(renderInterna("cento-zero")).rejects.toBeInstanceOf(NaoEncontrado);
  });

  it("slug inexistente cai na 404", async () => {
    await expect(renderInterna("nao-existe")).rejects.toBeInstanceOf(NaoEncontrado);
  });
});

describe("Interna — avulso", () => {
  it("unidade preenchida: preço com a unidade, mínimo com a unidade, seletor começa no mínimo", async () => {
    await renderInterna("morango-banhado");
    expect(screen.getByRole("heading", { level: 1, name: "Morango Banhado" })).toBeInTheDocument();
    expect(document.querySelector(".interna-preco")?.textContent?.replace(/\s+/g, " ")).toBe("R$ 2,50 a unidade");
    expect(screen.getByText("Pedido mínimo: 10 unidades")).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Quantidade" })).toHaveValue("10");
    expect(screen.getByRole("button", { name: "Diminuir Quantidade" })).toBeDisabled();
    expect(within(resumo()).getByText("10 unidades × R$ 2,50")).toBeInTheDocument();
    semTextoQuebrado();
  });

  it("unidade vazia (produtos de hoje): só o valor, mínimo só com o número, nada quebrado", async () => {
    await renderInterna("brigadeiro-unidade");
    expect(document.querySelector(".interna-preco")?.textContent?.replace(/\s+/g, " ")).toBe("R$ 3,50");
    expect(screen.getByText("Pedido mínimo: 10")).toBeInTheDocument();
    expect(within(resumo()).getByText("10 × R$ 3,50")).toBeInTheDocument();
    semTextoQuebrado();
  });

  it("respeita pedido_minimo e step: mínimo 12 em múltiplos de 5 começa em 15 e anda de 5 em 5", async () => {
    await renderInterna("beijinho");
    const campo = screen.getByRole("textbox", { name: "Quantidade" });
    expect(campo).toHaveValue("15");
    expect(screen.getByText("Em múltiplos de 5")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar Quantidade" }));
    expect(campo).toHaveValue("20");
    fireEvent.click(screen.getByRole("button", { name: "Diminuir Quantidade" }));
    fireEvent.click(screen.getByRole("button", { name: "Diminuir Quantidade" }));
    expect(campo).toHaveValue("15");
  });

  it("número digitado fora da regra desliga o botão com o motivo; ao sair do campo, vai para o aceito", async () => {
    const user = userEvent.setup();
    await renderInterna("beijinho");
    const campo = screen.getByRole("textbox", { name: "Quantidade" });
    await user.clear(campo);
    await user.type(campo, "22");
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Escolha em múltiplos de 5.")).toBeInTheDocument();
    await user.clear(campo);
    await user.type(campo, "5");
    expect(within(resumo()).getByText("Quantidade mínima: 15")).toBeInTheDocument();
    await user.tab();
    expect(campo).toHaveValue("15");
    expect(botaoAdicionar()).toBeEnabled();
  });

  it("galeria: capa primeiro, depois as extras na ordem", async () => {
    await renderInterna("morango-banhado");
    const galeria = screen.getByRole("region", { name: "Fotos de Morango Banhado" });
    expect(within(galeria).getAllByRole("img", { hidden: true }).map((i) => i.getAttribute("src"))).toEqual([
      "https://x/capa.jpg",
      "https://storage/galeria/m/a.webp",
      "https://storage/galeria/m/b.webp",
    ]);
    expect(screen.getByRole("button", { name: "Mostrar Morango Banhado, foto 1 de 3" })).toHaveAttribute("aria-current", "true");
  });

  it("Kit sem categoria: abre sem selo de categoria e a trilha vai direto ao nome", async () => {
    await renderInterna("kit-festa-sortido");
    const trilha = screen.getByRole("navigation", { name: "Você está em" });
    expect(within(trilha).getAllByRole("listitem").map((li) => li.textContent?.replace(/chevron_right/g, "").trim())).toEqual([
      "Produtos",
      "Kit Festa Sortido",
    ]);
    expect(document.querySelector(".interna-selos")).toBeNull();
    expect(screen.getByRole("img", { name: "Kit Festa Sortido: foto ainda não disponível" })).toBeInTheDocument();
    semTextoQuebrado();
  });

  it("adicionar ao pedido grava no carrinho e o contador do cabeçalho muda", async () => {
    await renderInterna("morango-banhado");
    expect(contador()).toBeNull();
    fireEvent.click(botaoAdicionar());
    expect(contador()).toHaveTextContent("1");
    expect(screen.getByRole("link", { name: "Sacola do pedido, 1 item" })).toBeInTheDocument();
    expect(within(resumo()).getByText("Adicionado ao pedido")).toBeInTheDocument();
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO)!);
    expect(salvo.linhas).toMatchObject([{ tipo: "normal", produtoId: MORANGO.id, quantidade: 10, observacao: null }]);
  });

  it("relacionados: destaques sem o próprio produto", async () => {
    await renderInterna("morango-banhado");
    const bloco = screen.getByRole("region", { name: "Combina com o seu pedido" });
    const nomes = within(bloco).getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    expect(nomes).not.toContain("Morango Banhado");
    expect(nomes).not.toContain("Cento Zero");
    expect(nomes).toEqual(expect.arrayContaining(["Empada de palmito", "Cento de salgados sortidos"]));
  });
});

describe("Interna — Cento", () => {
  it("sem seletor Livre/5/10 nem pedido mínimo do cadastro: conta em centos e distribui 100 entre os sabores", async () => {
    await renderInterna("cento-de-salgados");
    expect(screen.queryByRole("textbox", { name: "Quantidade" })).toBeNull();
    expect(screen.queryByText(/Pedido mínimo/)).toBeNull();
    expect(document.querySelector(".interna-preco")?.textContent?.replace(/\s+/g, " ")).toBe("R$ 95,99 o cento");
    expect(screen.getByText("Cada cento: 100 unidades")).toBeInTheDocument();
    expect(screen.getByText("0 de 100 selecionados")).toBeInTheDocument();
    expect(botaoAdicionar()).toBeDisabled();
    expect(screen.queryByText(/Tipo de preparo|Embalagem/)).toBeNull();
  });

  it("botão só liga com a soma exata; 2 centos pedem 200 numa combinação só", async () => {
    await renderInterna("cento-de-salgados");
    const mais = (sabor: string, vezes: number) => {
      for (let i = 0; i < vezes; i++) fireEvent.click(screen.getByRole("button", { name: `Aumentar ${sabor}` }));
    };
    mais("Risole de carne", 12);
    mais("Empada de palmito", 8);
    expect(screen.getByText("100 de 100 selecionados")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Aumentar Risole de carne" })).toBeDisabled();
    expect(botaoAdicionar()).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Aumentar número de centos" }));
    expect(screen.getByText("100 de 200 selecionados")).toBeInTheDocument();
    expect(botaoAdicionar()).toBeDisabled();
    expect(within(resumo()).getByText("Complete as 200 unidades para adicionar.")).toBeInTheDocument();
    mais("Risole de carne", 20);
    expect(screen.getByText("200 de 200 selecionados")).toBeInTheDocument();
    expect(within(resumo()).getByText("2 centos × R$ 95,99")).toBeInTheDocument();

    fireEvent.click(botaoAdicionar());
    expect(contador()).toHaveTextContent("1");
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO)!);
    expect(salvo.linhas).toMatchObject([
      {
        tipo: "cento",
        quantidade: 2,
        sabores: [
          { nome: "Risole de carne", quantidade: 160 },
          { nome: "Empada de palmito", quantidade: 40 },
        ],
      },
    ]);
  });

  it("diminuir os centos depois de distribuir mostra quanto passou e desliga o botão", async () => {
    await renderInterna("cento-de-salgados");
    fireEvent.click(screen.getByRole("button", { name: "Aumentar número de centos" }));
    for (let i = 0; i < 40; i++) fireEvent.click(screen.getByRole("button", { name: "Aumentar Risole de carne" }));
    fireEvent.click(screen.getByRole("button", { name: "Diminuir número de centos" }));
    expect(screen.getByText("Passou 100 unidades")).toBeInTheDocument();
    expect(botaoAdicionar()).toBeDisabled();
  });

  it("Cento com 1 sabor ativo (simulado): o total inteiro vai nele, sem distribuição", async () => {
    await renderInterna("cento-um");
    expect(screen.queryByRole("button", { name: /Aumentar Empada/ })).toBeNull();
    expect(screen.queryByText("Torta de Limão")).toBeNull();
    expect(screen.getByText("Empada de palmito", { selector: "strong" })).toBeInTheDocument();
    expect(botaoAdicionar()).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Aumentar número de centos" }));
    expect(screen.getByText(/As 200 unidades são de/)).toBeInTheDocument();
    fireEvent.click(botaoAdicionar());
    const salvo = JSON.parse(window.localStorage.getItem(CHAVE_CARRINHO)!);
    expect(salvo.linhas[0].sabores).toEqual([{ nome: "Empada de palmito", quantidade: 200 }]);
  });
});

describe("Interna — metadados (PR fase4/seo-metadados)", () => {
  const BASE = SITE_URL;
  const PADRAO = "Feito sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

  async function metadadosDe(slug: string) {
    const { generateMetadata } = await import("./page");
    return generateMetadata({ params: Promise.resolve({ slug }) });
  }

  it("descrição vazia, só espaços ou nula usa o texto padrão; preenchida vale como está", async () => {
    const casos: [string | null, string][] = [
      ["", PADRAO],
      ["   ", PADRAO],
      [null, PADRAO],
      ["Morango fresco banhado no chocolate.", "Morango fresco banhado no chocolate."],
    ];
    for (const [descricao, esperada] of casos) {
      banco.tabelas.produtos = [{ ...MORANGO, descricao }];
      expect((await metadadosDe("morango-banhado")).description, JSON.stringify(descricao)).toBe(esperada);
    }
  });

  it("canonical e og:url pelo slug, sem parâmetro; imagem = capa do produto", async () => {
    const m = await metadadosDe("morango-banhado");
    expect(m.title).toBe("Morango Banhado · Pingo de Mell");
    expect(m.alternates?.canonical).toBe(`${BASE}/produtos/morango-banhado`);
    expect(m.openGraph).toMatchObject({
      url: `${BASE}/produtos/morango-banhado`,
      siteName: "Pingo de Mell",
      locale: "pt_BR",
      type: "website",
      images: [{ url: "https://x/capa.jpg" }],
    });
  });

  it("sem capa: imagem padrão do site", async () => {
    const m = await metadadosDe("empada");
    expect(m.openGraph).toMatchObject({ images: [{ url: `${BASE}/fotos/hero-principal.jpeg` }] });
  });

  it("produto inexistente ou inativo: sem canonical nem Open Graph", async () => {
    for (const slug of ["nao-existe", "torta-de-limao"]) {
      const m = await metadadosDe(slug);
      expect(m.alternates, slug).toBeUndefined();
      expect(m.openGraph, slug).toBeUndefined();
    }
  });
});
