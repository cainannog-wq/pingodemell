import { CATEGORIA_VALUES, type CategoriaProduto } from "@/lib/produtos/categorias";
import { NOME_SUBCATEGORIA_MAX } from "./types";

export type ResultadoParse<T> = { success: true; data: T } | { success: false; error: string };

// Função pura (sem I/O). Espaços nas pontas saem e espaços repetidos viram um
// só, para o banco (nome sem espaço sobrando, de 1 a 80 caracteres) nunca ser
// quem recusa um nome comum.
export function parseNomeSubcategoria(bruto: unknown): ResultadoParse<string> {
  const nome = String(bruto ?? "").trim().replace(/\s+/g, " ");
  if (!nome) return { success: false, error: "Informe o nome da subcategoria." };
  if (nome.length > NOME_SUBCATEGORIA_MAX) {
    return { success: false, error: `O nome da subcategoria tem no máximo ${NOME_SUBCATEGORIA_MAX} caracteres.` };
  }
  return { success: true, data: nome };
}

export function parseCategoriaSubcategoria(bruto: unknown): ResultadoParse<CategoriaProduto> {
  const categoria = String(bruto ?? "").trim();
  if (!(CATEGORIA_VALUES as readonly string[]).includes(categoria)) {
    return { success: false, error: "Escolha uma categoria válida." };
  }
  return { success: true, data: categoria as CategoriaProduto };
}
