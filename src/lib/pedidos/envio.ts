import type { LinhaCarrinho } from "@/lib/carrinho/regras";
import { subtotalEmCentavos } from "@/lib/carrinho/regras";
import type { DadosCheckout, FormaPagamento, ModoEntrega } from "@/lib/checkout/formulario";

// O que o navegador manda para POST /api/pedidos (PR confirmacao-e-gravacao).
// Os nomes seguem o formulário do checkout; o servidor confere a forma e os
// limites de cada campo (validacao.ts) e recusa campo desconhecido. Nada
// aqui define `teste`: quem decide é o servidor, pelo ambiente.
//
// Cada linha leva o retrato do carrinho: nome, preço e composição do
// momento em que o item foi adicionado, mais o id do produto. O servidor
// NÃO confere nada disso no banco (produto ativo, preço atual): a atendente
// ajusta pelo WhatsApp.

type ItemBase = {
  produto_id: string;
  nome: string;
  quantidade: number;
  // Reais com até 2 casas, como gravado na linha do carrinho: por unidade
  // (avulso e Bento), por cento (Cento) ou por kg (Bolo).
  preco: number;
  observacao: string | null;
};

export type ItemEnvio =
  | (ItemBase & { tipo: "normal"; unidade_venda: string | null })
  | (ItemBase & { tipo: "cento"; sabores: { nome: string; quantidade: number }[] })
  | (ItemBase & { tipo: "bolo"; recheio: { id: string; nome: string }; formato: "redondo" | "quadrado" })
  | (ItemBase & { tipo: "bento"; recheio: { id: string; nome: string } });

export type CorpoPedido = {
  chave_idempotencia: string;
  nome: string;
  whatsapp: string;
  email: string;
  data: string;
  hora: string;
  modo: ModoEntrega;
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  complemento: string;
  ocasiao: string;
  pagamento: FormaPagamento;
  observacoes: string;
  itens: ItemEnvio[];
  // Total que a tela mostrou, em centavos. Só serve para registrar em log
  // (sem dado pessoal) quando difere do que o servidor recalculou; nunca
  // recusa o pedido.
  total_navegador_centavos: number;
};

// O que a rota devolve no sucesso (201 criado, 200 chave repetida): número,
// valor de cada linha e totais, nunca dado pessoal. A tela e a mensagem do
// WhatsApp saem daqui.
export type RespostaPedido = {
  numero: number;
  itens: { valor_centavos: number }[];
  subtotal_centavos: number;
  total_centavos: number;
};

// Códigos de erro da rota (corpo { codigo, mensagem }, sem eco do pedido).
export type CodigoErro = "invalido" | "grande_demais" | "gravacao_desligada" | "limite" | "erro";

export function itemDaLinha(linha: LinhaCarrinho): ItemEnvio {
  const base = {
    produto_id: linha.produtoId,
    nome: linha.nome,
    quantidade: linha.quantidade,
    preco: linha.preco,
    observacao: linha.observacao,
  };
  if (linha.tipo === "cento") return { ...base, tipo: "cento", sabores: linha.sabores.map((s) => ({ nome: s.nome, quantidade: s.quantidade })) };
  if (linha.tipo === "bolo") return { ...base, tipo: "bolo", recheio: { id: linha.recheio.id, nome: linha.recheio.nome }, formato: linha.formato };
  if (linha.tipo === "bento") return { ...base, tipo: "bento", recheio: { id: linha.recheio.id, nome: linha.recheio.nome } };
  return { ...base, tipo: "normal", unidade_venda: linha.unidade_venda };
}

export function montarCorpo(dados: DadosCheckout, linhas: LinhaCarrinho[], chave: string): CorpoPedido {
  const entrega = dados.modo === "entrega";
  return {
    chave_idempotencia: chave,
    nome: dados.nome.trim(),
    whatsapp: dados.whatsapp,
    email: dados.email.trim(),
    data: dados.data,
    hora: dados.hora,
    modo: dados.modo as ModoEntrega,
    cidade: entrega ? dados.cidade.trim() : "",
    bairro: entrega ? dados.bairro.trim() : "",
    rua: entrega ? dados.rua.trim() : "",
    numero: entrega ? dados.numero.trim() : "",
    complemento: entrega ? dados.complemento.trim() : "",
    ocasiao: dados.ocasiao.trim(),
    pagamento: dados.pagamento as FormaPagamento,
    observacoes: dados.observacoes.trim(),
    itens: linhas.map(itemDaLinha),
    total_navegador_centavos: linhas.reduce((soma, l) => soma + subtotalEmCentavos(l), 0),
  };
}

// Mesmo valor de linha nos três lugares (navegador, rota e gatilho do
// banco): centavos inteiros de preço × quantidade gravada.
export function valorDaLinhaEmCentavos(item: Pick<ItemEnvio, "preco" | "quantidade">): number {
  return Math.round(item.preco * 100) * item.quantidade;
}
