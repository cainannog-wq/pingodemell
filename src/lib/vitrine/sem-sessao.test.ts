import { beforeEach, describe, expect, it, vi } from "vitest";
import { clienteSimulado, novoBanco, type BancoSimulado } from "@/test/banco-simulado";
import type { ProdutoVitrine } from "./mais-pedidos";

// Conteúdo de admin nunca entra no cache público (PR perf/vitrine-consultas-
// cache). O cache da vitrine é um só para todo mundo; se a leitura usasse a
// sessão do admin logado, produto inativo, sabor inativo ou recheio inativo
// que só o admin enxerga poderiam ser guardados e servidos ao público.
//
// Aqui o cache é simulado de verdade (guarda por chave e argumentos), o
// cliente COM sessão é o de um admin logado que enxerga tudo, e o cliente
// SEM sessão é o anônimo. Com e sem cookie de sessão de admin na
// requisição, a vitrine só pode ler pelo cliente sem sessão, e nada de
// inativo pode estar entre o que foi guardado.

const guardado = new Map<string, unknown>();
vi.mock("next/cache", () => ({
  unstable_cache: (leitura: (...a: unknown[]) => Promise<unknown>, chave: string[]) =>
    async (...args: unknown[]) => {
      const k = JSON.stringify([chave, args]);
      if (!guardado.has(k)) guardado.set(k, await leitura(...args));
      return guardado.get(k);
    },
  updateTag: vi.fn(),
}));

const { cookieDeAdmin, cookies, clienteComSessao } = vi.hoisted(() => ({
  cookieDeAdmin: { presente: false },
  cookies: vi.fn(),
  clienteComSessao: vi.fn(),
}));
vi.mock("next/headers", () => ({ cookies }));
vi.mock("@/lib/supabase/server", () => ({ createClient: clienteComSessao }));

let anonimo: BancoSimulado;
let admin: BancoSimulado;
vi.mock("@/lib/supabase/publico", () => ({ createPublicClient: vi.fn(() => clienteSimulado(anonimo)) }));

let seq = 0;
function produto(parcial: Partial<ProdutoVitrine>): ProdutoVitrine {
  seq += 1;
  return {
    id: `id-${seq}`,
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
    destaque: true,
    atualizado_em: "2026-09-23T14:29:18.070Z",
    ...parcial,
  };
}

const ATIVO = produto({ nome: "Brigadeiro", slug: "brigadeiro" });
const INATIVO = produto({ nome: "Torta Só do Admin", slug: "torta-so-do-admin", ativo: false });
const CENTO = produto({ nome: "Cento Misto", slug: "cento-misto", tipo: "cento" });
const TABELAS = {
  produtos: [ATIVO, INATIVO, CENTO],
  produto_cento_itens: [
    { cento_nome: "Cento Misto", subitem_nome: "Brigadeiro", ordem: 0 },
    { cento_nome: "Cento Misto", subitem_nome: "Torta Só do Admin", ordem: 1 },
  ],
  produto_fotos: [{ produto_id: INATIVO.id, caminho: "galeria/inativo/a.webp", posicao: 1 }],
  recheios: [],
};

beforeEach(() => {
  guardado.clear();
  cookies.mockReset();
  clienteComSessao.mockReset();
  anonimo = novoBanco(TABELAS, "anon");
  admin = novoBanco(TABELAS, "admin");
  // Se a vitrine pedisse os cookies ou o cliente com sessão, receberia a
  // sessão do admin (quando o cookie existe), que enxerga tudo.
  cookies.mockImplementation(async () => ({
    getAll: () => (cookieDeAdmin.presente ? [{ name: "sb-npervqefspmwmrekskcb-auth-token", value: "sessao-do-admin" }] : []),
  }));
  clienteComSessao.mockImplementation(async () => clienteSimulado(cookieDeAdmin.presente ? admin : anonimo));
});

for (const comCookie of [true, false]) {
  describe(`${comCookie ? "com" : "sem"} cookie de sessão de admin na requisição`, () => {
    beforeEach(() => {
      cookieDeAdmin.presente = comCookie;
    });

    it("Home, Lista e interna leem só pelo cliente sem sessão, e nada de inativo é guardado", async () => {
      const { buscarInterna, buscarLista, buscarMaisPedidos } = await import("./buscar");
      const home = await buscarMaisPedidos();
      const lista = await buscarLista(null);
      const interna = await buscarInterna("torta-so-do-admin");
      const cento = await buscarInterna("cento-misto");

      expect(cookies).not.toHaveBeenCalled();
      expect(clienteComSessao).not.toHaveBeenCalled();

      expect(home.map((p) => p.nome)).not.toContain(INATIVO.nome);
      expect(lista!.map((i) => i.produto.nome)).not.toContain(INATIVO.nome);
      expect(interna).toEqual({ estado: "nao-encontrado" });
      expect(cento.estado === "ok" && cento.sabores).toEqual(["Brigadeiro"]);

      // O que só a sessão do admin enxerga: o produto inativo (por slug ou na
      // lista), a foto dele e o sabor inativo com "ativo": false. A linha
      // de sabor em si é pública (o nome do sabor aparece com o produto
      // embutido vazio, como para qualquer anônimo).
      const tudoGuardado = JSON.stringify([...guardado.values()]);
      expect(guardado.size).toBeGreaterThan(0);
      expect(tudoGuardado).not.toContain(`"slug":"${INATIVO.slug}"`);
      expect(tudoGuardado).not.toContain("galeria/inativo");
      expect(tudoGuardado).not.toContain('"ativo":false');
    });
  });
}
