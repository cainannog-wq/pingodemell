// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import ts from "typescript";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { Hero } from "@/app/(site)/_home/Hero";
import { CarrinhoVazio } from "@/app/(site)/carrinho/_carrinho/CarrinhoVazio";
import { CheckoutFalha } from "@/app/(site)/checkout/_checkout/CheckoutFalha";
import { PainelEnvio } from "@/app/(site)/checkout/_checkout/PainelEnvio";
import { PoliticaDePrivacidade } from "@/app/(site)/politica-de-privacidade/politica";
import { QuemSomos } from "@/app/(site)/quem-somos/_quem-somos/QuemSomos";
import { SiteChrome } from "@/components/site/SiteChrome";
import { mensagemSemRegistro } from "@/lib/pedidos/confirmacao";
import { DADOS_TESTE, LINHAS_TESTE } from "@/lib/pedidos/fixtura-teste";
import { ORIGENS_WHATSAPP, atributosWhatsApp } from "./whatsapp";

// Todo link wa.me do site público passa por atributosWhatsApp (PR 2 da
// Fase 4), que exige a origem de uma lista fechada: é ela, e só ela, que
// vai no evento whatsapp_clique do GA4. Duas provas:
// - varredura do código (fora do admin e dos testes): nenhum "wa.me"
//   escrito fora de lib/site/whatsapp.ts (e do link do painel, em
//   lib/pedidos/format.ts, que só o admin usa), nenhum href de WhatsApp sem
//   o auxiliar, e cada ponto conhecido com a sua origem;
// - montagem das telas: todo <a href="https://wa.me/..."> tem uma origem
//   válida.
// A confirmação com e sem retrato está em confirmacao-ga4.test.tsx.

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} src={props.src as string} />;
  },
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

const RAIZ = path.join(process.cwd(), "src");
function arquivosDoSite(): string[] {
  const lista: string[] = [];
  const andar = (dir: string) => {
    for (const nome of readdirSync(dir)) {
      const p = path.join(dir, nome);
      if (statSync(p).isDirectory()) andar(p);
      else if (/\.(ts|tsx)$/.test(nome) && !/\.test\.(ts|tsx)$/.test(nome)) lista.push(p);
    }
  };
  andar(RAIZ);
  return lista
    .map((p) => path.relative(RAIZ, p).split(path.sep).join("/"))
    .filter((rel) => !rel.startsWith("app/admin/") && !rel.startsWith("lib/admin/") && !rel.startsWith("components/admin/"));
}

function fonteDe(rel: string, texto: string): ts.SourceFile {
  return ts.createSourceFile(rel, texto, ts.ScriptTarget.Latest, true, rel.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
}
function ler(rel: string): ts.SourceFile {
  return fonteDe(rel, readFileSync(path.join(RAIZ, rel), "utf8"));
}

function visitar(no: ts.Node, fn: (n: ts.Node) => void) {
  fn(no);
  no.forEachChild((filho) => visitar(filho, fn));
}

const ARQUIVOS = arquivosDoSite();
const PARECE_WHATSAPP = /wa\.me|whats|LINK_WHATSAPP|linkWhatsApp|\burl\b/i;

function temWaMe(fonte: ts.SourceFile): boolean {
  let achou = false;
  visitar(fonte, (n) => {
    if (
      (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) &&
      n.text.includes("wa.me")
    )
      achou = true;
  });
  return achou;
}

function hrefsDeWhatsApp(fonte: ts.SourceFile): string[] {
  const achados: string[] = [];
  visitar(fonte, (n) => {
    if (ts.isJsxAttribute(n) && n.name.getText(fonte) === "href" && n.initializer) {
      const valor = n.initializer.getText(fonte);
      if (PARECE_WHATSAPP.test(valor)) achados.push(`${fonte.fileName}: href=${valor}`);
    }
  });
  return achados;
}

describe("varredura do código: links wa.me só pelo auxiliar", () => {
  it('"wa.me" só aparece em lib/site/whatsapp.ts e no link do painel (lib/pedidos/format.ts)', () => {
    const com = ARQUIVOS.filter((rel) => temWaMe(ler(rel))).sort();
    expect(com).toEqual(["lib/pedidos/format.ts", "lib/site/whatsapp.ts"]);
  });

  it("o link do painel (buildWhatsAppLink) só é usado fora do site público", () => {
    const usam = ARQUIVOS.filter((rel) => rel !== "lib/pedidos/format.ts" && readFileSync(path.join(RAIZ, rel), "utf8").includes("buildWhatsAppLink"));
    expect(usam).toEqual([]);
  });

  it("nenhum href de WhatsApp escrito direto num elemento: só pelo espalhamento de atributosWhatsApp", () => {
    const diretos = ARQUIVOS.filter((r) => r.endsWith(".tsx")).flatMap((rel) => hrefsDeWhatsApp(ler(rel)));
    expect(diretos).toEqual([]);
  });

  it("controle positivo: os detectores acusam href direto e wa.me escrito à mão", () => {
    const direto = fonteDe("x.tsx", 'const a = <a href={LINK_WHATSAPP_CONTATO} target="_blank">x</a>; const b = <a href={mensagem.url}>y</a>;');
    expect(hrefsDeWhatsApp(direto)).toHaveLength(2);
    const aMao = fonteDe("y.tsx", 'const u = `https://wa.me/${n}`; const c = <a {...atributosWhatsApp("home", u)}>z</a>;');
    expect(temWaMe(aMao)).toBe(true);
    expect(hrefsDeWhatsApp(aMao)).toEqual([]);
  });

  it("cada ponto conhecido usa o auxiliar com a sua origem, e só origens da lista", () => {
    const usos: string[] = [];
    for (const rel of ARQUIVOS) {
      const fonte = ler(rel);
      visitar(fonte, (n) => {
        if (ts.isCallExpression(n) && n.expression.getText(fonte) === "atributosWhatsApp") {
          const origem = n.arguments[0];
          expect(ts.isStringLiteral(origem), `${rel}: a origem precisa ser texto fixo`).toBe(true);
          usos.push(`${rel} ${(origem as ts.StringLiteral).text}`);
        }
      });
    }
    expect(usos.sort()).toEqual(
      [
        "components/site/SiteChrome.tsx flutuante",
        "components/site/SiteHeader.tsx menu",
        "app/(site)/quem-somos/_quem-somos/QuemSomos.tsx quem_somos",
        "app/(site)/politica-de-privacidade/politica.tsx politica",
        "app/(site)/carrinho/_carrinho/CarrinhoVazio.tsx carrinho_vazio",
        "app/(site)/checkout/_checkout/CheckoutFalha.tsx checkout_falha",
        "app/(site)/confirmacao/_confirmacao/Confirmacao.tsx confirmacao",
        "app/(site)/confirmacao/_confirmacao/Confirmacao.tsx confirmacao_sem_retrato",
        "app/(site)/checkout/_checkout/PainelEnvio.tsx saida_sem_registro",
      ].sort()
    );
    for (const u of usos) expect(ORIGENS_WHATSAPP).toContain(u.split(" ").pop());
  });

  it("o auxiliar recusa origem fora da lista na compilação e devolve só href, nova aba e a origem", () => {
    // @ts-expect-error origem fora da lista não compila
    atributosWhatsApp("rodape", "https://wa.me/5541");
    expect(atributosWhatsApp("home", "https://wa.me/5541")).toEqual({
      href: "https://wa.me/5541",
      target: "_blank",
      rel: "noopener noreferrer",
      "data-whatsapp-origem": "home",
    });
  });
});

describe("montagem das telas: todo link wa.me tem origem válida", () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.close ??= function () {};
    HTMLDialogElement.prototype.showModal ??= function () {};
  });
  afterEach(() => cleanup());

  function origensNaTela(): string[] {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href^="https://wa.me/"]'));
    expect(links.length).toBeGreaterThan(0);
    for (const a of links) expect(ORIGENS_WHATSAPP).toContain(a.getAttribute("data-whatsapp-origem"));
    return links.map((a) => a.getAttribute("data-whatsapp-origem")!).sort();
  }

  it.each([
    ["site (flutuante, menu) com a Quem Somos", () => <SiteChrome><QuemSomos /></SiteChrome>, ["flutuante", "menu", "quem_somos"]],
    ["Política", () => <PoliticaDePrivacidade dataVigencia="2026-10-01" />, ["politica"]],
    ["carrinho vazio", () => <CarrinhoVazio />, ["carrinho_vazio"]],
    ["falha do checkout", () => <CheckoutFalha />, ["checkout_falha"]],
    [
      "saída sem registro",
      () => (
        <PainelEnvio
          estado={{ tipo: "falha", falhas: 2 }}
          mensagemSemRegistro={mensagemSemRegistro(DADOS_TESTE, LINHAS_TESTE.slice(0, 2), "instabilidade")}
          aoTentar={() => {}}
          aoLiberar={() => {}}
          aoAbrirSemRegistro={() => {}}
          avisoSemRegistro={false}
        />
      ),
      ["saida_sem_registro"],
    ],
  ] as const)("%s", (_, tela, esperado) => {
    render(tela());
    expect([...new Set(origensNaTela())]).toEqual([...esperado]);
  });

  // O "Peça pelo WhatsApp" do destaque saiu em 07/10/2026. A origem "home"
  // continua na lista, sem uso (decisão do Cainan).
  it("Home (destaque): sem link wa.me", () => {
    render(<Hero />);
    expect(document.querySelectorAll('a[href^="https://wa.me/"]')).toHaveLength(0);
    expect(ORIGENS_WHATSAPP).toContain("home");
  });
});
