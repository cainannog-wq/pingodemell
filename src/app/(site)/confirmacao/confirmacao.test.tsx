// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { escreverCarrinho, lerCarrinho } from "@/lib/carrinho/regras";
import { CHAVE_CHECKOUT, escreverRascunho } from "@/lib/checkout/rascunho";
import { montarRetrato } from "@/lib/pedidos/confirmacao";
import { DADOS_TESTE, LINHAS_TESTE } from "@/lib/pedidos/fixtura-teste";
import { CHAVE_IDEMPOTENCIA, CHAVE_RETRATO, reiniciarRetratoParaTeste, salvarRetrato, type Retrato } from "@/lib/pedidos/retrato";
import ConfirmacaoPage, { metadata } from "./page";

// Tela /confirmacao (PR confirmacao-e-gravacao): lê só o retrato da aba;
// nunca consulta o banco nem a rede.

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("a confirmação não consulta o banco");
  }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(() => {
    throw new Error("a confirmação não consulta o banco");
  }),
}));

const CINCO = LINHAS_TESTE.slice(0, 5);
function resposta(numero = 1048) {
  const itens = CINCO.map((l) => ({ valor_centavos: Math.round(l.preco * 100) * l.quantidade }));
  const total = itens.reduce((a, b) => a + b.valor_centavos, 0);
  return { numero, itens, subtotal_centavos: total, total_centavos: total };
}
const REGISTRADO: Retrato = montarRetrato({ dados: DADOS_TESTE, linhas: CINCO, resposta: resposta(), prazo: { nome: "Cento de salgados sortidos", dias: 3 } });

function abrir() {
  reiniciarParaTeste();
  return render(
    <CarrinhoProvider>
      <ConfirmacaoPage />
    </CarrinhoProvider>
  );
}
const botaoWhatsApp = () => screen.getByRole("link", { name: /^Enviar pelo WhatsApp/ });

beforeEach(() => {
  window.localStorage.clear();
  window.sessionStorage.clear();
  reiniciarRetratoParaTeste();
  push.mockClear();
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("a confirmação não chama a rede");
    })
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("Confirmação: pedido registrado", () => {
  it("foco no título; número, botão do WhatsApp com a mensagem pronta em nova aba, resumo e avisos", async () => {
    salvarRetrato(REGISTRADO);
    abrir();
    const titulo = await screen.findByRole("heading", { level: 1, name: "Falta só enviar" });
    await waitFor(() => expect(titulo).toHaveFocus());
    expect(screen.getByText("Pedido nº 1048 · registrado, falta enviar")).toBeInTheDocument();

    const link = botaoWhatsApp();
    expect(link).toHaveAccessibleName(/abre em nova aba/);
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const texto = decodeURIComponent(link.getAttribute("href")!.replace("https://wa.me/5541988002315?text=", ""));
    expect(texto).toBe(REGISTRADO.mensagem);
    expect(texto.split("\n")[0]).toBe("Olá! Fiz o pedido nº 1048 pelo site.");

    const resumo = screen.getByRole("region", { name: "Resumo do pedido" });
    expect(within(resumo).getAllByRole("listitem")).toHaveLength(5);
    expect(resumo).toHaveTextContent("Total dos itens");
    expect(resumo).toHaveTextContent("R$ 914,06");
    expect(resumo).toHaveTextContent("O valor da entrega e o da decoração são informados no atendimento, e o total pode mudar.");
    expect(resumo).toHaveTextContent("Cento de salgados sortidos leva 3 dias para ficar pronto.");
    expect(resumo).toHaveTextContent("Tem foto de referência? Mande na conversa do WhatsApp");
    expect(screen.getByRole("link", { name: "Política de Privacidade" })).toHaveAttribute("href", "/politica-de-privacidade");
    expect(document.body).toHaveTextContent("Atendimento: Terça a sábado, 9h às 18h · domingo, 9h às 15h.");
  });

  it("não diz 'pedido confirmado', não promete prazo de resposta, sem emoji e sem hífen como separador", async () => {
    salvarRetrato(REGISTRADO);
    abrir();
    await screen.findByRole("heading", { level: 1 });
    const pagina = document.body.textContent ?? "";
    expect(pagina).not.toMatch(/pedido confirmado/i);
    expect(pagina).toMatch(/só vale depois que a nossa equipe responder/);
    expect(pagina).not.toMatch(/em até|minutos|horas|responde(mos)? em|retornamos/i);
    expect(pagina).not.toMatch(/\p{Extended_Pictographic}/u);
    const semPrevia = pagina.replace(REGISTRADO.mensagem, "");
    expect(semPrevia).not.toMatch(/ - /);
  });

  it("recarregar mantém a tela (o retrato fica na aba)", async () => {
    salvarRetrato(REGISTRADO);
    abrir();
    await screen.findByText("Pedido nº 1048 · registrado, falta enviar");
    cleanup();
    reiniciarRetratoParaTeste(); // a memória da página some; o sessionStorage fica
    abrir();
    expect(await screen.findByText("Pedido nº 1048 · registrado, falta enviar")).toBeInTheDocument();
  });

  it("'Fazer novo pedido' apaga o retrato e leva ao catálogo", async () => {
    const user = userEvent.setup();
    salvarRetrato(REGISTRADO);
    abrir();
    await user.click(await screen.findByRole("button", { name: "Fazer novo pedido" }));
    expect(window.sessionStorage.getItem(CHAVE_RETRATO)).toBeNull();
    expect(push).toHaveBeenCalledWith("/produtos");
  });

  it("mensagem acima do orçamento: 'Copiar mensagem' em destaque, com a instrução", async () => {
    salvarRetrato({ ...REGISTRADO, cabe: false });
    abrir();
    expect(await screen.findByText("Se a mensagem não aparecer no WhatsApp, copie e cole na conversa.")).toBeInTheDocument();
  });

  it("'Copiar mensagem' copia; sem área de transferência, mostra a mensagem num campo selecionável", async () => {
    const user = userEvent.setup();
    salvarRetrato(REGISTRADO);
    abrir();
    const escrever = vi.fn(async () => {});
    Object.defineProperty(navigator, "clipboard", { value: { writeText: escrever }, configurable: true });
    await user.click(await screen.findByRole("button", { name: "Copiar mensagem" }));
    expect(escrever).toHaveBeenCalledWith(REGISTRADO.mensagem);
    expect(await screen.findByText("Mensagem copiada. Cole na conversa do WhatsApp.")).toBeInTheDocument();

    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    await user.click(screen.getByRole("button", { name: "Copiar mensagem" }));
    expect(await screen.findByLabelText("Mensagem do pedido")).toHaveValue(REGISTRADO.mensagem);
  });
});

describe("Confirmação: sem registro (gravação desligada)", () => {
  it("sem número; carrinho, rascunho e chave só saem depois do clique no WhatsApp", async () => {
    const user = userEvent.setup();
    const retrato = montarRetrato({ dados: DADOS_TESTE, linhas: CINCO, resposta: null, prazo: null });
    salvarRetrato(retrato);
    window.localStorage.setItem(CHAVE_CARRINHO, escreverCarrinho(CINCO));
    window.sessionStorage.setItem(CHAVE_CHECKOUT, escreverRascunho(DADOS_TESTE));
    window.sessionStorage.setItem(CHAVE_IDEMPOTENCIA, "0f8a3b1c-2d4e-4f60-8a7b-9c0d1e2f3a4b");
    abrir();

    expect(await screen.findByText("Falta enviar")).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/nº \d/);
    expect(screen.getByRole("link", { name: /Voltar e editar/ })).toHaveAttribute("href", "/checkout");
    expect(lerCarrinho(window.localStorage.getItem(CHAVE_CARRINHO))).toHaveLength(5);

    await user.click(botaoWhatsApp());
    expect(lerCarrinho(window.localStorage.getItem(CHAVE_CARRINHO))).toEqual([]);
    expect(window.sessionStorage.getItem(CHAVE_CHECKOUT)).toBeNull();
    expect(window.sessionStorage.getItem(CHAVE_IDEMPOTENCIA)).toBeNull();
    expect(screen.getByRole("button", { name: "Fazer novo pedido" })).toBeInTheDocument();
  });
});

describe("Confirmação: sem retrato", () => {
  it("tela neutra, sem dado pessoal, com o WhatsApp geral da loja e sem consulta ao banco", async () => {
    abrir();
    const titulo = await screen.findByRole("heading", { level: 1, name: "Nenhum pedido recente" });
    await waitFor(() => expect(titulo).toHaveFocus());
    expect(
      screen.getByText(
        "Não encontramos um pedido recente neste aparelho. Se você chegou a enviar, o pedido foi registrado. Chame a gente no WhatsApp com o seu nome."
      )
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Falar com a gente no WhatsApp/ })).toHaveAttribute("href", "https://wa.me/5541988002315");
    expect(fetch).not.toHaveBeenCalled();
  });
});

it("rota fora do Google e sem dado do pedido no título", () => {
  expect(metadata.robots).toEqual({ index: false, follow: false });
  expect(String(metadata.title)).toBe("Enviar pedido · Pingo de Mell");
});
