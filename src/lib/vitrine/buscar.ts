import type { CategoriaProduto } from "@/lib/produtos/types";
import { createClient } from "@/lib/supabase/server";
import { CAMPOS_SABOR, centosComSabor, saboresAtivos, type LinhaSabor } from "./cento";
import { CAMPOS_RECHEIO_VITRINE, comPrecoAPartirDe, semIndisponiveis, type RecheioVitrine } from "./disponibilidade";
import { buscarFotosProduto, montarFotos, type FotoProduto } from "./fotos";
import { montarLista, type ItemLista } from "./lista";
import {
  CAMPOS_VITRINE,
  selecionarMaisPedidos,
  selecionarRelacionados,
  type ProdutoVitrine,
} from "./mais-pedidos";
import { variacaoDoProduto } from "./variacao";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Centos com ao menos um sabor ativo, entre os produtos recebidos. Cento
// sem sabor ativo é indisponível, como produto inativo: some da Home e da
// Lista (regra em cento.ts). Só consulta os sabores quando há Cento na
// lista. Retorna null em caso de erro.
async function centosDisponiveis(supabase: Supabase, produtos: ProdutoVitrine[]): Promise<Set<string> | null> {
  const nomes = produtos.filter((p) => p.tipo === "cento").map((p) => p.nome);
  if (nomes.length === 0) return new Set();

  const { data, error } = await supabase.from("produto_cento_itens").select(CAMPOS_SABOR).in("cento_nome", nomes);
  if (error) {
    console.error("Falha ao buscar os sabores dos Centos:", error.message);
    return null;
  }
  return centosComSabor((data ?? []) as unknown as LinhaSabor[]);
}

// Recheios do catálogo (Bolo grande e Bento Cake), só quando há Bolo ou
// Bento Cake entre os produtos recebidos. Sem nenhum, nem consulta. O
// inativo que o admin logado enxerga é filtrado pelas regras (recheios/
// regras.ts). Retorna null em caso de erro.
async function recheiosDaVitrine(supabase: Supabase, produtos: ProdutoVitrine[]): Promise<RecheioVitrine[] | null> {
  const precisa = produtos.some((p) => {
    const v = variacaoDoProduto(p);
    return v === "bolo" || v === "bento";
  });
  if (!precisa) return [];

  const { data, error } = await supabase.from("recheios").select(CAMPOS_RECHEIO_VITRINE).eq("ativo", true);
  if (error) {
    console.error("Falha ao buscar os recheios:", error.message);
    return null;
  }
  return (data ?? []) as unknown as RecheioVitrine[];
}

// Sabores dos Centos e recheios do catálogo, o que decide se um produto está
// disponível. null em caso de erro em qualquer uma das duas consultas.
// Usada também pelas ofertas do checkout (src/lib/checkout/buscar.ts).
export async function dependencias(supabase: Supabase, produtos: ProdutoVitrine[]) {
  const [comSabor, recheios] = await Promise.all([centosDisponiveis(supabase, produtos), recheiosDaVitrine(supabase, produtos)]);
  if (!comSabor || !recheios) return null;
  return { comSabor, recheios };
}

// Busca os candidatos a "Os mais pedidos" (ativo + destaque) e aplica a
// regra completa em selecionarMaisPedidos (bebida fora, ordem, limite) —
// a regra fica numa função pura, coberta por teste automatizado.
// Em caso de erro, a seção simplesmente não aparece na Home.
export async function buscarMaisPedidos(): Promise<ProdutoVitrine[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("produtos")
    .select(CAMPOS_VITRINE)
    .eq("ativo", true)
    .eq("destaque", true);

  if (error) {
    console.error("Falha ao buscar 'Os mais pedidos':", error.message);
    return [];
  }

  const produtos = (data ?? []) as ProdutoVitrine[];
  const dep = await dependencias(supabase, produtos);
  if (!dep) return [];
  return selecionarMaisPedidos(comPrecoAPartirDe(semIndisponiveis(produtos, dep.comSabor, dep.recheios), dep.recheios));
}

// Busca os produtos da Lista (/produtos) e aplica a regra em montarLista
// (inativo fora, destaques primeiro, ordem alfabética). O filtro de ativo
// fica na consulta E na regra: o cliente do servidor leva a sessão do
// cookie, então um admin logado navegando no site recebe do banco também
// os inativos — com ou sem a RLS de leitura só de ativos. Cento sem sabor
// ativo também fica fora. Retorna null em caso de erro (a página mostra
// aviso de falha, não "categoria vazia").
export async function buscarLista(categoria: CategoriaProduto | null): Promise<ItemLista[] | null> {
  const supabase = await createClient();
  let consulta = supabase.from("produtos").select(CAMPOS_VITRINE).eq("ativo", true);
  if (categoria) consulta = consulta.eq("Categoria", categoria);

  const { data, error } = await consulta;

  if (error) {
    console.error("Falha ao buscar a Lista de produtos:", error.message);
    return null;
  }

  const produtos = (data ?? []) as ProdutoVitrine[];
  const dep = await dependencias(supabase, produtos);
  if (!dep) return null;
  return montarLista(comPrecoAPartirDe(semIndisponiveis(produtos, dep.comSabor, dep.recheios), dep.recheios), categoria);
}

// Formato do slug, igual à restrição produtos_slug_formato do banco.
export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A leitura por slug fica AQUI, no código do site — não existe (e não deve
// ser criada) função de banco pública para isso. Só produto ativo, com o
// filtro na própria consulta E aqui: o admin logado navegando no site lê
// do banco também os inativos. "erro" = falha do banco (registrada no log).
async function lerProdutoPorSlug(supabase: Supabase, slug: string): Promise<ProdutoVitrine | null | "erro"> {
  const { data, error } = await supabase
    .from("produtos")
    .select(CAMPOS_VITRINE)
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("Falha ao buscar o produto pelo slug:", slug, error.message);
    return "erro";
  }

  const produto = data as ProdutoVitrine | null;
  return produto?.ativo === true ? produto : null;
}

// Produto ativo pelo slug, ou null quando não há o que mostrar: slug fora
// do formato (nem consulta o banco), inexistente, inativo ou falha do banco.
export async function buscarProdutoPorSlug(slug: string): Promise<ProdutoVitrine | null> {
  if (!FORMATO_SLUG.test(slug)) return null;
  const produto = await lerProdutoPorSlug(await createClient(), slug);
  return produto === "erro" ? null : produto;
}

export type Interna =
  | { estado: "ok"; produto: ProdutoVitrine; sabores: string[]; recheios: RecheioVitrine[]; fotos: FotoProduto[] }
  | { estado: "nao-encontrado" }
  | { estado: "erro" };

// Tudo o que a interna (/produtos/{slug}) mostra do banco:
// - produto ativo pelo slug; inexistente, inativo ou slug fora do formato
//   → "nao-encontrado" (a página cai na 404);
// - Cento: os sabores ativos, na ordem do cadastro; sem nenhum sabor ativo,
//   o Cento é indisponível → "nao-encontrado", como produto inativo;
// - Bolo e Bento Cake: os recheios do catálogo (o Bolo, agrupados; o Bento,
//   em lista simples); sem nenhum recheio ativo do lado dele, o produto é
//   indisponível → "nao-encontrado", como o Cento sem sabor;
// - fotos: capa e extras na ordem (se as extras falharem, só a capa);
// - falha do banco no produto ou nos sabores → "erro" (a página mostra
//   aviso de falha, não a 404).
export async function buscarInterna(slug: string): Promise<Interna> {
  if (!FORMATO_SLUG.test(slug)) return { estado: "nao-encontrado" };

  const supabase = await createClient();
  const produto = await lerProdutoPorSlug(supabase, slug);
  if (produto === "erro") return { estado: "erro" };
  if (!produto) return { estado: "nao-encontrado" };

  let sabores: string[] = [];
  if (produto.tipo === "cento") {
    const { data, error } = await supabase
      .from("produto_cento_itens")
      .select(CAMPOS_SABOR)
      .eq("cento_nome", produto.nome)
      .order("ordem", { ascending: true });
    if (error) {
      console.error("Falha ao buscar os sabores do Cento:", produto.nome, error.message);
      return { estado: "erro" };
    }
    sabores = saboresAtivos((data ?? []) as unknown as LinhaSabor[], produto.nome);
    if (sabores.length === 0) return { estado: "nao-encontrado" };
  }

  let recheios: RecheioVitrine[] = [];
  const variacao = variacaoDoProduto(produto);
  if (variacao === "bolo" || variacao === "bento") {
    const doCatalogo = await recheiosDaVitrine(supabase, [produto]);
    if (!doCatalogo) return { estado: "erro" };
    // semIndisponiveis dá a mesma resposta da Home e da Lista.
    if (semIndisponiveis([produto], new Set(), doCatalogo).length === 0) return { estado: "nao-encontrado" };
    recheios = doCatalogo;
  }

  const fotos = (await buscarFotosProduto(produto.id)) ?? montarFotos(produto, [], (c) => c);
  return { estado: "ok", produto: comPrecoAPartirDe([produto], recheios)[0], sabores, recheios, fotos };
}

// "Combina com o seu pedido" da interna: os mesmos produtos de "Os mais
// pedidos" (ativo + destaque, sem bebida, sem Cento indisponível), sem o
// produto da página (regra em selecionarRelacionados). Em caso de erro, o
// bloco some.
export async function buscarRelacionados(produtoId: string): Promise<ProdutoVitrine[]> {
  return selecionarRelacionados(await buscarMaisPedidos(), produtoId);
}
