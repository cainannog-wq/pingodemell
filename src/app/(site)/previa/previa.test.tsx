import { beforeEach, describe, expect, it, vi } from "vitest";

// Prévia do admin do kit inativo (/previa/{slug}): só com sessão, só kit, sem
// cache e com o botão de adicionar desligado. A prova de que a PRODUÇÃO não
// lista nem abre o kit inativo é de outro tipo (requisição à produção, ver o
// PR) e do banco (scripts/banco/kit-pessoa.mjs: o anônimo não lê kit inativo).

const { requireAuth, notFound, buscarInternaPrevia, createClient } = vi.hoisted(() => ({
  requireAuth: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
  buscarInternaPrevia: vi.fn(),
  createClient: vi.fn(async () => ({ sessao: true })),
}));

vi.mock("@/lib/supabase/dal", () => ({ requireAuth }));
vi.mock("@/lib/supabase/server", () => ({ createClient }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("@/lib/vitrine/buscar", () => ({ buscarInternaPrevia }));
vi.mock("../produtos/[slug]/_interna/CorpoDaInterna", () => ({ CorpoDaInterna: () => null }));

const { default: Pagina, dynamic, metadata } = await import("./[slug]/page");

const interna = { estado: "ok", produto: { ativo: false, nome: "Kit" } };
const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

beforeEach(() => {
  requireAuth.mockReset();
  buscarInternaPrevia.mockReset();
  notFound.mockClear();
});

describe("prévia do kit", () => {
  it("sem sessão: o login a barra e nada é lido", async () => {
    requireAuth.mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(Pagina(params("kit-festa-basico"))).rejects.toThrow("REDIRECT:/login");
    expect(buscarInternaPrevia).not.toHaveBeenCalled();
    expect(createClient).not.toHaveBeenCalled();
  });

  it("outro tipo, inexistente ou fora do formato: 404", async () => {
    requireAuth.mockResolvedValue({ id: "admin" });
    buscarInternaPrevia.mockResolvedValue({ estado: "nao-encontrado" });
    await expect(Pagina(params("bolo-tradicional"))).rejects.toThrow("NOT_FOUND");
  });

  it("falha do banco lança erro (nada é guardado em cache)", async () => {
    requireAuth.mockResolvedValue({ id: "admin" });
    buscarInternaPrevia.mockResolvedValue({ estado: "erro" });
    await expect(Pagina(params("kit"))).rejects.toThrow(/Falha/);
  });

  it("com sessão: lê com o cliente da sessão e monta a interna em modo prévia", async () => {
    requireAuth.mockResolvedValue({ id: "admin" });
    buscarInternaPrevia.mockResolvedValue({ estado: "ok", interna, kitCompleto: true });
    const elemento = (await Pagina(params("kit"))) as { props: { children: { props: Record<string, unknown> }[] } };
    expect(buscarInternaPrevia).toHaveBeenCalledWith("kit", { sessao: true });
    const corpo = elemento.props.children[1].props;
    expect(corpo.previa).toBe(true);
    expect(corpo.avisoDaPrevia).toBeNull();
    expect(corpo.maisPedidos).toEqual([]);
  });

  it("kit sem tamanho completo: aviso no lugar da configuração", async () => {
    requireAuth.mockResolvedValue({ id: "admin" });
    buscarInternaPrevia.mockResolvedValue({ estado: "ok", interna, kitCompleto: false });
    const elemento = (await Pagina(params("kit"))) as { props: { children: { props: Record<string, unknown> }[] } };
    expect(String(elemento.props.children[1].props.avisoDaPrevia)).toMatch(/nenhum tamanho completo/);
  });

  it("nunca em cache e nunca indexável", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(metadata.robots).toEqual({ index: false, follow: false });
  });
});
