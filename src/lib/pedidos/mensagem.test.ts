import { describe, expect, it } from "vitest";
import type { LinhaCarrinho } from "@/lib/carrinho/regras";
import { linkWhatsApp } from "@/lib/site/whatsapp";
import { mensagemSemRegistro, montarRetrato } from "./confirmacao";
import { itemDaLinha } from "./envio";
import { DADOS_TESTE, LINHAS_TESTE } from "./fixtura-teste";
import { montarMensagem, ORCAMENTO_URL, TEXTO_INSTABILIDADE, textoCompleto, type DadosMensagem } from "./mensagem";

// Mensagem do WhatsApp (PR confirmacao-e-gravacao).

const CINCO: LinhaCarrinho[] = LINHAS_TESTE.slice(0, 5);

function resposta(linhas: LinhaCarrinho[], numero = 1048) {
  const itens = linhas.map((l) => ({ valor_centavos: Math.round(l.preco * 100) * l.quantidade }));
  const total = itens.reduce((a, b) => a + b.valor_centavos, 0);
  return { numero, itens, subtotal_centavos: total, total_centavos: total };
}

const SABORES = [
  "Coxinha", "Risoles de carne", "Empada de frango", "Bolinha de queijo", "Kibe", "Enroladinho de salsicha",
  "Pastel de carne", "Pastel de queijo", "Esfiha de carne", "Esfiha de frango", "Croquete", "Mini pizza",
  "Canudinho de frango", "Barquete de atum", "Coxinha de costela", "Travesseirinho",
];
const DOCES = [
  "Brigadeiro", "Beijinho", "Cajuzinho", "Olho de sogra", "Casadinho", "Bicho de pé", "Brigadeiro branco",
  "Paçoquinha", "Surpresa de uva", "Camafeu", "Trufa de maracujá", "Ninho com Nutella",
];
const OBS_LONGA = " Observação longa do item para testar o tamanho, com detalhes de cor, tema e embalagem, tudo escrito pela cliente com calma.";

// Carrinho grande: os cinco tipos com observações longas + um Cento de 16
// sabores (4 centos) + um Cento de 12 sabores (3 centos).
export const GRANDE: LinhaCarrinho[] = [
  ...CINCO.map((l) => ({ ...l, observacao: `${l.observacao ?? ""}${OBS_LONGA}`.trim() })),
  {
    id: "g1", tipo: "cento", produtoId: "22222222-2222-4222-8222-222222222222", slug: null, nome: "Cento de salgados sortidos",
    preco: 95, quantidade: 4, observacao: null, sabores: SABORES.map((nome, i) => ({ nome, quantidade: i % 2 ? 30 : 20 })),
  },
  {
    id: "g2", tipo: "cento", produtoId: "abababab-abab-4bab-8bab-abababababab", slug: null, nome: "Cento de docinho",
    preco: 110, quantidade: 3, observacao: null, sabores: DOCES.map((nome, i) => ({ nome, quantidade: i % 2 ? 30 : 20 })),
  },
];
const DADOS_GRANDE = {
  ...DADOS_TESTE,
  observacoes:
    "A festa é no salão de festas do condomínio, bloco B. Quem recebe a entrega é a minha mãe, Sandra, se eu não estiver. Por favor, liguem antes de sair, porque o interfone não funciona. Tem uma pessoa com alergia a amendoim e outra que não come lactose; se puderem separar esses, agradeço.",
};

describe("mensagem completa", () => {
  const retrato = montarRetrato({ dados: DADOS_TESTE, linhas: CINCO, resposta: resposta(CINCO), prazo: null });

  it("sai inteira, na ordem pedida, com os cinco tipos de linha", () => {
    expect(retrato.formato).toBe("completo");
    expect(retrato.mensagem).toBe(
      [
        "Olá! Fiz o pedido nº 1048 pelo site.",
        "",
        "Meus dados",
        "Nome: Juliana Ribeiro Teste",
        "WhatsApp: (41) 99712-4408",
        "E-mail: juliana.teste@exemplo.com",
        "",
        "Itens",
        "1. Brigadeiro gourmet, 50 un, R$ 117,50",
        "   Obs.: Forminha rosa",
        "2. Cento de salgados sortidos, 3 centos, R$ 287,97",
        "   Sabores: Coxinha 150, Risoles 100, Empada 50",
        "3. Bolo recheado, recheio Chocolate com morango, 3 kg, redondo, R$ 269,70 (valor base, sem decoração)",
        '   Obs.: Escrever "Feliz 5 anos, Manu"',
        "4. Smash Cake Safári, 1 un, R$ 149,99",
        "5. Bento Cake Unicórnio, recheio Ninho, 2 un, R$ 88,90",
        "",
        "Entrega em: Rua das Cerejeiras, 88, Casa dos fundos, Nações, Fazenda Rio Grande",
        "Data: sábado, 17 de outubro de 2026, às 14h",
        "Ocasião: Aniversário de 5 anos",
        "Pagamento: Pix",
        "Observações: A festa é no salão do condomínio.",
        "",
        "Total dos itens: R$ 914,06",
        "O valor da entrega e o da decoração são informados no atendimento, e o total pode mudar.",
        "Se eu tiver foto de referência, mando nesta conversa.",
      ].join("\n")
    );
  });

  it("sem emoji, sem hífen como separador e sem marcador de lista", () => {
    for (const m of [retrato.mensagem, montarMensagem(dadosGrandes()).texto]) {
      expect(m).not.toMatch(/\p{Extended_Pictographic}/u);
      expect(m).not.toMatch(/ - /);
      expect(m).not.toMatch(/^\s*[-•*] /m);
    }
  });

  it("valores em reais pt BR a partir de centavos: milhar com ponto e centavos com vírgula", () => {
    const caro: LinhaCarrinho = { ...CINCO[2], preco: 411.5, quantidade: 3 };
    const r = montarRetrato({ dados: DADOS_TESTE, linhas: [caro], resposta: resposta([caro]), prazo: null });
    expect(r.mensagem).toContain("R$ 1.234,50 (valor base, sem decoração)");
    expect(r.mensagem).toContain("Total dos itens: R$ 1.234,50");
  });

  it("os valores saem da resposta do servidor, não da conta do navegador", () => {
    const r = montarRetrato({
      dados: DADOS_TESTE,
      linhas: [CINCO[0]],
      resposta: { numero: 7, itens: [{ valor_centavos: 999 }], subtotal_centavos: 999, total_centavos: 999 },
      prazo: null,
    });
    expect(r.mensagem).toContain("1. Brigadeiro gourmet, 50 un, R$ 9,99");
    expect(r.mensagem).toContain("Total dos itens: R$ 9,99");
    expect(r.totalCentavos).toBe(999);
  });

  it("retirada: 'Retirada na loja'; e-mail em branco não aparece", () => {
    const r = montarRetrato({ dados: { ...DADOS_TESTE, modo: "retirada", email: "" }, linhas: CINCO, resposta: resposta(CINCO), prazo: null });
    expect(r.mensagem).toContain("\nRetirada na loja\n");
    expect(r.mensagem).not.toContain("E-mail");
  });
});

function dadosGrandes(numero: number | null = 1048): DadosMensagem {
  const linhas = GRANDE.map((l) => ({ ...itemDaLinha(l), valor_centavos: Math.round(l.preco * 100) * l.quantidade }));
  return {
    numero,
    semRegistro: numero === null ? "instabilidade" : null,
    nome: DADOS_GRANDE.nome,
    whatsapp: DADOS_GRANDE.whatsapp,
    email: DADOS_GRANDE.email,
    modo: "entrega",
    cidade: DADOS_GRANDE.cidade,
    bairro: DADOS_GRANDE.bairro,
    rua: DADOS_GRANDE.rua,
    numeroEndereco: DADOS_GRANDE.numero,
    complemento: DADOS_GRANDE.complemento,
    data: DADOS_GRANDE.data,
    hora: DADOS_GRANDE.hora,
    ocasiao: DADOS_GRANDE.ocasiao,
    pagamento: "pix",
    observacoes: DADOS_GRANDE.observacoes,
    linhas,
    totalCentavos: linhas.reduce((a, b) => a + b.valor_centavos, 0),
  };
}

describe("orçamento na URL codificada e cascata completo → curto → mínimo", () => {
  it("mede a URL do wa.me já codificada (acento e quebra de linha incham)", () => {
    const texto = "ç\n";
    expect(linkWhatsApp(texto).length).toBe("https://wa.me/5541988002315?text=".length + "%C3%A7%0A".length);
  });

  it("carrinho grande: o completo passa do orçamento e vai o curto, com WhatsApp e entrega por bairro e cidade", () => {
    const d = dadosGrandes();
    expect(linkWhatsApp(textoCompleto(d)).length).toBeGreaterThan(ORCAMENTO_URL);
    const m = montarMensagem(d);
    expect(m.formato).toBe("curto");
    expect(m.cabe).toBe(true);
    expect(m.url.length).toBeLessThanOrEqual(ORCAMENTO_URL);
    expect(m.texto).toBe(
      [
        "Olá! Fiz o pedido nº 1048 pelo site.",
        "",
        "Nome: Juliana Ribeiro Teste",
        "WhatsApp: (41) 99712-4408",
        "Data: sábado, 17 de outubro de 2026, às 14h",
        "Entrega em: Nações, Fazenda Rio Grande",
        "",
        "Itens",
        "Brigadeiro gourmet, 50 un",
        "Cento de salgados sortidos, 3 centos",
        "Bolo recheado, 3 kg",
        "Smash Cake Safári, 1 un",
        "Bento Cake Unicórnio, 2 un",
        "Cento de salgados sortidos, 4 centos",
        "Cento de docinho, 3 centos",
        "",
        "Total dos itens: R$ 1.624,06",
        "O valor da entrega e o da decoração são informados no atendimento, e o total pode mudar.",
        "",
        "Detalhes completos no pedido nº 1048.",
      ].join("\n")
    );
  });

  it("curto com retirada diz 'Retirada'", () => {
    const m = montarMensagem({ ...dadosGrandes(), modo: "retirada" });
    expect(m.formato).toBe("curto");
    expect(m.texto).toContain("\nRetirada\n");
  });

  it("50 linhas de nome longo: nem o curto cabe e vai o mínimo, sem cortar texto", () => {
    const base = dadosGrandes();
    const linhas = Array.from({ length: 50 }, (_, i) => ({ ...base.linhas[0], nome: `Doce artesanal de festa número ${i + 1} com nome bem comprido` }));
    const m = montarMensagem({ ...base, linhas });
    expect(m.formato).toBe("minimo");
    expect(m.cabe).toBe(true);
    expect(m.texto).toContain("Itens: 50 itens no pedido");
    expect(m.texto).toContain("Detalhes completos no pedido nº 1048.");
    // Cada linha é inteira: nenhuma termina no meio de uma palavra cortada.
    expect(m.texto.split("\n").every((l) => l === "" || /[.\p{L}\d)]$/u.test(l))).toBe(true);
  });
});

describe("caminho sem registro", () => {
  it("saída de emergência: sem número, com a linha de instabilidade, mensagem inteira", () => {
    const m = mensagemSemRegistro(DADOS_TESTE, CINCO, "instabilidade");
    expect(m.formato).toBe("completo");
    expect(m.texto.split("\n").slice(0, 2)).toEqual(["Olá! Quero fazer um pedido pelo site.", TEXTO_INSTABILIDADE]);
    expect(m.texto).not.toMatch(/nº/);
    expect(m.texto).toContain("Total dos itens: R$ 914,06");
  });

  it("interruptor desligado: sem número e SEM a linha de instabilidade", () => {
    const r = montarRetrato({ dados: DADOS_TESTE, linhas: CINCO, resposta: null, prazo: null });
    expect(r.modo).toBe("sem_registro");
    expect(r.numero).toBeNull();
    expect(r.pendenteEsvaziar).toBe(true);
    expect(r.mensagem.split("\n")[0]).toBe("Olá! Quero fazer um pedido pelo site.");
    expect(r.mensagem).not.toContain(TEXTO_INSTABILIDADE);
  });

  it("carrinho grande sem registro: vai o completo mesmo passando do orçamento, e a tela destaca Copiar", () => {
    const m = mensagemSemRegistro(DADOS_GRANDE, GRANDE, "instabilidade");
    expect(m.formato).toBe("completo");
    expect(m.cabe).toBe(false);
    expect(m.texto).toContain("Sabores: Coxinha 20, Risoles de carne 30");
  });
});
