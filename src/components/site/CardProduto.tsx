import Image from "next/image";
import { Badge, ButtonLink, ProductCard } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";
import { formatarPrecoVitrine, type ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

// Card de produto do site público, igual na Home ("Os mais pedidos") e na
// Lista: foto (ou fundo da marca), nome, descrição curta, preço e botão.
// Card inteiro e botão levam à interna do produto pelo id; nada vai para o
// carrinho nesta entrega. As classes home-* vêm da Home e continuam com o
// mesmo nome pra Home não mudar.

// Foto do produto, ou o fundo da marca quando o produto ainda não tem foto.
// next/image carrega a foto só quando ela chega perto da tela
// (loading="lazy" é o padrão dele).
export function FotoProduto({
  produto,
  sizes,
}: {
  produto: Pick<ProdutoVitrine, "nome" | "image_url">;
  sizes: string;
}) {
  if (produto.image_url) {
    return <Image src={produto.image_url} alt={`Foto de ${produto.nome}`} fill sizes={sizes} style={{ objectFit: "cover" }} />;
  }
  return (
    <div className="home-product-fallback" role="img" aria-label={`${produto.nome}: foto ainda não disponível`}>
      <Hive />
    </div>
  );
}

// maisPedido: selo "Mais pedido" sobre a foto (bloco de destaques da
// Lista). É texto de verdade, lido pelo leitor de tela junto com o nome.
export function CardProduto({
  produto,
  sizes,
  maisPedido = false,
}: {
  produto: ProdutoVitrine;
  sizes: string;
  maisPedido?: boolean;
}) {
  const href = ROTAS.produto(produto.id);
  const tituloId = `produto-${produto.id}`;
  return (
    <ProductCard
      href={href}
      title={produto.nome}
      titleId={tituloId}
      description={produto.descricao}
      media={
        <>
          <FotoProduto produto={produto} sizes={sizes} />
          {maisPedido ? (
            <Badge variant="gold" className="site-selo-foto" style={{ textTransform: "none", letterSpacing: "normal" }}>
              Mais pedido
            </Badge>
          ) : null}
        </>
      }
    >
      <span className="home-price">{formatarPrecoVitrine(produto)}</span>
      {/* Leva à interna do produto; nada é adicionado ao carrinho nesta
          entrega. */}
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
}
