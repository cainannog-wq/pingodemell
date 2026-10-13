import { colunasDaEdicao, neutrosDoCadastro, colunasDoProduto, type ColunaProduto } from "./campos";
import type { ParsedProduto } from "./parse";

// Monta o que o Salvar grava em `produtos`, a partir da tabela de campos
// (campos.ts). Funções puras: nenhum acesso ao banco.

function valores(p: ParsedProduto): Record<ColunaProduto, unknown> {
  return {
    nome: p.nome,
    descricao: p.descricao,
    Categoria: p.categoria,
    subcategoria_id: p.subcategoria_id,
    tipo: p.tipo,
    preco: p.preco,
    pedido_minimo: p.pedido_minimo,
    step_quantidade: p.step_quantidade,
    unidade_venda: p.unidade_venda,
    prazo_producao_dias: p.prazo_producao_dias,
    destaque: p.destaque,
    ativo: p.ativo,
  };
}

// A subcategoria só está no resultado do parser quando o campo era visível.
function contextoDe(p: ParsedProduto) {
  return { categoria: p.categoria, tipo: p.tipo, temSubcategoriaParaEscolher: p.subcategoria_id !== undefined };
}

// UPDATE de edição: só as colunas dos campos visíveis. Campo escondido não
// vai: o que já está no banco fica como está.
export function montarUpdate(p: ParsedProduto): Record<string, unknown> {
  const todos = valores(p);
  const contexto = contextoDe(p);
  const saida: Record<string, unknown> = {};
  for (const coluna of colunasDaEdicao(contexto)) saida[coluna] = todos[coluna];
  return saida;
}

// INSERT de cadastro: os campos visíveis com o valor da tela e os escondidos
// com o valor neutro da tabela (as colunas são obrigatórias).
export function montarInsert(p: ParsedProduto): Record<string, unknown> {
  const todos = valores(p);
  const contexto = contextoDe(p);
  const visiveis = new Set<ColunaProduto>(colunasDaEdicao(contexto));
  const neutros = neutrosDoCadastro(contexto);
  const saida: Record<string, unknown> = {};
  for (const coluna of colunasDoProduto()) {
    if (visiveis.has(coluna)) saida[coluna] = todos[coluna];
    else if (coluna in neutros) saida[coluna] = neutros[coluna];
  }
  return saida;
}
