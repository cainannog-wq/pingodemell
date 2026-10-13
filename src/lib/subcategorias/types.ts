import type { CategoriaProduto } from "@/lib/produtos/categorias";

// Segundo nível de categoria (tabela public.subcategorias,
// supabase/subcategorias.sql). O slug é gerado e fixado pelo banco: aqui só
// aparece como informação.
export type Subcategoria = {
  id: string;
  categoria: CategoriaProduto;
  nome: string;
  slug: string;
  ordem: number;
  ativo: boolean;
};

export const CAMPOS_SUBCATEGORIA = "id, categoria, nome, slug, ordem, ativo";

export const NOME_SUBCATEGORIA_MAX = 80;

// O que o formulário de produto e o servidor precisam saber de cada linha.
export type SubcategoriaOpcao = Pick<Subcategoria, "id" | "categoria" | "nome" | "ativo" | "ordem">;

export const CAMPOS_SUBCATEGORIA_OPCAO = "id, categoria, nome, ativo, ordem";
