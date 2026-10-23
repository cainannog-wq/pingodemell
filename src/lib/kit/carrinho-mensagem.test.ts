import { describe, expect, it } from "vitest";
import {
  adicionarLinha,
  alterarQuantidade,
  contarKits,
  controleDaQuantidade,
  escreverCarrinho,
  linhaValida,
  lerCarrinho,
  MAX_KITS,
  podeEditarNaInterna,
  subtotalEmCentavos,
  type LinhaCarrinho,
  type LinhaKit,
  type NovaLinha,
} from "@/lib/carrinho/regras";
import { acaoDaOferta } from "@/lib/checkout/ofertas";
import { mensagemSemRegistro, montarRetrato as montarRetratoDoPedido } from "@/lib/pedidos/confirmacao";
import { DADOS_TESTE } from "@/lib/pedidos/fixtura-teste";
import { semIndisponiveis } from "@/lib/vitrine/disponibilidade";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";
import { BEIJINHO, BRIGADEIRO, NINHO, PRODUTO, SUCO, configDoExemplo } from "./fixtura";
import { montarRetrato } from "./texto";

const config = configDoExemplo();
const CERTO = { bolo: [[NINHO, 1]], doces: [[BRIGADEIRO, 10], [BEIJINHO, 10]], bebida: [[SUCO, 2]] } as LinhaKit["escolhas"];

function nova(pessoas = 10, escolhas = CERTO): Omit<LinhaKit, "id"> {
  return {
    tipo: "kit",
    produtoId: PRODUTO,
    slug: "kit-festa-basico",
    nome: "Kit Festa Básico",
    preco: 22,
    observacao: null,
    quantidade: pessoas,
    unidade_venda: "a pessoa",
    escolhas,
    retrato: montarRetrato(config, pessoas, escolhas),
  };
}
let seq = 0;
const novoId = () => `id-${++seq}`;

describe("kit no carrinho", () => {
  it("nunca junta: dois kits iguais são duas linhas", () => {
    const duas = adicionarLinha(adicionarLinha([], nova() as NovaLinha, novoId), nova() as NovaLinha, novoId);
    expect(duas).toHaveLength(2);
    expect(duas.every((l) => l.tipo === "kit")).toBe(true);
  });

  it("o sexto kit não entra (limite de 5 kits por pedido); outros itens continuam entrando", () => {
    let linhas: LinhaCarrinho[] = [];
    for (let i = 0; i < MAX_KITS + 1; i++) linhas = adicionarLinha(linhas, nova() as NovaLinha, novoId);
    expect(contarKits(linhas)).toBe(MAX_KITS);
    const comAvulso = adicionarLinha(
      linhas,
      { tipo: "normal", produtoId: "p", slug: "x", nome: "Doce", preco: 1, observacao: null, unidade_venda: null, quantidade: 1 } as NovaLinha,
      novoId
    );
    expect(comAvulso).toHaveLength(MAX_KITS + 1);
  });

  it("subtotal = preço por pessoa x pessoas, em centavos", () => {
    expect(subtotalEmCentavos({ ...nova(30), id: "a" })).toBe(66000);
  });

  it("sem controle de quantidade e sem ícone de editar", () => {
    const l = { ...nova(), id: "a" } as LinhaCarrinho;
    expect(controleDaQuantidade(l)).toBeNull();
    expect(alterarQuantidade([l], "a", 99)).toEqual([l]);
    expect(podeEditarNaInterna(l)).toBe(false);
  });

  it("valida na leitura: pessoas, escolhas e retrato coerentes; senão a linha é descartada", () => {
    const boa = { ...nova(), id: "a" };
    expect(linhaValida(boa)).toBe(true);
    expect(linhaValida({ ...boa, quantidade: 0 })).toBe(false);
    expect(linhaValida({ ...boa, quantidade: 20 })).toBe(false); // retrato diz 10 pessoas
    expect(linhaValida({ ...boa, escolhas: { Maiuscula: [] } })).toBe(false);
    expect(linhaValida({ ...boa, escolhas: { doces: [[BRIGADEIRO, 1.5]] } })).toBe(false);
    expect(linhaValida({ ...boa, retrato: { ...boa.retrato, grupos: "x" } })).toBe(false);
    const salvo = escreverCarrinho([boa, { ...boa, id: "b", quantidade: -1 }] as LinhaCarrinho[]);
    expect(lerCarrinho(salvo)).toHaveLength(1);
  });
});

describe("formato do bolo do kit", () => {
  it("linha com formato válido vale; formato fora da lista invalida a linha; linha de antes (sem formato) continua valendo", () => {
    const base = { ...nova(), id: "a" } as LinhaKit;
    expect(linhaValida({ ...base, formato: "quadrado", retrato: montarRetrato(config, 10, CERTO, "quadrado") })).toBe(true);
    expect(linhaValida(base)).toBe(true);
    expect(linhaValida({ ...base, formato: "triangular" })).toBe(false);
    expect(linhaValida({ ...base, retrato: { ...base.retrato, formato: "triangular" } })).toBe(false);
  });

  it("a composição escreve o formato depois do peso do bolo e some sem formato", async () => {
    const { linhasDaComposicao } = await import("./texto");
    expect(linhasDaComposicao(montarRetrato(config, 10, CERTO, "redondo"))[0]).toBe("Bolo: 1 kg, redondo");
    expect(linhasDaComposicao(montarRetrato(config, 10, CERTO))[0]).toBe("Bolo: 1 kg");
  });
});

describe("kit na mensagem do WhatsApp e na confirmação", () => {
  const linha = { ...nova(), id: "k1" } as LinhaCarrinho;
  const dados = { ...DADOS_TESTE, nome: "Teste Silva" };

  it("sem registro: nome, pessoas, valor e a composição com os nomes, sem emoji nem hífen", () => {
    const { texto } = mensagemSemRegistro(dados, [linha], "desligado");
    expect(texto).toContain("1. Kit Festa Básico, 10 pessoas, R$ 220,00");
    expect(texto).toContain("   Recheio do bolo: Ninho com morango");
    expect(texto).toContain("   Doces: Brigadeiro 10, Beijinho 10");
    const trecho = texto.slice(texto.indexOf("1. Kit"), texto.indexOf("Retirada") > -1 ? texto.indexOf("Retirada") : texto.indexOf("Entrega em"));
    expect(trecho).not.toMatch(/[-‐-―\u{1F300}-\u{1FAFF}]/u);
  });

  it("retrato da confirmação: quantidade em pessoas e detalhe com uma linha por item", () => {
    const retrato = montarRetratoDoPedido({
      dados: dados,
      linhas: [linha],
      resposta: { numero: 1060, itens: [{ valor_centavos: 22000 }], subtotal_centavos: 22000, total_centavos: 22000 },
      prazo: null,
    });
    expect(retrato.linhas[0].quantidade).toBe("10 pessoas");
    expect(retrato.linhas[0].detalhe?.split("\n").length).toBeGreaterThanOrEqual(4);
    expect(retrato.mensagem).toContain("Fiz o pedido nº 1060");
  });
});

function produto(tipo: string, id = "p1"): ProdutoVitrine {
  return {
    id,
    slug: "x",
    nome: "X",
    descricao: null,
    preco: 22,
    image_url: null,
    Categoria: "Kit Festa",
    tipo,
    unidade_venda: "a pessoa",
    pedido_minimo: 10,
    step_quantidade: "livre",
    ativo: true,
    destaque: true,
    atualizado_em: "2026-10-21T00:00:00Z",
  } as unknown as ProdutoVitrine;
}

describe("disponibilidade e ofertas", () => {
  it("kit só aparece com tamanho completo; sem o conjunto, todo kit é indisponível", () => {
    const k = produto("kit_pessoa");
    expect(semIndisponiveis([k], new Set(), [])).toEqual([]);
    expect(semIndisponiveis([k], new Set(), [], new Set(["p1"]))).toEqual([k]);
    expect(semIndisponiveis([k], new Set(), [], new Set(["outro"]))).toEqual([]);
  });

  it("tipo desconhecido não é vendido como avulso: fica indisponível", () => {
    expect(semIndisponiveis([produto("tipo_novo")], new Set(), [])).toEqual([]);
  });

  it("a oferta de kit leva à interna (nunca adiciona sem composição)", () => {
    expect(acaoDaOferta(produto("kit_pessoa") as never)).toBe("interna");
    expect(acaoDaOferta(produto("tipo_novo") as never)).toBe("interna");
  });
});
