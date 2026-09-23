import Image from "next/image";
import { ButtonLink, ProductCard } from "@/components/ds";
import { Carousel } from "@/components/site/Carousel";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";
import { formatarPrecoVitrine, type ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

// Foto do produto, ou o fundo da marca quando o produto ainda não tem foto.
export function FotoProduto({ produto }: { produto: Pick<ProdutoVitrine, "nome" | "image_url"> }) {
  if (produto.image_url) {
    return (
      <Image
        src={produto.image_url}
        alt={`Foto de ${produto.nome}`}
        fill
        sizes="(max-width: 767px) 230px, 285px"
        style={{ objectFit: "cover" }}
      />
    );
  }
  return (
    <div className="home-product-fallback" role="img" aria-label={`${produto.nome}: foto ainda não disponível`}>
      <Hive />
    </div>
  );
}

// "Os mais pedidos". Sem nenhum produto que se encaixe na regra, a seção
// inteira some (sem mensagem de vazio).
export function MaisPedidos({ produtos }: { produtos: ProdutoVitrine[] }) {
  if (produtos.length === 0) return null;

  return (
    <section className="site-section" aria-labelledby="home-mais-titulo">
      <div className="site-container">
        <Carousel
          rotulo="Os mais pedidos"
          cabecalho={
            <div className="site-section-head-text">
              <h2 id="home-mais-titulo">Os mais pedidos</h2>
              <p className="site-section-sub">Os queridinhos da Pingo de Mell.</p>
            </div>
          }
        >
          {produtos.map((produto) => {
            const href = ROTAS.produto(produto.id);
            const tituloId = `produto-${produto.id}`;
            return (
              <ProductCard
                key={produto.id}
                href={href}
                title={produto.nome}
                titleId={tituloId}
                description={produto.descricao}
                media={<FotoProduto produto={produto} />}
              >
                <span className="home-price">{formatarPrecoVitrine(produto)}</span>
                {/* Leva à interna do produto; nada é adicionado ao carrinho
                    nesta entrega. */}
                <ButtonLink
                  href={href}
                  variant="primary"
                  size="sm"
                  fullWidth
                  iconLeft="add"
                  aria-describedby={tituloId}
                  className="home-card-btn"
                >
                  <span className="site-so-desktop">Adicionar ao pedido</span>
                  <span className="site-so-mobile">Adicionar</span>
                </ButtonLink>
              </ProductCard>
            );
          })}
        </Carousel>
      </div>
    </section>
  );
}
