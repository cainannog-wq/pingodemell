export type PedidoStatus =
  | "aguardando_confirmacao"
  | "em_producao"
  | "entregue"
  | "cancelado";

export type PedidoModoEntrega = "entrega" | "retirada";

export type PedidoItem = {
  nome: string;
  variacao: string | null;
  quantidade: number;
  preco_unitario: number;
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
};
