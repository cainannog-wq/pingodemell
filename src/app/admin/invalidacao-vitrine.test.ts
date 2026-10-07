import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Cache da vitrine (src/lib/vitrine/cache.ts, PR perf/vitrine-consultas-
// cache): toda ação do admin que muda o que a cliente vê precisa chamar
// invalidarVitrine(), senão o site mostra o dado velho até o prazo vencer.
// Este teste falha se alguma ação listada deixar de invalidar, se a
// invalidação vier antes da gravação, se alguma saída depois da gravação
// sair sem invalidar, ou se aparecer uma ação nova que grava em tabela da
// vitrine sem invalidar.

const raiz = path.resolve(__dirname, "..", "..", "..");
const ARQUIVOS = {
  produtos: "src/app/admin/produtos/actions.ts",
  recheios: "src/app/admin/recheios/actions.ts",
};

// As ações que mudam o que a cliente vê (produto, preço, ativo, destaque,
// categoria, tipo, fotos, capa, composição do Cento, recheios).
const LISTADAS: Record<keyof typeof ARQUIVOS, string[]> = {
  produtos: ["createProduto", "updateProduto", "updateProdutoAtivo", "updateProdutoDestaque", "deleteProduto"],
  recheios: ["createRecheio", "updateRecheio", "updateRecheioAtivo"],
};

// Gravações que mudam a vitrine: tabelas lidas pelo site e as funções que
// gravam sabores do Cento, galeria e capa.
const GRAVACAO =
  /\.from\("(produtos|recheios|produto_cento_itens|produto_fotos)"\)\s*\.(insert|update|delete|upsert)\(|salvarSubitensCento\(|gravarGaleria\(|concluirTrocaDeCapa\(/;

// A linha i grava? A consulta pode estar quebrada em linhas
// (.from("produtos") numa, .update(...) na seguinte): olha a linha junto com
// as duas anteriores, e só conta onde a gravação termina.
function grava(linhas: string[], i: number): boolean {
  if (GRAVACAO.test(linhas[i])) return true;
  if (!/\.(insert|update|delete|upsert)\(/.test(linhas[i])) return false;
  return GRAVACAO.test(linhas.slice(Math.max(0, i - 2), i + 1).join("\n"));
}

function lerArquivo(relativo: string): string {
  return readFileSync(path.join(raiz, relativo), "utf8").replace(/\r\n/g, "\n");
}

// Corpo de cada função exportada: do "export async function nome(" até o
// próximo "export" no começo de linha.
function funcoesExportadas(fonte: string): Map<string, string> {
  const mapa = new Map<string, string>();
  const partes = fonte.split(/\n(?=export )/);
  for (const parte of partes) {
    const m = parte.match(/^export async function (\w+)\(/);
    if (m) mapa.set(m[1], parte);
  }
  return mapa;
}

describe("invalidação do cache da vitrine nas ações do admin (leitura do código)", () => {
  for (const [grupo, arquivo] of Object.entries(ARQUIVOS) as [keyof typeof ARQUIVOS, string][]) {
    const funcoes = funcoesExportadas(lerArquivo(arquivo));

    for (const nome of LISTADAS[grupo]) {
      it(`${nome} chama invalidarVitrine() depois de gravar e antes de cada saída seguinte`, () => {
        const corpo = funcoes.get(nome);
        expect(corpo, `${nome} não encontrada em ${arquivo}`).toBeDefined();
        const linhas = corpo!.split("\n");
        const primeiraGravacao = linhas.findIndex((_, i) => grava(linhas, i));
        expect(primeiraGravacao, `${nome} não grava nada que a regra conheça`).toBeGreaterThan(-1);
        const primeiraInvalidacao = linhas.findIndex((l) => l.includes("invalidarVitrine()"));
        expect(primeiraInvalidacao, `${nome} não chama invalidarVitrine()`).toBeGreaterThan(primeiraGravacao);

        // Cada saída depois da gravação (return com valor ou redirect) tem
        // uma invalidação entre a última gravação anterior e ela. As saídas
        // de erro da própria gravação principal (antes de qualquer coisa
        // gravada) ficam de fora: o bloco "if (error)" logo depois dela.
        let ultimaGravacao = primeiraGravacao;
        let ultimaInvalidacao = -1;
        let dentroDoErroDaGravacao = false;
        linhas.forEach((linha, i) => {
          if (i <= primeiraGravacao) return;
          if (grava(linhas, i)) ultimaGravacao = i;
          if (linha.includes("invalidarVitrine()")) ultimaInvalidacao = i;
          if (/^\s*if \(error\)/.test(linha) && ultimaInvalidacao < primeiraGravacao) dentroDoErroDaGravacao = true;
          if (dentroDoErroDaGravacao && /^\s{2}\}$/.test(linha)) {
            dentroDoErroDaGravacao = false;
            return;
          }
          if (dentroDoErroDaGravacao) return;
          if (/\breturn\b|\bredirect\(/.test(linha)) {
            expect(ultimaInvalidacao, `${nome}: saída sem invalidar na linha "${linha.trim()}"`).toBeGreaterThan(ultimaGravacao);
          }
        });
      });
    }

    it(`${arquivo}: nenhuma ação exportada grava na vitrine sem invalidar`, () => {
      for (const [nome, corpo] of funcoes) {
        if (GRAVACAO.test(corpo)) {
          expect(corpo.includes("invalidarVitrine()"), `${nome} grava na vitrine sem invalidar`).toBe(true);
        }
      }
    });
  }
});

// Comportamento: as ações simples (liga/desliga) invalidam só quando o banco
// confirma a gravação.
const { updateTag, resposta } = vi.hoisted(() => ({
  updateTag: vi.fn(),
  resposta: { error: null as { message: string } | null },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), updateTag }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/supabase/env", () => ({ supabaseUrl: "https://exemplo.supabase.co", supabaseAnonKey: "chave-de-teste" }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/supabase/dal", () => ({ requireAuth: vi.fn(async () => ({ id: "admin" })) }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => {
      const b = {
        update: () => b,
        eq: async () => resposta,
      };
      return b;
    },
  })),
}));

describe("invalidação do cache da vitrine nas ações do admin (execução)", () => {
  beforeEach(() => {
    updateTag.mockClear();
    resposta.error = null;
  });

  it("ligar ou desligar produto e destaque invalida a etiqueta 'vitrine'", async () => {
    const { updateProdutoAtivo, updateProdutoDestaque } = await import("./produtos/actions");
    await updateProdutoAtivo("Beijinho", false);
    await updateProdutoDestaque("Beijinho", true);
    expect(updateTag).toHaveBeenCalledTimes(2);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("ligar ou desligar recheio invalida a etiqueta 'vitrine'", async () => {
    const { updateRecheioAtivo } = await import("./recheios/actions");
    await updateRecheioAtivo("3f1c9a52-0000-4000-8000-000000000001", false);
    expect(updateTag).toHaveBeenCalledWith("vitrine");
  });

  it("gravação recusada pelo banco não invalida (nada mudou)", async () => {
    resposta.error = { message: "recusado" };
    const { updateProdutoAtivo } = await import("./produtos/actions");
    expect(await updateProdutoAtivo("Beijinho", false)).toEqual({ error: expect.any(String) });
    expect(updateTag).not.toHaveBeenCalled();
  });
});
