export type PedidoStatus =
  | "aguardando_confirmacao"
  | "em_producao"
  | "entregue"
  | "cancelado";

export type PedidoModoEntrega = "entrega" | "retirada";

// Item gravado em pedidos.itens. As 4 primeiras chaves existem em todo
// pedido; as outras, só nos gravados pelo site desde o PR
// confirmacao-e-gravacao (src/lib/pedidos/validacao.ts).
export type PedidoItem = {
  nome: string;
  variacao: string | null;
  quantidade: number;
  preco_unitario: number;
  produto_id?: string;
  tipo?: "normal" | "cento" | "bolo" | "bento";
  unidade_venda?: string | null;
  observacao?: string | null;
};

export type Pedido = {
  id: string;
  numero: number;
  cliente_nome: string;
  cliente_whatsapp: string;
  cliente_email: string | null;
  ocasiao: string | null;
  modo_entrega: PedidoModoEntrega;
  endereco: string | null;
  data_hora_entrega: string;
  forma_pagamento: string;
  observacoes: string | null;
  itens: PedidoItem[];
  subtotal: number;
  valor_entrega: number;
  total: number;
  status: PedidoStatus;
  criado_em: string;
  status_atualizado_em: string;
  // Gravado fora da produção (homologação, preview) ou pedido de teste
  // antigo. O painel esconde por padrão.
  teste: boolean;
};
