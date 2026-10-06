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

// Texto aprovado pelo Cainan (versão 2, redação formal, PR 5 da Fase 4),
// copiado literalmente do pedido — de propósito, não do componente. Cada
// entrada é um parágrafo, título ou item de lista, na ordem da página; a
// numeração interna (2.1, 2.2...) é texto do parágrafo. A linha da versão
// fica de fora (depende da data, testada à parte). O email de atendimento
// ao titular sai de LOJA (nunca escrito à mão fora de config.ts).
const TEXTO_LITERAL = [
  "Política de Privacidade",
  'A presente Política de Privacidade ("Política") estabelece as condições em que a Pingo de Mell realiza o tratamento de dados pessoais das pessoas que visitam este sítio eletrônico e dos usuários que efetuam pedidos por meio dele ("Titular"), em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais, "LGPD").',
  "1. Identificação do Controlador",
  "O Controlador dos dados pessoais é a Yaguiu Eventos e Esporte LTDA, que atua sob o nome Pingo de Mell, inscrita no CNPJ sob o nº 22.066.065/0001-72, estabelecida na Rua das Acácias, 412, Nações, Fazenda Rio Grande/PR.",
  `Os canais de atendimento ao Titular, para o exercício de direitos e para quaisquer questões relativas ao tratamento de dados pessoais, são o WhatsApp (41) 98800-2315, durante o horário de atendimento da loja, e o correio eletrônico ${LOJA.emailPrivacidade}.`,
  "2. Dados Pessoais Tratados",
  "2.1. No momento da finalização do pedido, são solicitados os seguintes dados: nome, número de WhatsApp, endereço de correio eletrônico (campo facultativo), endereço de entrega (somente quando escolhida a modalidade de entrega), data e horário desejados, ocasião, forma de pagamento escolhida, observações e itens do pedido, com as respectivas quantidades e preços.",
  "2.2. No campo de observações, o Titular poderá informar, por sua iniciativa, dados necessários à produção do pedido, como alergias ou restrições alimentares, que podem constituir dados pessoais sensíveis referentes à saúde. Tais informações são utilizadas exclusivamente para a preparação do pedido com segurança. O Titular não é obrigado a informar esses dados por meio do sítio eletrônico e poderá ajustar esses dados diretamente com a equipe, pelo WhatsApp.",
  "2.3. Não são coletados números de cartão, dados bancários nem CPF. O sítio eletrônico não realiza processamento de pagamentos, sendo a forma de pagamento ajustada no atendimento.",
  "2.4. É registrado o endereço IP do Titular a cada envio de pedido, com dados válidos, recebido pelo sítio eletrônico, ainda que o pedido não seja concluído. Tal registro tem a finalidade exclusiva de contabilizar os pedidos originados de um mesmo endereço em curto período e de prevenir o uso abusivo do sítio eletrônico.",
  "2.5. Durante a montagem do pedido, o carrinho é mantido no armazenamento do navegador do Titular, a fim de evitar sua perda caso a página seja fechada. Os dados digitados no formulário do pedido (nome, WhatsApp, email, endereço, modalidade de atendimento, data, horário, ocasião, forma de pagamento, observações e a marcação de ciência desta Política) também são mantidos no navegador, apenas na aba em uso, a fim de evitar sua perda caso o Titular retorne ao carrinho, e são eliminados quando a aba é fechada. Concluído o envio do pedido, o navegador mantém, igualmente apenas na aba em uso, um resumo do pedido enviado (número do pedido, itens, valores e o texto da mensagem a ser encaminhada pelo WhatsApp), a fim de permitir ao Titular rever a confirmação e enviar a mensagem, acompanhado de marcas técnicas que registram se a exibição da confirmação e o envio já foram contabilizados pela ferramenta de análise descrita na seção 8, sendo esse resumo eliminado quando a aba é fechada. O navegador mantém ainda, na aba em uso, um código aleatório destinado a evitar o registro em duplicidade do mesmo pedido e a contagem em duplicidade de eventos de análise. O carrinho e o formulário permanecem no dispositivo do Titular e somente são transmitidos ao Controlador com a confirmação do pedido, ressalvado o disposto na seção 2.7.",
  "2.6. Fotografias de referência para bolos e doces não são enviadas por meio do sítio eletrônico, devendo ser encaminhadas pelo Titular diretamente pelo WhatsApp.",
  "2.7. Quando o Titular consente com o uso da ferramenta de análise descrita na seção 8, o navegador envia ao Google Analytics: (a) o endereço e o título de cada página visitada, sem parâmetros, exceto o filtro de categoria da lista de produtos, e o endereço da página anterior, limitado ao domínio quando se tratar de outro sítio eletrônico, de modo que, nas páginas de produto, o endereço contém o identificador do produto e o título da página pode conter o nome do produto; (b) o nome e o identificador do produto adicionado ao carrinho; e (c) a ocorrência dos eventos de início do pedido, de exibição da confirmação, de envio do pedido e de clique nos botões de WhatsApp, estes com a indicação da área do sítio eletrônico em que o botão se encontra. Não são enviados nome, WhatsApp, email, endereço, observações, número do pedido nem valores. Independentemente do que o Controlador envia, o Google Analytics coleta por conta própria um identificador do navegador, gravado em cookie, o endereço IP, a partir do qual o Google deduz cidade, região e país e descarta o endereço completo, e dados do navegador, do idioma, do aparelho e da tela do Titular.",
  "3. Finalidades e Bases Legais",
  "3.1. Os dados pessoais fornecidos no pedido são tratados exclusivamente para receber, confirmar, produzir e entregar o pedido, bem como para contatar o Titular por WhatsApp ou email quando necessário ao atendimento.",
  "3.2. Os dados de navegação descritos na seção 2.7 são tratados, somente com o consentimento do Titular, para medir de forma estatística o uso do sítio eletrônico, como as páginas mais visitadas e a quantidade de pedidos iniciados e enviados, a fim de melhorar o conteúdo e o funcionamento do sítio.",
  "3.3. Os dados pessoais não são utilizados para fins publicitários, não há envio de comunicações promocionais, e os dados não são vendidos nem cedidos a terceiros para fins publicitários. O Controlador não ativa os recursos de publicidade nem de personalização de anúncios da ferramenta de análise, e os dados do pedido não são enviados a ela.",
  "3.4. A base legal do tratamento dos dados do pedido é a execução de contrato, ou de procedimentos preliminares relacionados a contrato do qual seja parte o Titular, a pedido do próprio Titular (art. 7º, inciso V, da LGPD). Quanto ao endereço IP registrado no pedido, a base legal é o legítimo interesse do Controlador na segurança do sítio eletrônico e na prevenção de abusos (art. 7º, inciso IX, da LGPD). Quanto aos dados de navegação descritos na seção 2.7, a base legal é o consentimento do Titular (art. 7º, inciso I, da LGPD), que pode ser revogado a qualquer tempo na forma da seção 8.",
  "3.5. A utilização dos dados para finalidade diversa, como o envio de comunicações promocionais, dependerá de prévia atualização desta Política e da obtenção de consentimento específico do Titular.",
  "4. Compartilhamento de Dados",
  "Os dados pessoais são compartilhados apenas com os agentes indispensáveis ao funcionamento do sítio eletrônico, ao atendimento do pedido e, quando o Titular consente, à medição de uso do sítio, a saber:",
  "• Supabase, provedor do banco de dados em que os pedidos são armazenados, com servidores localizados em São Paulo.",
  "• Netlify, provedor de hospedagem do sítio eletrônico, que poderá realizar o tratamento de dados em servidores localizados fora do Brasil.",
  "• Google (Google Analytics), ferramenta de medição de uso do sítio eletrônico, ativada somente se o Titular aceitar o uso de cookies de análise. Ativada a ferramenta, o navegador do Titular se comunica com servidores do Google, que recebem os dados descritos na seção 2.7 e poderão realizar o tratamento em servidores localizados fora do Brasil.",
  "• Cloudflare (Turnstile), serviço de verificação contra acesso automatizado, carregado apenas na página de acesso à área administrativa do sítio eletrônico.",
  "• WhatsApp (Meta), quando o Titular envia a mensagem do pedido. A partir do envio, a conversa é regida pelas regras do próprio WhatsApp.",
  "• Prestador de serviços de desenvolvimento e manutenção do sítio eletrônico, que, na condição de operador, tem acesso técnico ao banco de dados e às contas de hospedagem.",
  "• Integrantes da equipe da Pingo de Mell responsáveis pelo atendimento do pedido.",
  "Não há outro compartilhamento de dados, salvo em cumprimento de obrigação legal ou de ordem de autoridade competente.",
  "5. Prazo de Conservação",
  "5.1. Os pedidos são conservados por 12 meses, contados da data do pedido. Findo esse prazo, o pedido é eliminado integralmente do sistema do Controlador, incluídos os dados do cliente e os itens.",
  "5.2. Fica ressalvada a conservação por prazo superior quando exigida por obrigação legal ou regulatória, hipótese em que serão conservados apenas os dados necessários, pelo prazo exigido.",
  "5.3. O endereço IP utilizado para limitar as tentativas de pedido é conservado por até 30 dias, contados da última tentativa registrada daquele endereço.",
  "5.4. A conversa mantida entre o Titular e a loja no WhatsApp permanece no aplicativo, no dispositivo da loja, e não é eliminada em conjunto com o pedido do sistema. O Titular poderá requerer sua eliminação por meio de um dos canais indicados na seção 1.",
  "5.5. Os dados de navegação enviados à ferramenta de análise ficam disponíveis, por evento e por usuário, por até 14 meses. Os relatórios agregados, que não identificam o Titular, podem ser conservados sem prazo definido. Os cookies da ferramenta de análise têm validade de 180 dias.",
  "6. Direitos do Titular",
  "Nos termos do art. 18 da LGPD, o Titular poderá requerer, a qualquer tempo:",
  "• a confirmação da existência de tratamento de seus dados;",
  "• o acesso aos dados;",
  "• a correção de dados incompletos, inexatos ou desatualizados;",
  "• a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desconformidade com a LGPD;",
  "• a portabilidade dos dados a outro fornecedor de serviço ou produto, mediante requisição expressa;",
  "• a informação sobre as entidades com as quais o Controlador compartilhou seus dados;",
  "• a revogação do consentimento, que poderá ser feita a qualquer tempo, na forma da seção 8.",
  "A revogação do consentimento interrompe novas coletas, mas não apaga os dados já recebidos pela ferramenta de análise, que seguem os prazos da seção 5. Os dados de navegação não são associados a nome, WhatsApp ou email; por essa razão, o Controlador em regra não consegue identificar a quem pertencem, e os pedidos de acesso, correção ou eliminação relativos a eles poderão não ser atendidos individualmente, hipótese em que o Titular será informado.",
  "O requerimento deverá ser dirigido a um dos canais indicados na seção 1. Para resguardar o próprio Titular, o Controlador poderá solicitar a confirmação do nome e do número de telefone utilizados no pedido. O Controlador responderá no prazo de até 15 dias.",
  "7. Segurança da Informação",
  "O acesso ao painel administrativo em que os pedidos são consultados é restrito a pessoa autorizada, mediante login e senha e verificação contra acesso automatizado. O acesso técnico ao banco de dados e às contas de hospedagem é restrito ao prestador de serviços de desenvolvimento e manutenção do sítio eletrônico, descrito na seção 4. O banco de dados admite a gravação de pedidos exclusivamente por meio do servidor do sítio eletrônico, e a comunicação com o sítio eletrônico é protegida por criptografia (HTTPS).",
  "Nenhum sistema é absolutamente imune a falhas. Na hipótese de incidente de segurança que possa acarretar risco ou dano relevante ao Titular, o Controlador comunicará o Titular e a Autoridade Nacional de Proteção de Dados (ANPD), nos termos da lei.",
  "8. Cookies e Ferramentas de Análise",
  "O sítio eletrônico utiliza cookies de análise de audiência somente com o consentimento do Titular. O aviso com as opções Aceitar e Recusar é exibido sempre que a ferramenta de análise estiver habilitada no sítio eletrônico. Enquanto o Titular não escolher, nenhum cookie de análise é gravado e nenhum dado é enviado ao Google.",
  "Se o Titular aceitar, a ferramenta Google Analytics grava no navegador dois cookies, denominados _ga e _ga_ seguido do código da propriedade de medição, com validade de 180 dias, para distinguir visitantes e medir o uso do sítio eletrônico, na forma descrita na seção 2.7. O Controlador não utiliza cookies de publicidade, não ativa os recursos de publicidade e de sinais do Google e não utiliza identificação de usuário.",
  'O Titular pode alterar sua escolha a qualquer tempo, pelo botão "Preferências de privacidade", disponível no rodapé do sítio eletrônico sempre que a ferramenta de análise estiver habilitada. Se o Titular revogar um aceite anterior, a página é recarregada e os cookies da ferramenta de análise são apagados do navegador. Em qualquer caso, depois da recusa novas coletas deixam de ocorrer. A escolha é registrada no armazenamento do navegador e vale por 180 dias; depois desse prazo, ou quando esta Política for alterada de modo que exija nova escolha, o aviso é exibido novamente.',
  "Os demais dados armazenados no navegador, descritos na seção 2.5, são necessários ao funcionamento do carrinho e do pedido e são gravados independentemente dessa escolha.",
  "9. Alterações desta Política",
  "A versão e a data de vigência desta Política constam no topo desta página. Havendo alteração relevante, esta será publicada nesta página, com a indicação da nova versão e da nova data de vigência. Quando a alteração modificar as finalidades, as ferramentas ou os terceiros descritos nesta Política, o aviso de cookies será exibido novamente ao Titular.",
  "10. Reclamações e Autoridade Nacional",
  "Caso entenda que o tratamento de seus dados é indevido, o Titular poderá procurar primeiramente o Controlador, por um dos canais indicados na seção 1, sem prejuízo do direito de peticionar à ANPD, em gov.br/anpd.",
];

const TITULOS = TEXTO_LITERAL.filter((t) => /^\d+\. /.test(t));

// Hífen, hífen tipográfico, hífen não separável, sinal de menos, meia risca
// e travessão (o mesmo conjunto do teste da Quem Somos).
const HIFENS = /[-‐‑−–—]/;

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

  it("as listas do texto são listas de verdade (ul/li): 7 itens na seção 4 e 7 na seção 6", () => {
    render(<PoliticaDePrivacidadePage />);
    const itens = (id: string) =>
      within(document.getElementById(id)!)
        .getAllByRole("listitem")
        .map((li) => textoVisivel(li));
    expect(itens("compartilhamento")).toHaveLength(7);
    expect(itens("compartilhamento")[2]).toMatch(/^Google \(Google Analytics\)/);
    expect(itens("compartilhamento")[3]).toContain(
      "carregado apenas na página de acesso à área administrativa"
    );
    expect(itens("direitos")).toHaveLength(7);
  });

  it("mantém o formulário no navegador (seção 2.5); o Google Fonts saiu e o Google Analytics entrou (seção 4)", () => {
    render(<PoliticaDePrivacidadePage />);
    const secao2 = textoVisivel(document.getElementById("dados-coletados")!);
    const secao4 = textoVisivel(document.getElementById("compartilhamento")!);
    const pagina = textoVisivel(document.querySelector("article.politica")!);
    expect(secao2).toContain("apenas na aba em uso");
    expect(secao4).toContain("Google Analytics");
    // A fonte de ícones é servida pelo próprio site desde o PR 1 da Fase 4.
    expect(pagina).not.toContain("Google Fonts");
    expect(pagina).toContain("Supabase");
  });

  it("seção 2: dado de saúde nas observações, IP, resumo do pedido, código da aba e o que vai ao Google Analytics (2.1 a 2.7)", () => {
    render(<PoliticaDePrivacidadePage />);
    const secao2 = textoVisivel(document.getElementById("dados-coletados")!);
    const secao8 = textoVisivel(document.getElementById("cookies")!);
    expect(secao2).toMatch(/por sua iniciativa.*dados pessoais sensíveis referentes à saúde/);
    expect(secao2).toContain("a cada envio de pedido, com dados válidos");
    expect(secao2).toContain("um resumo do pedido enviado");
    expect(secao2).toContain(
      "um código aleatório destinado a evitar o registro em duplicidade do mesmo pedido e a contagem em duplicidade de eventos de análise"
    );
    expect(secao2).toContain("Não são enviados nome, WhatsApp, email, endereço, observações, número do pedido nem valores.");
    expect(secao8).toContain("dois cookies, denominados _ga e _ga_");
    expect(secao8).toContain("vale por 180 dias");
    // Numeração interna da seção 2: 2.1 a 2.7, em ordem.
    const numeros = [...document.getElementById("dados-coletados")!.querySelectorAll("p")].map(
      (p) => /^(\d\.\d)\. /.exec(textoVisivel(p))?.[1]
    );
    expect(numeros).toEqual(["2.1", "2.2", "2.3", "2.4", "2.5", "2.6", "2.7"]);
  });

  it("numeração interna das seções 3 (3.1 a 3.5) e 5 (5.1 a 5.5)", () => {
    render(<PoliticaDePrivacidadePage />);
    const numeros = (id: string) =>
      [...document.getElementById(id)!.querySelectorAll("p")].map((p) => /^(\d\.\d)\. /.exec(textoVisivel(p))?.[1]);
    expect(numeros("uso-dos-dados")).toEqual(["3.1", "3.2", "3.3", "3.4", "3.5"]);
    expect(numeros("retencao")).toEqual(["5.1", "5.2", "5.3", "5.4", "5.5"]);
  });

  it("sem hífen nem travessão no texto visível, fora do telefone, do CNPJ e do email de LOJA", () => {
    render(<PoliticaDePrivacidadePage />);
    const artigo = document.querySelector("article.politica")!;
    const permitidos = [LOJA.telefone, LOJA.cnpj, LOJA.emailPrivacidade];
    const limpo = permitidos.reduce((t, v) => t.split(v).join(""), textoVisivel(artigo));
    expect(limpo.match(HIFENS)?.[0] ?? null).toBeNull();
    // A checagem pega mesmo cada caractere (controle positivo).
    for (const c of ["-", "‐", "‑", "−", "–", "—"]) expect(HIFENS.test(`a${c}b`)).toBe(true);
    expect(HIFENS.test(LOJA.telefone)).toBe(true);
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

  it("links: WhatsApp pelo wa.me sem mensagem e ANPD pelo gov.br, em nova aba; email por mailto", () => {
    render(<PoliticaDePrivacidadePage />);
    const whatsapp = screen.getByRole("link", { name: /^\(41\) 98800-2315/ });
    expect(whatsapp).toHaveAttribute("href", `https://wa.me/${WHATSAPP.numero}`);
    expect(whatsapp.getAttribute("href")).not.toContain("?");
    expect(whatsapp).toHaveAttribute("data-whatsapp-origem", "politica");
    const anpd = screen.getByRole("link", { name: /^gov\.br\/anpd/ });
    expect(anpd).toHaveAttribute("href", "https://www.gov.br/anpd");
    for (const link of [whatsapp, anpd]) {
      expect(link).toHaveAttribute("target", "_blank");
      expect(link).toHaveAttribute("rel", "noopener noreferrer");
    }
    const email = within(document.getElementById("responsavel")!).getByRole("link", { name: LOJA.emailPrivacidade });
    expect(email).toHaveAttribute("href", `mailto:${LOJA.emailPrivacidade}`);
  });

  it("título, descrição e noindex mantido nos metadados", () => {
    expect(metadata.title).toBe("Política de Privacidade · Pingo de Mell");
    expect(metadata.description).toBe(
      "Condições em que a Pingo de Mell trata os dados pessoais de quem visita o site e faz pedidos: dados tratados, finalidades, compartilhamento, prazo de conservação e direitos do titular."
    );
    expect(metadata.robots).toEqual({ index: false });
  });

  it("não consulta o banco (nem pelo servidor nem pelo navegador)", () => {
    render(<PoliticaDePrivacidadePage />);
    expect(clienteDoServidor).not.toHaveBeenCalled();
    expect(clienteDoNavegador).not.toHaveBeenCalled();
  });
});

describe("Política de Privacidade — versão e data de vigência", () => {
  it("versão 2, ainda sem data de vigência (a data entra no commit do dia do merge)", () => {
    expect(VERSAO_POLITICA).toBe(2);
    expect(DATA_VIGENCIA_POLITICA).toBeNull();
    // A página de verdade usa a constante.
    render(<PoliticaDePrivacidadePage />);
    expect(document.querySelector(".politica-versao")).toHaveTextContent(/^Versão 2\.$/);
    expect(document.body.innerHTML).not.toMatch(/\{\{|\}\}/);
  });

  it("com a data nula, mostra só 'Versão 2.' e nenhum campo entre chaves", () => {
    const { container } = render(<PoliticaDePrivacidade dataVigencia={null} />);
    expect(container.querySelector(".politica-versao")).toHaveTextContent(/^Versão 2\.$/);
    expect(container.textContent).not.toContain("Vigente");
    expect(container.innerHTML).not.toMatch(/\{\{|\}\}/);
  });

  it("com uma data de teste, a frase de vigência aparece com essa data", () => {
    const { container } = render(<PoliticaDePrivacidade dataVigencia="2026-10-20" />);
    expect(container.querySelector(".politica-versao")).toHaveTextContent(
      /^Versão 2\. Vigente a partir de 20\/10\/2026\.$/
    );
    expect(container.innerHTML).not.toMatch(/\{\{|\}\}/);
  });

  it("recusa data fora do formato AAAA-MM-DD em vez de mostrar texto errado", () => {
    expect(() => render(<PoliticaDePrivacidade dataVigencia="20/10/2026" />)).toThrow(/AAAA-MM-DD/);
  });
});

describe("Política de Privacidade — mesma fonte do rodapé", () => {
  it("endereço, CNPJ e WhatsApp da política são os de LOJA, os mesmos do rodapé; o email é o de LOJA", () => {
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
    expect(responsavel).toContain(`e o correio eletrônico ${LOJA.emailPrivacidade}.`);
    // O endereço de LOJA, na frase do texto aprovado, sai idêntico.
    expect(LOJA.endereco).toBe("Rua das Acácias, 412, Nações, Fazenda Rio Grande/PR");
    expect(responsavel).toContain("estabelecida na Rua das Acácias, 412, Nações, Fazenda Rio Grande/PR.");
    // O número do wa.me é o mesmo telefone, só com dígitos e DDI 55.
    expect(WHATSAPP.numero).toBe(`55${LOJA.telefone.replace(/\D/g, "")}`);
  });

  it("os valores saem de LOJA (trocar LOJA muda a política), não estão escritos à mão", async () => {
    vi.resetModules();
    vi.doMock("@/lib/site/config", async (original) => {
      const real = await original<typeof import("@/lib/site/config")>();
      return {
        ...real,
        LOJA: {
          ...real.LOJA,
          endereco: "ENDERECO-DE-TESTE",
          cnpj: "CNPJ-DE-TESTE",
          telefone: "TELEFONE-DE-TESTE",
          emailPrivacidade: "EMAIL-DE-TESTE",
        },
        WHATSAPP: { ...real.WHATSAPP, numero: "5500000000000" },
      };
    });
    const { PoliticaDePrivacidade: ComConfigTrocada } = await import("./politica");
    render(<ComConfigTrocada dataVigencia={null} />);
    const responsavel = textoVisivel(document.getElementById("responsavel")!);
    expect(responsavel).toContain("inscrita no CNPJ sob o nº CNPJ-DE-TESTE, estabelecida na ENDERECO-DE-TESTE.");
    expect(responsavel).toContain("são o WhatsApp TELEFONE-DE-TESTE, durante o horário");
    expect(responsavel).toContain("e o correio eletrônico EMAIL-DE-TESTE.");
    expect(screen.getByRole("link", { name: /^TELEFONE-DE-TESTE/ })).toHaveAttribute(
      "href",
      "https://wa.me/5500000000000"
    );
    expect(screen.getByRole("link", { name: "EMAIL-DE-TESTE" })).toHaveAttribute("href", "mailto:EMAIL-DE-TESTE");
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
