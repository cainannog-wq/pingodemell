// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CarrinhoProvider } from "@/components/site/CarrinhoProvider";
import { CHAVE_CARRINHO, reiniciarParaTeste } from "@/lib/carrinho/armazenamento";
import { escreverCarrinho, lerCarrinho, type LinhaCarrinho } from "@/lib/carrinho/regras";
import { CHAVE_CHECKOUT } from "@/lib/checkout/rascunho";
import { createClient as clienteDoNavegador } from "@/lib/supabase/client";
import type { Oferta } from "@/lib/checkout/ofertas";
import type { LinhaSabor } from "@/lib/vitrine/cento";
import type { RecheioVitrine } from "@/lib/vitrine/disponibilidade";

// Checkout com o navegador simulado (jsdom) e o banco simulado.
//
// O relógio fica fixo numa quinta-feira às 22h30 de Brasília (sexta em UTC):
// o horário em que o servidor e o banco (UTC) já estão no dia seguinte. A
// suíte roda nos fusos UTC e America/Sao_Paulo (vitest.config.ts).
//
// Calendário: qui 01/10 (hoje) · sex 02 · sáb 03 · dom 04 · seg 05 · ter 06 ·
// qua 07 · qui 08 · sex 09 (dia sem produção no banco simulado) · sáb 10.

const { push } = vi.hoisted(() => ({ push: vi.fn() }));

// Os testes que preenchem o formulário inteiro digitam muito (userEvent);
// com a suíte toda em paralelo passam dos 5 s padrão.
vi.setConfig({ testTimeout: 30_000 });

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
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

// Banco simulado: cada consulta fica registrada (tabela, filtros) para o
// teste provar o que foi e o que NÃO foi perguntado ao banco.
type Consulta = { tabela: string; filtros: [string, string, unknown][] };
const consultas: Consulta[] = [];
let produtosDoBanco: Oferta[] = [];
let saboresDoBanco: LinhaSabor[] = [];
let recheiosDoBanco: RecheioVitrine[] = [];
let diasOffDoBanco: { data: string }[] = [];

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: (tabela: string) => {
      const consulta: Consulta = { tabela, filtros: [] };
      consultas.push(consulta);
      const dados =
        tabela === "produtos"
          ? produtosDoBanco
          : tabela === "produto_cento_itens"
            ? saboresDoBanco
            : tabela === "recheios"
              ? recheiosDoBanco
              : diasOffDoBanco;
      const b = {
        select: () => b,
        eq: (c: string, v: unknown) => (consulta.filtros.push(["eq", c, v]), b),
        gte: (c: string, v: unknown) => (consulta.filtros.push(["gte", c, v]), b),
        in: (c: string, v: unknown) => (consulta.filtros.push(["in", c, v]), b),
        order: () => b,
        then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: dados, error: null }).then(ok),
      };
      return b;
    },
  })),
}));
vi.mock("@/lib/supabase/client", () => ({
  createClient: vi.fn(() => {
    throw new Error("o checkout não consulta o banco pelo navegador");
  }),
}));

// ---------- Carrinho de teste: uma linha de cada tipo ----------

const base = { observacao: null, foto: null };
const brigadeiro: LinhaCarrinho = {
  ...base,
  id: "l-avulso",
  produtoId: "p-brigadeiro",
  slug: "brigadeiro-gourmet",
  nome: "Brigadeiro Gourmet",
  preco: 2.35,
  tipo: "normal",
  unidade_venda: "unidade",
  quantidade: 30,
  pedidoMinimo: 30,
  step: "livre",
  observacao: "Forminha rosa",
};
const cento: LinhaCarrinho = {
  ...base,
  id: "l-cento",
  produtoId: "p-cento",
  slug: "cento-de-salgados-sortidos",
  nome: "Cento de salgados sortidos",
  preco: 95,
  tipo: "cento",
  quantidade: 1,
  sabores: [
    { nome: "Coxinha", quantidade: 50 },
    { nome: "Risole", quantidade: 50 },
  ],
};
const bolo: LinhaCarrinho = {
  ...base,
  id: "l-bolo",
  produtoId: "p-bolo",
  slug: "bolo-de-chocolate-com-ninho",
  nome: "Bolo de Chocolate com Ninho",
  preco: 70,
  tipo: "bolo",
  quantidade: 2,
  recheio: { id: "r-brigadeiro", nome: "Brigadeiro (demo)" },
  formato: "redondo",
};
const smash: LinhaCarrinho = {
  ...base,
  id: "l-smash",
  produtoId: "p-smash",
  slug: "smash-cake-demo",
  nome: "Smash Cake (demo)",
  preco: 89.9,
  tipo: "normal",
  unidade_venda: null,
  quantidade: 1,
  pedidoMinimo: 1,
  step: "livre",
};
const bento: LinhaCarrinho = {
  ...base,
  id: "l-bento",
  produtoId: "p-bento",
  slug: "bento-cake-flork-demo",
  nome: "Bento Cake Flork (demo)",
  preco: 60,
  tipo: "bento",
  quantidade: 2,
  pedidoMinimo: 1,
  recheio: { id: "r-ninho", nome: "Ninho com morango (demo)" },
};
const CARRINHO = [brigadeiro, cento, bolo, smash, bento];
// 30 × 2,35 + 95 + 2 × 70 + 89,90 + 2 × 60
const TOTAL = "R$ 515,40";

// ---------- Produtos do banco simulado ----------

let seq = 0;
function produto(parcial: Partial<Oferta> & { id: string; nome: string }): Oferta {
  seq += 1;
  return {
    slug: parcial.nome.toLowerCase().replace(/[^a-z0-9]+/g, "-"),
    descricao: null,
    preco: 10,
    image_url: null,
    Categoria: "Doces",
    tipo: "normal",
    unidade_venda: null,
    pedido_minimo: 1,
    step_quantidade: "livre",
    ativo: true,
    destaque: false,
    atualizado_em: `2026-09-${String(seq).padStart(2, "0")}T12:00:00Z`,
    prazo_producao_dias: 1,
    ...parcial,
  };
}

function montarBanco() {
  seq = 0;
  produtosDoBanco = [
    // Depois de entrar no carrinho, o Brigadeiro mudou de preço (2,35 -> 9,99)
    // e o Bento Cake Flork foi desativado (não vem do banco). O recheio
    // "Ninho com morango (demo)" também saiu do catálogo.
    produto({ id: "p-brigadeiro", nome: "Brigadeiro Gourmet", preco: 9.99, destaque: true, unidade_venda: "unidade" }),
    produto({ id: "p-cento", nome: "Cento de salgados sortidos", tipo: "cento", prazo_producao_dias: 3 }),
    produto({ id: "p-bolo", nome: "Bolo de Chocolate com Ninho", tipo: "bolo", Categoria: "Bolos", prazo_producao_dias: 1 }),
    produto({ id: "p-smash", nome: "Smash Cake (demo)", Categoria: "Bolos", prazo_producao_dias: 2 }),
    // Candidatos às ofertas (ativos e em destaque), do mais antigo ao mais novo.
    produto({ id: "o-empada", nome: "Empada de palmito", Categoria: "Salgados", destaque: true }),
    produto({ id: "o-suco", nome: "Suco de Laranja", Categoria: "Bebidas", destaque: true }),
    produto({ id: "o-mini", nome: "Mini sanduíche", Categoria: "Salgados", destaque: true, pedido_minimo: 30, unidade_venda: "unidade" }),
    produto({ id: "o-bolo2", nome: "Bolo Prestígio", tipo: "bolo", Categoria: "Bolos", destaque: true }),
    produto({ id: "o-docinho", nome: "Cento de docinho", tipo: "cento", destaque: true, prazo_producao_dias: 3 }),
    produto({ id: "o-coca", nome: "Coca-cola 2L", Categoria: "Bebidas", destaque: true, preco: 12, unidade_venda: "unidade" }),
    produto({ id: "o-sem-destaque", nome: "Risole de carne", Categoria: "Salgados" }),
    // O admin logado recebe também os inativos: o código filtra.
    produto({ id: "o-inativo", nome: "Torta de Limão", ativo: false, destaque: true }),
  ];
  saboresDoBanco = [
    { cento_nome: "Cento de docinho", subitem_nome: "Beijinho", ordem: 1, sabor: { nome: "Beijinho", ativo: true } },
  ];
  recheiosDoBanco = [
    { id: "r-brigadeiro", nome: "Brigadeiro (demo)", vale_bolo: true, vale_bento: true, preco_kg: 75, grupo: "chocolate_outros", ativo: true },
  ];
  diasOffDoBanco = [{ data: "2026-10-09" }];
}

// ---------- Ajudantes ----------

let fetchSimulado: ReturnType<typeof vi.fn>;

async function abrir(linhas: LinhaCarrinho[] = CARRINHO) {
  window.localStorage.setItem(CHAVE_CARRINHO, escreverCarrinho(linhas));
  reiniciarParaTeste();
  const { default: CheckoutPage } = await import("./page");
  const ui = await CheckoutPage();
  return render(<CarrinhoProvider>{ui}</CarrinhoProvider>);
}

function dia(rotulo: RegExp) {
  return within(screen.getByRole("grid")).getByRole("button", { name: rotulo });
}
const enviar = () => screen.getByRole("button", { name: "Revisar e enviar" });
const alerta = () => document.querySelector<HTMLElement>(".checkout-erros")!;
const aceite = () => screen.getByRole("checkbox", { name: /Concordo em compartilhar meus dados/ });

async function preencherTudo(user: ReturnType<typeof userEvent.setup>, data = /^sábado, 3 de outubro/) {
  await user.type(screen.getByLabelText(/^Seu nome/), "Juliana Ribeiro");
  await user.type(screen.getByLabelText(/^Seu WhatsApp/), "41997124408");
  await user.click(aceite());
  await user.click(dia(data));
  await user.selectOptions(screen.getByLabelText(/^Horário em que precisa/), "14:00");
  await user.click(screen.getByRole("radio", { name: /Retirar na loja/ }));
  await user.click(screen.getByRole("radio", { name: "Pix" }));
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-02T01:30:00Z")); // quinta 01/10, 22h30 em Brasília
  window.localStorage.clear();
  window.sessionStorage.clear();
  consultas.length = 0;
  push.mockClear();
  montarBanco();
  fetchSimulado = vi.fn(async () => {
    throw new Error("o checkout não chama a rede pelo navegador");
  });
  vi.stubGlobal("fetch", fetchSimulado);
});

afterEach(() => {
  // Vale para todos os testes: nada de rede nem de banco pelo navegador.
  expect(fetchSimulado).not.toHaveBeenCalled();
  expect(clienteDoNavegador).not.toHaveBeenCalled();
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

// ---------- Resumo: o carrinho não é reconferido ----------

describe("Checkout — resumo do pedido sem reconferir o banco", () => {
  it("mostra uma linha de cada tipo com o preço e o status gravados, mesmo com o banco diferente, sem aviso", async () => {
    await abrir();
    const resumo = screen.getByRole("region", { name: "Resumo do pedido" });
    const itens = within(resumo).getAllByRole("listitem");
    expect(itens.map((li) => li.dataset.linha)).toEqual(["l-avulso", "l-cento", "l-bolo", "l-smash", "l-bento"]);

    // Brigadeiro: preço do banco agora é 9,99; aparece o gravado (2,35).
    const avulso = within(itens[0]);
    expect(avulso.getByText("Brigadeiro Gourmet")).toBeInTheDocument();
    expect(avulso.getByText("R$ 2,35")).toBeInTheDocument();
    expect(avulso.getByText("Quantidade: 30 unidades")).toBeInTheDocument();
    expect(avulso.getByText("R$ 70,50")).toBeInTheDocument();
    expect(avulso.getByText("Forminha rosa")).toBeInTheDocument();
    expect(resumo).not.toHaveTextContent("9,99");

    expect(within(itens[1]).getByText("Coxinha 50 · Risole 50")).toBeInTheDocument();
    expect(within(itens[2]).getByText("Recheio: Brigadeiro (demo) · Formato: Redondo")).toBeInTheDocument();
    expect(within(itens[3]).getByText("Smash Cake (demo)")).toBeInTheDocument();
    // Bento Cake desativado e recheio fora do catálogo: aparece igual, sem erro.
    expect(within(itens[4]).getByText("Recheio: Ninho com morango (demo)")).toBeInTheDocument();
    expect(within(itens[4]).getByText("R$ 120,00")).toBeInTheDocument();

    expect(within(resumo).getByText(TOTAL)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(/pode ter mudado|indisponível no momento|não está mais disponível/i);
    // O resumo não tem controle de quantidade nem botão de remover.
    expect(within(resumo).queryByRole("spinbutton")).toBeNull();
    expect(within(resumo).queryByRole("button")).toBeNull();
  });

  it("o banco só é consultado para calendário, prazos e ofertas; nada filtra pelas linhas do carrinho", async () => {
    await abrir();
    expect(consultas.map((c) => c.tabela).sort()).toEqual(["dias_off", "produto_cento_itens", "produtos", "recheios"]);
    const produtos = consultas.find((c) => c.tabela === "produtos")!;
    expect(produtos.filtros).toEqual([["eq", "ativo", true]]);
    // Nenhuma consulta por id de produto ou de recheio das linhas.
    const idsDoCarrinho = CARRINHO.flatMap((l) => [l.produtoId, "recheio" in l ? l.recheio.id : ""]).filter(Boolean);
    for (const c of consultas) {
      for (const [, coluna, valor] of c.filtros) {
        expect(coluna).not.toBe("id");
        const valores = Array.isArray(valor) ? valor : [valor];
        for (const v of valores) expect(idsDoCarrinho).not.toContain(v);
      }
    }
    // Dias sem produção de hoje (Brasília) em diante.
    expect(consultas.find((c) => c.tabela === "dias_off")!.filtros).toEqual([["gte", "data", "2026-10-01"]]);
  });

  it("carrinho vazio mostra o estado vazio, sem formulário", async () => {
    await abrir([]);
    expect(screen.getByRole("heading", { name: "Seu pedido ainda está vazinho" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Revisar e enviar" })).toBeNull();
  });
});

// ---------- Formulário ----------

describe("Checkout — validação do formulário", () => {
  it("enviar vazio aponta cada campo obrigatório, anuncia o resumo dos erros e foca o primeiro", async () => {
    const user = userEvent.setup();
    await abrir();
    await user.click(enviar());

    expect(alerta()).toHaveAttribute("role", "alert");
    expect(alerta()).toHaveTextContent("Faltam 7 campos para continuar.");
    const nome = screen.getByLabelText(/^Seu nome completo/);
    expect(nome).toHaveFocus();
    expect(nome).toHaveAccessibleDescription("Conta pra gente o seu nome completo.");
    expect(aceite()).not.toBeChecked();
    expect(aceite()).toHaveAccessibleDescription(
      "Para continuar, marque que concorda com o compartilhamento dos dados e com a Política de Privacidade."
    );
    expect(screen.getByLabelText(/^Seu WhatsApp/)).toHaveAccessibleDescription(
      "Ops, esse campo ficou em branco. É por aqui que a gente te responde."
    );
    expect(screen.getByText("Escolha a data no calendário.")).toBeInTheDocument();
    expect(screen.getByText("Escolha a data primeiro, depois o horário.")).toBeInTheDocument();
    expect(screen.getByText("Escolha se vai retirar na loja ou receber por entrega.")).toBeInTheDocument();
    expect(screen.getByText("Escolha a forma de pagamento.")).toBeInTheDocument();
    expect(push).not.toHaveBeenCalled();
  });

  it("WhatsApp e e-mail fora do formato não deixam avançar; e-mail vazio pode", async () => {
    const user = userEvent.setup();
    await abrir();
    await preencherTudo(user);
    await user.clear(screen.getByLabelText(/^Seu WhatsApp/));
    await user.type(screen.getByLabelText(/^Seu WhatsApp/), "4199");
    await user.type(screen.getByLabelText(/^Seu e-mail/), "juliana@");
    await user.click(enviar());
    expect(alerta()).toHaveTextContent("Faltam 2 campos para continuar.");
    expect(screen.getByLabelText(/^Seu WhatsApp/)).toHaveFocus();
    expect(screen.getByLabelText(/^Seu WhatsApp/)).toHaveAccessibleDescription(
      "Confira o número: DDD + número, por exemplo (41) 99999-9999."
    );
    expect(push).not.toHaveBeenCalled();

    await user.clear(screen.getByLabelText(/^Seu WhatsApp/));
    await user.type(screen.getByLabelText(/^Seu WhatsApp/), "41997124408");
    expect(screen.getByLabelText(/^Seu WhatsApp/)).toHaveValue("(41) 99712-4408");
    await user.clear(screen.getByLabelText(/^Seu e-mail/));
    await user.click(enviar());
    expect(push).toHaveBeenCalledWith("/confirmacao");
  });

  it("endereço aparece só na entrega: cidade, bairro, rua e número obrigatórios", async () => {
    const user = userEvent.setup();
    await abrir();
    expect(screen.queryByLabelText(/^Cidade/)).toBeNull();
    await preencherTudo(user);
    const entrega = screen.getByRole("radio", { name: /Entrega/ });
    // Sem o nome da cidade no cartão: a entrega pode ser em cidade próxima.
    expect(entrega.closest("label")).toHaveTextContent("EntregaAcréscimo a combinar no WhatsApp");
    await user.click(entrega);
    await user.click(enviar());
    expect(alerta()).toHaveTextContent("Faltam 4 campos para continuar.");
    expect(screen.getByLabelText(/^Cidade/)).toHaveFocus();

    await user.type(screen.getByLabelText(/^Cidade/), "Mandirituba");
    await user.type(screen.getByLabelText(/^Bairro/), "Centro");
    await user.type(screen.getByLabelText(/^Endereço/), "Rua das Flores");
    await user.type(screen.getByLabelText(/^Número/), "100");
    await user.click(enviar());
    expect(push).toHaveBeenCalledWith("/confirmacao");
    expect(JSON.parse(window.sessionStorage.getItem(CHAVE_CHECKOUT)!).dados).toMatchObject({
      cidade: "Mandirituba",
      bairro: "Centro",
      rua: "Rua das Flores",
      numero: "100",
    });
  });

  it("nome precisa ser completo (nome e sobrenome)", async () => {
    const user = userEvent.setup();
    await abrir();
    await preencherTudo(user);
    await user.clear(screen.getByLabelText(/^Seu nome completo/));
    await user.type(screen.getByLabelText(/^Seu nome completo/), "Juliana");
    await user.click(enviar());
    expect(screen.getByLabelText(/^Seu nome completo/)).toHaveAccessibleDescription(
      "Informe o nome completo, com nome e sobrenome."
    );
    expect(push).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText(/^Seu nome completo/), " Ribeiro");
    await user.click(enviar());
    expect(push).toHaveBeenCalledWith("/confirmacao");
  });

  it("consentimento nasce desmarcado e é obrigatório; o link da política fica em Seus dados", async () => {
    const user = userEvent.setup();
    await abrir();
    const dados = screen.getByRole("region", { name: "Seus dados" });
    expect(within(dados).getByRole("link", { name: /Política de Privacidade/ })).toHaveAttribute(
      "href",
      "/politica-de-privacidade"
    );
    // A frase antiga e o link no resumo saíram.
    expect(document.body).not.toHaveTextContent("Seus dados são usados só para cuidar deste pedido.");
    expect(screen.getAllByRole("link", { name: /Política de Privacidade/ })).toHaveLength(1);

    await preencherTudo(user);
    await user.click(aceite()); // desmarca
    await user.click(enviar());
    expect(alerta()).toHaveTextContent("Falta 1 campo para continuar.");
    expect(aceite()).toHaveFocus();
    expect(push).not.toHaveBeenCalled();
    await user.click(aceite());
    await user.click(enviar());
    expect(push).toHaveBeenCalledWith("/confirmacao");
  });

  it("e-mail continua opcional, sem a marca (opcional)", async () => {
    await abrir();
    const rotulo = document.querySelector('label[for="checkout-email"]')!;
    expect(rotulo).toHaveTextContent(/^Seu e-mail$/);
  });

  it("completo: o botão final só navega para a confirmação, sem gravar nada", async () => {
    const user = userEvent.setup();
    await abrir();
    await preencherTudo(user);
    await user.click(enviar());
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith("/confirmacao");
    // Mesmas consultas de leitura da abertura, nenhuma a mais.
    expect(consultas).toHaveLength(4);
  });

  it("o preenchido fica no sessionStorage e volta ao reabrir a página", async () => {
    const user = userEvent.setup();
    const { unmount } = await abrir();
    await user.type(screen.getByLabelText(/^Seu nome/), "Juliana");
    await user.click(dia(/^sábado, 3 de outubro/));
    unmount();
    expect(JSON.parse(window.sessionStorage.getItem(CHAVE_CHECKOUT)!).dados).toMatchObject({ nome: "Juliana", data: "2026-10-03" });

    await abrir();
    expect(screen.getByLabelText(/^Seu nome/)).toHaveValue("Juliana");
    expect(dia(/^sábado, 3 de outubro/)).toHaveAttribute("aria-pressed", "true");
  });

  it("aviso com o texto exato antes do botão", async () => {
    await abrir();
    const artesanal = screen.getByText(
      "Pode haver diferenças em relação à imagem enviada, a gente capricha, mas cada peça é única."
    );
    expect(document.body).not.toHaveTextContent("Seu doce é feito artesanalmente");
    expect(artesanal.compareDocumentPosition(enviar()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("horário vem logo depois do calendário no HTML (ordem do celular)", async () => {
    await abrir();
    const grade = screen.getByRole("grid");
    const hora = screen.getByLabelText(/^Horário em que precisa/);
    const porque = screen.getByText("Por que algumas datas ficam bloqueadas");
    expect(grade.compareDocumentPosition(hora) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(hora.compareDocumentPosition(porque) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});

// ---------- Data e hora ----------

describe("Checkout — data e hora (hoje: quinta 01/10, 22h30 em Brasília)", () => {
  it("bloqueia hoje, segunda e dia sem produção; libera sexta e o fim de semana (pedido até quinta)", async () => {
    await abrir();
    expect(screen.getByRole("heading", { name: "Outubro de 2026" })).toBeInTheDocument();
    expect(dia(/^quinta-feira, 1 de outubro/)).toHaveAttribute("aria-disabled", "true");
    expect(dia(/^segunda-feira, 5 de outubro/)).toHaveAttribute("aria-disabled", "true");
    expect(dia(/^sexta-feira, 9 de outubro/)).toHaveAttribute("aria-disabled", "true");
    expect(dia(/^sexta-feira, 9 de outubro/)).toHaveAccessibleName(/dia sem produção/);
    for (const livre of [/^sexta-feira, 2 de outubro/, /^sábado, 3 de outubro/, /^domingo, 4 de outubro/, /^terça-feira, 6 de outubro/]) {
      expect(dia(livre)).not.toHaveAttribute("aria-disabled");
    }
  });

  it("data bloqueada não pode ser escolhida", async () => {
    const user = userEvent.setup();
    await abrir();
    await user.click(dia(/^segunda-feira, 5 de outubro/));
    expect(dia(/^segunda-feira, 5 de outubro/)).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByLabelText(/^Horário em que precisa/)).toBeDisabled();
  });

  it("horário segue o dia: sábado até 17h30, domingo até 14h30", async () => {
    const user = userEvent.setup();
    await abrir();
    await user.click(dia(/^sábado, 3 de outubro/));
    const hora = screen.getByLabelText(/^Horário em que precisa/);
    expect(within(hora).getAllByRole("option").at(-1)).toHaveTextContent("17h30");
    await user.selectOptions(hora, "17:00");
    await user.click(dia(/^domingo, 4 de outubro/));
    expect(within(hora).getAllByRole("option").at(-1)).toHaveTextContent("14h30");
    // 17h não existe no domingo: volta vazio.
    expect(hora).toHaveValue("");
  });

  it("prazo curto (Cento de 3 dias para sexta) avisa, sem botão de WhatsApp, e NÃO bloqueia o envio", async () => {
    const user = userEvent.setup();
    await abrir();
    expect(dia(/^sexta-feira, 2 de outubro/)).toHaveAccessibleName(/prazo curto$/);
    await preencherTudo(user, /^sexta-feira, 2 de outubro/);

    expect(screen.getByText(/prazo curto para Cento de salgados sortidos/)).toBeInTheDocument();
    expect(screen.getByText(/depois do envio, a gente combina o prazo/)).toBeInTheDocument();
    expect(document.querySelector('a[href^="https://wa.me/"]')).toBeNull();

    await user.click(enviar());
    expect(push).toHaveBeenCalledWith("/confirmacao");
  });

  it("data que cabe no prazo mostra só a confirmação", async () => {
    const user = userEvent.setup();
    await abrir();
    await user.click(dia(/^domingo, 4 de outubro/));
    expect(screen.queryByText(/prazo curto/)).toBeNull();
    expect(screen.getByText("Domingo, 4 de outubro")).toBeInTheDocument();
    expect(screen.getByText("Dentro do prazo: pedidos de fim de semana até quinta-feira.")).toBeInTheDocument();
  });

  it("teclado: setas andam entre os dias, PageDown troca o mês, Enter escolhe", async () => {
    const user = userEvent.setup();
    await abrir();
    const primeiro = dia(/^sexta-feira, 2 de outubro/);
    expect(primeiro).toHaveAttribute("tabindex", "0");
    primeiro.focus();
    await user.keyboard("{ArrowRight}");
    expect(dia(/^sábado, 3 de outubro/)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(dia(/^sábado, 10 de outubro/)).toHaveFocus();
    await user.keyboard("{PageDown}");
    expect(screen.getByRole("heading", { name: "Novembro de 2026" })).toBeInTheDocument();
    expect(dia(/^terça-feira, 10 de novembro/)).toHaveFocus();
    await user.keyboard("{Enter}");
    expect(dia(/^terça-feira, 10 de novembro/)).toHaveAttribute("aria-pressed", "true");
    await user.keyboard("{PageUp}");
    expect(dia(/^sábado, 10 de outubro/)).toHaveFocus();
  });
});

// ---------- Ofertas ----------

describe("Checkout — ofertas do rodapé", () => {
  const nomesDasOfertas = () =>
    within(screen.getByRole("region", { name: "Para completar a festa" }))
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);

  it("sem data: até 5, ativas e em destaque, com bebida e Cento, sem o que já está no carrinho", async () => {
    await abrir();
    expect(nomesDasOfertas()).toEqual(["Coca-cola 2L", "Cento de docinho", "Bolo Prestígio", "Mini sanduíche", "Suco de Laranja"]);
  });

  it("com data, some o que não fica pronto a tempo (Cento de docinho, 3 dias, para sexta)", async () => {
    const user = userEvent.setup();
    await abrir();
    await user.click(dia(/^sexta-feira, 2 de outubro/));
    expect(nomesDasOfertas()).toEqual(["Coca-cola 2L", "Bolo Prestígio", "Mini sanduíche", "Suco de Laranja", "Empada de palmito"]);
  });

  it("mostra preço com a unidade, sem o pedido mínimo", async () => {
    await abrir();
    const coca = document.querySelector<HTMLElement>('[data-oferta="o-coca"]')!;
    expect(coca).toHaveTextContent("R$ 12,00 a unidade");
    const mini = document.querySelector<HTMLElement>('[data-oferta="o-mini"]')!;
    expect(mini).not.toHaveTextContent(/mín/i);
  });

  it("avulso entra direto no carrinho com o mínimo e a tela se atualiza; Cento e Bolo levam à interna", async () => {
    const user = userEvent.setup();
    await abrir();
    const mini = document.querySelector<HTMLElement>('[data-oferta="o-mini"]')!;
    await user.click(within(mini).getByRole("button", { name: "Adicionar" }));

    const linhas = lerCarrinho(window.localStorage.getItem(CHAVE_CARRINHO));
    expect(linhas).toHaveLength(6);
    expect(linhas[5]).toMatchObject({ produtoId: "o-mini", tipo: "normal", quantidade: 30, pedidoMinimo: 30 });
    expect(screen.getByText("Mini sanduíche (30 unidades) entrou no seu pedido.")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Resumo do pedido" })).getByText("Mini sanduíche")).toBeInTheDocument();
    expect(nomesDasOfertas()).not.toContain("Mini sanduíche");
    expect(screen.getByRole("heading", { name: "Para completar a festa" })).toHaveFocus();

    const docinho = document.querySelector<HTMLElement>('[data-oferta="o-docinho"]')!;
    expect(within(docinho).getByRole("link", { name: /Escolher sabores/ })).toHaveAttribute("href", "/produtos/cento-de-docinho");
    const bolo2 = document.querySelector<HTMLElement>('[data-oferta="o-bolo2"]')!;
    expect(within(bolo2).getByRole("link", { name: /Escolher recheio/ })).toHaveAttribute("href", "/produtos/bolo-prest-gio");
  });
});
