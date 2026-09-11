"use client";

import Link from "next/link";
import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import type { Pedido, PedidoStatus } from "@/lib/pedidos/types";
import { STATUS_BADGE_VARIANT, STATUS_LABEL } from "@/lib/pedidos/status";
import { formatDataHoraCurta, formatDataHoraExtensa, formatMoeda, buildWhatsAppLink } from "@/lib/pedidos/format";
import { Card, Icon, Button, Badge } from "@/components/ds";
import { atualizarStatusPedido } from "../actions";

const sectionTitleStyle: CSSProperties = {
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  fontWeight: 700,
  color: "var(--pdm-brown)",
  margin: "0 0 16px",
};

type EstadoPasso = "done" | "current" | "pending";
type PassoTimeline = { label: string; detalhe: string; estado: EstadoPasso };

function montarTimeline(pedido: Pedido): PassoTimeline[] {
  const recebido: PassoTimeline = {
    label: "Pedido recebido pelo WhatsApp",
    detalhe: formatDataHoraCurta(pedido.criado_em),
    estado: "done",
  };

  if (pedido.status === "cancelado") {
    return [
      recebido,
      { label: "Pedido cancelado", detalhe: formatDataHoraCurta(pedido.status_atualizado_em), estado: "done" },
    ];
  }

  const producaoLabel = pedido.status === "aguardando_confirmacao" ? "Aguardando confirmação" : "Em produção";
  const producaoEstado: EstadoPasso = pedido.status === "entregue" ? "done" : "current";
  const producaoDetalhe =
    pedido.status === "em_producao"
      ? formatDataHoraCurta(pedido.status_atualizado_em)
      : pedido.status === "entregue"
        ? "concluído"
        : "em aberto";

  const retirada = pedido.modo_entrega === "retirada";
  const entregaLabel = pedido.status === "entregue" ? (retirada ? "Retirado pelo cliente" : "Entregue") : retirada ? "Retirada prevista" : "Entrega prevista";
  const entregaDetalhe =
    pedido.status === "entregue" ? formatDataHoraCurta(pedido.status_atualizado_em) : formatDataHoraCurta(pedido.data_hora_entrega);

  return [
    recebido,
    { label: producaoLabel, detalhe: producaoDetalhe, estado: producaoEstado },
    { label: entregaLabel, detalhe: entregaDetalhe, estado: pedido.status === "entregue" ? "done" : "pending" },
  ];
}

function InfoRow({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
      <Icon name={icon} size={20} tone="accent" style={{ marginTop: 2 }} />
      <div>
        <div style={{ fontSize: 13, color: "var(--pdm-muted)" }}>{label}</div>
        <div style={{ fontWeight: 600 }}>{children}</div>
      </div>
    </div>
  );
}

export function PedidoDetail({ pedido }: { pedido: Pedido }) {
  const [isPending, startTransition] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [acaoEmCurso, setAcaoEmCurso] = useState<PedidoStatus | null>(null);

  function mudarStatus(novoStatus: PedidoStatus) {
    setErro(null);
    setAcaoEmCurso(novoStatus);
    startTransition(async () => {
      try {
        await atualizarStatusPedido(pedido.id, pedido.numero, pedido.status, novoStatus);
      } catch (err) {
        setErro(err instanceof Error ? err.message : "Não foi possível atualizar o pedido.");
      } finally {
        setAcaoEmCurso(null);
      }
    });
  }

  const podeMoverParaProducao = pedido.status === "aguardando_confirmacao";
  const podeMarcarEntregue = pedido.status === "aguardando_confirmacao" || pedido.status === "em_producao";
  const podeCancelar = pedido.status === "aguardando_confirmacao" || pedido.status === "em_producao";
  const semAcoesDisponiveis = !podeMoverParaProducao && !podeMarcarEntregue && !podeCancelar;

  const timeline = montarTimeline(pedido);
  const totalItens = pedido.itens.reduce((soma, item) => soma + item.quantidade, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <Link
          href="/admin/pedidos"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--pdm-muted)", fontSize: 14, textDecoration: "none" }}
        >
          <Icon name="arrow_back" size={18} tone="inherit" />
          Voltar ao histórico
        </Link>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, marginTop: 8, flexWrap: "wrap" }}>
          <div>
            <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
              Pedido #{pedido.numero}
            </h1>
            <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
              Recebido em {formatDataHoraExtensa(pedido.criado_em)} pelo WhatsApp.
            </p>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <Badge variant={STATUS_BADGE_VARIANT[pedido.status]}>{STATUS_LABEL[pedido.status]}</Badge>
            <a
              href={buildWhatsAppLink(pedido.cliente_whatsapp)}
              target="_blank"
              rel="noopener noreferrer"
              style={{ textDecoration: "none" }}
            >
              <Button variant="whatsapp" iconLeft="chat">
                Chamar no WhatsApp
              </Button>
            </a>
          </div>
        </div>
      </div>

      {erro ? (
        <div style={{ padding: "12px 16px", borderRadius: "var(--radius)", background: "var(--pdm-error)", color: "var(--pdm-white)" }}>
          {erro}
        </div>
      ) : null}

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 360px", gap: 24, alignItems: "start" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card tone="white" padding="24px">
            <h2 style={sectionTitleStyle}>Itens do pedido</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              {pedido.itens.map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
                  <div style={{ display: "flex", gap: 12 }}>
                    <Icon name="cake" size={22} tone="accent" style={{ marginTop: 2 }} />
                    <div>
                      <div style={{ fontWeight: 600 }}>{item.nome}</div>
                      {item.variacao ? <div style={{ fontSize: 14, color: "var(--pdm-muted)" }}>{item.variacao}</div> : null}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 24, alignItems: "baseline", flexShrink: 0 }}>
                    <span style={{ color: "var(--pdm-muted)", fontVariantNumeric: "tabular-nums" }}>{item.quantidade} un.</span>
                    <span style={{ fontWeight: 600, fontVariantNumeric: "tabular-nums", minWidth: 90, textAlign: "right" }}>
                      {formatMoeda(item.quantidade * item.preco_unitario)}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: 20, paddingTop: 16, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--pdm-muted)" }}>
                <span>Subtotal dos itens</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatMoeda(pedido.subtotal)}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", color: "var(--pdm-muted)" }}>
                <span>Entrega ({pedido.modo_entrega === "retirada" ? "retirada na loja" : "entrega"})</span>
                <span style={{ fontVariantNumeric: "tabular-nums" }}>
                  {pedido.valor_entrega > 0 ? formatMoeda(pedido.valor_entrega) : "sem custo"}
                </span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginTop: 8 }}>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "var(--pdm-brown)" }}>Total</span>
                <span style={{ fontFamily: "var(--font-heading)", fontSize: 22, color: "var(--pdm-brown)", fontVariantNumeric: "tabular-nums" }}>
                  {formatMoeda(pedido.total)}
                </span>
              </div>
            </div>
          </Card>

          <Card tone="white" padding="24px">
            <h2 style={sectionTitleStyle}>Andamento</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
              {timeline.map((passo, i) => (
                <div key={i} style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <div
                    style={{
                      width: 10,
                      height: 10,
                      borderRadius: "50%",
                      marginTop: 6,
                      flexShrink: 0,
                      background: passo.estado === "pending" ? "var(--pdm-disabled-bg)" : "var(--pdm-gold)",
                      boxShadow: passo.estado === "pending" ? "inset 0 0 0 1.5px var(--pdm-muted)" : "none",
                    }}
                  />
                  <div>
                    <div style={{ fontWeight: passo.estado === "pending" ? 400 : 600, color: passo.estado === "pending" ? "var(--pdm-muted)" : "var(--text-body)" }}>
                      {passo.label}
                    </div>
                    <div style={{ fontSize: 14, color: "var(--pdm-muted)" }}>{passo.detalhe}</div>
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 24, paddingTop: 20, borderTop: "1px solid var(--border-subtle)" }}>
              {semAcoesDisponiveis ? (
                <p style={{ margin: 0, color: "var(--pdm-muted)", fontSize: 14 }}>
                  Pedido {pedido.status === "entregue" ? "entregue" : "cancelado"} — nenhuma ação disponível.
                </p>
              ) : (
                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  {podeMarcarEntregue ? (
                    <Button iconLeft="check" disabled={isPending} onClick={() => mudarStatus("entregue")}>
                      {isPending && acaoEmCurso === "entregue" ? "Atualizando…" : "Marcar como entregue"}
                    </Button>
                  ) : null}
                  {podeMoverParaProducao ? (
                    <Button variant="secondary" iconLeft="restaurant" disabled={isPending} onClick={() => mudarStatus("em_producao")}>
                      {isPending && acaoEmCurso === "em_producao" ? "Atualizando…" : "Mover para produção"}
                    </Button>
                  ) : null}
                  {podeCancelar ? (
                    <Button
                      variant="ghost"
                      iconLeft="close"
                      disabled={isPending}
                      onClick={() => mudarStatus("cancelado")}
                      style={{ color: "var(--pdm-error)" }}
                    >
                      {isPending && acaoEmCurso === "cancelado" ? "Cancelando…" : "Cancelar pedido"}
                    </Button>
                  ) : null}
                </div>
              )}
            </div>
          </Card>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <Card tone="white" padding="24px">
            <h2 style={sectionTitleStyle}>Cliente</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <InfoRow icon="person" label="Nome">
                {pedido.cliente_nome}
              </InfoRow>
              <InfoRow icon="call" label="WhatsApp">
                {pedido.cliente_whatsapp}
              </InfoRow>
              {pedido.cliente_email ? (
                <InfoRow icon="mail" label="E-mail">
                  {pedido.cliente_email}
                </InfoRow>
              ) : null}
              {pedido.ocasiao ? (
                <InfoRow icon="celebration" label="Ocasião">
                  {pedido.ocasiao}
                </InfoRow>
              ) : null}
            </div>
          </Card>

          <Card tone="white" padding="24px">
            <h2 style={sectionTitleStyle}>Entrega e pagamento</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <InfoRow icon={pedido.modo_entrega === "retirada" ? "storefront" : "local_shipping"} label="Modo">
                {pedido.modo_entrega === "retirada" ? "Retirada na loja" : "Entrega"}
              </InfoRow>
              {pedido.endereco ? (
                <InfoRow icon="location_on" label="Endereço">
                  {pedido.endereco}
                </InfoRow>
              ) : null}
              <InfoRow icon="event" label="Data e hora">
                {formatDataHoraCurta(pedido.data_hora_entrega)}
              </InfoRow>
              <InfoRow icon="payments" label="Pagamento">
                {pedido.forma_pagamento}
              </InfoRow>
            </div>
          </Card>

          {pedido.observacoes ? (
            <Card tone="white" padding="24px">
              <h2 style={sectionTitleStyle}>Observações do cliente</h2>
              <p style={{ margin: 0 }}>{pedido.observacoes}</p>
            </Card>
          ) : null}
        </div>
      </div>

      <p style={{ margin: 0, color: "var(--pdm-muted)", fontSize: 13 }}>{totalItens} item(ns) no total.</p>
    </div>
  );
}
