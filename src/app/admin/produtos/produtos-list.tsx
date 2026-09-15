"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { Produto } from "@/lib/produtos/types";
import { Card, Icon, Input, Button } from "@/components/ds";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { deleteProduto } from "./actions";

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
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 24, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ fontFamily: "var(--font-heading)", fontSize: 32, lineHeight: 1.3, margin: 0, color: "var(--pdm-brown)" }}>
            Produtos
          </h1>
          <p style={{ margin: "4px 0 0", color: "var(--pdm-muted)" }}>
            {totalCount === 0 ? "Nenhum produto cadastrado ainda." : "Esses são os produtos que aparecem no cardápio."}
          </p>
        </div>
        <Link href="/admin/produtos/novo">
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
          <div style={{ overflowX: "auto" }}>
            <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "var(--pdm-cream)" }}>
                  <th style={{ ...thStyle, width: 96 }}>Foto</th>
                  <th style={thStyle}>Nome</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 130 }}>Preço</th>
                  <th style={{ ...thStyle, textAlign: "right", width: 170 }}>Pedido mínimo</th>
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
                    <td data-label="Preço" style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                      {formatPreco(produto.preco)}
                    </td>
                    <td
                      data-label="Pedido mínimo"
                      style={{ padding: "16px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums", color: "var(--pdm-muted)" }}
                    >
                      {produto.pedido_minimo} un.
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
        ) : (
          <div style={{ padding: "80px 24px", display: "grid", placeItems: "center", textAlign: "center", background: "var(--pdm-cream-warm)" }}>
            <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
              <Icon name="cake" size={40} tone="accent" />
              <h3 style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
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
