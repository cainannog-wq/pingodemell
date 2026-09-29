// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { DURACAO_AVISO_MS } from "@/components/site/PilhaDeAvisos";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { escreverCarrinho, lerCarrinho, type LinhaCarrinho } from "@/lib/carrinho/regras";
import { createClient as clienteDoNavegador } from "@/lib/supabase/client";
import { createClient as clienteDoServidor } from "@/lib/supabase/server";
import { TEXTO_DECORACAO } from "@/lib/vitrine/bolo";
import { Carrinho } from "./_carrinho/Carrinho";

// Página do carrinho com o navegador simulado (jsdom). Banco e fetch estão
// armados para FALHAR: a página não pode consultar nada, só ler o que está
// gravado em cada linha do localStorage.

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

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => {
    throw new Error("a página do carrinho não pode consultar o banco (servidor)");
  }),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("a página do carrinho não pode consultar o banco (navegador)");
  }),
}));

const FOTO = "https://exemplo.supabase.co/storage/v1/object/public/Pingo%20de%20Mell/capa.webp";
const base = { slug: "x", observacao: null, foto: null };

// Uma linha de cada tipo, como a interna grava.
const brigadeiro: LinhaCarrinho = {
  ...base,
  id: "l-avulso",
  produtoId: "p-brigadeiro",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 2.35,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade: 20,
  pedidoMinimo: 10,
  step: "multiplos_5",
  foto: FOTO,
  observacao: "Forminha rosa, sem granulado colorido",
};
const cento: LinhaCarrinho = {
  ...base,
  id: "l-cento",
  produtoId: "p-cento",
  slug: "cento-de-salgados-assados",
  nome: "Cento de salgados assados",
  preco: 95.99,
  tipo: "cento",
  quantidade: 2,
  sabores: [
    { nome: "Coxinha", quantidade: 80 },
    { nome: "Risole", quantidade: 60 },
    { nome: "Empada", quantidade: 40 },
    { nome: "Bolinha de queijo", quantidade: 20 },
    { nome: "Kibe", quantidade: 0 },
  ],
};
const bolo: LinhaCarrinho = {
  ...base,
  id: "l-bolo",
  produtoId: "p-bolo",
  slug: "bolo-recheado",
  nome: "Bolo Recheado",
  preco: 89.9,
  tipo: "bolo",
  quantidade: 12, // acima de 10 kg: só exibe o que foi gravado
  recheio: { id: "r-ninho", nome: "Ninho com morango" },
  formato: "quadrado",
  observacao: 'Escrever "Feliz 5 anos, Manu" na cobertura',
};
const smash: LinhaCarrinho = {
  ...base,
  id: "l-smash",
  produtoId: "p-smash",
  nome: "Smash Cake",
  preco: 39.9,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade: 2,
  pedidoMinimo: 1,
  step: "livre",
};
const bento: LinhaCarrinho = {
  ...base,
  id: "l-bento",
  produtoId: "p-bento",
  nome: "Bento Cake Unicórnio",
  preco: 45,
  tipo: "bento",
  quantidade: 3,
  pedidoMinimo: 2,
  recheio: { id: "r-brigadeiro", nome: "Brigadeiro" },
};
const TODAS = [brigadeiro, cento, bolo, smash, bento];

function gravarNoNavegador(linhas: LinhaCarrinho[]) {
  window.localStorage.setItem(CHAVE_CARRINHO, escreverCarrinho(linhas));
}
function salvas(): LinhaCarrinho[] {
  return lerCarrinho(window.localStorage.getItem(CHAVE_CARRINHO));
}
function abrir(linhas: LinhaCarrinho[] = TODAS) {
  gravarNoNavegador(linhas);
  reiniciarParaTeste();
  return render(
    <CarrinhoProvider>
      <Carrinho />
    </CarrinhoProvider>
  );
}
function item(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-linha="${id}"]`);
}
function itemOuFalha(id: string): HTMLElement {
  const el = item(id);
  if (!el) throw new Error(`linha ${id} não está na tela`);
  return el;
}
function botaoRemover(id: string) {
  return within(itemOuFalha(id)).getByRole("button", { name: /^Remover / });
}
function idsNaTela(): string[] {
  return [...document.querySelectorAll<HTMLElement>("[data-linha]")].map((el) => el.dataset.linha as string);
}
// Texto de um parágrafo inteiro (os valores em R$ ficam num <span> que não quebra).
function paragrafo(escopo: HTMLElement, texto: string | RegExp) {
  return within(escopo).getByText((_, el) => {
    if (el?.tagName !== "P") return false;
    const conteudo = el.textContent ?? "";
    return typeof texto === "string" ? conteudo === texto : texto.test(conteudo);
  });
}
const avisosNaTela = () => screen.queryAllByText("Item removido");

let fetchSimulado: ReturnType<typeof vi.fn>;

beforeEach(() => {
  window.localStorage.clear();
  reiniciarParaTeste();
  fetchSimulado = vi.fn(async () => {
    throw new Error("a página do carrinho não pode chamar a rede");
  });
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  // Vale para todos os testes: nenhuma consulta de rede nem de banco.
  expect(fetchSimulado).not.toHaveBeenCalled();
  expect(clienteDoServidor).not.toHaveBeenCalled();
  expect(clienteDoNavegador).not.toHaveBeenCalled();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("Carrinho — exibição do que está gravado", () => {
  it("mostra uma linha de cada tipo com os dados exatamente como gravados, sem consultar nada", () => {
    abrir();
    expect(idsNaTela()).toEqual(["l-avulso", "l-cento", "l-bolo", "l-smash", "l-bento"]);

    const avulso = within(itemOuFalha("l-avulso"));
    expect(avulso.getByRole("heading", { name: "Brigadeiro Gourmet" })).toBeInTheDocument();
    expect(paragrafo(itemOuFalha("l-avulso"), "R$ 2,35 a unidade")).toBeInTheDocument();
    expect(avulso.getByText("Forminha rosa, sem granulado colorido")).toBeInTheDocument();
    expect(avulso.getByText("R$ 47,00")).toBeInTheDocument();
    expect(avulso.getByRole("img", { name: "Foto de Brigadeiro Gourmet" })).toHaveAttribute("src", FOTO);

    const c = within(itemOuFalha("l-cento"));
    expect(c.getByText("Coxinha 80 · Risole 60 · Empada 40 · Bolinha de queijo 20")).toBeInTheDocument();
    expect(paragrafo(itemOuFalha("l-cento"), "2 centos · 200 unidades · R$ 95,99 o cento")).toBeInTheDocument();
    expect(c.getByText("R$ 191,98")).toBeInTheDocument();

    const b = within(itemOuFalha("l-bolo"));
    expect(b.getByText("Recheio: Ninho com morango · Formato: Quadrado")).toBeInTheDocument();
    expect(paragrafo(itemOuFalha("l-bolo"), "12 kg × R$ 89,90 o kg")).toBeInTheDocument();
    expect(b.getByText('Escrever "Feliz 5 anos, Manu" na cobertura')).toBeInTheDocument();
    expect(b.getByText("R$ 1.078,80")).toBeInTheDocument();

    const s = within(itemOuFalha("l-smash"));
    expect(paragrafo(itemOuFalha("l-smash"), "R$ 39,90 a unidade")).toBeInTheDocument();
    expect(s.getByText("R$ 79,80")).toBeInTheDocument();

    const bn = within(itemOuFalha("l-bento"));
    expect(bn.getByText("Recheio: Brigadeiro")).toBeInTheDocument();
    expect(paragrafo(itemOuFalha("l-bento"), "R$ 45,00 cada")).toBeInTheDocument();
    expect(bn.getByText("R$ 135,00")).toBeInTheDocument();

    // linha sem foto gravada: fundo da marca, não imagem quebrada
    expect(within(itemOuFalha("l-cento")).getByRole("img", { name: /foto ainda não disponível/ })).toBeInTheDocument();
  });

  it("total é a soma direta das linhas, no resumo e na barra do celular", () => {
    abrir();
    // 47 + 191,98 + 1078,80 + 79,80 + 135
    const resumo = within(screen.getByRole("region", { name: "Resumo" }));
    expect(resumo.getByText("R$ 1.532,58")).toBeInTheDocument();
    expect(document.querySelector(".carrinho-barra strong")).toHaveTextContent("R$ 1.532,58");
  });

  it("o cartão da decoração só aparece com Bolo no carrinho, com o texto já usado na interna", () => {
    abrir();
    expect(screen.getByText(TEXTO_DECORACAO)).toBeInTheDocument();
    cleanup();
    abrir([brigadeiro, smash]);
    expect(screen.queryByText(TEXTO_DECORACAO)).not.toBeInTheDocument();
  });

  it("'Finalizar pedido' leva para /checkout (ainda 404) e 'Continuar comprando' para a Lista", () => {
    abrir();
    for (const link of screen.getAllByRole("link", { name: /Finalizar pedido/ })) {
      expect(link).toHaveAttribute("href", "/checkout");
    }
    for (const link of screen.getAllByRole("link", { name: /Continuar comprando/ })) {
      expect(link).toHaveAttribute("href", "/produtos");
    }
  });

  it("carrinho vazio: mensagem, catálogo e WhatsApp", () => {
    abrir([]);
    expect(screen.getByRole("heading", { level: 1, name: "Seu pedido ainda está vazinho" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Ver o catálogo/ })).toHaveAttribute("href", "/produtos");
    expect(screen.getByRole("link", { name: /Falar com a gente/ }).getAttribute("href")).toMatch(/^https:\/\/wa\.me\//);
    expect(screen.queryByRole("link", { name: /Finalizar pedido/ })).not.toBeInTheDocument();
  });
});

describe("Carrinho — quantidade por tipo", () => {
  it("só Avulso, Smash Cake e Bento Cake têm seletor; Cento e Bolo só têm o botão de remover", () => {
    abrir();
    for (const id of ["l-avulso", "l-smash", "l-bento"]) {
      const linha = within(itemOuFalha(id));
      expect(linha.getByRole("button", { name: /^Diminuir / })).toBeInTheDocument();
      expect(linha.getByRole("button", { name: /^Aumentar / })).toBeInTheDocument();
      expect(linha.getByRole("textbox")).toBeInTheDocument();
    }
    for (const id of ["l-cento", "l-bolo"]) {
      const linha = within(itemOuFalha(id));
      expect(linha.queryByRole("button", { name: /^(Diminuir|Aumentar) / })).not.toBeInTheDocument();
      expect(linha.queryByRole("textbox")).not.toBeInTheDocument();
      expect(linha.queryByRole("spinbutton")).not.toBeInTheDocument();
      // única ação da linha: remover
      expect(linha.getAllByRole("button").map((b) => b.getAttribute("aria-label"))).toEqual([
        expect.stringMatching(/^Remover /),
      ]);
    }
  });

  it("linha sem mínimo/step gravados (antiga) também só tem o botão de remover", () => {
    const antiga = { ...brigadeiro } as Record<string, unknown>;
    delete antiga.pedidoMinimo;
    delete antiga.step;
    abrir([antiga as LinhaCarrinho]);
    const linha = within(itemOuFalha("l-avulso"));
    expect(linha.queryByRole("textbox")).not.toBeInTheDocument();
    expect(linha.queryByRole("button", { name: /^(Diminuir|Aumentar) / })).not.toBeInTheDocument();
    expect(linha.getByRole("button", { name: /^Remover / })).toBeInTheDocument();
  });

  it("Avulso: anda no step, trava no mínimo e o total recalcula", async () => {
    const user = userEvent.setup();
    abrir();
    const linha = within(itemOuFalha("l-avulso"));
    const menos = linha.getByRole("button", { name: "Diminuir Quantidade de Brigadeiro Gourmet" });
    const mais = linha.getByRole("button", { name: "Aumentar Quantidade de Brigadeiro Gourmet" });
    const campo = linha.getByRole("textbox", { name: "Quantidade de Brigadeiro Gourmet" });

    expect(campo).toHaveValue("20");
    await user.click(mais);
    expect(campo).toHaveValue("25");
    expect(linha.getByText("R$ 58,75")).toBeInTheDocument();
    expect(salvas().find((l) => l.id === "l-avulso")?.quantidade).toBe(25);
    expect(screen.getAllByText("R$ 1.544,33").length).toBeGreaterThan(0);

    await user.click(menos);
    await user.click(menos);
    await user.click(menos);
    expect(campo).toHaveValue("10");
    expect(menos).toBeDisabled(); // travou no mínimo
    expect(salvas().find((l) => l.id === "l-avulso")?.quantidade).toBe(10);
    expect(linha.getByText("R$ 23,50")).toBeInTheDocument();
  });

  it("número digitado abaixo do mínimo mostra 'Quantidade mínima: 10', não muda a linha e ao sair do campo vai para o mínimo", async () => {
    const user = userEvent.setup();
    abrir();
    const linha = within(itemOuFalha("l-avulso"));
    const campo = linha.getByRole("textbox", { name: "Quantidade de Brigadeiro Gourmet" });

    await user.clear(campo);
    await user.type(campo, "3");
    expect(linha.getByText("Quantidade mínima: 10")).toBeInTheDocument();
    expect(salvas().find((l) => l.id === "l-avulso")?.quantidade).toBe(20); // nada mudou ainda

    await user.tab();
    expect(campo).toHaveValue("10");
    expect(linha.queryByText("Quantidade mínima: 10")).not.toBeInTheDocument();
    expect(salvas().find((l) => l.id === "l-avulso")?.quantidade).toBe(10);
  });

  it("número fora do step avisa e, ao sair do campo, vai para o múltiplo mais próximo; número certo vale na hora", async () => {
    const user = userEvent.setup();
    abrir();
    const linha = within(itemOuFalha("l-avulso"));
    const campo = linha.getByRole("textbox", { name: "Quantidade de Brigadeiro Gourmet" });

    await user.clear(campo);
    await user.type(campo, "32");
    expect(linha.getByText("Escolha em múltiplos de 5.")).toBeInTheDocument();
    await user.tab();
    expect(campo).toHaveValue("35");

    await user.clear(campo);
    await user.type(campo, "60");
    expect(salvas().find((l) => l.id === "l-avulso")?.quantidade).toBe(60);
    expect(linha.queryByText(/múltiplos/)).not.toBeInTheDocument();
  });

  it("Smash Cake anda de 1 em 1 e Bento Cake trava no mínimo do produto (2), sem step", async () => {
    const user = userEvent.setup();
    abrir();
    const s = within(itemOuFalha("l-smash"));
    await user.click(s.getByRole("button", { name: /^Aumentar / }));
    expect(s.getByRole("textbox")).toHaveValue("3");
    await user.click(s.getByRole("button", { name: /^Diminuir / }));
    await user.click(s.getByRole("button", { name: /^Diminuir / }));
    expect(s.getByRole("textbox")).toHaveValue("1");
    expect(s.getByRole("button", { name: /^Diminuir / })).toBeDisabled();

    const b = within(itemOuFalha("l-bento"));
    await user.click(b.getByRole("button", { name: /^Diminuir / }));
    expect(b.getByRole("textbox")).toHaveValue("2");
    expect(b.getByRole("button", { name: /^Diminuir / })).toBeDisabled();
    expect(b.getByText("R$ 90,00")).toBeInTheDocument();
    expect(b.getByText(/mín\. 2/)).toBeInTheDocument();
  });

  it("Cento e Bolo continuam como foram gravados depois de mexer nas outras linhas", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(itemOuFalha("l-smash")).getByRole("button", { name: /^Aumentar / }));
    expect(salvas().find((l) => l.id === "l-cento")).toEqual(cento);
    expect(salvas().find((l) => l.id === "l-bolo")).toEqual(bolo);
  });
});

describe("Carrinho — remover e desfazer", () => {
  it("um clique tira a linha na hora, da tela e do localStorage, sem confirmação, e abre o aviso com 'Desfazer'", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(botaoRemover("l-cento"));

    expect(item("l-cento")).toBeNull();
    expect(salvas().map((l) => l.id)).toEqual(["l-avulso", "l-bolo", "l-smash", "l-bento"]);
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByText("Item removido")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Desfazer a remoção de Cento de salgados assados" })).toHaveTextContent("Desfazer");
    // total sem a linha
    expect(within(screen.getByRole("region", { name: "Resumo" })).getByText("R$ 1.340,60")).toBeInTheDocument();
  });

  it("o aviso fica numa região aria-live polite que já existia antes da remoção", async () => {
    const user = userEvent.setup();
    abrir();
    const regiao = document.querySelector(".avisos");
    expect(regiao).toHaveAttribute("aria-live", "polite");
    await user.click(botaoRemover("l-smash"));
    expect(regiao).toContainElement(screen.getByText("Item removido"));
  });

  it("'Desfazer' devolve a linha idêntica e na mesma posição, e o total volta", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(botaoRemover("l-bolo"));
    await user.click(screen.getByRole("button", { name: /^Desfazer a remoção de Bolo Recheado/ }));

    expect(salvas()).toEqual(TODAS);
    expect(idsNaTela()).toEqual(["l-avulso", "l-cento", "l-bolo", "l-smash", "l-bento"]);
    expect(avisosNaTela()).toHaveLength(0);
    expect(within(screen.getByRole("region", { name: "Resumo" })).getByText("R$ 1.532,58")).toBeInTheDocument();
  });

  it("'Desfazer' com o teclado (Enter no botão) e o foco volta para o botão de remover da linha", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(botaoRemover("l-smash"));
    const desfazer = screen.getByRole("button", { name: /^Desfazer a remoção de Smash Cake/ });
    desfazer.focus();
    expect(desfazer).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(salvas()).toEqual(TODAS);
    expect(botaoRemover("l-smash")).toHaveFocus();
  });

  it("remover funciona com o teclado", async () => {
    const user = userEvent.setup();
    abrir();
    botaoRemover("l-cento").focus();
    await user.keyboard("{Enter}");
    expect(item("l-cento")).toBeNull();
  });

  it("remover a última linha mostra o carrinho vazio, com o aviso ainda na tela; desfazer traz a linha de volta", async () => {
    const user = userEvent.setup();
    abrir([smash]);
    await user.click(botaoRemover("l-smash"));
    expect(screen.getByRole("heading", { level: 1, name: "Seu pedido ainda está vazinho" })).toBeInTheDocument();
    expect(screen.getByText("Item removido")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /^Desfazer / }));
    expect(salvas()).toEqual([smash]);
    expect(item("l-smash")).not.toBeNull();
  });

  describe("qualquer outra interação só fecha o aviso e a remoção fica valendo", () => {
    async function removerECOnferir() {
      const user = userEvent.setup();
      abrir();
      await user.click(botaoRemover("l-cento"));
      expect(avisosNaTela()).toHaveLength(1);
      return user;
    }
    function removidoParaSempre() {
      expect(avisosNaTela()).toHaveLength(0);
      expect(item("l-cento")).toBeNull();
      expect(salvas().map((l) => l.id)).not.toContain("l-cento");
    }

    it("botão X de fechar", async () => {
      const user = await removerECOnferir();
      await user.click(screen.getByRole("button", { name: "Fechar aviso" }));
      removidoParaSempre();
    });

    it("clique fora do aviso", async () => {
      const user = await removerECOnferir();
      await user.click(screen.getByRole("heading", { level: 1 }));
      removidoParaSempre();
    });

    it("ajustar a quantidade de outra linha", async () => {
      const user = await removerECOnferir();
      await user.click(within(itemOuFalha("l-smash")).getByRole("button", { name: /^Aumentar / }));
      removidoParaSempre();
    });

    it("rolar a tela (roda do mouse, dedo ou teclas de rolagem)", async () => {
      for (const rolar of [
        () => fireEvent.wheel(window),
        () => fireEvent.touchMove(document.body),
        () => fireEvent.keyDown(document.body, { key: "PageDown" }),
        () => fireEvent.keyDown(document.body, { key: " " }),
      ]) {
        cleanup();
        window.localStorage.clear();
        const user = await removerECOnferir();
        void user;
        rolar();
        removidoParaSempre();
      }
    });

    it("digitar num campo não conta como rolar", async () => {
      const user = await removerECOnferir();
      const campo = within(itemOuFalha("l-smash")).getByRole("textbox");
      campo.focus();
      fireEvent.keyDown(campo, { key: "ArrowDown" });
      expect(avisosNaTela()).toHaveLength(1);
      void user;
    });

    it("navegar para outra página (a tela desmonta): a remoção fica valendo", async () => {
      const user = userEvent.setup();
      const { unmount } = abrir();
      await user.click(botaoRemover("l-cento"));
      unmount();
      expect(salvas().map((l) => l.id)).not.toContain("l-cento");
    });

    it("com o tempo (8 segundos)", () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      abrir();
      fireEvent.click(botaoRemover("l-cento"));
      expect(avisosNaTela()).toHaveLength(1);
      act(() => vi.advanceTimersByTime(DURACAO_AVISO_MS - 1));
      expect(avisosNaTela()).toHaveLength(1);
      act(() => vi.advanceTimersByTime(1));
      removidoParaSempre();
    });
  });

  it("atualizar a página com o aviso na tela: a remoção já estava gravada e o item não volta", async () => {
    const user = userEvent.setup();
    const { unmount } = abrir();
    await user.click(botaoRemover("l-cento"));
    expect(avisosNaTela()).toHaveLength(1);

    // "F5": some tudo da memória da página; só o localStorage sobra
    unmount();
    reiniciarParaTeste();
    render(
      <CarrinhoProvider>
        <Carrinho />
      </CarrinhoProvider>
    );
    expect(idsNaTela()).toEqual(["l-avulso", "l-bolo", "l-smash", "l-bento"]);
    expect(avisosNaTela()).toHaveLength(0);
  });

  describe("cada remoção tem o seu aviso, independente dos outros", () => {
    it("remover outra linha NÃO fecha o aviso anterior; cada 'Desfazer' devolve só a sua linha", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(botaoRemover("l-cento"));
      await user.click(botaoRemover("l-smash"));
      expect(avisosNaTela()).toHaveLength(2);
      expect(idsNaTela()).toEqual(["l-avulso", "l-bolo", "l-bento"]);

      await user.click(screen.getByRole("button", { name: /^Desfazer a remoção de Cento/ }));
      expect(idsNaTela()).toEqual(["l-avulso", "l-cento", "l-bolo", "l-bento"]);
      expect(avisosNaTela()).toHaveLength(1); // o da outra linha segue

      await user.click(screen.getByRole("button", { name: /^Desfazer a remoção de Smash Cake/ }));
      expect(salvas()).toEqual(TODAS);
      expect(avisosNaTela()).toHaveLength(0);
    });

    it("desfazer na ordem inversa também devolve tudo na posição original", async () => {
      const user = userEvent.setup();
      abrir();
      await user.click(botaoRemover("l-cento"));
      await user.click(botaoRemover("l-bolo"));
      await user.click(screen.getByRole("button", { name: /^Desfazer a remoção de Bolo/ }));
      await user.click(screen.getByRole("button", { name: /^Desfazer a remoção de Cento/ }));
      expect(salvas()).toEqual(TODAS);
    });

    it("o tempo de cada aviso corre à parte: fecha um sem fechar o outro", () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      abrir();
      fireEvent.click(botaoRemover("l-cento"));
      act(() => vi.advanceTimersByTime(5000));
      fireEvent.click(botaoRemover("l-smash"));
      expect(avisosNaTela()).toHaveLength(2);
      act(() => vi.advanceTimersByTime(3000)); // o primeiro completa 8 s
      expect(avisosNaTela()).toHaveLength(1);
      expect(screen.getByRole("button", { name: /^Desfazer a remoção de Smash Cake/ })).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(5000));
      expect(avisosNaTela()).toHaveLength(0);
    });

    it("o tempo pausa com o mouse em cima e com o foco dentro, e segue de onde parou", () => {
      vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
      abrir();
      fireEvent.click(botaoRemover("l-cento"));
      const aviso = screen.getByText("Item removido").closest("[data-aviso]") as HTMLElement;

      act(() => vi.advanceTimersByTime(6000));
      fireEvent.pointerEnter(aviso);
      act(() => vi.advanceTimersByTime(60_000));
      expect(avisosNaTela()).toHaveLength(1);
      fireEvent.pointerLeave(aviso);
      act(() => vi.advanceTimersByTime(1999));
      expect(avisosNaTela()).toHaveLength(1);
      act(() => vi.advanceTimersByTime(1));
      expect(avisosNaTela()).toHaveLength(0);

      // foco dentro do aviso
      fireEvent.click(botaoRemover("l-smash"));
      const desfazer = screen.getByRole("button", { name: /^Desfazer / });
      fireEvent.focus(desfazer);
      act(() => vi.advanceTimersByTime(60_000));
      expect(avisosNaTela()).toHaveLength(1);
      fireEvent.blur(desfazer);
      act(() => vi.advanceTimersByTime(DURACAO_AVISO_MS));
      expect(avisosNaTela()).toHaveLength(0);
    });

    it("no desktop ficam no máximo 3 avisos empilhados; o mais antigo fecha e a remoção dele vale", async () => {
      const user = userEvent.setup();
      abrir();
      for (const id of ["l-avulso", "l-cento", "l-bolo", "l-smash"]) await user.click(botaoRemover(id));
      expect(avisosNaTela()).toHaveLength(3);
      expect(screen.queryByRole("button", { name: /^Desfazer a remoção de Brigadeiro/ })).not.toBeInTheDocument();
      expect(salvas().map((l) => l.id)).toEqual(["l-bento"]);
    });

    it("no celular ficam no máximo 2, para não cobrir a barra de 'Finalizar pedido'", async () => {
      vi.stubGlobal("matchMedia", (consulta: string) => ({
        matches: consulta === "(max-width: 767px)",
        media: consulta,
        addEventListener: () => {},
        removeEventListener: () => {},
      }));
      const user = userEvent.setup();
      abrir();
      for (const id of ["l-avulso", "l-cento", "l-bolo"]) await user.click(botaoRemover(id));
      expect(avisosNaTela()).toHaveLength(2);
      expect(screen.queryByRole("button", { name: /^Desfazer a remoção de Brigadeiro/ })).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /^Desfazer a remoção de Bolo/ })).toBeInTheDocument();
    });
  });
});

describe("Carrinho — editar Cento e Bolo", () => {
  it("só o Cento e o Bolo têm o ícone de editar, ao lado do de remover, e ele leva à interna com ?editar=", () => {
    abrir();
    const cento = within(itemOuFalha("l-cento")).getByRole("link", { name: "Editar Cento de salgados assados" });
    expect(cento).toHaveAttribute("href", "/produtos/cento-de-salgados-assados?editar=l-cento");
    const bolo = within(itemOuFalha("l-bolo")).getByRole("link", { name: "Editar Bolo Recheado" });
    expect(bolo).toHaveAttribute("href", "/produtos/bolo-recheado?editar=l-bolo");
    for (const id of ["l-cento", "l-bolo"]) {
      expect(within(itemOuFalha(id)).getByRole("button", { name: /^Remover / })).toBeInTheDocument();
    }
    for (const id of ["l-avulso", "l-smash", "l-bento"]) {
      expect(within(itemOuFalha(id)).queryByRole("link", { name: /^Editar / })).not.toBeInTheDocument();
    }
  });

  it("clicar em editar não remove nem muda a linha (a troca só acontece ao confirmar na interna)", async () => {
    const user = userEvent.setup();
    abrir();
    await user.click(within(itemOuFalha("l-cento")).getByRole("link", { name: /^Editar / }));
    expect(salvas()).toEqual(TODAS);
    expect(idsNaTela()).toEqual(["l-avulso", "l-cento", "l-bolo", "l-smash", "l-bento"]);
    expect(avisosNaTela()).toHaveLength(0);
  });

  it("linha sem slug gravado não tem o ícone (não há para onde levar)", () => {
    abrir([{ ...cento, slug: null } as LinhaCarrinho]);
    expect(within(itemOuFalha("l-cento")).queryByRole("link", { name: /^Editar / })).not.toBeInTheDocument();
  });
});
