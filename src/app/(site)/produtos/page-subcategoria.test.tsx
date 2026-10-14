// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SITE_URL } from "@/lib/site/url";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

// Filtro por subcategoria na Lista (PR 5, commit 3). Banco simulado: nenhum
// teste lê ou altera o banco real.

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
vi.mock("next/navigation", async (importarOriginal) => ({
  ...(await importarOriginal<typeof import("next/navigation")>()),
  useRouter: () => ({ push }),
}));

let produtosDoBanco: ProdutoVitrine[] = [];
let subcategoriasDoBanco: Record<string, unknown>[] = [];
vi.mock("@/lib/supabase/publico", () => ({
  createPublicClient: vi.fn(() => ({
    from: (tabela: string) => {
      const dados =
        tabela === "subcategorias" ? subcategoriasDoBanco : tabela === "produtos" ? produtosDoBanco.map((p) => ({ ...p, sabores: [] })) : [];
      const b = {
        select: () => b,
        eq: () => b,
        in: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok),
      };
      return b;
    },
  })),
}));

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
    subcategoria_id: null,
    ...parcial,
  };
}

const SUBS = [
  { id: "s-gourmet", categoria: "Doces", nome: "Gourmet Premium", slug: "gourmet-premium", ordem: 20, ativo: true },
  { id: "s-finos", categoria: "Doces", nome: "Finos", slug: "finos", ordem: 10, ativo: true },
  { id: "s-premium-kit", categoria: "Kit Festa", nome: "Premium", slug: "premium", ordem: 10, ativo: true },
  { id: "s-smash", categoria: "Bolos", nome: "Smash Cake", slug: "smash-cake", ordem: 10, ativo: true },
  { id: "s-fritos", categoria: "Salgados", nome: "Fritos", slug: "fritos", ordem: 10, ativo: true },
];

const catalogo = () => [
  produto({ nome: "Brigadeiro Gourmet", subcategoria_id: "s-gourmet" }),
  produto({ nome: "Beijinho Gourmet", subcategoria_id: "s-gourmet" }),
  produto({ nome: "Éclair", subcategoria_id: "s-finos" }),
  produto({ nome: "Doce Solto" }),
  produto({ nome: "Kit Premium A", Categoria: "Kit Festa", subcategoria_id: "s-premium-kit" }),
  produto({ nome: "Kit Sem Sub", Categoria: "Kit Festa" }),
  produto({ nome: "Smash Safári", Categoria: "Bolos", subcategoria_id: "s-smash" }),
  produto({ nome: "Bolo Comum", Categoria: "Bolos" }),
  produto({ nome: "Coxinha", Categoria: "Salgados", subcategoria_id: "s-fritos" }),
  produto({ nome: "Bento Flork", Categoria: "Bento Cake", tipo: "bento_cake" }),
];

type Query = Record<string, string | string[]>;

async function pagina(query: Query = {}) {
  const { default: ListaPage } = await import("./page");
  return ListaPage({ searchParams: Promise.resolve(query) });
}
async function renderLista(query: Query = {}) {
  return render(await pagina(query));
}
type Bloco = "celular" | "desktop";
// As duas apresentações do mesmo filtro estão no HTML (a que não vale na
// largura some por CSS, que o jsdom não carrega): cada afirmação é conferida
// em cada bloco, pela classe dele.
const subfiltro = (bloco: Bloco) => document.querySelector<HTMLElement>(`.lista-subfiltro--${bloco}`);
const chips = (bloco: Bloco) => (subfiltro(bloco) ? within(subfiltro(bloco)!).getAllByRole("link", { hidden: true }) : []);
const textoDosChips = (bloco: Bloco) => chips(bloco).map((a) => a.textContent);
const chipAtual = (bloco: Bloco) => chips(bloco).find((a) => a.getAttribute("aria-current") === "page");
const semFiltro = () => document.querySelector(".lista-subfiltro") === null;
const cards = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

beforeEach(() => {
  produtosDoBanco = catalogo();
  subcategoriasDoBanco = SUBS;
  push.mockClear();
});
afterEach(cleanup);

describe("filtro de subcategorias na Lista", () => {
  it("sem categoria não há filtro, com ou sem ?subcategoria=", async () => {
    await renderLista();
    expect(semFiltro()).toBe(true);
    cleanup();
    await renderLista({ subcategoria: "gourmet-premium" });
    expect(semFiltro()).toBe(true);
    expect(cards()).toContain("Doce Solto");
    expect(cards()).toContain("Smash Safári");
  });

  it("categoria sem subcategoria com produto (Bento Cake) não tem filtro nem buraco", async () => {
    await renderLista({ categoria: "bento-cake" });
    expect(semFiltro()).toBe(true);
    const bloco = document.querySelector(".lista-filtro")!;
    expect(bloco.children).toHaveLength(1); // só as categorias
  });

  it("leitura das subcategorias vazia: a Lista funciona sem filtro nem chips", async () => {
    subcategoriasDoBanco = [];
    await renderLista({ categoria: "doces", subcategoria: "finos" });
    expect(semFiltro()).toBe(true);
    expect(cards()).toHaveLength(4);
  });

  it("o filtro de categorias não leva a subcategoria", async () => {
    await renderLista({ categoria: "doces", subcategoria: "finos", busca: "e" });
    const hrefs = within(screen.getByRole("navigation", { name: "Categorias" })).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs.join()).not.toContain("subcategoria");
    expect(hrefs).toContain("/produtos?categoria=salgados&busca=e");
  });

  it("a ordem no HTML é a da tela: categorias, subcategorias, busca, lista (sem depender de CSS)", async () => {
    await renderLista({ categoria: "doces", subcategoria: "finos" });
    const categorias = screen.getByRole("navigation", { name: "Categorias" });
    const celular = subfiltro("celular")!;
    const desktop = subfiltro("desktop")!;
    const busca = screen.getByRole("search");
    const grade = document.querySelector(".lista-grade")!;
    const antes = (a: Node, b: Node) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    expect(antes(categorias, desktop)).toBe(true);
    expect(antes(categorias, celular)).toBe(true);
    expect(antes(desktop, busca)).toBe(true);
    expect(antes(celular, busca)).toBe(true);
    expect(antes(busca, grade)).toBe(true);
    // As subcategorias moram no mesmo bloco das categorias (o box do desktop).
    expect(categorias.parentElement).toBe(document.querySelector(".lista-filtro"));
    expect(desktop.parentElement).toBe(categorias.parentElement);
    expect(celular.parentElement).toBe(categorias.parentElement);
  });

  describe.each(["celular", "desktop"] as const)("bloco %s", (bloco) => {
    it("categoria com subcategorias: Todas e depois cada uma por ordem; 'Todas' atual por padrão", async () => {
      await renderLista({ categoria: "doces" });
      expect(textoDosChips(bloco)).toEqual(["Todas", "Finos", "Gourmet Premium"]);
      expect(chipAtual(bloco)).toHaveTextContent("Todas");
      expect(cards()).toHaveLength(4);
    });

    it("subcategoria de 1 produto aparece (Smash Cake)", async () => {
      await renderLista({ categoria: "bolos" });
      expect(textoDosChips(bloco)).toEqual(["Todas", "Smash Cake"]);
    });

    it("opção ativa leva aria-current (uma só) e filtra os cards", async () => {
      await renderLista({ categoria: "doces", subcategoria: "gourmet-premium" });
      expect(chipAtual(bloco)).toHaveTextContent("Gourmet Premium");
      expect(chips(bloco).filter((a) => a.hasAttribute("aria-current"))).toHaveLength(1);
      expect(cards().sort()).toEqual(["Beijinho Gourmet", "Brigadeiro Gourmet"]);
    });

    it.each(["inexistente", "smash-cake", "premium"])("slug inválido para a categoria (%s) vale como 'Todas', sem erro", async (slug) => {
      await renderLista({ categoria: "doces", subcategoria: slug });
      expect(chipAtual(bloco)).toHaveTextContent("Todas");
      expect(cards()).toHaveLength(4);
    });

    it("os links levam busca e ordem e nunca a página; 'Todas' tira só a subcategoria", async () => {
      await renderLista({ categoria: "doces", subcategoria: "finos", busca: "e", ordem: "a-z", pagina: "3" });
      const hrefs = chips(bloco).map((a) => a.getAttribute("href"));
      expect(hrefs).toEqual([
        "/produtos?categoria=doces&busca=e&ordem=a-z",
        "/produtos?categoria=doces&subcategoria=finos&busca=e&ordem=a-z",
        "/produtos?categoria=doces&subcategoria=gourmet-premium&busca=e&ordem=a-z",
      ]);
      expect(hrefs.join()).not.toContain("pagina");
    });

    it("busca sem resultado dentro da subcategoria: mensagem da busca, 'Limpar busca' mantém o filtro", async () => {
      await renderLista({ categoria: "doces", subcategoria: "gourmet-premium", busca: "zzz" });
      expect(screen.getByText(/Nenhum produto em Doces com “zzz” no nome/)).toBeInTheDocument();
      expect(screen.queryByText(/Ainda não temos produtos nesta categoria/)).toBeNull();
      const limpar = screen.getByRole("link", { name: "Limpar busca" });
      expect(limpar).toHaveAttribute("href", "/produtos?categoria=doces&subcategoria=gourmet-premium");
      expect(chipAtual(bloco)).toHaveTextContent("Gourmet Premium");
    });

    it("o HTML do servidor já traz os links (sem JavaScript)", async () => {
      const html = renderToStaticMarkup(await pagina({ categoria: "kit-festa", subcategoria: "premium" }));
      const trecho = html.slice(html.indexOf(`lista-subfiltro--${bloco}`));
      const nav = trecho.slice(0, trecho.indexOf("</nav>"));
      expect(nav).toContain('href="/produtos?categoria=kit-festa&amp;subcategoria=premium"');
      expect(nav).toContain('href="/produtos?categoria=kit-festa"');
      expect(nav).toMatch(/aria-current="page"[^>]*>Premium</);
      expect(html).toContain("Kit Premium A");
      expect(html).not.toContain("Kit Sem Sub");
    });
  });

  it("celular: rótulo curto 'Subcategorias' fora da leitura (a nav já tem nome); desktop: botão mostra a opção atual", async () => {
    await renderLista({ categoria: "doces", subcategoria: "gourmet-premium" });
    const titulo = subfiltro("celular")!.querySelector(".lista-subfiltro-titulo")!;
    expect(titulo).toHaveTextContent("Subcategorias");
    expect(titulo).toHaveAttribute("aria-hidden", "true");
    const botao = subfiltro("desktop")!.querySelector("summary")!;
    expect(botao).toHaveTextContent("Subcategoria: Gourmet Premium");
    cleanup();
    await renderLista({ categoria: "doces" });
    expect(subfiltro("desktop")!.querySelector("summary")).toHaveTextContent("Subcategoria: Todas");
  });

  it("as duas navs têm o mesmo nome acessível", async () => {
    await renderLista({ categoria: "doces" });
    expect(subfiltro("celular")).toHaveAttribute("aria-label", "Subcategorias de Doces");
    expect(subfiltro("desktop")).toHaveAttribute("aria-label", "Subcategorias de Doces");
  });
});

describe("dropdown do desktop fecha sozinho", () => {
  const aberto = async () => {
    await renderLista({ categoria: "doces", subcategoria: "finos" });
    const detalhes = subfiltro("desktop")!.querySelector("details")!;
    detalhes.open = true;
    return detalhes;
  };

  it("sem JavaScript é um <details> nativo, fechado, com os links reais dentro", async () => {
    await renderLista({ categoria: "doces" });
    const detalhes = subfiltro("desktop")!.querySelector("details")!;
    expect(detalhes.open).toBe(false);
    expect(detalhes.querySelector("summary")).not.toBeNull();
    expect(within(detalhes).getAllByRole("link", { hidden: true })).toHaveLength(3);
  });

  it("escolher uma opção fecha", async () => {
    const detalhes = await aberto();
    fireEvent.click(within(detalhes).getByRole("link", { name: "Gourmet Premium", hidden: true }));
    expect(detalhes.open).toBe(false);
  });

  it("Esc fecha e devolve o foco ao botão", async () => {
    const detalhes = await aberto();
    within(detalhes).getAllByRole("link", { hidden: true })[1].focus();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(detalhes.open).toBe(false);
    expect(document.activeElement).toBe(detalhes.querySelector("summary"));
  });

  it("clicar fora fecha; clicar dentro não", async () => {
    const detalhes = await aberto();
    fireEvent.pointerDown(detalhes.querySelector("summary")!);
    expect(detalhes.open).toBe(true);
    fireEvent.pointerDown(screen.getByRole("search"));
    expect(detalhes.open).toBe(false);
  });

  it("outras teclas não fecham", async () => {
    const detalhes = await aberto();
    fireEvent.keyDown(document, { key: "ArrowDown" });
    expect(detalhes.open).toBe(true);
  });
});

describe("BuscaEOrdem mantém a subcategoria", () => {
  it("sem JavaScript: campo escondido leva categoria e subcategoria no GET", async () => {
    await renderLista({ categoria: "doces", subcategoria: "finos" });
    const form = screen.getByRole("search");
    expect(form.querySelector('input[type="hidden"][name="categoria"]')).toHaveValue("doces");
    expect(form.querySelector('input[type="hidden"][name="subcategoria"]')).toHaveValue("finos");
  });

  it("sem subcategoria ativa (ou inválida) não há campo escondido dela", async () => {
    await renderLista({ categoria: "doces", subcategoria: "inexistente" });
    expect(screen.getByRole("search").querySelector('input[name="subcategoria"]')).toBeNull();
  });

  it("com JavaScript: buscar, trocar a ordem e limpar a busca mantêm o filtro e voltam à página 1", async () => {
    await renderLista({ categoria: "doces", subcategoria: "gourmet-premium", busca: "bri", pagina: "2" });
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "bei" } });
    fireEvent.submit(screen.getByRole("search"));
    expect(push).toHaveBeenLastCalledWith("/produtos?categoria=doces&subcategoria=gourmet-premium&busca=bei");

    fireEvent.change(screen.getByRole("combobox"), { target: { value: "z-a" } });
    expect(push).toHaveBeenLastCalledWith("/produtos?categoria=doces&subcategoria=gourmet-premium&busca=bri&ordem=z-a");

    fireEvent.click(screen.getByRole("button", { name: "Limpar busca" }));
    expect(push).toHaveBeenLastCalledWith("/produtos?categoria=doces&subcategoria=gourmet-premium");
  });
});

describe("paginação com subcategoria", () => {
  it("os links das páginas levam a subcategoria (massa de teste de 30 produtos)", async () => {
    produtosDoBanco = [
      ...Array.from({ length: 30 }, (_, i) => produto({ nome: `Fino ${String(i + 1).padStart(2, "0")}`, subcategoria_id: "s-finos" })),
      produto({ nome: "Gourmet Fora", subcategoria_id: "s-gourmet" }),
    ];
    await renderLista({ categoria: "doces", subcategoria: "finos", ordem: "a-z" });
    expect(cards()).toHaveLength(24);
    const nav = screen.getByRole("navigation", { name: "Páginas da lista" });
    const hrefs = within(nav).getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toContain("/produtos?categoria=doces&subcategoria=finos&ordem=a-z&pagina=2");
    for (const h of hrefs) expect(h).toContain("subcategoria=finos");
  });

  it("subcategoria inválida não vai para os links da paginação", async () => {
    produtosDoBanco = Array.from({ length: 30 }, (_, i) => produto({ nome: `Doce ${String(i + 1).padStart(2, "0")}` }));
    await renderLista({ categoria: "doces", subcategoria: "lixo" });
    const nav = screen.getByRole("navigation", { name: "Páginas da lista" });
    for (const a of within(nav).getAllByRole("link")) expect(a.getAttribute("href")).not.toContain("subcategoria");
  });
});

describe("308 e metadados", () => {
  async function redirecionaPara(query: Query) {
    try {
      await pagina(query);
    } catch (erro) {
      return String((erro as { digest?: string }).digest);
    }
    return null;
  }

  it("?categoria=kits&subcategoria=premium redireciona 308 e preserva a subcategoria", async () => {
    expect(await redirecionaPara({ categoria: "kits", subcategoria: "premium" })).toBe(
      "NEXT_REDIRECT;replace;/produtos?categoria=kit-festa&subcategoria=premium;308;"
    );
    expect(await redirecionaPara({ categoria: "KITS", subcategoria: "Premium", busca: "kit", ordem: "z-a", pagina: "2" })).toBe(
      "NEXT_REDIRECT;replace;/produtos?categoria=kit-festa&subcategoria=premium&busca=kit&ordem=z-a&pagina=2;308;"
    );
  });

  it("título, descrição, canonical, Open Graph e robots da URL filtrada são os da categoria", async () => {
    const { generateMetadata } = await import("./page");
    const meta = (q: Query) => generateMetadata({ searchParams: Promise.resolve(q) });
    const filtrada = await meta({ categoria: "bolos", subcategoria: "smash-cake", busca: "x", ordem: "a-z", pagina: "2" });
    const categoria = await meta({ categoria: "bolos" });
    expect(filtrada).toEqual(categoria);
    expect(filtrada.alternates?.canonical).toBe(`${SITE_URL}/produtos?categoria=bolos`);
    expect(JSON.stringify(filtrada)).not.toContain("subcategoria");
    // Slug inválido também não muda nada.
    expect(await meta({ categoria: "bolos", subcategoria: "lixo" })).toEqual(categoria);
  });
});
