"use client";

import Link from "next/link";
import { useMemo, useState, type CSSProperties } from "react";
import type { Pedido, PedidoStatus } from "@/lib/pedidos/types";
import { STATUS_BADGE_VARIANT, STATUS_LABEL, STATUS_OPTIONS } from "@/lib/pedidos/status";
import { formatDataHoraCurta, formatMoeda } from "@/lib/pedidos/format";
import { Card, Icon, Input, Button, Badge } from "@/components/ds";
import { exportarPedidosCSV } from "./export-csv";

const thStyle: CSSProperties = {
  textAlign: "left",
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  color: "var(--pdm-brown)",
  padding: "16px 24px",
};

const selectStyle: CSSProperties = {
  minHeight: "var(--tap-min)",
  padding: "12px 14px",
  fontFamily: "var(--font-body)",
  fontSize: "var(--fs-body)",
  color: "var(--text-body)",
  background: "var(--surface-raised)",
  border: "1.5px solid var(--border-subtle)",
  borderRadius: "var(--radius)",
};

// Quantidade de ITENS DISTINTOS do pedido (ex.: bolo + brigadeiro +
// coxinha = 3), não a soma das quantidades de cada um — é assim que a
// coluna "Itens" aparece no design aprovado (#1042 tem 3 produtos
// diferentes, mesmo com 136 unidades somadas entre eles).
function contarItens(pedido: Pedido): number {
  return pedido.itens.length;
}

function StatCard({ label, mobileLabel, value }: { label: string; mobileLabel?: string; value: string }) {
  return (
    <Card tone="white" padding="20px 24px" className="admin-stat-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span className="admin-stat-card-label" style={{ fontSize: 13, textTransform: "uppercase", letterSpacing: ".05em", fontWeight: 700, color: "var(--pdm-muted)" }}>
        {mobileLabel ? (
          <>
            <span className="admin-stat-card-label-full">{label}</span>
            <span className="admin-stat-card-label-short">{mobileLabel}</span>
          </>
        ) : (
          label
        )}
      </span>
      <span className="admin-stat-card-value" style={{ fontFamily: "var(--font-heading)", fontSize: 28, lineHeight: 1.2, color: "var(--pdm-brown)" }}>{value}</span>
    </Card>
  );
}

export function PedidosList({
  pedidos,
  stats,
}: {
  pedidos: Pedido[];
  stats: { pedidosNoMes: number; aguardandoConfirmacao: number; entregues: number; valorNoMes: number };
}) {
  const [search, setSearch] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<PedidoStatus | "todos">("todos");

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pedidos.filter((p) => {
      const matchStatus = statusFiltro === "todos" || p.status === statusFiltro;
      if (!matchStatus) return false;
      if (!term) return true;
      return p.cliente_nome.toLowerCase().includes(term) || String(p.numero).includes(term);
    });
  }, [pedidos, search, statusFiltro]);

  const totalCount = pedidos.length;
  const hasFilter = search.trim().length > 0 || statusFiltro !== "todos";
  const resultLabel = rows.length === 1 ? "1 pedido" : `${rows.length} pedidos`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
            Histórico de pedidos
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>Todo pedido fechado pelo WhatsApp fica registrado aqui.</p>
        </div>
        <div className="admin-header-action-desktop">
          <Button variant="secondary" iconLeft="download" onClick={() => exportarPedidosCSV(rows)} disabled={rows.length === 0}>
            Exportar planilha
          </Button>
        </div>
      </div>

      <div className="admin-stat-grid" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 16 }}>
        <StatCard label="Pedidos no mês" value={String(stats.pedidosNoMes)} />
        <StatCard label="Aguardando confirmação" mobileLabel="Aguardando" value={String(stats.aguardandoConfirmacao)} />
        <StatCard label="Entregues" value={String(stats.entregues)} />
        <StatCard label="Valor no mês" value={formatMoeda(stats.valorNoMes)} />
      </div>

      <Card tone="white" padding="0">
        <div
          className="admin-table-toolbar"
          style={{ display: "flex", alignItems: "center", gap: 16, padding: 24, borderBottom: "1px solid var(--border-subtle)", flexWrap: "wrap" }}
        >
          <div className="admin-table-search">
            <Input
              icon="search"
              placeholder="Buscar por cliente ou nº do pedido"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <select
            value={statusFiltro}
            onChange={(e) => setStatusFiltro(e.target.value as PedidoStatus | "todos")}
            style={selectStyle}
          >
            <option value="todos">Todos os status</option>
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {STATUS_LABEL[status]}
              </option>
            ))}
          </select>
          <div style={{ marginLeft: "auto", fontSize: 14, color: "var(--pdm-muted)" }}>{resultLabel}</div>
        </div>

        {rows.length > 0 ? (
          <div className="admin-table-desktop-wrap" style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--pdm-cream)" }}>
                  <th style={{ ...thStyle, width: 100 }}>Pedido</th>
                  <th style={thStyle}>Cliente</th>
                  <th style={thStyle}>Entrega</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Itens</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={thStyle}>Status</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 140 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((pedido) => (
                  <tr key={pedido.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td className="admin-table-title" style={{ padding: "16px 24px", fontWeight: 700, color: "var(--pdm-brown)" }}>
                      #{pedido.numero}
                    </td>
                    <td data-label="Cliente" style={{ padding: "16px 24px" }}>
                      <div style={{ fontWeight: 600 }}>{pedido.cliente_nome}</div>
                      {pedido.ocasiao ? <div style={{ fontSize: 14, color: "var(--pdm-muted)" }}>{pedido.ocasiao}</div> : null}
                    </td>
                    <td data-label="Entrega" style={{ padding: "16px 24px", fontVariantNumeric: "tabular-nums" }}>
                      {formatDataHoraCurta(pedido.data_hora_entrega)}
                    </td>
                    <td data-label="Itens" style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {contarItens(pedido)} {contarItens(pedido) === 1 ? "item" : "itens"}
                    </td>
                    <td data-label="Total" style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>
                      {formatMoeda(pedido.total)}
                    </td>
                    <td data-label="Status" style={{ padding: "16px 24px" }}>
                      <Badge variant={STATUS_BADGE_VARIANT[pedido.status]}>{STATUS_LABEL[pedido.status]}</Badge>
                    </td>
                    <td data-label="Ações" style={{ padding: "16px 24px", textAlign: "right" }}>
                      <Link href={`/admin/pedidos/${pedido.numero}`}>
                        <Button variant="secondary" size="sm" iconLeft="visibility">
                          Ver pedido
                        </Button>
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="admin-mobile-cards">
            {rows.map((pedido) => (
              <div key={pedido.id} className="admin-mobile-card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12 }}>
                  <span style={{ fontWeight: 700, color: "var(--pdm-brown)" }}>#{pedido.numero}</span>
                  <Badge variant={STATUS_BADGE_VARIANT[pedido.status]}>{STATUS_LABEL[pedido.status]}</Badge>
                </div>
                <div style={{ marginTop: 8, fontWeight: 600 }}>{pedido.cliente_nome}</div>
                {pedido.ocasiao ? <div style={{ fontSize: 14, color: "var(--pdm-muted)" }}>{pedido.ocasiao}</div> : null}
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "4px 20px",
                    marginTop: 8,
                    fontSize: 14,
                    color: "var(--pdm-muted)",
                  }}
                >
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>{formatDataHoraCurta(pedido.data_hora_entrega)}</span>
                  <span style={{ fontVariantNumeric: "tabular-nums" }}>
                    {contarItens(pedido)} {contarItens(pedido) === 1 ? "item" : "itens"}
                  </span>
                  <span style={{ fontWeight: 700, color: "var(--pdm-black)", fontVariantNumeric: "tabular-nums" }}>
                    {formatMoeda(pedido.total)}
                  </span>
                </div>

                <div className="admin-mobile-card-divider" />

                <Link href={`/admin/pedidos/${pedido.numero}`} className="admin-mobile-card-cta">
                  <Button variant="secondary" size="sm" iconLeft="visibility" style={{ width: "100%" }}>
                    Ver pedido
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 && (
          <div className="admin-empty-state" style={{ padding: "80px 24px", display: "grid", placeItems: "center", textAlign: "center", background: "var(--pdm-cream-warm)" }}>
            <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
              <Icon name="receipt_long" size={40} tone="accent" />
              <h3 className="admin-empty-state-title" style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
                {totalCount === 0 ? "Nenhum pedido registrado ainda" : "Nada encontrado com esse filtro"}
              </h3>
              <p style={{ margin: 0, color: "var(--pdm-muted)" }}>
                {totalCount === 0
                  ? "Pedidos fechados pelo WhatsApp aparecem aqui assim que forem registrados."
                  : "Ajuste a busca ou o filtro de status para ver os pedidos cadastrados."}
              </p>
              {hasFilter ? (
                <Button
                  variant="secondary"
                  onClick={() => {
                    setSearch("");
                    setStatusFiltro("todos");
                  }}
                >
                  Limpar filtros
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      <div className="admin-header-action-mobile">
        <Button
          variant="secondary"
          iconLeft="download"
          onClick={() => exportarPedidosCSV(rows)}
          disabled={rows.length === 0}
          style={{ width: "100%" }}
        >
          Exportar planilha
        </Button>
      </div>
    </div>
  );
}
