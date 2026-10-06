import { cache } from "react";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { createClient } from "@/lib/supabase/server";
import { CAMPOS_SABOR, centosComSabor, saboresAtivos, type LinhaSabor } from "./cento";
import { CAMPOS_RECHEIO_VITRINE, comPrecoAPartirDe, semIndisponiveis, type RecheioVitrine } from "./disponibilidade";
import { lerFotosExtras, montarFotos, urlPublicaDaFoto, type FotoProduto } from "./fotos";
import { montarLista, type ItemLista } from "./lista";
import {
  CAMPOS_VITRINE,
  selecionarMaisPedidos,
  selecionarRelacionados,
  type ProdutoVitrine,
} from "./mais-pedidos";
import { variacaoDoProduto } from "./variacao";

type Supabase = Awaited<ReturnType<typeof createClient>>;

// Tempo de resposta (PR perf/vitrine-consultas-cache): a função do site roda
// longe do banco, e cada consulta em sequência custa uma viagem inteira. Por
// isso Home, Lista e interna disparam tudo o que é independente ao mesmo
// tempo, numa viagem só:
// - os sabores do Cento vêm embutidos na própria consulta de produtos, pela
//   chave de cento_nome (produto que não é Cento vem com a lista vazia);
// - os recheios saem em paralelo, sempre; a falha deles só conta quando há
//   Bolo ou Bento Cake na tela (antes, sem os dois, nem havia consulta);
// - na interna, as fotos extras saem em paralelo, pelo slug.

// Campos da vitrine com as linhas de sabor embutidas (só o Cento tem).
const CAMPOS_COM_SABORES = `${CAMPOS_VITRINE}, sabores:produto_cento_itens!produto_cento_itens_cento_nome_fkey(${CAMPOS_SABOR})`;

type ProdutoComSabores = ProdutoVitrine & { sabores?: LinhaSabor[] | null };

// Tira os sabores de cada produto (eles não vão para a tela nem para os
// componentes do navegador) e junta todas as linhas de sabor numa lista.
function separarSabores(linhas: ProdutoComSabores[]): { produtos: ProdutoVitrine[]; sabores: LinhaSabor[] } {
  const produtos: ProdutoVitrine[] = [];
  const sabores: LinhaSabor[] = [];
  for (const { sabores: doProduto, ...produto } of linhas) {
    produtos.push(produto);
    sabores.push(...(doProduto ?? []));
  }
  return { produtos, sabores };
}

function precisaDeRecheios(produtos: ProdutoVitrine[]): boolean {
  return produtos.some((p) => {
    const v = variacaoDoProduto(p);
    return v === "bolo" || v === "bento";
  });
}

// Recheios ativos do catálogo (Bolo grande e Bento Cake). O inativo que o
// admin logado enxerga é filtrado pelas regras (recheios/regras.ts). Retorna
// null em caso de erro.
async function lerRecheios(supabase: Supabase): Promise<RecheioVitrine[] | null> {
  const { data, error } = await supabase.from("recheios").select(CAMPOS_RECHEIO_VITRINE).eq("ativo", true);
  if (error) {
    console.error("Falha ao buscar os recheios:", error.message);
    return null;
  }
  return (data ?? []) as unknown as RecheioVitrine[];
}

// Uma leitura de recheios por requisição: a interna e "Combina com o seu
// pedido" dividem a mesma.
const recheiosDaRequisicao = cache(async () => lerRecheios(await createClient()));

// Recheios que valem para os produtos da tela: sem Bolo nem Bento Cake, a
// falha da leitura não importa (lista vazia); com eles, a falha vira null.
function recheiosParaATela(produtos: ProdutoVitrine[], recheios: RecheioVitrine[] | null): RecheioVitrine[] | null {
  return precisaDeRecheios(produtos) ? recheios : [];
}

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

// Sabores dos Centos e recheios do catálogo, o que decide se um produto está
// disponível, para quem já tem a lista de produtos em mãos: as ofertas do
// checkout (src/lib/checkout/buscar.ts) e o sitemap. null em caso de erro
// em qualquer uma das duas consultas.
export async function dependencias(supabase: Supabase, produtos: ProdutoVitrine[]) {
  const [comSabor, recheios] = await Promise.all([
    centosDisponiveis(supabase, produtos),
    precisaDeRecheios(produtos) ? lerRecheios(supabase) : Promise.resolve([]),
  ]);
  if (!comSabor || !recheios) return null;
  return { comSabor, recheios };
}

// Produtos da vitrine (com os sabores embutidos) e recheios numa viagem só,
// já sem os indisponíveis e com o "a partir de" do Bolo. null em caso de
// erro (a mensagem do log diz qual leitura).
async function lerVitrine(
  supabase: Supabase,
  filtro: { destaque?: true; categoria?: CategoriaProduto | null },
  rotulo: string
): Promise<ProdutoVitrine[] | null> {
  let consulta = supabase.from("produtos").select(CAMPOS_COM_SABORES).eq("ativo", true);
  if (filtro.destaque) consulta = consulta.eq("destaque", true);
  if (filtro.categoria) consulta = consulta.eq("Categoria", filtro.categoria);

  const [{ data, error }, recheiosLidos] = await Promise.all([consulta, recheiosDaRequisicao()]);
  if (error) {
    console.error(rotulo, error.message);
    return null;
  }

  const { produtos, sabores } = separarSabores((data ?? []) as unknown as ProdutoComSabores[]);
  const recheios = recheiosParaATela(produtos, recheiosLidos);
  if (!recheios) return null;
  return comPrecoAPartirDe(semIndisponiveis(produtos, centosComSabor(sabores), recheios), recheios);
}

// Busca os candidatos a "Os mais pedidos" (ativo + destaque) e aplica a
// regra completa em selecionarMaisPedidos (bebida fora, ordem, limite) —
// a regra fica numa função pura, coberta por teste automatizado.
// Em caso de erro, a seção simplesmente não aparece na Home.
export async function buscarMaisPedidos(): Promise<ProdutoVitrine[]> {
  const produtos = await lerVitrine(await createClient(), { destaque: true }, "Falha ao buscar 'Os mais pedidos':");
  return produtos ? selecionarMaisPedidos(produtos) : [];
}

// Busca os produtos da Lista (/produtos) e aplica a regra em montarLista
// (inativo fora, destaques primeiro, ordem alfabética). O filtro de ativo
// fica na consulta E na regra: o cliente do servidor leva a sessão do
// cookie, então um admin logado navegando no site recebe do banco também
// os inativos — com ou sem a RLS de leitura só de ativos. Cento sem sabor
// ativo também fica fora. Retorna null em caso de erro (a página mostra
// aviso de falha, não "categoria vazia").
export async function buscarLista(categoria: CategoriaProduto | null): Promise<ItemLista[] | null> {
  const produtos = await lerVitrine(await createClient(), { categoria }, "Falha ao buscar a Lista de produtos:");
  return produtos ? montarLista(produtos, categoria) : null;
}

// Formato do slug, igual à restrição produtos_slug_formato do banco.
export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// A leitura por slug fica AQUI, no código do site — não existe (e não deve
// ser criada) função de banco pública para isso. Só produto ativo, com o
// filtro na própria consulta E aqui: o admin logado navegando no site lê
// do banco também os inativos. Vem com as linhas de sabor embutidas (só o
// Cento tem). "erro" = falha do banco (registrada no log).
async function lerProdutoPorSlug(
  supabase: Supabase,
  slug: string
): Promise<{ produto: ProdutoVitrine; sabores: LinhaSabor[] } | null | "erro"> {
  const { data, error } = await supabase
    .from("produtos")
    .select(CAMPOS_COM_SABORES)
    .eq("slug", slug)
    .eq("ativo", true)
    .maybeSingle();

  if (error) {
    console.error("Falha ao buscar o produto pelo slug:", slug, error.message);
    return "erro";
  }

  const linha = data as unknown as ProdutoComSabores | null;
  if (linha?.ativo !== true) return null;
  const { produtos, sabores } = separarSabores([linha]);
  return { produto: produtos[0], sabores };
}

// Produto ativo pelo slug, ou null quando não há o que mostrar: slug fora
// do formato (nem consulta o banco), inexistente, inativo ou falha do banco.
export async function buscarProdutoPorSlug(slug: string): Promise<ProdutoVitrine | null> {
  if (!FORMATO_SLUG.test(slug)) return null;
  const lido = await lerProdutoPorSlug(await createClient(), slug);
  return lido === "erro" || lido === null ? null : lido.produto;
}

export type Interna =
  | { estado: "ok"; produto: ProdutoVitrine; sabores: string[]; recheios: RecheioVitrine[]; fotos: FotoProduto[] }
  | { estado: "nao-encontrado" }
  | { estado: "erro" };

// Tudo o que a interna (/produtos/{slug}) mostra do banco, numa viagem só
// (produto com os sabores, fotos extras e recheios ao mesmo tempo):
// - produto ativo pelo slug; inexistente, inativo ou slug fora do formato
//   → "nao-encontrado" (a página cai na 404);
// - Cento: os sabores ativos, na ordem do cadastro; sem nenhum sabor ativo,
//   o Cento é indisponível → "nao-encontrado", como produto inativo;
// - Bolo e Bento Cake: os recheios do catálogo (o Bolo, agrupados; o Bento,
//   em lista simples); sem nenhum recheio ativo do lado dele, o produto é
//   indisponível → "nao-encontrado", como o Cento sem sabor;
// - fotos: capa e extras na ordem (se as extras falharem, só a capa);
// - falha do banco no produto, nos sabores ou (só para Bolo e Bento Cake)
//   nos recheios → "erro" (a página mostra aviso de falha, não a 404).
export async function buscarInterna(slug: string): Promise<Interna> {
  if (!FORMATO_SLUG.test(slug)) return { estado: "nao-encontrado" };

  const supabase = await createClient();
  const [lido, extras, recheiosLidos] = await Promise.all([
    lerProdutoPorSlug(supabase, slug),
    lerFotosExtras(supabase, slug),
    recheiosDaRequisicao(),
  ]);
  if (lido === "erro") return { estado: "erro" };
  if (!lido) return { estado: "nao-encontrado" };
  const { produto } = lido;

  let sabores: string[] = [];
  if (produto.tipo === "cento") {
    sabores = saboresAtivos(lido.sabores, produto.nome);
    if (sabores.length === 0) return { estado: "nao-encontrado" };
  }

  const recheios = recheiosParaATela([produto], recheiosLidos);
  if (!recheios) return { estado: "erro" };
  // semIndisponiveis dá a mesma resposta da Home e da Lista.
  if (semIndisponiveis([produto], new Set([produto.nome]), recheios).length === 0) return { estado: "nao-encontrado" };

  const fotos = montarFotos(produto, extras ?? [], (caminho) => urlPublicaDaFoto(supabase, caminho));
  return { estado: "ok", produto: comPrecoAPartirDe([produto], recheios)[0], sabores, recheios, fotos };
}

// "Combina com o seu pedido" da interna: os mesmos produtos de "Os mais
// pedidos" (ativo + destaque, sem bebida, sem Cento indisponível), sem o
// produto da página (regra em selecionarRelacionados). Em caso de erro, o
// bloco some. A interna busca "Os mais pedidos" junto com o produto
// (página) e aplica a mesma regra.
export async function buscarRelacionados(produtoId: string): Promise<ProdutoVitrine[]> {
  return selecionarRelacionados(await buscarMaisPedidos(), produtoId);
}
