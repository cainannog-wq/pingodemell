"use client";

import { useMemo, useState } from "react";
import { Badge, Button, Select } from "@/components/ds";

export type SubitemCandidato = {
  nome: string;
  ativo: boolean;
};

const SEM_SELECAO = "";

// Seletor dos subitens (sabores) de um produto tipo "Cento": dropdown com
// os produtos já cadastrados no catálogo, sem campo de texto livre. Um
// <select> nativo em vez de busca com lista sobreposta — o dropdown do
// navegador não fica sujeito ao overflow:hidden do Card que envolve o
// formulário (usado pros cantos arredondados), diferente de uma lista
// própria posicionada em absolute, que ficava cortada por ele.
//
// A lista escolhida vai pro formulário como um input hidden "subitem_nome"
// por item, na ordem em que foi adicionado, lido por parseProdutoForm via
// formData.getAll("subitem_nome").
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
  const [selecionado, setSelecionado] = useState(SEM_SELECAO);

  const candidatos = useMemo(
    () => produtosDisponiveis.filter((p) => p.nome !== nomeAtual && !subitens.includes(p.nome)),
    [produtosDisponiveis, subitens, nomeAtual]
  );

  const statusPorNome = useMemo(() => {
    const map = new Map<string, boolean>();
    for (const p of produtosDisponiveis) map.set(p.nome, p.ativo);
    return map;
  }, [produtosDisponiveis]);

  function adicionar() {
    if (!selecionado) return;
    setSubitens((atual) => (atual.includes(selecionado) ? atual : [...atual, selecionado]));
    setSelecionado(SEM_SELECAO);
  }

  function remover(nome: string) {
    setSubitens((atual) => atual.filter((n) => n !== nome));
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {subitens.map((nome) => (
        <input key={nome} type="hidden" name="subitem_nome" value={nome} />
      ))}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        <div style={{ flex: "1 1 260px", minWidth: 200 }}>
          <Select
            aria-label="Escolher produto para adicionar como subitem"
            value={selecionado}
            onChange={(e) => setSelecionado(e.target.value)}
          >
            <option value={SEM_SELECAO}>
              {candidatos.length === 0 ? "Nenhum produto disponível" : "Selecione um produto do catálogo…"}
            </option>
            {candidatos.map((p) => (
              <option key={p.nome} value={p.nome}>
                {p.nome}
                {!p.ativo ? " (inativo)" : ""}
              </option>
            ))}
          </Select>
        </div>
        <Button type="button" variant="secondary" iconLeft="add" onClick={adicionar} disabled={!selecionado}>
          Adicionar
        </Button>
      </div>

      {subitens.length === 0 ? (
        <p style={{ margin: 0, fontSize: "var(--fs-small)", color: "var(--pdm-muted)" }}>
          Nenhum subitem adicionado ainda. Escolha um produto na lista acima.
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
