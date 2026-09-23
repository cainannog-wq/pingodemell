import Image from "next/image";
import { Badge, Button, ButtonLink } from "@/components/ds";
import { Hive } from "@/components/site/Hive";
import { ROTAS } from "@/lib/site/rotas";
import { LINK_WHATSAPP_CONTATO } from "@/lib/site/whatsapp";

export function Hero() {
  return (
    <section className="home-hero">
      <Hive />
      <div className="site-container home-hero-grid">
        <div className="home-hero-text">
          <Badge variant="soft" className="home-hero-badge">
            <span className="site-so-desktop">Desde 2009 em Fazenda Rio Grande</span>
            <span className="site-so-mobile">Desde 2009</span>
          </Badge>
          <h1>Toda festa é uma história</h1>
          <p className="home-hero-lead">
            <span className="site-so-desktop">
              Bolos, salgados, doces e kits festa feitos sob encomenda, com o mesmo cuidado desde o primeiro pedido.
              Você monta tudo aqui e a gente combina o resto pelo WhatsApp.
            </span>
            <span className="site-so-mobile">
              Bolos, salgados, doces e kits festa feitos sob encomenda em Fazenda Rio Grande.
            </span>
          </p>
          <div className="home-hero-ctas">
            <ButtonLink href={ROTAS.lista} variant="primary" size="lg" iconRight="arrow_forward" className="home-hero-btn">
              Quero encomendar
            </ButtonLink>
            <Button
              as="a"
              href={LINK_WHATSAPP_CONTATO}
              target="_blank"
              rel="noopener noreferrer"
              variant="secondary"
              size="lg"
              iconLeft="whatsapp"
              className="home-hero-btn"
            >
              Peça pelo WhatsApp
            </Button>
          </div>
          <p className="home-hero-note">
            <span className="site-so-desktop">
              Dias de semana: pedidos com 1 dia de antecedência. Fins de semana: pedidos até quinta-feira.
            </span>
            <span className="site-so-mobile">1 dia de antecedência · fim de semana, até quinta.</span>
          </p>
        </div>

        <div className="home-hero-media">
          <div className="home-hero-photo">
            <Image
              src="/fotos/hero-principal.jpeg"
              alt="Bolo de KitKat com morangos e brigadeiros"
              fill
              sizes="(max-width: 767px) 100vw, 568px"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <div className="home-hero-inset">
            <Image
              src="/fotos/hero-principal-2.jpeg"
              alt="Brigadeiros gourmet em forminhas rosa"
              fill
              sizes="190px"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
