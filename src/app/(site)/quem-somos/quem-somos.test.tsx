// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { SiteChrome } from "@/components/site/SiteChrome";
import { LOJA, urlInstagram } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { LINK_WHATSAPP_SEM_MENSAGEM } from "@/lib/site/whatsapp";
import QuemSomosPage, { metadata } from "./page";
import { FRASE_TOPO } from "./_quem-somos/QuemSomos";

vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element
    return <img alt={props.alt as string} src={props.src as string} className={props.className as string} />;
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
  usePathname: () => "/quem-somos",
}));

beforeAll(() => {
  // O jsdom não implementa <dialog> (menu do cabeçalho).
  HTMLDialogElement.prototype.close ??= function () {};
  HTMLDialogElement.prototype.showModal ??= function () {};
});
afterEach(cleanup);

function montar() {
  render(
    <SiteChrome>
      <QuemSomosPage />
    </SiteChrome>
  );
  return screen.getByRole("main");
}

// Hífen, hífen não separável, hífen tipográfico, sinal de menos, travessão
// meia risca e travessão.
const HIFENS = /[-‐‑−–—]/;

// Valores de LOJA que têm hífen e podem aparecer na página: saem antes da
// checagem (são dados, não texto da página). O CNPJ só aparece no rodapé,
// fora do main.
const VALORES_LOJA_COM_HIFEN = Object.values(LOJA).filter((v) => HIFENS.test(v));

function semValoresDaLoja(texto: string): string {
  return VALORES_LOJA_COM_HIFEN.reduce((t, v) => t.split(v).join(""), texto);
}

// Todo texto que alguém lê ou ouve dentro do main: texto (as duas versões,
// desktop e mobile, porque o jsdom não aplica o CSS que esconde uma delas),
// texto alternativo, aria-label e title.
function textosDoMain(main: HTMLElement): string[] {
  const atributos = [...main.querySelectorAll("[alt], [aria-label], [title]")].flatMap((el) =>
    ["alt", "aria-label", "title"].map((a) => el.getAttribute(a) ?? "")
  );
  return [main.textContent ?? "", ...atributos];
}

describe("Quem Somos", () => {
  it("tem um H1 e títulos em ordem (H1, H2 e os cartões em H3)", () => {
    const main = montar();
    const h1 = within(main).getAllByRole("heading", { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent("Somos a Pingo de Mell");
    const niveis = [...main.querySelectorAll("h1, h2, h3, h4, h5, h6")].map((h) => Number(h.tagName[1]));
    niveis.forEach((n, i) => {
      if (i > 0) expect(n - niveis[i - 1]).toBeLessThanOrEqual(1);
    });
    expect(within(main).getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual([
      "Desde 2009, um pedido por vez",
      "O que a gente cuida em cada pedido",
      "Venha nos visitar",
    ]);
  });

  it("metadados: título no padrão das páginas públicas e a frase do topo como descrição, sem hífen", () => {
    expect(metadata.title).toBe("Quem Somos · Pingo de Mell");
    expect(metadata.description).toBe(FRASE_TOPO);
    expect(metadata.description).toBe(
      "Uma confeitaria de família em Fazenda Rio Grande, feita de encomendas, festas e gente que volta."
    );
    expect(HIFENS.test(`${metadata.title} ${metadata.description}`)).toBe(false);
  });

  it("dados de contato renderizados são os de LOJA", () => {
    const main = montar();
    const contato = main.querySelector("#contato") as HTMLElement;
    expect(contato).not.toBeNull();
    const itens = [...contato.querySelectorAll(".qs-contato-lista > li")].map((li) => li.textContent);
    expect(itens[0]).toBe(`location_on${LOJA.enderecoCurto}${LOJA.cidade}`);
    // Desktop: dia fechado em outra linha; mobile: na mesma, depois de " · ".
    expect(itens[1]).toBe(`schedule${LOJA.horario}${LOJA.diaFechado} · ${LOJA.diaFechado}`);
    const whatsapp = within(contato).getByRole("link", { name: /WhatsApp/ });
    expect(whatsapp).toHaveAccessibleName(`WhatsApp ${LOJA.telefone} (abre em nova aba)`);
    expect(whatsapp).toHaveAttribute("href", LINK_WHATSAPP_SEM_MENSAGEM);
    expect(within(contato).getByRole("link", { name: /Google Maps/ })).toHaveAttribute("href", LOJA.mapsUrl);
    expect(within(contato).getByRole("link", { name: /Instagram/ })).toHaveAttribute("href", urlInstagram());
  });

  it("o WhatsApp abre sem mensagem preenchida", () => {
    const main = montar();
    const href = within(main).getByRole("link", { name: /WhatsApp/ }).getAttribute("href") ?? "";
    expect(new URL(href).search).toBe("");
    expect(href).toBe(`https://wa.me/55${LOJA.telefone.replace(/\D/g, "")}`);
  });

  it("todo link externo abre em nova aba com noopener noreferrer e avisa isso", () => {
    const main = montar();
    const externos = [...main.querySelectorAll("a")].filter((a) => /^https?:/.test(a.getAttribute("href") ?? ""));
    expect(externos.map((a) => a.getAttribute("href"))).toEqual([LINK_WHATSAPP_SEM_MENSAGEM, LOJA.mapsUrl, urlInstagram()]);
    for (const a of externos) {
      expect(a).toHaveAttribute("target", "_blank");
      expect(a).toHaveAttribute("rel", "noopener noreferrer");
      expect(a.textContent).toContain("(abre em nova aba)");
    }
    expect(within(main).getByRole("link", { name: "Abrir no Google Maps (abre em nova aba)" })).toHaveAttribute(
      "href",
      LOJA.mapsUrl
    );
  });

  it("sem iframe, sem script e sem imagem de fora; o mapa é ilustração fora do leitor de tela e do foco", () => {
    const main = montar();
    expect(main.querySelectorAll("iframe, script, object, embed")).toHaveLength(0);
    for (const img of main.querySelectorAll("img")) expect(img.getAttribute("src")).toMatch(/^\/(fotos|icons)\//);
    const mapa = main.querySelector(".qs-mapa") as HTMLElement;
    expect(mapa).toHaveAttribute("aria-hidden", "true");
    expect(mapa.querySelectorAll("a, button, [tabindex]")).toHaveLength(0);
    expect(mapa.querySelector("svg")).toHaveAttribute("focusable", "false");
    // Nenhum texto dentro do SVG (sem nome de rua nem endereço).
    expect(mapa.querySelectorAll("text")).toHaveLength(0);
    expect(mapa.textContent).toBe("");
    // Só um link para o Google Maps.
    expect(main.querySelectorAll(`a[href="${LOJA.mapsUrl}"]`)).toHaveLength(1);
  });

  it("nenhum hífen nem travessão no main (texto, alt, aria-label e title), fora os valores de LOJA", () => {
    const main = montar();
    console.log("[quem-somos] valores de LOJA com hífen, fora da checagem:", VALORES_LOJA_COM_HIFEN);
    expect(VALORES_LOJA_COM_HIFEN).toEqual([LOJA.telefone, LOJA.cnpj]);
    for (const texto of textosDoMain(main)) {
      const limpo = semValoresDaLoja(texto);
      expect(limpo.match(HIFENS)?.[0] ?? null, limpo).toBeNull();
    }
    // A checagem pega mesmo cada caractere.
    for (const c of ["-", "‐", "‑", "−", "–", "—"]) expect(HIFENS.test(`a${c}b`)).toBe(true);
  });

  it("as duas versões do handoff (desktop e mobile) estão na página e a inativa some com display:none", () => {
    const main = montar();
    const desktop = [...main.querySelectorAll(".site-so-desktop")].map((el) => el.textContent).join(" ");
    const mobile = [...main.querySelectorAll(".site-so-mobile")].map((el) => el.textContent).join(" ");
    expect(desktop).toContain("e uma bancada pequena. De lá para cá crescemos com o bairro");
    expect(desktop).toContain("do jeito que a gente serviria em casa.");
    expect(desktop).toContain("Seguir no Instagram");
    expect(mobile).toContain("Hoje atendemos Fazenda Rio Grande com bolos, salgados, doces tradicionais, personalizados e finos. O cuidado é o que não mudou.");
    expect(mobile).toContain("Tema, cores e idade: cada festa tem uma história.");
    expect(mobile).toContain("Prazos combinados e cumpridos, com conferência item por item.");
    const css = readFileSync(path.join(process.cwd(), "src/components/site/site.css"), "utf8");
    expect(css).toMatch(/@media \(min-width: 768px\) \{\s*\.pdm-site \.site-so-mobile \{\s*display: none !important;/);
    expect(css).toMatch(/@media \(max-width: 767px\) \{\s*\.pdm-site \.site-so-desktop \{\s*display: none !important;/);
  });

  it("foto da Taami com o texto alternativo do handoff; ícones decorativos fora do leitor de tela", () => {
    const main = montar();
    expect(within(main).getByAltText("Taami Yaguiu na loja da Pingo de Mell")).toHaveAttribute("src", "/fotos/taami-yaguiu.jpeg");
    expect(main.querySelector(".qs-botao-instagram")).toHaveAttribute("alt", "");
    for (const icone of main.querySelectorAll(".material-symbols-rounded")) {
      expect(icone.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it("menu, menu mobile e rodapé levam à página; só Sobre nós é a página atual", () => {
    montar();
    for (const nome of ["Principal", "Principal (menu)", "Rodapé"]) {
      const nav = screen.getByRole("navigation", { name: nome, hidden: true });
      const sobre = within(nav).getByRole("link", { name: /Sobre nós/, hidden: true });
      const contato = within(nav).getByRole("link", { name: /Contato/, hidden: true });
      expect(sobre).toHaveAttribute("href", ROTAS.quemSomos);
      expect(contato).toHaveAttribute("href", ROTAS.contato);
      expect(contato).not.toHaveAttribute("aria-current");
      if (nome !== "Rodapé") expect(sobre).toHaveAttribute("aria-current", "page");
    }
    expect(ROTAS.quemSomos).toBe("/quem-somos");
    expect(ROTAS.contato).toBe("/quem-somos#contato");
    expect(screen.getByRole("main").querySelector("#contato")).not.toBeNull();
  });
});
