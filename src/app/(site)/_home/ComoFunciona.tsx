import { Icon } from "@/components/ds";
import { Hive } from "@/components/site/Hive";

// "Como funciona o seu pedido" — texto fixo do layout (o mobile tem
// versões mais curtas de cada passo).
const PASSOS = [
  {
    titulo: "Escolha os itens",
    desktop: "Navegue pelo catálogo e vá adicionando ao pedido, com sabores e quantidades.",
    mobile: "Sabores e quantidades, direto no catálogo.",
  },
  {
    titulo: "Informe data e detalhes",
    desktop: "Data do evento, retirada ou entrega, tema e cores. Só uma vez, sem repetir depois.",
    mobile: "Data, retirada ou entrega, tema e cores.",
  },
  {
    titulo: "Envie pelo WhatsApp",
    desktop: "O site monta a mensagem já formatada. Você confere e toca em enviar.",
    mobile: "A mensagem já sai formatada. Você só toca em enviar.",
  },
  {
    titulo: "Receba a confirmação",
    desktop: "Conferimos tudo, enviamos o orçamento do que é personalizado e a chave Pix do sinal.",
    mobile: "Enviamos o orçamento do que é personalizado e a chave Pix do sinal.",
  },
];

export function ComoFunciona() {
  return (
    <section className="home-como site-on-dark" aria-labelledby="home-como-titulo">
      <Hive />
      <div className="site-container home-como-inner">
        <div className="home-como-head">
          <span className="home-kicker">Encomendas</span>
          <h2 id="home-como-titulo">Como funciona o seu pedido</h2>
          <p className="home-como-lead site-so-desktop">
            Quatro passos. O último acontece no WhatsApp, com uma pessoa da nossa equipe.
          </p>
        </div>

        <ol className="home-steps">
          {PASSOS.map((passo, i) => (
            <li key={passo.titulo} className="home-step">
              <span className="home-step-num" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <h3>
                  <span className="site-visually-hidden">Passo {i + 1}: </span>
                  {passo.titulo}
                </h3>
                <p>
                  <span className="site-so-desktop">{passo.desktop}</span>
                  <span className="site-so-mobile">{passo.mobile}</span>
                </p>
              </div>
            </li>
          ))}
        </ol>

        <div className="home-pay">
          <Icon name="payments" size={32} color="var(--brown-700)" />
          <p>
            <strong>Reserve pelo site</strong> e combine o pagamento no WhatsApp.
          </p>
        </div>
      </div>
    </section>
  );
}
