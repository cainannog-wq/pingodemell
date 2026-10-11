// Lista única das unidades de venda (PR unidade/texto-venda, 11/10/2026).
// `produtos.unidade_venda` é texto livre: o cadastro guarda "unidade" e
// "caixa" sem artigo e "o kit", "o cento", "o kg", "o combo" com artigo.
// Aqui o artigo do valor guardado não importa ("o kit" e "kit" são a mesma
// unidade): o texto do preço e o plural saem sempre desta lista.
//
// Preço: "R$ 2,50 a unidade", "R$ 250,00 o kit", nunca com "por".
// Quantidade e mínimo: "30 unidades", "10 kits", "2 kg".
// Valor fora da lista: o preço sai sem unidade e a quantidade só com o
// número, nunca o texto como foi digitado.

export type UnidadeVenda = {
  chave: string;
  // Depois do valor no preço: "a unidade", "o kit".
  preco: string;
  singular: string;
  plural: string;
};

const LISTA: UnidadeVenda[] = [
  { chave: "unidade", preco: "a unidade", singular: "unidade", plural: "unidades" },
  { chave: "caixa", preco: "a caixa", singular: "caixa", plural: "caixas" },
  { chave: "kit", preco: "o kit", singular: "kit", plural: "kits" },
  { chave: "cento", preco: "o cento", singular: "cento", plural: "centos" },
  { chave: "kg", preco: "o kg", singular: "kg", plural: "kg" },
  { chave: "combo", preco: "o combo", singular: "combo", plural: "combos" },
  // Fora da lista do PR, mas já reconhecido antes dele; nenhum produto usa.
  { chave: "litro", preco: "o litro", singular: "litro", plural: "litros" },
];

const POR_CHAVE = new Map(LISTA.map((u) => [u.chave, u]));

// Outras grafias da mesma unidade, já aceitas antes na mensagem do pedido.
const SINONIMOS: Record<string, string> = { unidades: "unidade", un: "unidade" };

// Unidade conhecida a partir do valor guardado, ignorando maiúscula, espaço
// sobrando e o artigo "o"/"a" do começo. null: vazio ou fora da lista.
export function unidadeDeVenda(valor: string | null | undefined): UnidadeVenda | null {
  const texto = valor?.trim().toLowerCase().replace(/\s+/g, " ");
  if (!texto) return null;
  const semArtigo = texto.replace(/^(o|a) /, "");
  return POR_CHAVE.get(SINONIMOS[semArtigo] ?? semArtigo) ?? null;
}

export const UNIDADE: UnidadeVenda = POR_CHAVE.get("unidade")!;
