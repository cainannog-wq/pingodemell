import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ROTAS } from "@/lib/site/rotas";
import { metadadosIndexaveis } from "@/lib/site/seo";
import { buscarInterna, buscarMaisPedidos } from "@/lib/vitrine/buscar";
import { CorpoDaInterna } from "./_interna/CorpoDaInterna";
import "./interna.css";

type Props = { params: Promise<{ slug: string }> };

// Página inteira em cache, servida pela borda (PR perf/vitrine-consultas-
// cache): cada produto é montado na primeira visita (nenhum no build) e de
// novo a cada 24 horas (PRAZO_VITRINE_SEGUNDOS, src/lib/vitrine/cache.ts; o Next
// exige o número escrito aqui), ou na hora quando o admin salva algo que
// muda a vitrine. Nada aqui lê cookie, sessão nem a busca da URL: o
// ?editar= do carrinho é lido no navegador (ConfigEditavelDaUrl).
export const revalidate = 86400;

export async function generateStaticParams() {
  return [];
}

// Uma busca só por requisição, dividida entre generateMetadata e a página.
const carregar = cache((slug: string) => buscarInterna(slug));

const DESCRICAO_PADRAO =
  "Feito sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const interna = await carregar(slug);
  if (interna.estado === "nao-encontrado") return { title: "Página não encontrada · Pingo de Mell" };
  if (interna.estado === "erro") return { title: "Produto · Pingo de Mell" };
  const { produto } = interna;
  return metadadosIndexaveis({
    titulo: `${produto.nome} · Pingo de Mell`,
    descricao: descricaoDoProduto(produto.descricao),
    // Canonical sem ?editar nem outro parâmetro.
    caminho: ROTAS.produto(produto.slug ?? slug),
    imagem: produto.image_url ?? undefined,
  });
}

// O cadastro grava descrição vazia como "" (não null): vazia ou só com
// espaços usa o texto padrão.
function descricaoDoProduto(descricao: string | null): string {
  return descricao?.trim() ? descricao : DESCRICAO_PADRAO;
}

// Interna do produto (página 3 do site), pelo slug. Produto inexistente,
// inativo, Cento sem sabor ativo ou Bolo sem recheio de Bolo ativo → 404.
// Quem decide a tela é o tipo do produto (variacaoDoProduto): o Cento monta a
// combinação de sabores; o Bolo escolhe tamanho, formato e recheio; o Bento
// Cake com recheios próprios escolhe o recheio e a quantidade (sem recheios
// próprios, vira avulso); o avulso (inclusive o Smash Cake) escolhe a
// quantidade e, se o produto tem recheios personalizados, um recheio.
// Todos gravam no carrinho do navegador ("Adicionar ao pedido") e atualizam
// o contador do cabeçalho. Cento e Bolo também abrem em modo edição, pelo ícone
// de editar do carrinho (?editar={id da linha}, ver ConfigEditavel).
export default async function ProdutoPage({ params }: Props) {
  // "Os mais pedidos" (para "Combina com o seu pedido") sai junto com o
  // produto, na mesma viagem ao banco.
  const [interna, maisPedidos] = await Promise.all([carregar((await params).slug), buscarMaisPedidos()]);
  if (interna.estado === "nao-encontrado") notFound();

  // Falha do banco: lança erro em vez de montar o aviso. Assim a página com
  // falha não é guardada: o Next continua servindo a versão anterior e, se
  // não houver nenhuma, mostra o aviso de falha de error.tsx.
  if (interna.estado === "erro") throw new Error("Falha ao carregar o produto.");

  return <CorpoDaInterna interna={interna} maisPedidos={maisPedidos} />;
}
