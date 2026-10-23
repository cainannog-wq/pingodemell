// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pedido } from "@/lib/pedidos/types";
import { FORMAS_PAGAMENTO } from "@/lib/checkout/formulario";
import { montarMensagem, type DadosMensagem } from "@/lib/pedidos/mensagem";
import { PedidoDetail } from "@/app/admin/pedidos/[numero]/pedido-detail";

// Testes de ataque (auditoria de segurança de 23/10/2026): caminho de ataque,
// não caminho feliz.

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/app/admin/pedidos/actions", () => ({ atualizarStatusPedido: vi.fn() }));

afterEach(cleanup);

const raiz = path.resolve(__dirname, "..", "..", "..");

function arquivos(pasta: string, saida: string[] = []): string[] {
  for (const nome of readdirSync(pasta)) {
    const cheio = path.join(pasta, nome);
    if (statSync(cheio).isDirectory()) arquivos(cheio, saida);
    else saida.push(cheio);
  }
  return saida;
}

describe("Server Actions do admin exigem sessão antes de qualquer outra coisa", () => {
  // login e logout ficam de fora: login é público por natureza e logout só
  // encerra a sessão de quem chama.
  const alvos = arquivos(path.join(raiz, "src", "app", "admin")).filter((f) => /actions\.ts$/.test(f));

  it("encontra os arquivos de actions do admin", () => {
    expect(alvos.length).toBeGreaterThanOrEqual(6);
  });

  for (const arquivo of alvos.filter((f) => !/admin[\\/]actions\.ts$/.test(f))) {
    it(`${path.relative(raiz, arquivo)}: cada função exportada chama requireAuth() antes de ler ou gravar`, () => {
      const texto = readFileSync(arquivo, "utf8");
      const pedacos = texto.split(/^export async function /m).slice(1);
      expect(pedacos.length).toBeGreaterThan(0);
      for (const pedaco of pedacos) {
        const nome = pedaco.slice(0, pedaco.indexOf("("));
        const posAuth = pedaco.indexOf("await requireAuth()");
        expect(posAuth, `${nome} sem requireAuth()`).toBeGreaterThan(-1);
        const antes = pedaco.slice(0, posAuth);
        // Nada de leitura de banco, de formulário ou de outro await antes.
        expect(/await |\.from\(|formData\.get|createClient|createAdminClient/.test(antes), `${nome}: algo roda antes de requireAuth()`).toBe(false);
      }
    });
  }
});

describe("nenhum caminho do código injeta HTML cru", () => {
  it("sem dangerouslySetInnerHTML, innerHTML, outerHTML, insertAdjacentHTML nem document.write fora dos testes", () => {
    const achados = arquivos(path.join(raiz, "src"))
      .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f) && !f.includes(`${path.sep}test${path.sep}`))
      .filter((f) => /dangerouslySetInnerHTML|\.innerHTML|\.outerHTML|insertAdjacentHTML|document\.write/.test(readFileSync(f, "utf8")))
      .map((f) => path.relative(raiz, f));
    expect(achados).toEqual([]);
  });
});

const PAYLOADS = [
  `<img src=x onerror="window.__xss=1">`,
  `<script>window.__xss=1</script>`,
  `"><svg onload=window.__xss=1>`,
  `javascript:window.__xss=1`,
];

function pedidoComPayload(p: string): Pedido {
  return {
    id: "id",
    numero: 1,
    cliente_nome: p,
    cliente_whatsapp: "(41) 99999-0000",
    cliente_email: p,
    ocasiao: p,
    modo_entrega: "entrega",
    endereco: p,
    data_hora_entrega: "2026-10-17T17:00:00.000Z",
    forma_pagamento: p,
    observacoes: p,
    itens: [{ nome: p, variacao: `${p}\n${p}`, quantidade: 1, preco_unitario: 10, observacao: p } as Pedido["itens"][number]],
    subtotal: 10,
    valor_entrega: 0,
    total: 10,
    status: "aguardando_confirmacao",
    criado_em: "2026-09-29T15:00:00.000Z",
    status_atualizado_em: "2026-09-29T15:00:00.000Z",
    teste: false,
  };
}

describe("detalhe do pedido no painel: texto livre da cliente vira texto, nunca elemento", () => {
  for (const p of PAYLOADS) {
    it(`payload ${p.slice(0, 24)}`, () => {
      const { container } = render(<PedidoDetail pedido={pedidoComPayload(p)} />);
      expect(container.querySelector("script, img[src='x'], svg[onload]")).toBeNull();
      // Nenhum elemento ganhou atributo de evento (o texto escapado em si pode conter "onload=").
      const comEvento = Array.from(container.querySelectorAll("*")).filter((el) =>
        Array.from(el.attributes).some((a) => /^on/i.test(a.name))
      );
      expect(comEvento).toEqual([]);
      expect((window as unknown as { __xss?: number }).__xss).toBeUndefined();
      // O texto aparece literal.
      expect(container.textContent).toContain(p.split("\n")[0]);
      // Nenhum link montado com o texto da cliente leva a javascript:.
      for (const a of Array.from(container.querySelectorAll("a"))) {
        expect(a.getAttribute("href") ?? "").not.toMatch(/^\s*javascript:/i);
      }
    });
  }
});

function dadosComPayload(p: string): DadosMensagem {
  return {
    numero: 1048,
    semRegistro: null,
    nome: p,
    whatsapp: "(41) 99999-0000",
    email: p,
    modo: "entrega",
    cidade: p,
    bairro: p,
    rua: p,
    numeroEndereco: "1",
    complemento: p,
    data: "2026-10-17",
    hora: "14:00",
    ocasiao: p,
    pagamento: FORMAS_PAGAMENTO[0].valor,
    observacoes: `${p}\n\n\n&text=outro#fragmento%0A`,
    linhas: [],
    totalCentavos: 1000,
  };
}

describe("mensagem do WhatsApp com texto malicioso da cliente", () => {
  for (const p of [...PAYLOADS, "https://phishing.example/x &phone=5541000000000 #a ?b=c"]) {
    it(`a URL carrega o texto codificado e não deixa a cliente injetar parâmetro (${p.slice(0, 20)})`, () => {
      const m = montarMensagem(dadosComPayload(p));
      const url = new URL(m.url);
      expect(url.hostname).toBe("wa.me");
      // Só o parâmetro text; nada que a cliente digitou virou outro parâmetro.
      expect([...url.searchParams.keys()]).toEqual(["text"]);
      expect(url.hash).toBe("");
      expect(url.searchParams.get("text")).toBe(m.texto);
      // Sem caractere cru perigoso na URL.
      expect(m.url).not.toMatch(/[<>"\s]/);
      // Número de destino não muda.
      expect(url.pathname).toMatch(/^\/\d+$/);
    });
  }
});
