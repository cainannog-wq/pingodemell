"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type RefObject } from "react";
import { Badge, Button, ButtonLink, Icon, TextLink, WhatsAppMark } from "@/components/ds";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import { CopiarMensagem } from "@/components/site/CopiarMensagem";
import { Hive } from "@/components/site/Hive";
import { useMontado } from "@/components/site/useMontado";
import { apagarRascunho } from "@/lib/checkout/rascunho";
import { formatMoeda } from "@/lib/pedidos/format";
import { TEXTO_ENTREGA_DECORACAO } from "@/lib/pedidos/mensagem";
import { apagarRetrato, lerRetrato, salvarRetrato, trocarChaveIdempotencia, type Retrato } from "@/lib/pedidos/retrato";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { LINK_WHATSAPP_GERAL, atributosWhatsApp, linkWhatsApp } from "@/lib/site/whatsapp";
import { enviarEvento } from "@/lib/analitica/gtag";
import { TEXTO_DECORACAO } from "@/lib/vitrine/bolo";

// Tela de confirmação (PR confirmacao-e-gravacao). Três situações:
// - registrado: o servidor gravou; mostra o número e o botão do WhatsApp;
// - sem registro: a gravação está desligada (409); nada foi gravado. O
//   carrinho e o rascunho só são apagados depois do clique no WhatsApp;
// - sem retrato (outro aparelho, aba privada, dados limpos): tela neutra,
//   sem dado pessoal e sem consulta ao banco.
// Não diz "pedido confirmado": o pedido só vale quando a equipe responde
// pelo WhatsApp. Nenhum texto promete prazo de resposta.
//
// O WhatsApp abre só pelo clique real no link (nova aba). Nada de
// redirecionamento automático nem window.open depois de chamada assíncrona.

type RefTitulo = RefObject<HTMLHeadingElement | null>;

export function Confirmacao() {
  const montado = useMontado();
  if (!montado) return <div className="confirmacao" aria-busy="true" />;
  return <ConfirmacaoMontada />;
}

function ConfirmacaoMontada() {
  const [retrato, setRetrato] = useState<Retrato | null>(() => lerRetrato());
  const titulo = useRef<HTMLHeadingElement>(null);

  // Foco no título ao entrar (o leitor de tela anuncia a página nova).
  useEffect(() => {
    titulo.current?.focus();
  }, []);

  if (!retrato) return <SemRetrato titulo={titulo} />;
  return <ComRetrato retrato={retrato} titulo={titulo} aoMudar={setRetrato} />;
}

function SemRetrato({ titulo }: { titulo: RefTitulo }) {
  return (
    <div className="confirmacao">
      <section className="confirmacao-topo">
        <Hive />
        <div className="site-container confirmacao-topo-inner">
          <h1 ref={titulo} tabIndex={-1}>
            Nenhum pedido recente
          </h1>
          <p>
            Não encontramos um pedido recente neste aparelho. Se você chegou a enviar, o pedido foi registrado. Chame a
            gente no WhatsApp com o seu nome.
          </p>
          <div className="confirmacao-neutra-acoes">
            <ButtonLink {...atributosWhatsApp("confirmacao_sem_retrato", LINK_WHATSAPP_GERAL)} variant="whatsapp" size="lg" iconLeft="whatsapp">
              Falar com a gente no WhatsApp
              <span className="site-visually-hidden"> (abre em nova aba)</span>
            </ButtonLink>
            <TextLink href={ROTAS.lista}>Ver o catálogo</TextLink>
          </div>
        </div>
      </section>
    </div>
  );
}

function ComRetrato({ retrato, titulo, aoMudar }: { retrato: Retrato; titulo: RefTitulo; aoMudar: (r: Retrato) => void }) {
  const router = useRouter();
  const { limpar } = useCarrinho();
  const registrado = retrato.modo === "registrado";
  const url = linkWhatsApp(retrato.mensagem);

  // GA4 (PR 2 da Fase 4): confirmacao_exibida uma vez por pedido. A marca
  // fica no próprio retrato (recarregar não repete) e só é gravada quando o
  // evento sai (sem aceite, nada sai e nada é marcado).
  const exibidaMedida = useRef(false);
  useEffect(() => {
    if (exibidaMedida.current) return;
    exibidaMedida.current = true;
    const atual = lerRetrato() ?? retrato;
    if (atual.medido?.exibida) return;
    if (!enviarEvento("confirmacao_exibida")) return;
    const marcado = { ...atual, medido: { exibida: true, enviado: atual.medido?.enviado ?? false } };
    salvarRetrato(marcado);
    aoMudar(marcado);
  }, [retrato, aoMudar]);

  // Clique no botão final (nova aba, síncrono, sem esperar nada):
  // - pedido_enviado uma vez por pedido (marca no retrato; o whatsapp_clique
  //   sai junto, pela origem do link, e os dois não se somam);
  // - sem registro: o pedido "sai" aqui. Esvazia o carrinho, apaga o
  //   rascunho e troca a chave (o próximo pedido é outro).
  function aoAbrirWhatsApp() {
    let atualizado = lerRetrato() ?? retrato;
    let mudou = false;
    if (!atualizado.medido?.enviado && enviarEvento("pedido_enviado")) {
      atualizado = { ...atualizado, medido: { exibida: atualizado.medido?.exibida ?? false, enviado: true } };
      mudou = true;
    }
    if (atualizado.pendenteEsvaziar) {
      mudou = true;
      limpar();
      apagarRascunho();
      trocarChaveIdempotencia();
      atualizado = { ...atualizado, pendenteEsvaziar: false };
    }
    if (!mudou) return;
    salvarRetrato(atualizado);
    aoMudar(atualizado);
  }

  function novoPedido() {
    apagarRetrato();
    router.push(ROTAS.lista);
  }

  return (
    <div className="confirmacao">
      <section className="confirmacao-topo">
        <Hive />
        <div className="site-container confirmacao-topo-inner">
          <Badge variant="soft">{registrado ? `Pedido nº ${retrato.numero} · registrado, falta enviar` : "Falta enviar"}</Badge>
          <h1 ref={titulo} tabIndex={-1}>
            Falta só enviar
          </h1>
          <p>
            {registrado
              ? "Seu pedido foi registrado no site. Agora envie a mensagem pelo WhatsApp: o pedido só vale depois que a nossa equipe responder por lá."
              : "Envie o pedido pelo WhatsApp. Ele só vale depois que a nossa equipe responder por lá."}
          </p>
        </div>
      </section>

      <div className="site-container confirmacao-corpo">
        <div className="confirmacao-principal">
          <section className="confirmacao-acoes" aria-label="Enviar o pedido">
            <a className="confirmacao-whatsapp" {...atributosWhatsApp("confirmacao", url)} onClick={aoAbrirWhatsApp}>
              <WhatsAppMark size={26} />
              Enviar pelo WhatsApp
              <span className="site-visually-hidden"> (abre em nova aba)</span>
            </a>
            <p className="confirmacao-nota">O WhatsApp abre em nova aba com a mensagem pronta. É só tocar em enviar.</p>
            <p className="confirmacao-nota">
              Ao enviar, seus dados vão para o WhatsApp da loja. Veja a <TextLink href={ROTAS.privacidade}>Política de Privacidade</TextLink>.
            </p>
            <CopiarMensagem
              texto={retrato.mensagem}
              destaque={!retrato.cabe}
              instrucao={retrato.cabe ? undefined : "Se a mensagem não aparecer no WhatsApp, copie e cole na conversa."}
            />
          </section>

          <section className="confirmacao-resumo" aria-labelledby="confirmacao-resumo-titulo">
            <h2 id="confirmacao-resumo-titulo">Resumo do pedido</h2>
            <ul className="confirmacao-itens">
              {retrato.linhas.map((l, i) => (
                <li key={i}>
                  <div>
                    <p className="confirmacao-item-nome">{l.nome}</p>
                    <p className="confirmacao-item-detalhe">
                      {l.quantidade}
                      {l.detalhe ? `, ${l.detalhe}` : ""}
                    </p>
                    {l.observacao ? <p className="confirmacao-item-detalhe">Obs.: {l.observacao}</p> : null}
                  </div>
                  <span className="confirmacao-item-valor">{formatMoeda(l.valor_centavos / 100)}</span>
                </li>
              ))}
            </ul>
            <div className="confirmacao-total">
              <span>Total dos itens</span>
              <strong>{formatMoeda(retrato.totalCentavos / 100)}</strong>
            </div>
            <p className="confirmacao-caixa" data-tom="info">
              <Icon name="info" size={20} color="var(--pdm-info)" />
              <span>{TEXTO_ENTREGA_DECORACAO}</span>
            </p>
            {retrato.temBolo ? (
              <p className="confirmacao-caixa" data-tom="info">
                <Icon name="cake" size={20} color="var(--pdm-info)" />
                <span>{TEXTO_DECORACAO}</span>
              </p>
            ) : null}
            {retrato.prazo ? (
              <p className="confirmacao-caixa" data-tom="alerta">
                <Icon name="schedule" size={20} color="var(--brown-700)" />
                <span>
                  {retrato.prazo.nome} leva {retrato.prazo.dias} {retrato.prazo.dias === 1 ? "dia" : "dias"} para ficar
                  pronto. A equipe confirma o prazo na conversa.
                </span>
              </p>
            ) : null}
            <p className="confirmacao-caixa" data-tom="info">
              <Icon name="photo_camera" size={20} color="var(--pdm-info)" />
              <span>Tem foto de referência? Mande na conversa do WhatsApp, depois da mensagem.</span>
            </p>
          </section>

          <section className="confirmacao-previa" aria-labelledby="confirmacao-previa-titulo">
            <h2 id="confirmacao-previa-titulo">
              <WhatsAppMark size={20} /> Prévia da mensagem
            </h2>
            <div className="confirmacao-balao-fundo">
              <p className="confirmacao-balao">{retrato.mensagem}</p>
            </div>
          </section>
        </div>

        <aside className="confirmacao-lateral">
          <section className="confirmacao-passos" aria-labelledby="confirmacao-passos-titulo">
            <h2 id="confirmacao-passos-titulo">O que acontece agora</h2>
            <ol>
              <li>
                <span className="confirmacao-passo-numero" aria-hidden="true">
                  1
                </span>
                <div>
                  <p className="confirmacao-passo-titulo">Envie a mensagem</p>
                  <p>O WhatsApp abre com o pedido escrito. Confira e toque em enviar.</p>
                </div>
              </li>
              <li>
                <span className="confirmacao-passo-numero" aria-hidden="true">
                  2
                </span>
                <div>
                  <p className="confirmacao-passo-titulo">A equipe confere o pedido</p>
                  <p>E informa o valor da entrega, o da decoração, se houver, e o total.</p>
                </div>
              </li>
              <li>
                <span className="confirmacao-passo-numero" aria-hidden="true">
                  3
                </span>
                <div>
                  <p className="confirmacao-passo-titulo">O pedido vale quando a equipe responder</p>
                  <p>A confirmação e o pagamento são combinados na conversa.</p>
                </div>
              </li>
            </ol>
            <p className="confirmacao-horario">
              <Icon name="schedule" size={18} tone="inherit" />
              <span>Atendimento: {LOJA.horario}.</span>
            </p>
          </section>

          {registrado ? (
            <p className="confirmacao-guarde">
              <Icon name="bookmark" size={20} color="var(--brown-700)" />
              <span>
                <strong>Guarde o número {retrato.numero}.</strong> Ele está na mensagem e ajuda a equipe a encontrar o seu
                pedido.
              </span>
            </p>
          ) : null}

          {retrato.pendenteEsvaziar ? (
            <ButtonLink href={ROTAS.checkout} variant="secondary" size="md" iconLeft="edit" fullWidth>
              Voltar e editar
            </ButtonLink>
          ) : (
            <Button type="button" variant="secondary" size="md" iconLeft="add_shopping_cart" fullWidth onClick={novoPedido}>
              Fazer novo pedido
            </Button>
          )}
        </aside>
      </div>
    </div>
  );
}
