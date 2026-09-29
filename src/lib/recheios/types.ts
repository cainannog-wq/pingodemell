// Catálogo de recheios (tabela public.recheios, supabase/recheios-schema.sql):
// uma tabela só para o Bolo grande e para o Bento Cake. Cada linha diz onde
// vale (vale_bolo, vale_bento).

export const GRUPO_RECHEIO_VALUES = ["frutas", "chocolate_outros"] as const;
export type GrupoRecheio = (typeof GRUPO_RECHEIO_VALUES)[number];

export const GRUPO_RECHEIO_LABELS: Record<GrupoRecheio, string> = {
  frutas: "Recheio com Frutas",
  chocolate_outros: "Recheio com chocolate e outros",
};

export const NOME_RECHEIO_MAX = 80;

export type Recheio = {
  id: string;
  nome: string;
  // Aparece no Bolo grande (agrupado, com preco_kg).
  vale_bolo: boolean;
  // Aparece na lista simples do Bento Cake (informativo, sem preço).
  vale_bento: boolean;
  // R$ por kg. Só existe quando vale_bolo (o banco garante).
  preco_kg: number | null;
  // Só existe quando vale_bolo (o banco garante).
  grupo: GrupoRecheio | null;
  ativo: boolean;
  criado_em: string;
  atualizado_em: string;
};

export const CAMPOS_RECHEIO = "id, nome, vale_bolo, vale_bento, preco_kg, grupo, ativo, criado_em, atualizado_em";
