import { describe, expect, it } from "vitest";
import { parseProdutoForm } from "@/lib/produtos/parse";

function buildFormData(fields: Record<string, string>) {
  const formData = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    formData.set(key, value);
  }
  return formData;
}

const CAMPOS_VALIDOS = {
  nome: "Bolo de cenoura",
  preco: "45,90",
  pedido_minimo: "1",
  prazo_producao_dias: "2",
  step_quantidade: "livre",
  categoria: "Doces",
};

describe("parseProdutoForm", () => {
  it("aceita um formulário totalmente preenchido", () => {
    const result = parseProdutoForm(buildFormData(CAMPOS_VALIDOS));
    expect(result.success).toBe(true);
  });

  it("bloqueia salvar sem prazo de produção", () => {
    const semPrazo = { ...CAMPOS_VALIDOS };
    delete (semPrazo as Record<string, string>).prazo_producao_dias;
    const result = parseProdutoForm(buildFormData(semPrazo));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/prazo de produção/i);
    }
  });

  it("bloqueia prazo de produção negativo", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, prazo_producao_dias: "-1" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/prazo de produção/i);
    }
  });

  it("aceita prazo de produção igual a 0 (produto sempre disponível, ex.: bebida)", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, prazo_producao_dias: "0" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.prazo_producao_dias).toBe(0);
    }
  });

  it("bloqueia salvar sem step de quantidade", () => {
    const semStep = { ...CAMPOS_VALIDOS };
    delete (semStep as Record<string, string>).step_quantidade;
    const result = parseProdutoForm(buildFormData(semStep));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/step de quantidade/i);
    }
  });

  it("bloqueia um step de quantidade fora da lista permitida", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, step_quantidade: "multiplos_3" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/step de quantidade/i);
    }
  });

  it("recusa salvar sem categoria (campo ausente ou vazio)", () => {
    const semCategoria = { ...CAMPOS_VALIDOS } as Record<string, string>;
    delete semCategoria.categoria;
    for (const campos of [semCategoria, { ...CAMPOS_VALIDOS, categoria: "" }, { ...CAMPOS_VALIDOS, categoria: "  " }]) {
      const result = parseProdutoForm(buildFormData(campos));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toBe("Selecione a categoria do produto.");
      }
    }
  });

  it("aceita as categorias de produto normal, incluindo Kits e Adicionais", () => {
    for (const categoria of ["Bolos", "Doces", "Salgados", "Bebidas", "Kits", "Adicionais"]) {
      const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, categoria }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.categoria).toBe(categoria);
      }
    }
  });

  it("unidade de venda: vazio vira null", () => {
    for (const unidade_venda of [undefined, "", "   "]) {
      const campos = unidade_venda === undefined ? CAMPOS_VALIDOS : { ...CAMPOS_VALIDOS, unidade_venda };
      const result = parseProdutoForm(buildFormData(campos));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unidade_venda).toBeNull();
      }
    }
  });

  it("unidade de venda: aceita as sugeridas e texto livre, sem espaços sobrando", () => {
    for (const [digitado, gravado] of [
      ["kg", "kg"],
      ["unidade", "unidade"],
      ["litro", "litro"],
      ["  caixa   com 6 ", "caixa com 6"],
    ]) {
      const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, unidade_venda: digitado }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.unidade_venda).toBe(gravado);
      }
    }
  });

  it("unidade de venda: recusa mais de 20 caracteres", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, unidade_venda: "x".repeat(21) }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/unidade de venda/i);
    }
  });

  // Bolo só em quilos inteiros: com unidade kg, a quantidade mínima é em kg
  // e só aceita número inteiro — meio quilo não tem como ser cadastrado.
  it("bolo em kg: quantidade mínima 1,5 (ou 1.5) é recusada; 1 e 2 são aceitas", () => {
    const bolo = { ...CAMPOS_VALIDOS, categoria: "Bolos", unidade_venda: "kg" };
    for (const pedido_minimo of ["1,5", "1.5", "0,5", "0"]) {
      const result = parseProdutoForm(buildFormData({ ...bolo, pedido_minimo }));
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toMatch(/pedido mínimo/i);
      }
    }
    for (const pedido_minimo of ["1", "2"]) {
      const result = parseProdutoForm(buildFormData({ ...bolo, pedido_minimo }));
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.pedido_minimo).toBe(Number(pedido_minimo));
        expect(result.data.unidade_venda).toBe("kg");
      }
    }
  });

  it("bloqueia uma categoria fora da lista permitida", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, categoria: "Sobremesas" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/categoria/i);
    }
  });

  it("recusa valores parecidos com Adicionais (só o valor exato do banco vale)", () => {
    for (const categoria of ["adicionais", "Adicional", "Velas e Balões", "ADICIONAIS"]) {
      const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, categoria }));
      expect(result.success, categoria).toBe(false);
    }
  });

  it("lê destaque e ativo como desligados quando os checkboxes não vêm marcados no formData", () => {
    const result = parseProdutoForm(buildFormData(CAMPOS_VALIDOS));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.destaque).toBe(false);
      expect(result.data.ativo).toBe(false);
    }
  });

  it("lê destaque e ativo como ligados quando o checkbox vem marcado", () => {
    const formData = buildFormData(CAMPOS_VALIDOS);
    formData.set("destaque", "on");
    formData.set("ativo", "on");
    const result = parseProdutoForm(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.destaque).toBe(true);
      expect(result.data.ativo).toBe(true);
    }
  });

  it("lê o preço no formato decimal simples da máscara de moeda (campo oculto, ponto decimal)", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, preco: "1234.56" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preco).toBe(1234.56);
    }
  });

  it("lê o preço no formato brasileiro com separador de milhar", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, preco: "1.234,56" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preco).toBe(1234.56);
    }
  });

  it("lê o preço no formato brasileiro sem separador de milhar", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, preco: "45,90" }));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.preco).toBe(45.9);
    }
  });

  it("assume tipo 'normal' quando o campo não vem no formData", () => {
    const result = parseProdutoForm(buildFormData(CAMPOS_VALIDOS));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo).toBe("normal");
      expect(result.data.subitens).toEqual([]);
    }
  });

  it("bloqueia um tipo de produto fora da lista permitida", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, tipo: "combo" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/tipo de produto/i);
    }
  });
});

describe("parseProdutoForm — tipo Cento", () => {
  function buildCentoFormData(subitens: string[], overrides: Record<string, string> = {}) {
    const formData = buildFormData({ ...CAMPOS_VALIDOS, ...overrides, tipo: "cento" });
    for (const subitem of subitens) {
      formData.append("subitem_nome", subitem);
    }
    return formData;
  }

  it("aceita um cento com subitens referenciando produtos reais", () => {
    const result = parseProdutoForm(
      buildCentoFormData(["Coxinha de frango", "Risole de carne", "Empada de palmito"])
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo).toBe("cento");
      expect(result.data.subitens).toEqual(["Coxinha de frango", "Risole de carne", "Empada de palmito"]);
    }
  });

  it("bloqueia salvar um cento sem nenhum subitem", () => {
    const result = parseProdutoForm(buildCentoFormData([]));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/pelo menos um subitem/i);
    }
  });

  it("bloqueia um cento que referencia a si mesmo como subitem", () => {
    const result = parseProdutoForm(
      buildCentoFormData(["Coxinha de frango", CAMPOS_VALIDOS.nome])
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/não pode ter a si mesmo/i);
    }
  });

  it("remove subitem duplicado mantendo só uma referência", () => {
    const result = parseProdutoForm(
      buildCentoFormData(["Coxinha de frango", "Coxinha de frango", "Risole de carne"])
    );
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.subitens).toEqual(["Coxinha de frango", "Risole de carne"]);
    }
  });

  it("ignora subitens enviados quando o tipo não é cento", () => {
    const formData = buildFormData(CAMPOS_VALIDOS);
    formData.append("subitem_nome", "Coxinha de frango");
    const result = parseProdutoForm(formData);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.tipo).toBe("normal");
      expect(result.data.subitens).toEqual([]);
    }
  });
});
