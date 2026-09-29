// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import { existsSync } from "node:fs";
import path from "node:path";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SiteFooter } from "@/components/site/SiteFooter";
import { LOJA, WHATSAPP } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { createClient as clienteDoNavegador } from "@/lib/supabase/client";
import { createClient as clienteDoServidor } from "@/lib/supabase/server";
import PoliticaDePrivacidadePage, { metadata } from "./page";
import { DATA_VIGENCIA_POLITICA, PoliticaDePrivacidade, SECOES_POLITICA, VERSAO_POLITICA } from "./politica";

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
// A página não pode consultar o banco: qualquer chamada fica registrada.
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.doUnmock("@/lib/site/config");
  vi.resetModules();
});

// Texto aprovado pelo Cainan (versão 1, com as trocas das seções 2, 4 e 8),
// copiado literalmente do pedido — de propósito, não do componente. Cada
// entrada é um parágrafo, título ou item de lista, na ordem da página. A
// linha da versão fica de fora (depende da data, testada à parte).
const TEXTO_LITERAL = [
  "Política de Privacidade",
  "Esta política explica como a Pingo de Mell trata os dados pessoais de quem faz um pedido pelo nosso site, de acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).",
  "1. Quem é o responsável",
  "O responsável pelos seus dados é a Yaguiu Eventos e Esporte LTDA, que atua como Pingo de Mell, CNPJ 22.066.065/0001-72, Rua das Acácias, 412, Nações, Fazenda Rio Grande/PR.",
  "Para qualquer assunto sobre seus dados, fale com a gente pelo WhatsApp (41) 98800-2315, no horário de atendimento da loja.",
  "2. Quais dados coletamos",
  "Quando você finaliza um pedido, pedimos: nome, número de WhatsApp, email (opcional), endereço de entrega (só se você escolher entrega), data e horário desejados, ocasião, forma de pagamento escolhida, observações e os itens do pedido, com quantidades e preços.",
  "Não coletamos número de cartão, dados bancários nem CPF. O site não processa pagamento: a forma de pagar é combinada no atendimento.",
  "Também guardamos o seu endereço IP cada vez que o site recebe uma tentativa de enviar pedido, mesmo quando o pedido não é concluído. Ele serve apenas para contar quantos pedidos partem de um mesmo endereço em um curto período e barrar uso abusivo do site.",
  "Enquanto você monta o pedido, o carrinho fica salvo no armazenamento do seu próprio navegador, para não se perder se você fechar a página.",
  "O que você digita no formulário do pedido (nome, WhatsApp, email, endereço, data, horário, ocasião, forma de pagamento e observações) também fica guardado no seu navegador, apenas nesta aba, para não se perder se você voltar ao carrinho. Esses dados somem quando você fecha a aba.",
  "O carrinho e o formulário ficam no seu aparelho e só chegam até nós quando você confirma o pedido.",
  "Fotos de referência para bolos e doces não são enviadas pelo site. Você as manda direto pelo WhatsApp.",
  "3. Para que usamos seus dados",
  "Usamos seus dados somente para receber, confirmar, produzir e entregar o seu pedido, e para falar com você sobre ele por WhatsApp ou email quando for preciso.",
  "Não usamos seus dados para propaganda, não enviamos promoções e não vendemos nem cedemos seus dados a terceiros.",
  "A base legal é a execução do pedido que você pediu para fazer, incluindo os passos anteriores a ele (LGPD, art. 7º, inciso V). Para o endereço IP, a base é o legítimo interesse da loja em proteger o site contra abuso (art. 7º, inciso IX).",
  "Se um dia quisermos usar seus dados para outra finalidade, como enviar promoções, vamos atualizar esta política e pedir o seu consentimento antes.",
  "4. Com quem compartilhamos",
  "Compartilhamos dados apenas com quem é necessário para o site e o pedido funcionarem:",
  "• Supabase, serviço onde os pedidos são guardados. Os servidores ficam em São Paulo.",
  "• Netlify, serviço que hospeda o site. Pode processar dados em servidores fora do Brasil.",
  "• Google (Google Fonts), que fornece a fonte dos ícones do site. Ao abrir uma página, o seu navegador busca essa fonte nos servidores do Google, que recebem o seu endereço IP.",
  "• WhatsApp (Meta), quando você envia a mensagem do pedido. A partir desse envio, a conversa segue as regras do próprio WhatsApp.",
  "• As pessoas da equipe da Pingo de Mell que atendem o seu pedido.",
  "Fora isso, só compartilhamos dados se uma ordem legal exigir.",
  "5. Por quanto tempo guardamos",
  "Os pedidos ficam guardados por 12 meses, contados da data do pedido. Depois disso, o pedido é apagado por inteiro do nosso sistema, com os dados do cliente e os itens. Se uma lei exigir que algum dado seja guardado por mais tempo, guardamos só o que ela exige, pelo tempo que ela exige.",
  "O endereço IP usado para limitar pedidos é guardado por até 30 dias.",
  "A conversa que você tem com a loja no WhatsApp fica no aplicativo, no aparelho da loja, e não é apagada junto com o pedido do sistema. Se você quiser que ela seja apagada, peça pelo contato da seção 1.",
  "6. Seus direitos",
  "Você pode pedir, a qualquer momento:",
  "• confirmar que tratamos seus dados;",
  "• ter acesso a eles;",
  "• corrigir dados incompletos ou errados;",
  "• apagar dados que não precisamos mais guardar;",
  "• receber seus dados em formato que possa levar a outro serviço;",
  "• saber com quem compartilhamos seus dados;",
  "• retirar um consentimento que tenha dado, quando houver.",
  "Faça o pedido pelo WhatsApp indicado na seção 1. Para proteger você, podemos pedir que confirme o nome e o número usados no pedido. Respondemos em até 15 dias.",
  "7. Como protegemos seus dados",
  "O acesso ao painel onde os pedidos aparecem é restrito, com login e senha de uma pessoa autorizada. O banco de dados só aceita gravação de pedidos pelo servidor do site, e a conexão com o site é criptografada (HTTPS).",
  "Nenhum sistema é totalmente imune a falhas. Se acontecer um incidente que possa causar risco relevante a você, avisamos você e a Autoridade Nacional de Proteção de Dados (ANPD), como a lei manda.",
  "8. Cookies e ferramentas de análise",
  "Hoje o site não usa cookies de publicidade nem de análise de audiência. Os únicos dados guardados no seu navegador são o carrinho e o que você digita no formulário do pedido, explicados na seção 2.",
  "Se passarmos a usar ferramentas de análise, vamos atualizar esta política e pedir o seu consentimento antes de ativar essas ferramentas.",
  "9. Mudanças nesta política",
  "A data de vigência fica no topo desta página. Quando houver mudança relevante, ela aparece aqui com a nova data.",
  "10. Reclamações",
  "Se você achar que tratamos seus dados de forma indevida, fale primeiro com a gente pelo contato da seção 1. Você também pode reclamar à ANPD, em gov.br/anpd.",
];

const TITULOS = TEXTO_LITERAL.filter((t) => /^\d+\. /.test(t));

// Texto que aparece na tela: sem o aviso "(abre em nova aba)", que só o
// leitor de tela lê, e com os espaços normalizados.
function textoVisivel(el: Element): string {
  const copia = el.cloneNode(true) as Element;
  copia.querySelectorAll(".site-visually-hidden").forEach((n) => n.remove());
  return (copia.textContent ?? "").replace(/\s+/g, " ").trim();
}

// Blocos do texto na ordem da página: título, parágrafos e itens de lista
// (com "• " na frente), fora a linha da versão e o índice.
function blocosDoTexto(): string[] {
  const artigo = document.querySelector("article.politica")!;
  const blocos: string[] = [];
  for (const el of artigo.querySelectorAll(
    ":scope > header > h1, :scope > header > p:not(.politica-versao), :scope > section > *"
  )) {
    if (el.tagName === "UL") el.querySelectorAll("li").forEach((li) => blocos.push(`• ${textoVisivel(li)}`));
    else blocos.push(textoVisivel(el));
  }
  return blocos;
}

describe("Política de Privacidade — página", () => {
  it("renderiza a rota sem erro, com o texto aprovado palavra por palavra", () => {
    render(<PoliticaDePrivacidadePage />);
    expect(blocosDoTexto()).toEqual(TEXTO_LITERAL);
  });

  it("tem um H1 e dez H2 na ordem do texto, sem saltos de nível", () => {
    render(<PoliticaDePrivacidadePage />);
    const h1 = screen.getAllByRole("heading", { level: 1 });
    expect(h1.map((h) => h.textContent)).toEqual(["Política de Privacidade"]);
    const h2 = screen.getAllByRole("heading", { level: 2 });
    expect(h2.map((h) => h.textContent)).toEqual(TITULOS);
    expect(h2).toHaveLength(10);
    expect(document.querySelectorAll("h3, h4, h5, h6")).toHaveLength(0);
  });

  it("as listas do texto são listas de verdade (ul/li): 5 itens na seção 4 e 7 na seção 6", () => {
    render(<PoliticaDePrivacidadePage />);
    const itens = (id: string) =>
      within(document.getElementById(id)!)
        .getAllByRole("listitem")
        .map((li) => textoVisivel(li));
    expect(itens("compartilhamento")).toHaveLength(5);
    expect(itens("compartilhamento")[2]).toMatch(/^Google \(Google Fonts\)/);
    expect(itens("direitos")).toHaveLength(7);
  });

  it("mantém a frase do formulário (seção 2) e a do Google (seção 4)", () => {
    render(<PoliticaDePrivacidadePage />);
    const texto = textoVisivel(document.body);
    expect(texto).toContain(
      "O que você digita no formulário do pedido (nome, WhatsApp, email, endereço, data, horário, ocasião, forma de pagamento e observações) também fica guardado no seu navegador, apenas nesta aba"
    );
    expect(texto).toContain(
      "Google (Google Fonts), que fornece a fonte dos ícones do site. Ao abrir uma página, o seu navegador busca essa fonte nos servidores do Google, que recebem o seu endereço IP."
    );
    expect(texto).toContain("Os únicos dados guardados no seu navegador são o carrinho e o que você digita no formulário do pedido");
  });

  it("índice 'Nesta página' com os dez links âncora para as seções, com ids estáveis", () => {
    render(<PoliticaDePrivacidadePage />);
    const indice = screen.getByRole("navigation", { name: "Nesta página" });
    const links = within(indice).getAllByRole("link");
    expect(links.map((a) => a.getAttribute("href"))).toEqual([
      "#responsavel",
      "#dados-coletados",
      "#uso-dos-dados",
      "#compartilhamento",
      "#retencao",
      "#direitos",
      "#seguranca",
      "#cookies",
      "#mudancas",
      "#reclamacoes",
    ]);
    expect(links.map((a) => a.textContent)).toEqual(TITULOS);
    for (const { id, titulo } of SECOES_POLITICA) {
      const secao = document.getElementById(id)!;
      expect(secao.tagName).toBe("SECTION");
      expect(within(secao).getByRole("heading", { level: 2 })).toHaveTextContent(titulo);
    }
  });

  it("links externos: WhatsApp pelo wa.me sem mensagem e ANPD pelo gov.br, em nova aba", () => {
    render(<PoliticaDePrivacidadePage />);
    const whatsapp = screen.getByRole("link", { name: /^\(41\) 98800-2315/ });
    expect(whatsapp).toHaveAttribute("href", `https://wa.me/${WHATSAPP.numero}`);
    expect(whatsapp.getAttribute("href")).not.toContain("?");
    const anpd = screen.getByRole("link", { name: /^gov\.br\/anpd/ });
    expect(anpd).toHaveAttribute("href", "https://www.gov.br/anpd");
    for (const link of [whatsapp, anpd]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
  });

  it("título, descrição e noindex mantido nos metadados", () => {
    expect(metadata.title).toBe("Política de Privacidade · Pingo de Mell");
    expect(metadata.description).toBeTruthy();
    expect(metadata.robots).toEqual({ index: false });
  });

  it("não consulta o banco (nem pelo servidor nem pelo navegador)", () => {
    render(<PoliticaDePrivacidadePage />);
    expect(clienteDoServidor).not.toHaveBeenCalled();
    expect(clienteDoNavegador).not.toHaveBeenCalled();
  });
});

describe("Política de Privacidade — versão e data de vigência", () => {
  it("versão 1 e data nula neste PR", () => {
    expect(VERSAO_POLITICA).toBe(1);
    expect(DATA_VIGENCIA_POLITICA).toBeNull();
  });

  it("com a data nula, mostra só 'Versão 1.' e nenhum campo entre chaves", () => {
    const { container } = render(<PoliticaDePrivacidade dataVigencia={null} />);
    expect(container.querySelector(".politica-versao")).toHaveTextContent(/^Versão 1\.$/);
    expect(container.textContent).not.toContain("Vigente");
    expect(container.innerHTML).not.toMatch(/\{\{|\}\}/);
    // A página de verdade usa a constante (nula).
    cleanup();
    render(<PoliticaDePrivacidadePage />);
    expect(document.querySelector(".politica-versao")).toHaveTextContent(/^Versão 1\.$/);
    expect(document.body.innerHTML).not.toMatch(/\{\{|\}\}/);
  });

  it("com uma data de teste, a frase de vigência aparece com essa data", () => {
    const { container } = render(<PoliticaDePrivacidade dataVigencia="2026-10-20" />);
    expect(container.querySelector(".politica-versao")).toHaveTextContent(
      /^Versão 1\. Vigente a partir de 20\/10\/2026\.$/
    );
    expect(container.innerHTML).not.toMatch(/\{\{|\}\}/);
  });

  it("recusa data fora do formato AAAA-MM-DD em vez de mostrar texto errado", () => {
    expect(() => render(<PoliticaDePrivacidade dataVigencia="20/10/2026" />)).toThrow(/AAAA-MM-DD/);
  });
});

describe("Política de Privacidade — mesma fonte do rodapé", () => {
  it("endereço, CNPJ e WhatsApp da política são os de LOJA, os mesmos do rodapé", () => {
    render(
      <>
        <PoliticaDePrivacidadePage />
        <SiteFooter />
      </>
    );
    const responsavel = textoVisivel(document.getElementById("responsavel")!);
    const rodape = textoVisivel(document.querySelector("footer")!);
    for (const valor of [LOJA.endereco, LOJA.cnpj, LOJA.telefone]) {
      expect(responsavel).toContain(valor);
      expect(rodape).toContain(valor);
    }
    // O número do wa.me é o mesmo telefone, só com dígitos e DDI 55.
    expect(WHATSAPP.numero).toBe(`55${LOJA.telefone.replace(/\D/g, "")}`);
  });

  it("os valores saem de LOJA (trocar LOJA muda a política), não estão escritos à mão", async () => {
    vi.resetModules();
    vi.doMock("@/lib/site/config", async (original) => {
      const real = await original<typeof import("@/lib/site/config")>();
      return {
        ...real,
        LOJA: { ...real.LOJA, endereco: "ENDERECO-DE-TESTE", cnpj: "CNPJ-DE-TESTE", telefone: "TELEFONE-DE-TESTE" },
        WHATSAPP: { ...real.WHATSAPP, numero: "5500000000000" },
      };
    });
    const { PoliticaDePrivacidade: ComConfigTrocada } = await import("./politica");
    render(<ComConfigTrocada dataVigencia={null} />);
    const responsavel = textoVisivel(document.getElementById("responsavel")!);
    expect(responsavel).toContain("CNPJ CNPJ-DE-TESTE, ENDERECO-DE-TESTE.");
    expect(responsavel).toContain("pelo WhatsApp TELEFONE-DE-TESTE, no horário");
    expect(screen.getByRole("link", { name: /^TELEFONE-DE-TESTE/ })).toHaveAttribute(
      "href",
      "https://wa.me/5500000000000"
    );
  });
});

describe("Política de Privacidade — links que apontam para ela", () => {
  it("a rota da página é ROTAS.privacidade, e ela existe no app", () => {
    expect(ROTAS.privacidade).toBe("/politica-de-privacidade");
    const arquivo = path.join(process.cwd(), "src", "app", "(site)", ROTAS.privacidade.slice(1), "page.tsx");
    expect(existsSync(arquivo)).toBe(true);
  });

  it("o rodapé linka para a rota da página (o link do checkout é conferido em checkout.test.tsx)", () => {
    render(<SiteFooter />);
    const rodape = screen.getByRole("navigation", { name: "Rodapé" });
    expect(within(rodape).getByRole("link", { name: "Política de privacidade" })).toHaveAttribute(
      "href",
      ROTAS.privacidade
    );
  });
});
