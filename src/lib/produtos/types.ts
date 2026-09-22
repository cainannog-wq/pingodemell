export type Produto = {
  nome: string;
  preco: number;
  descricao: string | null;
  image_url: string | null;
  criado_em: string | null;
  pedido_minimo: number;
};
