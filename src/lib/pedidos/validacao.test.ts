import { describe, expect, it } from "vitest";
import { subtotalEmCentavos, totalDoCarrinho } from "@/lib/carrinho/regras";
import { CHAVE_TESTE as CHAVE, DADOS_TESTE as DADOS, FIXTURA_VALORES as fixtura, LINHAS_TESTE as LINHAS } from "./fixtura-teste";
import { montarCorpo, type CorpoPedido } from "./envio";
import { LIMITES, normalizarWhatsApp, validarPedido } from "./validacao";

// Validação do servidor: forma e limite, não verdade de negócio (PR
// confirmacao-e-gravacao). "Hoje" é injetado: 29/09/2026 em Brasília.
const HOJE = "2026-09-29";

function corpo(sobrescrever: Partial<CorpoPedido> = {}): CorpoPedido {
  return { ...montarCorpo(DADOS, LINHAS, CHAVE), ...sobrescrever };
}

function recusa(bruto: unknown): string {
  const r = validarPedido(bruto, HOJE);
  if (r.ok) throw new Error("era para recusar");
  return r.mensagem;
}

describe("validação do pedido no servidor: aceita", () => {
  it("o carrinho com os cinco tipos de linha e monta o pedido para gravar", () => {
    const r = validarPedido(corpo(), HOJE);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const { pedido } = r.valor;
    expect(pedido.cliente_whatsapp).toBe("(41) 99712-4408");
    expect(pedido.forma_pagamento).toBe("Pix");
    expect(pedido.endereco).toBe("Rua das Cerejeiras, 88 - Casa dos fundos, Nações, Fazenda Rio Grande");
    // 14h de Brasília = 17h UTC, qualquer que seja o fuso do processo.
    expect(pedido.data_hora_entrega).toBe("2026-10-17T17:00:00.000Z");
    expect(pedido.itens.map((i) => i.tipo)).toEqual(["normal", "cento", "bolo", "normal", "bento", "normal", "normal"]);
    expect(pedido.itens[0]).toMatchObject({ produto_id: LINHAS[0].produtoId, quantidade: 50, preco_unitario: 2.35 });
    expect(pedido.itens[2]).toMatchObject({ recheio: { nome: "Chocolate com morango" }, formato: "redondo" });
    // Nada define teste nem status pelo corpo.
    expect(pedido).not.toHaveProperty("teste");
    expect(pedido).not.toHaveProperty("status");
  });

  it("NÃO confere produto no banco: id de produto que não existe (formato válido), preço alterado e produto desativado passam", () => {
    const itens = corpo().itens.map((i, n) =>
      n === 0 ? { ...i, produto_id: "00000000-0000-4000-8000-000000000000", preco: 0.01 } : i
    );
    const r = validarPedido(corpo({ itens }), HOJE);
    expect(r.ok).toBe(true);
    // O servidor não recebe nem consulta "ativo": a regra é só de forma.
  });

  it("WhatsApp com +55 na frente (12 ou 13 dígitos) tira o 55 e aceita", () => {
    expect(normalizarWhatsApp("+55 (41) 99712-4408")).toBe("41997124408");
    expect(normalizarWhatsApp("55 41 3333-4444")).toBe("4133334444");
    expect(validarPedido(corpo({ whatsapp: "+55 41 99712-4408" }), HOJE).ok).toBe(true);
  });

  it("data de hoje e data exatamente 12 meses à frente", () => {
    expect(validarPedido(corpo({ data: HOJE }), HOJE).ok).toBe(true);
    expect(validarPedido(corpo({ data: "2027-09-29" }), HOJE).ok).toBe(true);
  });

  it("retirada sem endereço e e-mail em branco", () => {
    const r = validarPedido(corpo({ modo: "retirada", cidade: "", bairro: "", rua: "", numero: "", complemento: "", email: "" }), HOJE);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.valor.pedido.endereco).toBeNull();
      expect(r.valor.pedido.cliente_email).toBeNull();
    }
  });
});

describe("validação do pedido no servidor: recusa", () => {
  it("campo desconhecido, no pedido e no item", () => {
    expect(recusa({ ...corpo(), teste: false })).toMatch(/não reconhece/);
    expect(recusa({ ...corpo(), status: "entregue" })).toMatch(/não reconhece/);
    const itens = corpo().itens.map((i, n) => (n === 0 ? { ...i, preco_unitario: 1 } : i));
    expect(recusa(corpo({ itens: itens as CorpoPedido["itens"] }))).toMatch(/não reconhece/);
  });

  it("cada texto acima do tamanho máximo", () => {
    const grande = (n: number) => "a".repeat(n + 1);
    expect(recusa(corpo({ nome: grande(LIMITES.nome) }))).toMatch(/nome/);
    expect(recusa(corpo({ email: `${grande(LIMITES.email)}@x.com` }))).toMatch(/e-mail/);
    expect(recusa(corpo({ ocasiao: grande(LIMITES.ocasiao) }))).toMatch(/ocasião/);
    expect(recusa(corpo({ observacoes: grande(LIMITES.observacoes) }))).toMatch(/observações/);
    expect(recusa(corpo({ rua: grande(LIMITES.rua) }))).toMatch(/endereço/);
    expect(recusa(corpo({ complemento: grande(LIMITES.complemento) }))).toMatch(/endereço/);
    const itens = corpo().itens.map((i, n) => (n === 0 ? { ...i, observacao: grande(LIMITES.observacaoItem) } : i));
    expect(recusa(corpo({ itens }))).toMatch(/observação/);
  });

  it("WhatsApp inválido", () => {
    for (const w of ["(41) 9971-24", "00 99712-4408", "+1 415 555 0100", "(41) 19712-4408", "5541997124408999"]) {
      expect(recusa(corpo({ whatsapp: w }))).toMatch(/WhatsApp/);
    }
  });

  it("e-mail em formato inválido", () => {
    expect(recusa(corpo({ email: "juliana@" }))).toMatch(/e-mail/);
  });

  it("data no passado (ontem em Brasília) e além de 12 meses", () => {
    expect(recusa(corpo({ data: "2026-09-28" }))).toMatch(/já passou/);
    expect(recusa(corpo({ data: "2027-09-30" }))).toMatch(/longe/);
    expect(recusa(corpo({ data: "2026-02-30" }))).toMatch(/data/);
    expect(recusa(corpo({ hora: "25:00" }))).toMatch(/horário/);
  });

  it("linhas demais (51) e nenhuma linha", () => {
    const uma = corpo().itens[6];
    expect(recusa(corpo({ itens: Array.from({ length: LIMITES.linhas + 1 }, () => uma) }))).toMatch(/50 itens/);
    expect(validarPedido(corpo({ itens: Array.from({ length: LIMITES.linhas }, () => uma) }), HOJE).ok).toBe(true);
    expect(recusa(corpo({ itens: [] }))).toMatch(/pelo menos um item/);
  });

  it("quantidade fora do limite de cada tipo", () => {
    const [avulso, cento, bolo, , bento] = corpo().itens;
    expect(recusa(corpo({ itens: [{ ...avulso, quantidade: 10_000 }] }))).toMatch(/quantidade/);
    expect(recusa(corpo({ itens: [{ ...avulso, quantidade: 0 }] }))).toMatch(/quantidade/);
    expect(recusa(corpo({ itens: [{ ...avulso, quantidade: 1.5 }] }))).toMatch(/quantidade/);
    expect(recusa(corpo({ itens: [{ ...cento, quantidade: 51 }] }))).toMatch(/quantidade/);
    expect(recusa(corpo({ itens: [{ ...bolo, quantidade: 51 }] }))).toMatch(/quantidade/);
    expect(recusa(corpo({ itens: [{ ...bento, quantidade: 10_000 }] }))).toMatch(/quantidade/);
  });

  it("preço negativo, com 3 casas ou acima de R$ 50.000", () => {
    const [avulso] = corpo().itens;
    for (const preco of [-1, 1.005, 50_000.01, Number.NaN]) {
      expect(recusa(corpo({ itens: [{ ...avulso, preco }] }))).toMatch(/valor/);
    }
    expect(validarPedido(corpo({ itens: [{ ...avulso, preco: 50_000 }] }), HOJE).ok).toBe(true);
  });

  it("id de produto e de recheio fora do formato", () => {
    const [avulso, , bolo] = corpo().itens;
    expect(recusa(corpo({ itens: [{ ...avulso, produto_id: "coca-cola" }] }))).toMatch(/incompleto/);
    expect(recusa(corpo({ itens: [{ ...bolo, recheio: { id: "1", nome: "Ninho" } } as CorpoPedido["itens"][number]] }))).toMatch(/recheio/);
  });

  it("itens acima de 16 KB", () => {
    const [avulso] = corpo().itens;
    const pesado = { ...avulso, nome: "é".repeat(LIMITES.nomeItem), observacao: "ã".repeat(LIMITES.observacaoItem) };
    // Cada linha dessas tem ~1,1 KB em UTF-8: 16 linhas passam de 16 KB.
    expect(recusa(corpo({ itens: Array.from({ length: 16 }, () => pesado) }))).toMatch(/grande demais/);
  });

  it("chave de idempotência fora do formato", () => {
    expect(recusa(corpo({ chave_idempotencia: "123" }))).toMatch(/incompleto/);
  });

  it("mensagem de erro nunca repete o que veio no corpo", () => {
    const marcador = "MARCADOR_PESSOAL_XYZ";
    const mensagens = [
      recusa(corpo({ nome: marcador.repeat(20) })),
      recusa(corpo({ whatsapp: marcador })),
      recusa(corpo({ itens: [{ ...corpo().itens[0], nome: marcador, quantidade: 0 }] })),
      recusa({ ...corpo(), [marcador]: 1 }),
    ];
    for (const m of mensagens) expect(m).not.toContain(marcador);
  });
});

describe("conferência de valores (item 7g): navegador = rota = banco", () => {
  it("cada linha e o total batem no centavo, nos cinco tipos, com centavos", () => {
    const r = validarPedido(corpo(), HOJE);
    if (!r.ok) throw new Error(r.mensagem);
    fixtura.linhas.forEach((l, i) => {
      // Navegador (página do carrinho e checkout).
      expect(subtotalEmCentavos(LINHAS[i])).toBe(l.valorCentavos);
      // Rota.
      expect(r.valor.valoresCentavos[i]).toBe(l.valorCentavos);
      // O que vai para o gatilho do banco: quantidade e preço da linha como
      // estão no carrinho (Bolo em kg, Cento em centos).
      expect(r.valor.pedido.itens[i].quantidade).toBe(l.quantidade);
      expect(r.valor.pedido.itens[i].preco_unitario).toBe(l.preco);
    });
    expect(Math.round(totalDoCarrinho(LINHAS) * 100)).toBe(fixtura.totalCentavos);
    expect(r.valor.subtotalCentavos).toBe(fixtura.totalCentavos);
    expect(r.valor.totalNavegadorCentavos).toBe(fixtura.totalCentavos);
  });
});
