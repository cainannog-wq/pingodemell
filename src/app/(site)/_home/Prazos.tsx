import { InfoCard } from "@/components/ds";

// "Combinado desde já" — texto fixo do layout. id="prazos" é o destino do
// link "Prazos" do rodapé. O layout tem textos mais curtos no mobile.
const CARDS = [
  {
    icon: "storefront",
    titulo: "Horário da loja",
    desktop: "Terça a sábado, das 9h às 18h. Domingo, das 9h às 15h. Segunda-feira é o nosso dia de descanso.",
    mobile: "Terça a sábado, 9h às 18h. Domingo, 9h às 15h.",
  },
  {
    icon: "schedule",
    titulo: "1 dia de antecedência",
    desktop: "Para os dias de semana, precisamos do seu pedido com 1 dia de antecedência.",
    mobile: "Dias de semana: peça com 1 dia de antecedência.",
  },
  {
    icon: "event",
    titulo: "Fim de semana até quinta",
    desktop: "Festa no sábado ou domingo? Faça o pedido até quinta-feira e fica tudo tranquilo.",
    mobile: "Festa no sábado ou domingo? Faça o pedido até quinta-feira.",
  },
];

export function Prazos() {
  return (
    <section id="prazos" className="site-section home-prazos" aria-labelledby="home-prazos-titulo">
      <div className="site-container">
        <div className="site-section-head-center">
          <h2 id="home-prazos-titulo">Combinado desde já</h2>
          <p className="home-prazos-lead">
            <span className="site-so-desktop">
              A gente trabalha com esses prazos para o seu pedido sair do jeito que você imaginou. Dá uma olhada antes de
              escolher a data.
            </span>
            <span className="site-so-mobile">
              A gente trabalha com esses prazos para o seu pedido sair do jeito que você imaginou.
            </span>
          </p>
        </div>

        <div className="home-prazos-grid site-so-desktop">
          {CARDS.map((card) => (
            <InfoCard key={card.titulo} icon={card.icon} title={card.titulo}>
              {card.desktop}
            </InfoCard>
          ))}
        </div>
        <div className="home-prazos-grid site-so-mobile">
          {CARDS.map((card) => (
            <InfoCard key={card.titulo} icon={card.icon} title={card.titulo} align="start" compact>
              {card.mobile}
            </InfoCard>
          ))}
        </div>
      </div>
    </section>
  );
}
