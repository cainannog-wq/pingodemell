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

  it("bloqueia prazo de produção zero ou negativo", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, prazo_producao_dias: "0" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/prazo de produção/i);
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

  it("aceita produto sem categoria selecionada", () => {
    const result = parseProdutoForm(buildFormData(CAMPOS_VALIDOS));
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.categoria).toBeNull();
    }
  });

  it("bloqueia uma categoria fora da lista permitida", () => {
    const result = parseProdutoForm(buildFormData({ ...CAMPOS_VALIDOS, categoria: "Sobremesas" }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toMatch(/categoria/i);
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
});
