// Erros do banco em português que a equipe entenda. Nenhuma mensagem crua do
// banco chega à tela (ela pode citar nome de restrição e de coluna).
export type ErroBanco = { code?: string | null; message?: string | null } | null | undefined;

export function traduzirErroSubcategoria(erro: ErroBanco): string {
  switch (erro?.code) {
    case "23505":
      return "Já existe uma subcategoria com esse nome nesta categoria.";
    case "23514":
      return "O nome precisa ter de 1 a 80 caracteres e não pode começar nem terminar com espaço.";
    case "23503":
      return "Esta subcategoria está em uso por produtos. Desative em vez de apagar.";
    case "42501":
      return "Você não tem permissão para fazer isso. Entre de novo e tente outra vez.";
    default:
      return "Não foi possível salvar agora. Tente de novo em instantes.";
  }
}

export function mensagemEmUso(quantidade: number): string {
  return quantidade === 1
    ? "1 produto usa esta subcategoria; desative em vez de apagar."
    : `${quantidade} produtos usam esta subcategoria; desative em vez de apagar.`;
}
