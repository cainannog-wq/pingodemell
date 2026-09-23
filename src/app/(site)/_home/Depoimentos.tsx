import { Icon } from "@/components/ds";
import { LOJA } from "@/lib/site/config";

// Avaliações reais do Google, copiadas literalmente do layout (sem
// corrigir digitação). Sem data relativa ("7 meses atrás"): texto fixo
// com data relativa envelhece errado — fica só "Avaliação no Google".
const DEPOIMENTOS = [
  {
    autor: "Michelle Pivatelli",
    texto:
      "Parabéns pelo trabalho maravilhoso de vcs, o bolo que encomendei ficou idêntico da foto que tirei de referência, e o sabor de ninho com morango é impecável nada enjoativo, simplesmente maravilho, super recomendo, e sempre que precisar estarei fazendo encomendas. Obrigada Verediana pelo excelente atendimento e paciência 🩷",
  },
  {
    autor: "juliane cunha dos santos",
    texto:
      "Realizei a encomenda de um kit festa para meu aniversário e realmente o mesmo estava excepcional. O bolo estava maravilhoso,assim como os salgados e os docinhos Recomendo muito este serviço, tanto que já encomendei novamente para o aniversário do meu neto.",
  },
  {
    autor: "Fabrício Cordeiro",
    texto:
      "Super Recomendo a PINGO DE MELL um capricho incomparável, os salgados e doces e bolos são feito de forma artesanal em uma delicadeza praticamente uma obra de arte, fora o atendimento da Veridianna muito solicita e educada sempre se colocando para tirar todas as dúvidas..SUPER RECOMENDO AMEI TUDO...",
  },
];

export function Depoimentos() {
  return (
    <section className="site-section site-band" aria-labelledby="home-depo-titulo">
      <div className="site-container">
        <div className="site-section-head-center">
          <h2 id="home-depo-titulo">Quem já comemorou com a gente</h2>
        </div>

        <div className="home-reviews" role="region" aria-label="Avaliações de clientes" tabIndex={0}>
          {DEPOIMENTOS.map((d) => (
            <figure key={d.autor} className="home-review">
              <div className="home-review-stars" role="img" aria-label="5 de 5 estrelas">
                {Array.from({ length: 5 }, (_, i) => (
                  <Icon key={i} name="star" size={20} color="var(--gold-400)" />
                ))}
              </div>
              <blockquote>{d.texto}</blockquote>
              <figcaption>
                <span className="home-review-avatar" aria-hidden="true">
                  {d.autor.charAt(0).toUpperCase()}
                </span>
                <span style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                  <span className="home-review-name">{d.autor}</span>
                  <span className="home-review-source">Avaliação no Google</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>

        <div className="home-reviews-cta">
          <a className="home-reviews-link" href={LOJA.avaliacoesGoogleUrl} target="_blank" rel="noopener noreferrer">
            Ver todas as avaliações
            <Icon name="open_in_new" size={20} color="var(--gold-500)" />
            <span className="site-visually-hidden"> (abre em nova aba)</span>
          </a>
        </div>
      </div>
    </section>
  );
}
