import { PaginaNaoEncontrada } from "@/components/site/PaginaNaoEncontrada";

// 404 do notFound() chamado por uma página do site público (interna de
// produto inexistente, inativo ou Cento sem sabor ativo). Já está dentro do
// layout do site, que monta cabeçalho e rodapé: aqui vai só o conteúdo.
export default function NotFound() {
  return <PaginaNaoEncontrada />;
}
