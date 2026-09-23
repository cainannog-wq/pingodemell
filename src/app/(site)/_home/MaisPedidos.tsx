import { CardProduto } from "@/components/site/CardProduto";
import { Carousel } from "@/components/site/Carousel";
import type { ProdutoVitrine } from "@/lib/vitrine/mais-pedidos";

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
          {produtos.map((produto) => (
            <CardProduto key={produto.id} produto={produto} sizes="(max-width: 767px) 230px, 285px" />
          ))}
        </Carousel>
      </div>
    </section>
  );
}
