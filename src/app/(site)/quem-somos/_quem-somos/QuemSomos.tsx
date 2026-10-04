import Image from "next/image";
import { Badge, Icon, InfoCard } from "@/components/ds";
import type { IconeNome } from "@/lib/icones";
import { Hive } from "@/components/site/Hive";
import { LOJA, urlInstagram } from "@/lib/site/config";
import { LINK_WHATSAPP_SEM_MENSAGEM } from "@/lib/site/whatsapp";
import { MapaIlustrado } from "./MapaIlustrado";

// Quem Somos (página 7 do handoff). Texto e foto são os do handoff, trazidos
// da loja pelo Cainan: entram como estão, só sem hífen nem travessão. O
// layout tem versão desktop e mobile de alguns textos; as duas ficam no
// HTML e a inativa some com display:none (.site-so-desktop/.site-so-mobile).
// Endereço, horário, telefone e Instagram vêm de LOJA, nunca escritos aqui.

export const FRASE_TOPO =
  "Uma confeitaria de família em Fazenda Rio Grande, feita de encomendas, festas e gente que volta.";

const HISTORIA_DESKTOP = [
  "Quem começou tudo foi a Taami, em 2009, em casa, com receitas de família e uma bancada pequena. De lá para cá crescemos com o bairro, aprendemos com cada festa e hoje atendemos Fazenda Rio Grande com bolos, salgados, doces tradicionais, personalizados e finos.",
  "O que não mudou foi o cuidado. Cada pedido ainda passa pela mão da Taami e da equipe, um por um.",
];
const HISTORIA_MOBILE =
  "Quem começou tudo foi a Taami, em 2009, em casa, com receitas de família. Hoje atendemos Fazenda Rio Grande com bolos, salgados, doces tradicionais, personalizados e finos. O cuidado é o que não mudou.";

const VALORES: { icone: IconeNome; titulo: string; desktop: string; mobile: string }[] = [
  {
    icone: "favorite",
    titulo: "Cuidado",
    desktop: "Massa, recheio e acabamento feitos no dia, do jeito que a gente serviria em casa.",
    mobile: "Massa, recheio e acabamento feitos no dia.",
  },
  {
    icone: "celebration",
    titulo: "Afeto",
    desktop: "A gente pergunta o tema, as cores e a idade porque cada festa tem uma história.",
    mobile: "Tema, cores e idade: cada festa tem uma história.",
  },
  {
    icone: "check",
    titulo: "Qualidade",
    desktop: "Prazos combinados e cumpridos. Nada sai daqui sem passar pela nossa conferência.",
    mobile: "Prazos combinados e cumpridos, com conferência item por item.",
  },
];

function NovaAba() {
  return (
    <>
      <Icon name="open_in_new" size={16} color="var(--gold-400)" />
      <span className="site-visually-hidden"> (abre em nova aba)</span>
    </>
  );
}

export function QuemSomos() {
  return (
    <>
      <section className="qs-hero">
        <Hive />
        <div className="site-container qs-hero-inner">
          <p className="qs-kicker">Sobre nós</p>
          <h1>Somos a Pingo de Mell</h1>
          <p className="qs-lead">{FRASE_TOPO}</p>
        </div>
      </section>

      <section className="qs-historia" aria-labelledby="qs-historia-titulo">
        <div className="site-container qs-historia-inner">
          <figure className="qs-foto">
            <Image
              src="/fotos/taami-yaguiu.jpeg"
              alt="Taami Yaguiu na loja da Pingo de Mell"
              width={1200}
              height={960}
              sizes="(max-width: 767px) 100vw, 520px"
              preload
            />
            <figcaption>
              <span className="qs-foto-nome">Taami Yaguiu</span>
              <span className="qs-foto-papel">Proprietária e confeiteira da Pingo de Mell</span>
            </figcaption>
            <Badge variant="gold" shape="round" className="qs-selo site-so-desktop" aria-hidden="true">
              <Icon name="hive" size={28} tone="inherit" />
            </Badge>
          </figure>

          <div className="qs-historia-texto">
            <h2 id="qs-historia-titulo">Desde 2009, um pedido por vez</h2>
            <div className="qs-paragrafos site-so-desktop">
              {HISTORIA_DESKTOP.map((p) => (
                <p key={p}>{p}</p>
              ))}
            </div>
            <div className="qs-paragrafos site-so-mobile">
              <p>{HISTORIA_MOBILE}</p>
            </div>
            <blockquote className="qs-citacao">
              <p>Para nós nunca é só mais um evento. É sempre uma história a ser contada e um sonho a ser realizado.</p>
            </blockquote>
          </div>
        </div>
      </section>

      <section className="qs-valores" aria-labelledby="qs-valores-titulo">
        <div className="site-container">
          <h2 id="qs-valores-titulo">O que a gente cuida em cada pedido</h2>
          <ul className="qs-valores-lista">
            {VALORES.map((v) => (
              <li key={v.titulo}>
                <div className="site-so-desktop">
                  <InfoCard icon={v.icone} title={v.titulo} style={{ height: "100%" }}>
                    {v.desktop}
                  </InfoCard>
                </div>
                <div className="site-so-mobile">
                  <InfoCard icon={v.icone} title={v.titulo} align="start" compact>
                    {v.mobile}
                  </InfoCard>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="contato" className="qs-contato" aria-labelledby="qs-contato-titulo">
        <div className="site-container qs-contato-inner">
          <p className="qs-kicker qs-area-kicker">Contato</p>
          <h2 id="qs-contato-titulo" className="qs-area-titulo">
            Venha nos visitar
          </h2>

          <ul className="qs-contato-lista qs-area-lista">
            <li className="qs-contato-item">
              <Icon name="location_on" size={26} tone="accent" />
              <p>
                {LOJA.enderecoCurto}
                <br />
                {LOJA.cidade}
              </p>
            </li>
            <li className="qs-contato-item">
              <Icon name="schedule" size={26} tone="accent" />
              <p>
                {LOJA.horario}
                <span className="site-so-desktop">
                  <br />
                  <span className="qs-fechado">{LOJA.diaFechado}</span>
                </span>
                <span className="site-so-mobile"> · {LOJA.diaFechado}</span>
              </p>
            </li>
            <li>
              <a
                className="qs-contato-item qs-contato-whatsapp"
                href={LINK_WHATSAPP_SEM_MENSAGEM}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Icon name="chat" size={26} tone="accent" />
                <span>
                  <span className="site-visually-hidden">WhatsApp</span> {LOJA.telefone}
                </span>
                <NovaAba />
              </a>
            </li>
          </ul>

          <div className="qs-botoes qs-area-botoes">
            <a className="qs-botao" href={LOJA.mapsUrl} target="_blank" rel="noopener noreferrer">
              <Icon name="location_on" size={20} color="var(--gold-500)" />
              Abrir no Google Maps
              <NovaAba />
            </a>
            <a className="qs-botao" href={urlInstagram()} target="_blank" rel="noopener noreferrer">
              <Image src="/icons/instagram.webp" alt="" width={22} height={22} className="qs-botao-instagram" />
              <span className="site-so-desktop">Seguir no Instagram</span>
              <span className="site-so-mobile">Instagram</span>
              <NovaAba />
            </a>
          </div>

          <div className="qs-area-mapa">
            <MapaIlustrado />
          </div>
        </div>
      </section>
    </>
  );
}
