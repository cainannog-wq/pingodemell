import { describe, expect, it } from "vitest";
import { subtotalEmCentavos, totalDoCarrinho, type LinhaKit } from "@/lib/carrinho/regras";
import { VAZIO } from "@/lib/checkout/formulario";
import { itemDaLinha, montarCorpo, valorDaLinhaEmCentavos } from "@/lib/pedidos/envio";
import { validarPedido } from "@/lib/pedidos/validacao";
import tamanhos31 from "./tamanhos-31.json";
import { BEIJINHO, BRIGADEIRO, NINHO, PRODUTO, SUCO, configDoExemplo } from "./fixtura";
import { montarRetrato } from "./texto";

// O total do kit nos 31 tamanhos (pedido do Cainan: este teste não se corta).
// A conta é preço por pessoa x pessoas, em centavos inteiros, nos três lugares
// (navegador, rota e gatilho do banco, este em scripts/banco/gravacao-pedidos.mjs
// com o mesmo JSON) e tem de bater com o preço do kit antigo de cada tamanho:
// é o que garante que trocar os 31 kits pelos 3 não muda nenhum preço.

const TODOS = tamanhos31.kits.flatMap((k) =>
  k.tamanhos.map(([pessoas, antigo]) => ({ kit: k.nome, porPessoa: k.precoPorPessoaCentavos, pessoas, antigo }))
);
const config = configDoExemplo([10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100]);
const DADOS = {
  ...VAZIO,
  nome: "Teste Silva",
  whatsapp: "(41) 99999-1111",
  aceite: true,
  data: "2026-11-20",
  hora: "10:00",
  modo: "retirada",
  pagamento: "pix",
} as typeof VAZIO;
const CHAVE = "0f8a3b1c-2d4e-4f60-8a7b-9c0d1e2f3a4b";

function linha(kit: string, porPessoa: number, pessoas: number): LinhaKit {
  const escolhas = {
    bolo: [[NINHO, 1]],
    doces: [[BRIGADEIRO, pessoas], [BEIJINHO, pessoas]],
    bebida: [[SUCO, Math.ceil(pessoas / 5)]],
  } as LinhaKit["escolhas"];
  return {
    id: `l-${kit}-${pessoas}`,
    tipo: "kit",
    produtoId: PRODUTO,
    slug: "kit",
    nome: kit,
    preco: porPessoa / 100,
    observacao: null,
    quantidade: pessoas,
    unidade_venda: "a pessoa",
    escolhas,
    retrato: montarRetrato(config, pessoas, escolhas),
  };
}

describe("os 31 tamanhos", () => {
  it("são 31 (11 + 10 + 10) e o preço por pessoa x pessoas é o do kit antigo, sem arredondar", () => {
    expect(TODOS).toHaveLength(31);
    for (const t of TODOS) expect(t.porPessoa * t.pessoas, `${t.kit} ${t.pessoas}`).toBe(t.antigo);
  });

  it.each(TODOS)("$kit, $pessoas pessoas: navegador e rota dão $antigo centavos", ({ kit, porPessoa, pessoas, antigo }) => {
    const l = linha(kit, porPessoa, pessoas);
    // Navegador.
    expect(subtotalEmCentavos(l)).toBe(antigo);
    expect(Math.round(totalDoCarrinho([l]) * 100)).toBe(antigo);
    // Rota: o mesmo valor, pela conta da própria rota e pela validação do corpo.
    expect(valorDaLinhaEmCentavos(itemDaLinha(l))).toBe(antigo);
    const corpo = montarCorpo(DADOS, [l], CHAVE);
    const r = validarPedido(JSON.parse(JSON.stringify(corpo)), "2026-10-21");
    expect(r.ok, r.ok ? "" : r.mensagem).toBe(true);
    if (r.ok) {
      expect(r.valor.valoresCentavos).toEqual([antigo]);
      expect(r.valor.subtotalCentavos).toBe(antigo);
      expect(corpo.total_navegador_centavos).toBe(antigo);
    }
  });

  it("cinco kits grandes no mesmo pedido somam certo e o corpo cabe nos limites", () => {
    const grandes = TODOS.filter((t) => t.pessoas === 100);
    const cinco = [...grandes, grandes[0], grandes[1]].map((t) => linha(t.kit, t.porPessoa, t.pessoas));
    expect(cinco).toHaveLength(5);
    const corpo = montarCorpo(DADOS, cinco, CHAVE);
    const r = validarPedido(JSON.parse(JSON.stringify(corpo)), "2026-10-21");
    expect(r.ok, r.ok ? "" : r.mensagem).toBe(true);
    if (r.ok) expect(r.valor.subtotalCentavos).toBe(cinco.reduce((s, l) => s + subtotalEmCentavos(l), 0));
    expect(new TextEncoder().encode(JSON.stringify(corpo)).length).toBeLessThan(32 * 1024);
  });
});
