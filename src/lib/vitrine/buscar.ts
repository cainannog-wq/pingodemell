import type { SupabaseClient } from "@supabase/supabase-js";
import { cache } from "react";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { emCacheDaVitrine } from "./cache";
import { CAMPOS_SABOR, centosComSabor, saboresAtivos, type LinhaSabor } from "./cento";
import { CAMPOS_RECHEIO_VITRINE, comPrecoAPartirDe, semIndisponiveis, type RecheioVitrine } from "./disponibilidade";
import { lerFotosExtras, montarFotos, type FotoProduto } from "./fotos";
import { montarLista, type ItemLista } from "./lista";
import {
  CAMPOS_VITRINE,
  selecionarMaisPedidos,
  selecionarRelacionados,
  type ProdutoVitrine,
} from "./mais-pedidos";
import { variacaoDoProduto } from "./variacao";

type Supabase = SupabaseClient;

// Tempo de resposta (PR perf/vitrine-consultas-cache). A função do site roda
// longe do banco, e cada consulta em sequência custa uma viagem inteira:
// - Home, Lista e interna disparam tudo o que é independente ao mesmo
//   tempo, numa viagem só. Os sabores do Cento vêm embutidos na própria
//   consulta de produtos (chave de cento_nome); os recheios saem sempre, em
//   paralelo, e a falha deles só conta quando há Bolo ou Bento Cake na tela;
//   na interna, as fotos extras saem em paralelo, pelo slug.
// - Cada leitura fica no cache da vitrine (cache.ts: etiqueta "vitrine",
//   60 s, invalidada pelas ações do admin). Por isso a vitrine lê SEMPRE
//   com o cliente sem sessão (o mesmo que o anônimo vê, nunca o do admin
//   logado): o que entra no cache é servido para todo mundo. As leituras em
//   cache lançam erro em caso de falha (erro não é guardado); quem chama
//   captura e mantém o comportamento de sempre (seção some, aviso de falha).

// Cliente sem sessão nem cookie. Importado aqui dentro: sem as variáveis de
// ambiente (por exemplo, um build sem acesso ao Supabase), o erro fica
// dentro da leitura e é tratado como falha do banco, sem derrubar o build.
// Uma importação só, dividida pelas leituras que saem juntas; se falhar,
// a próxima leitura tenta de novo.
let modulo: Promise<typeof import("@/lib/supabase/publico")> | undefined;
async function clientePublico(): Promise<Supabase> {
  modulo ??= import("@/lib/supabase/publico").catch((e) => {
    modulo = undefined;
    throw e;
  });
  return (await modulo).createPublicClient();
}

const FALHA = Symbol("falha da leitura");

// Espera uma leitura em cache; em caso de erro, registra no log com o
// rótulo de sempre e devolve FALHA.
async function tentar<T>(leitura: Promise<T>, rotulo: string): Promise<T | typeof FALHA> {
  try {
    return await leitura;
  } catch (e) {
    console.error(rotulo, e instanceof Error ? e.message : e);
    return FALHA;
  }
}

// Campos da vitrine com as linhas de sabor embutidas (só o Cento tem).
const CAMPOS_COM_SABORES = `${CAMPOS_VITRINE}, sabores:produto_cento_itens!produto_cento_itens_cento_nome_fkey(${CAMPOS_SABOR})`;

type ProdutoComSabores = ProdutoVitrine & { sabores?: LinhaSabor[] | null };
type ProdutosESabores = { produtos: ProdutoVitrine[]; sabores: LinhaSabor[] };

// Tira os sabores de cada produto (eles não vão para a tela nem para os
// componentes do navegador) e junta todas as linhas de sabor numa lista.
function separarSabores(linhas: ProdutoComSabores[]): ProdutosESabores {
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

// Recheios ativos do catálogo (Bolo grande e Bento Cake). O inativo que um
// cliente com sessão enxergaria é filtrado pelas regras (recheios/regras.ts).
async function consultarRecheios(supabase: Supabase): Promise<RecheioVitrine[]> {
  const { data, error } = await supabase.from("recheios").select(CAMPOS_RECHEIO_VITRINE).eq("ativo", true);
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RecheioVitrine[];
}

// ---- Leituras em cache (lançam erro em caso de falha) ----

const lerProdutosEmCache = emCacheDaVitrine(
  async (destaque: boolean, categoria: CategoriaProduto | null): Promise<ProdutosESabores> => {
    let consulta = (await clientePublico()).from("produtos").select(CAMPOS_COM_SABORES).eq("ativo", true);
    if (destaque) consulta = consulta.eq("destaque", true);
    if (categoria) consulta = consulta.eq("Categoria", categoria);
    const { data, error } = await consulta;
    if (error) throw new Error(error.message);
    return separarSabores((data ?? []) as unknown as ProdutoComSabores[]);
  },
  "vitrine-produtos"
);

const lerRecheiosEmCache = emCacheDaVitrine(async () => consultarRecheios(await clientePublico()), "vitrine-recheios");

// A leitura por slug fica AQUI, no código do site — não existe (e não deve
// ser criada) função de banco pública para isso. Só produto ativo, com o
// filtro na própria consulta E aqui. Vem com as linhas de sabor embutidas
// (só o Cento tem). null = inexistente ou inativo.
const lerProdutoPorSlugEmCache = emCacheDaVitrine(
  async (slug: string): Promise<{ produto: ProdutoVitrine; sabores: LinhaSabor[] } | null> => {
    const { data, error } = await (await clientePublico())
      .from("produtos")
      .select(CAMPOS_COM_SABORES)
      .eq("slug", slug)
      .eq("ativo", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const linha = data as unknown as ProdutoComSabores | null;
    if (linha?.ativo !== true) return null;
    const { produtos, sabores } = separarSabores([linha]);
    return { produto: produtos[0], sabores };
  },
  "vitrine-produto-slug"
);

const lerFotosExtrasEmCache = emCacheDaVitrine(
  async (slug: string) => lerFotosExtras(await clientePublico(), slug),
  "vitrine-fotos-extras"
);

// Uma leitura de recheios por requisição: a interna e "Combina com o seu
// pedido" dividem a mesma.
const recheiosDaRequisicao = cache(() => tentar(lerRecheiosEmCache(), "Falha ao buscar os recheios:"));

// Recheios que valem para os produtos da tela: sem Bolo nem Bento Cake, a
// falha da leitura não importa (lista vazia); com eles, a falha vira null.
function recheiosParaATela(
  produtos: ProdutoVitrine[],
  recheios: RecheioVitrine[] | typeof FALHA
): RecheioVitrine[] | null {
  if (!precisaDeRecheios(produtos)) return [];
  return recheios === FALHA ? null : recheios;
}

// ---- Para quem já tem a lista de produtos em mãos (sem cache) ----

// Centos com ao menos um sabor ativo, entre os produtos recebidos. Cento
// sem sabor ativo é indisponível, como produto inativo (regra em cento.ts).
// Só consulta os sabores quando há Cento na lista. Retorna null em caso de
// erro.
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
// disponível, com o cliente de quem chama: as ofertas do checkout
// (src/lib/checkout/buscar.ts) e o sitemap. Sem cache. null em caso de erro
// em qualquer uma das duas consultas.
export async function dependencias(supabase: Supabase, produtos: ProdutoVitrine[]) {
  const recheiosLidos = async (): Promise<RecheioVitrine[] | null> => {
    if (!precisaDeRecheios(produtos)) return [];
    try {
      return await consultarRecheios(supabase);
    } catch (e) {
      console.error("Falha ao buscar os recheios:", e instanceof Error ? e.message : e);
      return null;
    }
  };
  const [comSabor, recheios] = await Promise.all([centosDisponiveis(supabase, produtos), recheiosLidos()]);
  if (!comSabor || !recheios) return null;
  return { comSabor, recheios };
}

// ---- Vitrine ----

// Produtos da vitrine (com os sabores embutidos) e recheios numa viagem só,
// já sem os indisponíveis e com o "a partir de" do Bolo. null em caso de
// erro (a mensagem do log diz qual leitura).
async function lerVitrine(
  filtro: { destaque?: true; categoria?: CategoriaProduto | null },
  rotulo: string
): Promise<ProdutoVitrine[] | null> {
  const [lidos, recheiosLidos] = await Promise.all([
    tentar(lerProdutosEmCache(filtro.destaque === true, filtro.categoria ?? null), rotulo),
    recheiosDaRequisicao(),
  ]);
  if (lidos === FALHA) return null;
  const recheios = recheiosParaATela(lidos.produtos, recheiosLidos);
  if (!recheios) return null;
  return comPrecoAPartirDe(semIndisponiveis(lidos.produtos, centosComSabor(lidos.sabores), recheios), recheios);
}

// Busca os candidatos a "Os mais pedidos" (ativo + destaque) e aplica a
// regra completa em selecionarMaisPedidos (bebida fora, ordem, limite) —
// a regra fica numa função pura, coberta por teste automatizado.
// Em caso de erro, a seção simplesmente não aparece na Home (decisão do
// Cainan em 06/10/2026: a Home sem a seção pode ficar guardada até 60 s).
export async function buscarMaisPedidos(): Promise<ProdutoVitrine[]> {
  const produtos = await lerVitrine({ destaque: true }, "Falha ao buscar 'Os mais pedidos':");
  return produtos ? selecionarMaisPedidos(produtos) : [];
}

// Busca os produtos da Lista (/produtos) e aplica a regra em montarLista
// (inativo fora, destaques primeiro, ordem alfabética). O filtro de ativo
// fica na consulta E na regra. Cento sem sabor ativo também fica fora.
// Retorna null em caso de erro (a página mostra aviso de falha, não
// "categoria vazia").
export async function buscarLista(categoria: CategoriaProduto | null): Promise<ItemLista[] | null> {
  const produtos = await lerVitrine({ categoria }, "Falha ao buscar a Lista de produtos:");
  return produtos ? montarLista(produtos, categoria) : null;
}

// Formato do slug, igual à restrição produtos_slug_formato do banco.
export const FORMATO_SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;

// Produto ativo pelo slug, ou null quando não há o que mostrar: slug fora
// do formato (nem consulta o banco), inexistente, inativo ou falha do banco.
export async function buscarProdutoPorSlug(slug: string): Promise<ProdutoVitrine | null> {
  if (!FORMATO_SLUG.test(slug)) return null;
  const lido = await tentar(lerProdutoPorSlugEmCache(slug), `Falha ao buscar o produto pelo slug: ${slug}`);
  return lido === FALHA || lido === null ? null : lido.produto;
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
//   nos recheios → "erro" (a página lança erro: o Next mantém a versão
//   anterior, e na primeira geração mostra o error.tsx da interna).
export async function buscarInterna(slug: string): Promise<Interna> {
  if (!FORMATO_SLUG.test(slug)) return { estado: "nao-encontrado" };

  const [lido, extras, recheiosLidos] = await Promise.all([
    tentar(lerProdutoPorSlugEmCache(slug), `Falha ao buscar o produto pelo slug: ${slug}`),
    tentar(lerFotosExtrasEmCache(slug), "Falha ao buscar as fotos extras:"),
    recheiosDaRequisicao(),
  ]);
  if (lido === FALHA) return { estado: "erro" };
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

  const fotos = montarFotos(produto, extras === FALHA ? [] : extras, (url) => url);
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
