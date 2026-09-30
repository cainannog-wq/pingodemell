"use client";

import { useEffect, useState } from "react";
import { Button, Icon, WhatsAppMark } from "@/components/ds";
import { CopiarMensagem } from "@/components/site/CopiarMensagem";
import type { Mensagem } from "@/lib/pedidos/mensagem";

// Falha, erro de validação e bloqueio do envio, no próprio checkout, com o
// formulário preservado (decisão do Cainan, PR confirmacao-e-gravacao):
// - falha (rede, tempo esgotado, 5xx): "Tentar de novo" com a mesma chave;
//   da 2ª falha em diante, também "Enviar pelo WhatsApp sem registrar";
// - inválido (4xx fora 409 e 429): mensagem e já a saída pelo WhatsApp,
//   sem "Tentar de novo" (o mesmo corpo falharia igual);
// - limite (429): quantos minutos esperar, "Tentar de novo" desabilitado até
//   passar o tempo e a saída pelo WhatsApp.
// A saída é um link montado na hora com os dados da tela (clique real, sem
// chamada assíncrona antes). O carrinho não é esvaziado.

export type EstadoEnvio =
  | { tipo: "parado" }
  | { tipo: "enviando" }
  | { tipo: "falha"; falhas: number }
  | { tipo: "invalido"; mensagem: string }
  | { tipo: "limite"; ateMs: number; liberado: boolean };

export function mostraSaida(estado: EstadoEnvio): boolean {
  return (
    (estado.tipo === "falha" && estado.falhas >= 2) || estado.tipo === "invalido" || estado.tipo === "limite"
  );
}

function minutosAte(ateMs: number, agora: number): number {
  return Math.max(0, Math.ceil((ateMs - agora) / 60_000));
}

export function PainelEnvio({
  estado,
  mensagemSemRegistro,
  aoTentar,
  aoLiberar,
  aoAbrirSemRegistro,
  avisoSemRegistro,
}: {
  estado: EstadoEnvio;
  mensagemSemRegistro: Mensagem | null;
  aoTentar: () => void;
  // Chamado quando a espera do limite por IP termina.
  aoLiberar: () => void;
  aoAbrirSemRegistro: () => void;
  avisoSemRegistro: boolean;
}) {
  const [agora, setAgora] = useState(() => Date.now());
  const ateMs = estado.tipo === "limite" ? estado.ateMs : null;
  useEffect(() => {
    if (ateMs === null) return;
    const relogio = setInterval(() => setAgora(Date.now()), 5_000);
    return () => clearInterval(relogio);
  }, [ateMs]);

  const minutos = ateMs !== null ? minutosAte(ateMs, agora) : 0;
  const liberado = estado.tipo === "limite" && estado.liberado;
  useEffect(() => {
    if (ateMs !== null && minutos === 0 && !liberado) aoLiberar();
  }, [ateMs, minutos, liberado, aoLiberar]);
  const podeTentar = estado.tipo === "falha" || liberado;

  return (
    <>
      {/* Progresso: sempre no HTML, anunciado quando muda. */}
      <p className="site-visually-hidden" role="status" aria-live="polite">
        {estado.tipo === "enviando" ? "Registrando o pedido. Aguarde." : ""}
      </p>

      <div role="alert" className="checkout-envio-alerta" data-vazio={estado.tipo === "parado" || estado.tipo === "enviando" || undefined}>
        {estado.tipo === "falha" ? (
          <div className="checkout-caixa" data-tom="erro">
            <Icon name="wifi_off" size={22} color="var(--pdm-error)" />
            <div>
              <p className="checkout-caixa-titulo">Não conseguimos registrar o pedido</p>
              <p>Pode ter sido a conexão. Seu pedido e seus dados continuam aqui. Tente de novo.</p>
            </div>
          </div>
        ) : null}
        {estado.tipo === "invalido" ? (
          <div className="checkout-caixa" data-tom="erro">
            <Icon name="error" size={22} color="var(--pdm-error)" />
            <div>
              <p className="checkout-caixa-titulo">O site não aceitou o pedido</p>
              <p>{estado.mensagem}</p>
              <p>Você pode ajustar o pedido ou enviar pelo WhatsApp sem registrar no site.</p>
            </div>
          </div>
        ) : null}
        {estado.tipo === "limite" ? (
          <div className="checkout-caixa" data-tom="erro">
            <Icon name="hourglass_top" size={22} color="var(--pdm-error)" />
            <div>
              <p className="checkout-caixa-titulo">Muitos pedidos enviados desta conexão</p>
              <p>
                {minutos > 0
                  ? `Aguarde ${minutos} ${minutos === 1 ? "minuto" : "minutos"} para tentar de novo, ou envie pelo WhatsApp sem registrar no site.`
                  : "Já pode tentar de novo."}
              </p>
            </div>
          </div>
        ) : null}
      </div>

      {estado.tipo === "falha" || estado.tipo === "limite" ? (
        <Button type="button" variant="secondary" size="md" fullWidth iconLeft="refresh" disabled={!podeTentar} onClick={aoTentar}>
          Tentar de novo
        </Button>
      ) : null}

      {mostraSaida(estado) && mensagemSemRegistro ? (
        <div className="checkout-saida">
          <a
            className="checkout-saida-link"
            href={mensagemSemRegistro.url}
            target="_blank"
            rel="noopener noreferrer"
            onClick={aoAbrirSemRegistro}
          >
            <WhatsAppMark size={20} />
            Enviar pelo WhatsApp sem registrar
            <span className="site-visually-hidden"> (abre em nova aba)</span>
          </a>
          <p className="checkout-saida-nota">A mensagem vai completa, sem número de pedido. A equipe registra por lá.</p>
          <CopiarMensagem
            texto={mensagemSemRegistro.texto}
            destaque={!mensagemSemRegistro.cabe}
            instrucao={mensagemSemRegistro.cabe ? undefined : "Se a mensagem não aparecer no WhatsApp, copie e cole na conversa."}
          />
        </div>
      ) : null}

      {avisoSemRegistro ? (
        <div className="checkout-caixa" data-tom="info" role="status">
          <Icon name="info" size={22} color="var(--pdm-info)" />
          <p>Você abriu o WhatsApp sem registro no site. Se a mensagem já foi enviada, não precisa fazer o pedido de novo.</p>
        </div>
      ) : null}
    </>
  );
}
