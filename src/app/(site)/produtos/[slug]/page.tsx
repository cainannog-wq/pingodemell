import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, cache } from "react";
import { Badge, Icon } from "@/components/ds";
import { CardProduto, PrecoProduto } from "@/components/site/CardProduto";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { metadadosIndexaveis } from "@/lib/site/seo";
import { buscarInterna, buscarMaisPedidos } from "@/lib/vitrine/buscar";
import { UNIDADES_POR_CENTO } from "@/lib/vitrine/cento";
import { ehMaisPedido, selecionarRelacionados } from "@/lib/vitrine/mais-pedidos";
import { textoMinimo } from "@/lib/vitrine/minimo";
import { variacaoDoProduto } from "@/lib/vitrine/variacao";
import { ConfigAvulso } from "./_interna/ConfigAvulso";
import { ConfigBento } from "./_interna/ConfigBento";
import { ConfigEditavel } from "./_interna/ConfigEditavel";
import { ConfigEditavelDaUrl } from "./_interna/ConfigEditavelDaUrl";
import { Galeria } from "./_interna/Galeria";
import "./interna.css";

type Props = { params: Promise<{ slug: string }> };

// Página inteira em cache, servida pela borda (PR perf/vitrine-consultas-
// cache): cada produto é montado na primeira visita (nenhum no build) e de
// novo a cada 1 hora (PRAZO_VITRINE_SEGUNDOS, src/lib/vitrine/cache.ts; o Next
// exige o número escrito aqui), ou na hora quando o admin salva algo que
// muda a vitrine. Nada aqui lê cookie, sessão nem a busca da URL: o
// ?editar= do carrinho é lido no navegador (ConfigEditavelDaUrl).
export const revalidate = 3600;

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
// inativo, Cento sem sabor ativo, Bolo sem recheio de Bolo ativo ou Bento
// Cake sem recheio de Bento ativo → 404. Quem decide a tela é o tipo do
// produto (variacaoDoProduto): o Cento monta a combinação de sabores; o
// Bolo escolhe tamanho, formato e recheio; o Bento Cake escolhe o recheio e
// a quantidade; o avulso (inclusive o Smash Cake) escolhe a quantidade.
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

  const { produto, sabores, recheios, fotos } = interna;
  const relacionados = selecionarRelacionados(maisPedidos, produto.id);
  const variacao = variacaoDoProduto(produto);
  const cento = variacao === "cento";
  const minimo = textoMinimo(produto);

  return (
    <div className="interna">
      <nav className="site-container interna-trilha" aria-label="Você está em">
        <ol>
          <li>
            <Link href={ROTAS.lista}>Produtos</Link>
          </li>
          {produto.Categoria ? (
            <li>
              <Icon name="chevron_right" size={16} color="var(--brown-300)" />
              <Link href={ROTAS.listaPorCategoria(produto.Categoria)}>{produto.Categoria}</Link>
            </li>
          ) : null}
          <li>
            <Icon name="chevron_right" size={16} color="var(--brown-300)" />
            <span aria-current="page">{produto.nome}</span>
          </li>
        </ol>
      </nav>

      <section className="site-container interna-corpo" aria-labelledby="interna-titulo">
        <Galeria fotos={fotos} nome={produto.nome} />

        <div className="interna-config">
          <div className="interna-cabeca">
            {produto.Categoria || ehMaisPedido(produto) ? (
              <div className="interna-selos">
                {produto.Categoria ? <Badge variant="soft">{produto.Categoria}</Badge> : null}
                {ehMaisPedido(produto) ? (
                  <Badge variant="gold" style={{ textTransform: "none", letterSpacing: "normal" }}>
                    Mais pedido
                  </Badge>
                ) : null}
              </div>
            ) : null}
            <h1 id="interna-titulo">{produto.nome}</h1>
            {produto.descricao ? <p className="interna-descricao">{produto.descricao}</p> : null}
            <div className="interna-preco">
              <PrecoProduto produto={produto} />
            </div>
            {cento ? (
              <p className="interna-minimo">
                <Icon name="inventory_2" size={20} color="var(--brown-700)" />
                Cada cento: {UNIDADES_POR_CENTO} unidades
              </p>
            ) : minimo ? (
              <p className="interna-minimo">
                <Icon name="inventory_2" size={20} color="var(--brown-700)" />
                {minimo}
              </p>
            ) : null}
          </div>

          <div className="interna-divisor" />

          {variacao === "cento" ? (
            // Sem o JavaScript (HTML guardado), a configuração comum; no
            // navegador, ConfigEditavelDaUrl lê o ?editar= e entra no modo
            // edição quando ele existe.
            <Suspense fallback={<ConfigEditavel tipo="cento" produto={produto} sabores={sabores} editarId={null} />}>
              <ConfigEditavelDaUrl tipo="cento" produto={produto} sabores={sabores} />
            </Suspense>
          ) : variacao === "bolo" ? (
            <Suspense fallback={<ConfigEditavel tipo="bolo" produto={produto} recheios={recheios} editarId={null} />}>
              <ConfigEditavelDaUrl tipo="bolo" produto={produto} recheios={recheios} />
            </Suspense>
          ) : variacao === "bento" ? (
            <ConfigBento produto={produto} recheios={recheios} />
          ) : (
            <ConfigAvulso produto={produto} />
          )}

          <div className="interna-prazo">
            <h2 className="interna-prazo-titulo">Prazo e como receber</h2>
            <p>
              <Icon name="schedule" size={22} color="var(--brown-700)" />
              <span>Dias de semana: 1 dia de antecedência. Fins de semana: pedidos até quinta-feira.</span>
            </p>
            <p>
              <Icon name="storefront" size={22} color="var(--brown-700)" />
              <span>
                Retirada na loja: {LOJA.enderecoCurto} · {LOJA.horario.toLowerCase()}.
              </span>
            </p>
            <p>
              <Icon name="local_shipping" size={22} color="var(--brown-700)" />
              <span>Entrega em Fazenda Rio Grande com acréscimo a combinar no WhatsApp.</span>
            </p>
          </div>
        </div>
      </section>

      {relacionados.length > 0 ? (
        <section className="interna-relacionados" aria-labelledby="interna-relacionados-titulo">
          <div className="site-container">
            <h2 id="interna-relacionados-titulo">Combina com o seu pedido</h2>
            <ul className="interna-relacionados-grade" role="list">
              {relacionados.map((p) => (
                <li key={p.id}>
                  <CardProduto produto={p} sizes="(max-width: 767px) 230px, 384px" />
                </li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}
    </div>
  );
}
