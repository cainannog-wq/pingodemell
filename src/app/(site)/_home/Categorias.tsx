import Image from "next/image";
import Link from "next/link";
import { TextLink } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
import { TILES_CATEGORIA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";

// "O que você vai encontrar": as 4 categorias do CMS (não as 5 do layout).
// Foto de cada tile vem de TILES_CATEGORIA (config única); sem foto, o
// tile usa o fundo da marca.
export function Categorias() {
  return (
    <section className="site-section site-band" aria-labelledby="home-cats-titulo">
      <div className="site-container">
        <div className="site-section-head">
          <div className="site-section-head-text">
            <h2 id="home-cats-titulo">O que você vai encontrar</h2>
            <p className="site-section-sub">
              <span className="site-so-desktop">Bolos, salgados, doces e kits festa, todos feitos sob encomenda.</span>
              <span className="site-so-mobile">Bolos, salgados, doces e kits festa, todos sob encomenda.</span>
            </p>
          </div>
          <TextLink href={ROTAS.lista} icon="arrow_forward" style={{ flex: "none" }}>
            Ver o catálogo completo
          </TextLink>
        </div>

        <ul className="home-cats" role="list" style={{ listStyle: "none", padding: 0, margin: 0 }}>
          {TILES_CATEGORIA.map((tile) => (
            <li key={tile.categoria}>
              <Link href={ROTAS.listaPorCategoria(tile.categoria)} className="home-cat">
                {tile.imagem ? (
                  <Image src={tile.imagem} alt={tile.alt} fill sizes="(max-width: 767px) 50vw, 285px" />
                ) : (
                  <Hive />
                )}
                <span className="home-cat-shade" aria-hidden="true" />
                <span className="home-cat-label">{tile.rotulo}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
