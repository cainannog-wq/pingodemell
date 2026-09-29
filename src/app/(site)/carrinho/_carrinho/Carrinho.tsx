"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { ButtonLink, Icon, TextLink } from "@/components/ds";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import { Hive } from "@/components/site/Hive";
import { PilhaDeAvisos, type Aviso } from "@/components/site/PilhaDeAvisos";
import { useMontado } from "@/components/site/useMontado";
import { alterarQuantidade, subtotalDaLinha, totalDoCarrinho, type LinhaCarrinho } from "@/lib/carrinho/regras";
import { formatMoeda } from "@/lib/pedidos/format";
import { ROTAS } from "@/lib/site/rotas";
import { TEXTO_DECORACAO } from "@/lib/vitrine/bolo";
import { CarrinhoVazio } from "./CarrinhoVazio";
import { ItemCarrinho } from "./ItemCarrinho";

// Página do carrinho (página 4 do site). Lê e grava só no navegador
// (CarrinhoProvider, localStorage): NENHUMA consulta ao banco, nem para
// conferir se o produto ou o recheio ainda existem, nem para recalcular o
// preço. Tudo que aparece e o total são o que ficou gravado em cada linha
// quando o item foi adicionado. Risco aceito, decisão do Cainan: quem confere
// o catálogo de novo é o checkout, e a Taami revisa a mensagem do WhatsApp
// antes de produzir.

// Quantos avisos de "Item removido" ficam empilhados. No celular são menos,
// para não cobrir a barra fixa de "Finalizar pedido" (o mais antigo fecha e
// a remoção dele vale).
export const MAX_AVISOS_DESKTOP = 3;
export const MAX_AVISOS_MOBILE = 2;

const CELULAR = "(max-width: 767px)";

function assinarCelular(aoMudar: () => void) {
  if (typeof window.matchMedia !== "function") return () => {};
  const consulta = window.matchMedia(CELULAR);
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}
const lerCelular = () => typeof window.matchMedia === "function" && window.matchMedia(CELULAR).matches;
const lerCelularNoServidor = () => false;

let sequenciaAviso = 0;

export function Carrinho() {
  const { linhas, alterar, remover, reinserir } = useCarrinho();
  const montado = useMontado();
  const celular = useSyncExternalStore(assinarCelular, lerCelular, lerCelularNoServidor);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const raiz = useRef<HTMLDivElement>(null);
  const foco = useRef<{ linha?: string; titulo?: boolean } | null>(null);

  // O botão que tinha o foco some junto com a linha (ou o aviso some depois
  // do "Desfazer"): o foco vai para um lugar que existe, para quem usa
  // teclado ou leitor de tela não voltar ao topo da página.
  useEffect(() => {
    const alvo = foco.current;
    if (!alvo || !raiz.current) return;
    foco.current = null;
    const el = alvo.linha
      ? raiz.current.querySelector<HTMLElement>(`[data-linha="${CSS.escape(alvo.linha)}"] [data-remover]`)
      : null;
    (el ?? raiz.current.querySelector<HTMLElement>("h1"))?.focus();
  }, [linhas]);

  function fecharAviso(id: string) {
    setAvisos((atuais) => atuais.filter((a) => a.id !== id));
  }

  function aoRemover(linha: LinhaCarrinho) {
    // A remoção vale na hora, no localStorage. O aviso só oferece voltar atrás.
    const ordem = linhas.map((l) => l.id);
    remover(linha.id);
    foco.current = { titulo: true };

    sequenciaAviso += 1;
    const id = `aviso-${sequenciaAviso}`;
    const aviso: Aviso = {
      id,
      texto: "Item removido",
      acao: {
        rotulo: "Desfazer",
        descricao: `Desfazer a remoção de ${linha.nome}`,
        aoClicar: () => {
          reinserir(linha, ordem);
          foco.current = { linha: linha.id };
          fecharAviso(id);
        },
      },
    };
    const limite = celular ? MAX_AVISOS_MOBILE : MAX_AVISOS_DESKTOP;
    setAvisos((atuais) => [...atuais, aviso].slice(-limite));
  }

  function aoMudarQuantidade(id: string, quantidade: number) {
    const antes = linhas.find((l) => l.id === id);
    const nova = alterarQuantidade(linhas, id, quantidade).find((l) => l.id === id);
    if (antes && nova && nova.quantidade !== antes.quantidade) alterar(id, nova);
  }

  if (!montado) {
    return (
      <div className="carrinho" ref={raiz}>
        <Topo />
        <div className="site-container carrinho-corpo" aria-busy="true" />
      </div>
    );
  }

  if (linhas.length === 0) {
    return (
      <div className="carrinho" ref={raiz}>
        <CarrinhoVazio />
        <PilhaDeAvisos avisos={avisos} aoFechar={fecharAviso} />
      </div>
    );
  }

  const total = formatMoeda(totalDoCarrinho(linhas));
  const temBolo = linhas.some((l) => l.tipo === "bolo");

  return (
    <div className="carrinho" ref={raiz}>
      <Topo />

      <div className="site-container carrinho-corpo">
        <div className="carrinho-coluna-itens">
          <ul className="carrinho-itens" aria-label="Itens do pedido">
            {linhas.map((linha) => (
              <ItemCarrinho key={linha.id} linha={linha} aoRemover={aoRemover} aoMudarQuantidade={aoMudarQuantidade} />
            ))}
          </ul>
          <div className="carrinho-continuar site-so-desktop">
            <TextLink href={ROTAS.lista}>
              <Icon name="arrow_back" size={18} tone="inherit" />
              Continuar comprando
            </TextLink>
          </div>
        </div>

        <aside className="carrinho-coluna-resumo">
          <section className="carrinho-resumo" aria-labelledby="carrinho-resumo-titulo">
            <h2 id="carrinho-resumo-titulo">Resumo</h2>
            <ul className="carrinho-resumo-linhas">
              {linhas.map((linha) => (
                <li key={linha.id}>
                  <span>{linha.nome}</span>
                  <span>{formatMoeda(subtotalDaLinha(linha))}</span>
                </li>
              ))}
            </ul>
            <div className="carrinho-resumo-total">
              <span>Subtotal</span>
              <strong>{total}</strong>
            </div>
            {temBolo ? (
              <p className="carrinho-resumo-info">
                <Icon name="info" size={20} color="var(--pdm-info)" />
                <span>{TEXTO_DECORACAO}</span>
              </p>
            ) : null}
            <div className="site-so-desktop">
              <ButtonLink href={ROTAS.checkout} variant="primary" size="lg" fullWidth iconRight="arrow_forward">
                Finalizar pedido
              </ButtonLink>
            </div>
            <div className="carrinho-resumo-continuar">
              <TextLink href={ROTAS.lista}>
                <Icon name="arrow_back" size={18} tone="inherit" />
                Continuar comprando
              </TextLink>
            </div>
          </section>

          <div className="carrinho-sem-pagamento site-so-desktop">
            <p className="carrinho-sem-pagamento-titulo">
              <Icon name="payments" size={20} color="var(--brown-700)" />
              Sem pagamento no site
            </p>
            <p>Você envia o pedido pelo WhatsApp, a gente confirma e pede um sinal via Pix. Nada é cobrado aqui.</p>
          </div>
        </aside>
      </div>

      {/* Barra fixa do celular: mesmo subtotal e mesmo botão do resumo. */}
      <div className="carrinho-barra">
        <div className="carrinho-barra-linha">
          <div className="carrinho-barra-textos">
            <span>Subtotal</span>
            <strong>{total}</strong>
          </div>
          <ButtonLink href={ROTAS.checkout} variant="primary" size="md" fullWidth iconRight="arrow_forward">
            Finalizar pedido
          </ButtonLink>
        </div>
      </div>

      <PilhaDeAvisos avisos={avisos} aoFechar={fecharAviso} />
    </div>
  );
}

function Topo() {
  return (
    <section className="carrinho-topo">
      <Hive />
      <div className="site-container carrinho-topo-inner">
        <h1 tabIndex={-1}>Seu pedido</h1>
        <p>
          <span className="site-so-desktop">Confira tudo antes de enviar. O pagamento é combinado pelo WhatsApp.</span>
          <span className="site-so-mobile">Confira tudo antes de enviar. Nada é cobrado aqui.</span>
        </p>
      </div>
    </section>
  );
}
