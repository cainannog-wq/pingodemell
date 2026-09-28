import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";
import { Badge, Icon } from "@/components/ds";
import { CardProduto, PrecoProduto } from "@/components/site/CardProduto";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { buscarInterna, buscarRelacionados } from "@/lib/vitrine/buscar";
import { UNIDADES_POR_CENTO } from "@/lib/vitrine/cento";
import { ehMaisPedido } from "@/lib/vitrine/mais-pedidos";
import { textoMinimo } from "@/lib/vitrine/minimo";
import { ConfigAvulso } from "./_interna/ConfigAvulso";
import { ConfigCento } from "./_interna/ConfigCento";
import { Galeria } from "./_interna/Galeria";
import "./interna.css";

type Props = { params: Promise<{ slug: string }> };

// Uma busca só por requisição, dividida entre generateMetadata e a página.
const carregar = cache((slug: string) => buscarInterna(slug));

const DESCRICAO_PADRAO =
  "Feito sob encomenda pela Pingo de Mell. Escolha, monte o pedido e a gente combina o resto no WhatsApp.";

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const interna = await carregar((await params).slug);
  if (interna.estado === "nao-encontrado") return { title: "Página não encontrada · Pingo de Mell" };
  if (interna.estado === "erro") return { title: "Produto · Pingo de Mell" };
  return {
    title: `${interna.produto.nome} · Pingo de Mell`,
    description: interna.produto.descricao ?? DESCRICAO_PADRAO,
  };
}

// Interna do produto (página 3 do site), pelo slug. Produto inexistente,
// inativo ou Cento sem sabor ativo → 404. O Cento monta a combinação de
// sabores; o avulso escolhe a quantidade. Os dois gravam no carrinho do
// navegador ("Adicionar ao pedido") e atualizam o contador do cabeçalho.
export default async function ProdutoPage({ params }: Props) {
  const interna = await carregar((await params).slug);
  if (interna.estado === "nao-encontrado") notFound();

  if (interna.estado === "erro") {
    return (
      <div className="site-container interna-falha">
        <div className="lista-aviso">
          <Icon name="error" size={28} tone="accent" />
          <p>Não conseguimos carregar este produto agora. Tente de novo em alguns instantes.</p>
        </div>
      </div>
    );
  }

  const { produto, sabores, fotos } = interna;
  const relacionados = await buscarRelacionados(produto.id);
  const cento = produto.tipo === "cento";
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

          {cento ? <ConfigCento produto={produto} sabores={sabores} /> : <ConfigAvulso produto={produto} />}

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
