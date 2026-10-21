import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
import { conferirSaboresDoCento, temCento } from "./sabores-cento";
import type { ItemGravado } from "./validacao";

// Regra 5 (PR servidor/cento-passo-soma): sabor tem que estar na lista do
// próprio produto, ativo ou não; produto desconhecido passa.
const ID = "22222222-2222-4222-8222-222222222222";
const linha = (nomes: string[], produto_id = ID): ItemGravado => ({
  nome: "Cento", variacao: null, quantidade: 1, preco_unitario: 90, produto_id, tipo: "cento", observacao: null,
  sabores: nomes.map((nome) => ({ nome, quantidade: 0 })),
});
const avulso: ItemGravado = { nome: "A", variacao: null, quantidade: 1, preco_unitario: 1, produto_id: ID, tipo: "normal", observacao: null };

describe("conferência dos sabores do Cento com a lista do produto", () => {
  it("sabor na lista passa (a lista conta o sabor mesmo inativo: ela não olha ativo)", () => {
    expect(conferirSaboresDoCento([linha(["Coxinha", "Empada"])], { [ID]: ["Coxinha", "Risoles", "Empada"] })).toEqual({ ok: true, desconhecidos: 0 });
  });
  it("sabor fora da lista é recusado, sem repetir o nome", () => {
    const r = conferirSaboresDoCento([linha(["Coxinha", "Pizza"])], { [ID]: ["Coxinha"] });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.mensagem).not.toContain("Pizza");
  });
  it("sabor de outro Cento não vale", () => {
    expect(conferirSaboresDoCento([linha(["Brigadeiro"])], { [ID]: ["Coxinha"], outro: ["Brigadeiro"] }).ok).toBe(false);
  });
  it("produto fora do mapa passa e é contado", () => {
    expect(conferirSaboresDoCento([linha(["Qualquer"], "99999999-9999-4999-8999-999999999999"), linha(["Coxinha"], ID)], { [ID]: ["Coxinha"] })).toEqual({ ok: true, desconhecidos: 1 });
  });
  it("só olha linha de Cento", () => {
    expect(temCento([avulso])).toBe(false);
    expect(temCento([avulso, linha(["x"])])).toBe(true);
    expect(conferirSaboresDoCento([avulso], {})).toEqual({ ok: true, desconhecidos: 0 });
  });
});
