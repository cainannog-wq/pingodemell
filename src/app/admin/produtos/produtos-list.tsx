"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { STEP_QUANTIDADE_LABELS, type Produto } from "@/lib/produtos/types";
import { Card, Icon, Input, Button, Toggle } from "@/components/ds";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteProduto, updateProdutoAtivo } from "./actions";

// Ícone de destaque, sem texto ao lado (só title/aria-label), reaproveitado
// na tabela desktop e no card mobile.
function DestaqueIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span role="img" aria-label="Produto em destaque" title="Produto em destaque" style={{ display: "inline-flex" }}>
      <Icon name="check_circle" size={22} tone="accent" />
    </span>
  );
}

// Toggle inline de status ativo/inativo na listagem. Sem estado próprio:
// o estado vive no ProdutosList (única fonte de verdade), porque a mesma
// linha renderiza duas vezes (tabela desktop + card mobile, alternadas via
// CSS) e cada instância com estado próprio dessincronizaria da outra.
function AtivoToggleCell({
  nome,
  ativo,
  saving,
  feedback,
  onToggle,
}: {
  nome: string;
  ativo: boolean;
  saving: boolean;
  feedback: "ok" | "erro" | undefined;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Toggle
        checked={ativo}
        onCheckedChange={onToggle}
        disabled={saving}
        aria-label={ativo ? `Desativar ${nome}` : `Ativar ${nome}`}
      />
      <span style={{ fontSize: 13, color: ativo ? "var(--pdm-success)" : "var(--pdm-muted)" }}>
        {ativo ? "Ativo" : "Inativo"}
      </span>
      {feedback === "erro" && (
        <span role="alert" style={{ fontSize: 12, color: "var(--pdm-error)" }}>
          Erro ao salvar
        </span>
      )}
      {feedback === "ok" && (
        <span role="status" style={{ fontSize: 12, color: "var(--pdm-success)" }}>
          Salvo
        </span>
      )}
    </div>
  );
}

// Formatação manual (sem toLocaleString/Intl) para evitar divergência de
// hidratação entre o ICU do servidor e o do navegador.
function formatPreco(preco: number) {
  const [intPart, decPart] = preco.toFixed(2).split(".");
  const withThousands = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return `R$ ${withThousands},${decPart}`;
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  color: "var(--pdm-brown)",
  padding: "16px 24px",
};

export function ProdutosList({ produtos }: { produtos: Produto[] }) {
  const [search, setSearch] = useState("");
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [ativoOverrides, setAtivoOverrides] = useState<Record<string, boolean>>({});
  const [savingAtivo, setSavingAtivo] = useState<Record<string, boolean>>({});
  const [feedbackAtivo, setFeedbackAtivo] = useState<Record<string, "ok" | "erro" | undefined>>({});
  const [, startAtivoTransition] = useTransition();

  function handleToggleAtivo(produto: Produto, next: boolean) {
    const previous = ativoOverrides[produto.nome] ?? produto.ativo;
    setAtivoOverrides((overrides) => ({ ...overrides, [produto.nome]: next }));
    setSavingAtivo((saving) => ({ ...saving, [produto.nome]: true }));
    setFeedbackAtivo((feedback) => ({ ...feedback, [produto.nome]: undefined }));

    startAtivoTransition(async () => {
      const result = await updateProdutoAtivo(produto.nome, next);
      setSavingAtivo((saving) => ({ ...saving, [produto.nome]: false }));
      if (result.error) {
        setAtivoOverrides((overrides) => ({ ...overrides, [produto.nome]: previous }));
        setFeedbackAtivo((feedback) => ({ ...feedback, [produto.nome]: "erro" }));
      } else {
        setFeedbackAtivo((feedback) => ({ ...feedback, [produto.nome]: "ok" }));
      }
      setTimeout(() => {
        setFeedbackAtivo((feedback) => ({ ...feedback, [produto.nome]: undefined }));
      }, 2500);
    });
  }

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return produtos;
    return produtos.filter((p) => p.nome.toLowerCase().includes(term));
  }, [produtos, search]);

  const totalCount = produtos.length;
  const hasFilter = search.trim().length > 0;
  const resultLabel = rows.length === 1 ? "1 produto" : `${rows.length} produtos`;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div className="admin-page-header" style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 className="admin-page-h1" style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
            Produtos
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
            {totalCount === 0 ? "Nenhum produto cadastrado ainda." : "Esses são os produtos que aparecem no cardápio."}
          </p>
        </div>
        <Link href="/admin/produtos/novo" className="admin-page-header-cta">
          <Button iconLeft="add">Cadastrar produto</Button>
        </Link>
      </div>

      <Card tone="white" padding="0">
        <div
          className="admin-table-toolbar"
          style={{ display: "flex", alignItems: "center", gap: 16, padding: 24, borderBottom: "1px solid var(--border-subtle)", flexWrap: "wrap" }}
        >
          <div className="admin-table-search">
            <Input
              icon="search"
              placeholder="Buscar pelo nome do produto"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div style={{ marginLeft: "auto", fontSize: 14, color: "var(--pdm-muted)" }}>{resultLabel}</div>
        </div>

        {rows.length > 0 ? (
          <div className="admin-table-desktop-wrap" style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--pdm-cream)" }}>
                  <th style={{ ...thStyle, width: 96 }}>Foto</th>
                  <th style={thStyle}>Nome</th>
                  <th style={{ ...thStyle, width: 120 }}>Categoria</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 130 }}>Preço</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 170 }}>Pedido mínimo</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 140 }}>Prazo</th>
                  <th style={{ ...thStyle, width: 160 }}>Step</th>
                  <th style={{ ...thStyle, width: 90, textAlign: "center" }}>Destaque</th>
                  <th style={{ ...thStyle, width: 170 }}>Status</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 170 }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((produto) => (
                  <tr key={produto.nome} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                    <td data-label="Foto" style={{ padding: "16px 24px" }}>
                      <div
                        style={{
                          width: 56,
                          height: 56,
                          borderRadius: "var(--radius)",
                          background: "var(--pdm-cream-warm)",
                          display: "grid",
                          placeItems: "center",
                          overflow: "hidden",
                        }}
                      >
                        {produto.image_url ? (
                          <Image src={produto.image_url} alt={produto.nome} width={56} height={56} style={{ objectFit: "cover" }} />
                        ) : (
                          <Icon name="photo_camera" size={26} />
                        )}
                      </div>
                    </td>
                    <td className="admin-table-title" style={{ padding: "16px 24px", fontWeight: 600 }}>{produto.nome}</td>
                    <td data-label="Categoria" style={{ padding: "16px 24px", color: "var(--pdm-muted)" }}>
                      {produto.Categoria ?? "—"}
                    </td>
                    <td data-label="Preço" style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatPreco(produto.preco)}
                    </td>
                    <td
                      data-label="Pedido mínimo"
                      style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--pdm-muted)" }}
                    >
                      {produto.pedido_minimo} un.
                    </td>
                    <td
                      data-label="Prazo"
                      style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--pdm-muted)" }}
                    >
                      {produto.prazo_producao_dias} {produto.prazo_producao_dias === 1 ? "dia" : "dias"}
                    </td>
                    <td data-label="Step" style={{ padding: "16px 24px", color: "var(--pdm-muted)" }}>
                      {STEP_QUANTIDADE_LABELS[produto.step_quantidade]}
                    </td>
                    <td data-label="Destaque" style={{ padding: "16px 24px", textAlign: "center" }}>
                      <DestaqueIndicator show={produto.destaque} />
                    </td>
                    <td data-label="Status" style={{ padding: "16px 24px" }}>
                      <AtivoToggleCell
                        nome={produto.nome}
                        ativo={ativoOverrides[produto.nome] ?? produto.ativo}
                        saving={savingAtivo[produto.nome] ?? false}
                        feedback={feedbackAtivo[produto.nome]}
                        onToggle={(next) => handleToggleAtivo(produto, next)}
                      />
                    </td>
                    <td data-label="Ações" style={{ padding: "16px 24px" }}>
                      <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                        <Link href={`/admin/produtos/${encodeURIComponent(produto.nome)}`}>
                          <Button variant="secondary" size="sm" iconLeft="edit">
                            Editar
                          </Button>
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          iconLeft="delete"
                          aria-label={`Excluir ${produto.nome}`}
                          title="Excluir produto"
                          onClick={() => setProdutoParaExcluir(produto.nome)}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {rows.length > 0 ? (
          <div className="admin-mobile-cards">
            {rows.map((produto) => (
              <div key={produto.nome} className="admin-mobile-card">
                <div style={{ display: "flex", gap: 12 }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      flexShrink: 0,
                      borderRadius: "var(--radius)",
                      background: "var(--pdm-cream-warm)",
                      display: "grid",
                      placeItems: "center",
                      overflow: "hidden",
                    }}
                  >
                    {produto.image_url ? (
                      <Image src={produto.image_url} alt={produto.nome} width={56} height={56} style={{ objectFit: "cover" }} />
                    ) : (
                      <Icon name="photo_camera" size={26} />
                    )}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600 }}>{produto.nome}</div>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                      <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatPreco(produto.preco)}</span>
                      <span style={{ fontSize: 13, color: "var(--pdm-muted)" }}>{produto.pedido_minimo} un. mín.</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 6, flexWrap: "wrap", fontSize: 13, color: "var(--pdm-muted)" }}>
                      <span>{produto.Categoria ?? "Sem categoria"}</span>
                      <span>·</span>
                      <span>
                        Prazo: {produto.prazo_producao_dias} {produto.prazo_producao_dias === 1 ? "dia" : "dias"}
                      </span>
                      <span>·</span>
                      <span>{STEP_QUANTIDADE_LABELS[produto.step_quantidade]}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 8, flexWrap: "wrap" }}>
                      <DestaqueIndicator show={produto.destaque} />
                      <AtivoToggleCell
                        nome={produto.nome}
                        ativo={ativoOverrides[produto.nome] ?? produto.ativo}
                        saving={savingAtivo[produto.nome] ?? false}
                        feedback={feedbackAtivo[produto.nome]}
                        onToggle={(next) => handleToggleAtivo(produto, next)}
                      />
                    </div>
                  </div>
                </div>

                <div className="admin-mobile-card-divider" />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <Link href={`/admin/produtos/${encodeURIComponent(produto.nome)}`}>
                    <Button variant="secondary" size="sm" iconLeft="edit">
                      Editar
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    iconLeft="delete"
                    aria-label={`Excluir ${produto.nome}`}
                    title="Excluir produto"
                    onClick={() => setProdutoParaExcluir(produto.nome)}
                  />
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {rows.length === 0 && (
          <div className="admin-empty-state" style={{ padding: "80px 24px", display: "grid", placeItems: "center", textAlign: "center", background: "var(--pdm-cream-warm)" }}>
            <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
              <Icon name="cake" size={40} tone="accent" />
              <h3 className="admin-empty-state-title" style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
                {totalCount === 0 ? "Seu cardápio ainda está vazio" : "Nada encontrado com esse filtro"}
              </h3>
              <p style={{ margin: 0, color: "var(--pdm-muted)" }}>
                {totalCount === 0
                  ? "Cadastre o primeiro produto e ele já aparece aqui no painel."
                  : "Ajuste a busca para ver os produtos cadastrados."}
              </p>
              {totalCount === 0 ? (
                <Link href="/admin/produtos/novo">
                  <Button iconLeft="add">Cadastrar o primeiro produto</Button>
                </Link>
              ) : hasFilter ? (
                <Button variant="secondary" onClick={() => setSearch("")}>
                  Limpar busca
                </Button>
              ) : null}
            </div>
          </div>
        )}
      </Card>

      {produtoParaExcluir && (
        <DeleteConfirmDialog
          nome={produtoParaExcluir}
          pending={isPending}
          onCancel={() => setProdutoParaExcluir(null)}
          onConfirm={() => {
            startTransition(async () => {
              await deleteProduto(produtoParaExcluir);
              setProdutoParaExcluir(null);
            });
          }}
        />
      )}
    </div>
  );
}
