import { CATEGORIA_VALUES, type CategoriaProduto } from "@/lib/produtos/categorias";
import { recusaDaSubcategoria, temSubcategoriaParaEscolher } from "@/lib/subcategorias/regras";
import { CAMPOS_SUBCATEGORIA_OPCAO, type SubcategoriaOpcao } from "@/lib/subcategorias/types";
import type { createClient } from "@/lib/supabase/server";

// Subcategoria no Salvar do produto: o servidor é a fonte de verdade. O
// navegador manda só o `subcategoria_id` escolhido; se o campo deve ser
// aceito, quem decide é o banco, lido aqui.

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Subcategoria que o produto já tem (edição); no cadastro, nada.
export type ProdutoAtual = { Categoria?: string | null; subcategoria_id?: string | null } | null;

export type SubcategoriaDoEnvio =
  | {
      ok: true;
      // undefined: o campo não veio no envio e não houve consulta.
      temSubcategoriaParaEscolher: boolean | undefined;
      // Subcategorias da categoria escolhida (só quando houve consulta).
      linhas: Pick<SubcategoriaOpcao, "id" | "ativo">[];
    }
  | { ok: false; erro: string };

const SEM_CONSULTA: SubcategoriaDoEnvio = { ok: true, temSubcategoriaParaEscolher: undefined, linhas: [] };

function vinculoDe(atual: ProdutoAtual) {
  return { subcategoriaId: atual?.subcategoria_id ?? null, categoriaSalva: atual?.Categoria ?? null };
}

// Todas as subcategorias para o formulário filtrar pela categoria escolhida.
// Falha de leitura: lista vazia (o seletor não aparece, o Salvar não envia o
// campo e o vínculo do banco fica como está).
export async function lerSubcategoriasParaOFormulario(supabase: Supabase): Promise<SubcategoriaOpcao[]> {
  const { data, error } = await supabase
    .from("subcategorias")
    .select(CAMPOS_SUBCATEGORIA_OPCAO)
    .order("ordem", { ascending: true });
  if (error) {
    console.error("subcategorias: falha ao ler para o formulário de produto", error.code);
    return [];
  }
  return (data ?? []) as unknown as SubcategoriaOpcao[];
}

// Sem o campo `subcategoria_id` no envio não há consulta: a coluna não vai ao
// UPDATE e o vínculo que está no banco fica como está. Com o campo, uma
// consulta só, das subcategorias da categoria escolhida.
export async function lerSubcategoriasDoEnvio(
  supabase: Supabase,
  formData: FormData,
  atual: ProdutoAtual
): Promise<SubcategoriaDoEnvio> {
  if (!formData.has("subcategoria_id")) return SEM_CONSULTA;
  const categoria = String(formData.get("categoria") ?? "").trim();
  // Categoria inválida: o parser recusa o formulário logo depois.
  if (!(CATEGORIA_VALUES as readonly string[]).includes(categoria)) return SEM_CONSULTA;

  const { data, error } = await supabase
    .from("subcategorias")
    .select(CAMPOS_SUBCATEGORIA_OPCAO)
    .eq("categoria", categoria as CategoriaProduto);
  if (error) return { ok: false, erro: "Não foi possível conferir as subcategorias agora. Tente de novo." };

  const linhas = (data ?? []) as unknown as SubcategoriaOpcao[];
  return {
    ok: true,
    temSubcategoriaParaEscolher: temSubcategoriaParaEscolher(linhas, categoria, vinculoDe(atual)),
    linhas,
  };
}

// Depois do parser: o valor enviado (quando o campo era visível) precisa ser
// da categoria escolhida e estar ativo, salvo a que o produto já tem. Devolve
// a mensagem de recusa ou null.
export function recusarSubcategoria(
  subcategoriaId: string | null | undefined,
  categoria: string,
  lidas: SubcategoriaDoEnvio,
  atual: ProdutoAtual
): string | null {
  if (!lidas.ok || !subcategoriaId) return null;
  return recusaDaSubcategoria(subcategoriaId, lidas.linhas, categoria, vinculoDe(atual));
}
