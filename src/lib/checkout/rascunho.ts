import { FORMAS_PAGAMENTO, MAXIMO, VAZIO, type DadosCheckout } from "./formulario";

// Onde fica o que a cliente já preencheu no checkout: sessionStorage do
// navegador, chave pdm-checkout-v1 (decisão do Cainan, PR
// checkout-de-verdade). Sobrevive a ir ao carrinho e voltar e a recarregar
// a página; some ao fechar a aba e não aparece em outras abas. Nada vai
// para o banco nem para cookie. A tela de confirmação (próximo item) lê
// daqui.
//
// A leitura confere cada campo: o que não for texto, ou passar do tamanho
// máximo, volta vazio. Se o navegador bloquear o sessionStorage, o
// formulário funciona só na memória da página.

export const CHAVE_CHECKOUT = "pdm-checkout-v1";
export const VERSAO_CHECKOUT = 1;

function texto(v: unknown, maximo: number): string {
  return typeof v === "string" && v.length <= maximo ? v : "";
}

export function lerRascunho(salvo: string | null): DadosCheckout {
  if (!salvo) return { ...VAZIO };
  let bruto: unknown;
  try {
    bruto = JSON.parse(salvo);
  } catch {
    return { ...VAZIO };
  }
  if (!bruto || typeof bruto !== "object") return { ...VAZIO };
  const { versao, dados } = bruto as { versao?: unknown; dados?: unknown };
  if (versao !== VERSAO_CHECKOUT || !dados || typeof dados !== "object") return { ...VAZIO };
  const d = dados as Record<string, unknown>;

  const data = texto(d.data, 10);
  const hora = texto(d.hora, 5);
  return {
    nome: texto(d.nome, MAXIMO.nome),
    whatsapp: texto(d.whatsapp, MAXIMO.whatsapp),
    email: texto(d.email, MAXIMO.email),
    aceite: d.aceite === true,
    data: /^\d{4}-\d{2}-\d{2}$/.test(data) ? data : "",
    hora: /^\d{2}:\d{2}$/.test(hora) ? hora : "",
    modo: d.modo === "retirada" || d.modo === "entrega" ? d.modo : "",
    cidade: texto(d.cidade, MAXIMO.cidade),
    bairro: texto(d.bairro, MAXIMO.bairro),
    rua: texto(d.rua, MAXIMO.rua),
    numero: texto(d.numero, MAXIMO.numero),
    complemento: texto(d.complemento, MAXIMO.complemento),
    ocasiao: texto(d.ocasiao, MAXIMO.ocasiao),
    pagamento: FORMAS_PAGAMENTO.find((f) => f.valor === d.pagamento)?.valor ?? "",
    observacoes: texto(d.observacoes, MAXIMO.observacoes),
  };
}

export function escreverRascunho(dados: DadosCheckout): string {
  return JSON.stringify({ versao: VERSAO_CHECKOUT, dados });
}

export function carregarRascunho(): DadosCheckout {
  try {
    return lerRascunho(window.sessionStorage.getItem(CHAVE_CHECKOUT));
  } catch {
    return { ...VAZIO };
  }
}

export function salvarRascunho(dados: DadosCheckout): void {
  try {
    window.sessionStorage.setItem(CHAVE_CHECKOUT, escreverRascunho(dados));
  } catch {
    // Sem sessionStorage: o formulário segue só na memória da página.
  }
}
