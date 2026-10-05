// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useConfirmacao } from "@/app/(site)/produtos/[slug]/_interna/edicao";
import { reiniciarAnaliticaParaTeste } from "@/lib/analitica/gtag";
import { reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { assinaturaDaLinha, type LinhaCarrinho, type NovaLinha } from "@/lib/carrinho/regras";
import { CHAVE_CONSENTIMENTO, reiniciarConsentimentoParaTeste } from "@/lib/consentimento/consentimento";
import { CarrinhoProvider, useCarrinho } from "./CarrinhoProvider";

// add_to_cart (PR 2 da Fase 4): num ponto só, CarrinhoProvider.adicionar,
// com slug e nome do produto. Substituir (edição confirmada), alterar a
// quantidade, remover e desfazer não mandam nada.

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

const AVULSO: NovaLinha = {
  produtoId: "p-brigadeiro",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 2.35,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade: 30,
  pedidoMinimo: 30,
  step: "livre",
  observacao: null,
  foto: null,
};
const BOLO: NovaLinha = {
  produtoId: "p-bolo",
  slug: "bolo-de-chocolate-com-ninho",
  nome: "Bolo de Chocolate com Ninho",
  preco: 70,
  tipo: "bolo",
  quantidade: 2,
  recheio: { id: "r-1", nome: "Brigadeiro" },
  formato: "redondo",
  observacao: null,
  foto: null,
};

function eventos(): [string, unknown][] {
  return (window.dataLayer ?? [])
    .map((a) => Array.from(a as ArrayLike<unknown>))
    .filter((c) => c[0] === "event")
    .map((c) => [c[1] as string, c[2]]);
}

type Api = ReturnType<typeof useCarrinho> & { confirmacao: ReturnType<typeof useConfirmacao> };
function montar(edicao?: Parameters<typeof useConfirmacao>[0]): { api: () => Api } {
  let atual: Api | undefined;
  function Sonda() {
    const carrinho = useCarrinho();
    const confirmacao = useConfirmacao(edicao);
    atual = { ...carrinho, confirmacao };
    return null;
  }
  render(
    <CarrinhoProvider>
      <Sonda />
    </CarrinhoProvider>
  );
  return { api: () => atual! };
}

beforeEach(() => {
  window.localStorage.clear();
  reiniciarParaTeste();
  reiniciarConsentimentoParaTeste();
  reiniciarAnaliticaParaTeste();
  vi.stubEnv("GA4_ID", "G-TESTE00000");
  vi.stubEnv("CONTEXTO_NETLIFY", "branch-deploy");
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-06T01:30:00Z"));
  window.localStorage.setItem(CHAVE_CONSENTIMENTO, JSON.stringify({ versao: 1, escolha: "aceito", data: "2026-10-05", versaoPolitica: 1 }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllEnvs();
  reiniciarAnaliticaParaTeste();
});

describe("add_to_cart", () => {
  it("adicionar: um evento com só slug e nome, sem preço, quantidade ou valor", () => {
    const { api } = montar();
    act(() => api().adicionar(AVULSO));
    expect(eventos()).toEqual([["add_to_cart", { items: [{ item_id: "brigadeiro-gourmet", item_name: "Brigadeiro Gourmet" }] }]]);
  });

  it("linha sem slug: só o nome", () => {
    const { api } = montar();
    act(() => api().adicionar({ ...AVULSO, slug: null }));
    expect(eventos()).toEqual([["add_to_cart", { items: [{ item_name: "Brigadeiro Gourmet" }] }]]);
  });

  it("alterar quantidade, remover e desfazer não mandam nada", () => {
    const { api } = montar();
    act(() => api().adicionar(AVULSO));
    const linha = api().linhas[0];
    act(() => api().alterar(linha.id, { ...linha, quantidade: 40 } as LinhaCarrinho));
    const ordem = api().linhas.map((l) => l.id);
    act(() => api().remover(linha.id));
    act(() => api().reinserir({ ...linha, quantidade: 40 } as LinhaCarrinho, ordem));
    expect(eventos().map((e) => e[0])).toEqual(["add_to_cart"]);
  });

  it("edição confirmada (substituir) não manda add_to_cart; edição que virou item novo manda", () => {
    const primeiro = montar();
    act(() => primeiro.api().adicionar(BOLO));
    const original = primeiro.api().linhas[0] as LinhaCarrinho & { tipo: "bolo" };
    cleanup();

    const edicao = { linha: original, assinatura: assinaturaDaLinha(original) };
    const { api } = montar(edicao);
    let resultado = "";
    act(() => {
      resultado = api().confirmacao.confirmar({ ...BOLO, quantidade: 3 });
    });
    expect(resultado).toBe("substituiu");
    expect(eventos().map((e) => e[0])).toEqual(["add_to_cart"]);

    // A linha mudou depois que a edição abriu: vira item novo e conta.
    act(() => {
      resultado = api().confirmacao.confirmar({ ...BOLO, quantidade: 4 });
    });
    expect(resultado).toBe("adicionou");
    expect(eventos().map((e) => e[0])).toEqual(["add_to_cart", "add_to_cart"]);
  });

  it("sem consentimento: nada", () => {
    window.localStorage.removeItem(CHAVE_CONSENTIMENTO);
    reiniciarConsentimentoParaTeste();
    const { api } = montar();
    act(() => api().adicionar(AVULSO));
    expect(window.dataLayer).toBeUndefined();
    expect(api().linhas).toHaveLength(1);
  });
});
