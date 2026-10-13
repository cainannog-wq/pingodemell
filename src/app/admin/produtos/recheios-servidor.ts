import { campoVisivel } from "@/lib/produtos/campos";
import { validarRecheiosDoProduto } from "@/lib/produtos/recheios-produto";
import type { CategoriaProduto, TipoProduto } from "@/lib/produtos/types";

// Recheios personalizados no Salvar do produto (supabase/produto-recheios.sql).
// O formulário manda recheios_produto (lista em JSON) e recheios_ligados.
// Sem o campo, a lista salva não é tocada. Lista vazia (interruptor
// desligado) limpa. O servidor confere tudo de novo: o navegador não vale.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const INVALIDO = "A lista de recheios está inválida. Recarregue a página e tente de novo.";

export type RecheiosDoEnvio =
  | { ok: true; aplicar: false }
  | { ok: true; aplicar: true; lista: { id?: string; nome: string }[] }
  | { ok: false; erro: string };

export function lerRecheiosDoEnvio(
  formData: FormData,
  produto: { categoria: CategoriaProduto | null; tipo: TipoProduto }
): RecheiosDoEnvio {
  const bruto = formData.get("recheios_produto");
  if (bruto === null) return { ok: true, aplicar: false };
  if (typeof bruto !== "string") return { ok: false, erro: INVALIDO };

  let itens: unknown;
  try {
    itens = JSON.parse(bruto);
  } catch {
    return { ok: false, erro: INVALIDO };
  }
  if (!Array.isArray(itens)) return { ok: false, erro: INVALIDO };
  const lista: { id?: string; nome: string }[] = [];
  for (const item of itens) {
    if (typeof item !== "object" || item === null) return { ok: false, erro: INVALIDO };
    const { id, nome } = item as { id?: unknown; nome?: unknown };
    if (typeof nome !== "string") return { ok: false, erro: INVALIDO };
    if (id !== undefined && !(typeof id === "string" && UUID.test(id))) return { ok: false, erro: INVALIDO };
    lista.push(id ? { id: id.toLowerCase(), nome } : { nome });
  }

  // Interruptor desligado: apaga a lista (nada a conferir).
  if (formData.get("recheios_ligados") !== "1") return { ok: true, aplicar: true, lista: [] };

  if (!campoVisivel("recheios", { categoria: produto.categoria, tipo: produto.tipo })) {
    return { ok: false, erro: "Recheios personalizados só existem para Bolos (tipo normal) e para a categoria Bento Cake." };
  }
  const conferida = validarRecheiosDoProduto(lista);
  if (!conferida.ok) return { ok: false, erro: conferida.erro };
  return { ok: true, aplicar: true, lista: conferida.recheios };
}
