"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Input } from "@/components/ds";

export type SubitemCandidato = {
  nome: string;
  ativo: boolean;
};

// Seletor de busca dos subitens (sabores) de um produto tipo "Cento".
// Cada subitem é sempre a referência a um produto real já cadastrado — sem
// campo de texto livre. A lista escolhida vai pro formulário como um input
// hidden "subitem_nome" por item, na ordem em que foi adicionado, lido por
// parseProdutoForm via formData.getAll("subitem_nome").
export function SubitensPicker({
  produtosDisponiveis,
  initialSubitens,
  nomeAtual,
}: {
  produtosDisponiveis: SubitemCandidato[];
  initialSubitens: string[];
  nomeAtual?: string;
}) {
  const [subitens, setSubitens] = useState<string[]>(initialSubitens);
  const [search, setSearch] = useState("");

  const candidatos = useMemo(() => {
    const term = search.trim().toLowerCase();
    return produtosDisponiveis
      .filter((p) => p.nome !== nomeAtual && !subitens.includes(p.nome))
      .filter((p) => (term ? p.nome.toLowerCase().includes(term) : true))
      .slice(0, 8);
  }, [produtosDisponiveis, search, subitens, nomeAtual]);

  const statusPorNome = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of produtosDisponiveis) map.set(p.nome, p.ativo);
    return map;
  }, [produtosDisponiveis]);

  function adicionar(nome: string) {
    setSubitens((atual) => (atual.includes(nome) ? atual : [...atual, nome]));
    setSearch("");
  }

  function remover(nome: string) {
    setSubitens((atual) => atual.filter((n) => n !== nome));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {subitens.map((nome) => (
        <input key={nome} type="hidden" name="subitem_nome" value={nome} />
      ))}

      <div style={{ position: "relative" }}>
        <Input
          icon="search"
          placeholder="Buscar produto pelo nome para adicionar como subitem"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        {search.trim() && (
          <div
            style={{
              position: "absolute",
              top: "calc(100% + 4px)",
              left: 0,
              right: 0,
              zIndex: 10,
              background: "var(--surface-raised)",
              border: "1.5px solid var(--border-subtle)",
              borderRadius: "var(--radius)",
              boxShadow: "var(--shadow-rest)",
              maxHeight: 240,
              overflowY: "auto",
            }}
          >
            {candidatos.length === 0 ? (
              <div style={{ padding: "12px 14px", fontSize: "var(--fs-small)", color: "var(--pdm-muted)" }}>
                Nenhum produto encontrado.
              </div>
            ) : (
              candidatos.map((p) => (
                <button
                  key={p.nome}
                  type="button"
                  onClick={() => adicionar(p.nome)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    width: "100%",
                    padding: "10px 14px",
                    background: "transparent",
                    border: "none",
                    borderBottom: "1px solid var(--border-subtle)",
                    textAlign: "left",
                    cursor: "pointer",
                    fontFamily: "var(--font-body)",
                    fontSize: "var(--fs-body)",
                    color: "var(--text-body)",
                  }}
                >
                  <span>{p.nome}</span>
                  {!p.ativo && (
                    <Badge variant="error" shape="pill">
                      Inativo
                    </Badge>
                  )}
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {subitens.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--fs-small)", color: "var(--pdm-muted)" }}>
          Nenhum subitem adicionado ainda. Busque acima um produto já cadastrado.
        </p>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {subitens.map((nome) => {
            const ativo = statusPorNome.get(nome) ?? true;
            return (
              <li
                key={nome}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  padding: "10px 14px",
                  background: "var(--pdm-cream-warm)",
                  borderRadius: "var(--radius)",
                }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nome}</span>
                  {!ativo && (
                    <Badge variant="error" shape="pill" icon="warning">
                      Produto inativo
                    </Badge>
                  )}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  iconLeft="close"
                  aria-label={`Remover ${nome} da lista de subitens`}
                  title="Remover subitem"
                  onClick={() => remover(nome)}
                />
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
