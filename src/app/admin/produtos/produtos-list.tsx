"use client";

import Image from "next/image";
import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import type { CategoriaProduto, Produto } from "@/lib/produtos/types";
import { CATEGORIA_VALUES } from "@/lib/produtos/types";
import { Card, Icon, Input, Button, Badge, Toggle } from "@/components/ds";
import { DeleteConfirmDialog } from "./delete-confirm-dialog";
import { ProductActionMenu } from "./product-action-menu";
import { deleteProduto, updateProdutoAtivo, updateProdutoDestaque } from "./actions";

// Ícone de destaque, sem texto ao lado (só title/aria-label), reaproveitado
// na tabela desktop. tone="default" (não "accent"): a auditoria de
// acessibilidade de 22/09/2026 mediu --pdm-gold-soft (tone="accent") em
// 2,67:1 contra fundo branco, abaixo do 3:1 exigido pra ícone com
// significado (SC 1.4.11). --icon-default (--pdm-brown) tem 5,9:1.
function DestaqueIndicator({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <span role="img" aria-label="Produto em destaque" title="Produto em destaque" style={{ display: "inline-flex" }}>
      <Icon name="check_circle" size={22} tone="default" />
    </span>
  );
}

// Toggle inline de status ativo/inativo na tabela desktop. Sem estado
// próprio: o estado vive no ProdutosList (única fonte de verdade). A partir
// da reorganização de 22/09/2026, esse toggle existe só no desktop — no
// mobile, ativar/desativar passou para o menu de 3 pontinhos do card.
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
      {/* --pdm-success (texto): 3,75:1 contra branco, abaixo do 4,5:1
          exigido pra texto pequeno (SC 1.4.3, achado da auditoria de
          22/09/2026). --pdm-success-text é a mesma cor escurecida, 5,62:1,
          só pra uso como texto — ver colors.css. */}
      <span style={{ fontSize: 13, color: ativo ? "var(--pdm-success-text)" : "var(--pdm-muted)" }}>
        {ativo ? "Ativo" : "Inativo"}
      </span>
      {feedback === "erro" && (
        <span role="alert" style={{ fontSize: 12, color: "var(--pdm-error)" }}>
          Erro ao salvar
        </span>
      )}
      {feedback === "ok" && (
        <span role="status" style={{ fontSize: 12, color: "var(--pdm-success-text)" }}>
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

// Ignora acento e maiúscula/minúscula na busca por nome ("pao de mel"
// encontra "Pão de Mel").
function normalizar(valor: string): string {
  return valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  fontSize: 14,
  textTransform: "uppercase",
  letterSpacing: ".05em",
  color: "var(--pdm-brown)",
  padding: "16px 24px",
};

type ChipValue = "Todos" | CategoriaProduto | "Sem categoria" | "Inativos";
const CHIPS: ChipValue[] = ["Todos", ...CATEGORIA_VALUES, "Sem categoria", "Inativos"];

export function ProdutosList({ produtos }: { produtos: Produto[] }) {
  const [search, setSearch] = useState("");
  const [chip, setChip] = useState<ChipValue>("Todos");
  const [produtoParaExcluir, setProdutoParaExcluir] = useState<string | null>(null);
  // Produto já excluído, mas os arquivos das fotos extras não saíram do
  // storage (ver deleteProduto).
  const [avisoExclusao, setAvisoExclusao] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const [ativoOverrides, setAtivoOverrides] = useState<Record<string, boolean>>({});
  const [savingAtivo, setSavingAtivo] = useState<Record<string, boolean>>({});
  const [feedbackAtivo, setFeedbackAtivo] = useState<Record<string, "ok" | "erro" | undefined>>({});
  const [, startAtivoTransition] = useTransition();

  const [destaqueOverrides, setDestaqueOverrides] = useState<Record<string, boolean>>({});
  const [, startDestaqueTransition] = useTransition();

  // Feedback rápido do menu de ações do card mobile ("Produto desativado"),
  // no mesmo padrão do "Observação salva" do calendário de dias off —
  // independente do feedback da tabela desktop (textos diferentes).
  const [mobileFeedback, setMobileFeedback] = useState<Record<string, { texto: string; tom: "ok" | "erro" } | undefined>>({});

  function mostrarFeedbackMobile(nome: string, texto: string, tom: "ok" | "erro") {
    setMobileFeedback((f) => ({ ...f, [nome]: { texto, tom } }));
    setTimeout(() => {
      setMobileFeedback((f) => ({ ...f, [nome]: undefined }));
    }, 2500);
  }

  function handleToggleAtivo(produto: Produto, next: boolean, origem: "desktop" | "mobile" = "desktop") {
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
        if (origem === "mobile") mostrarFeedbackMobile(produto.nome, "Erro ao salvar", "erro");
      } else {
        setFeedbackAtivo((feedback) => ({ ...feedback, [produto.nome]: "ok" }));
        if (origem === "mobile") {
          mostrarFeedbackMobile(produto.nome, next ? "Produto ativado" : "Produto desativado", "ok");
        }
      }
      setTimeout(() => {
        setFeedbackAtivo((feedback) => ({ ...feedback, [produto.nome]: undefined }));
      }, 2500);
    });
  }

  function handleToggleDestaque(produto: Produto, next: boolean) {
    const previous = destaqueOverrides[produto.nome] ?? produto.destaque;
    setDestaqueOverrides((overrides) => ({ ...overrides, [produto.nome]: next }));

    startDestaqueTransition(async () => {
      const result = await updateProdutoDestaque(produto.nome, next);
      if (result.error) {
        setDestaqueOverrides((overrides) => ({ ...overrides, [produto.nome]: previous }));
        mostrarFeedbackMobile(produto.nome, "Erro ao salvar", "erro");
      } else {
        mostrarFeedbackMobile(produto.nome, next ? "Produto em destaque" : "Destaque removido", "ok");
      }
    });
  }

  const rows = useMemo(() => {
    const term = normalizar(search.trim());
    return produtos.filter((produto) => {
      const ativoAtual = ativoOverrides[produto.nome] ?? produto.ativo;

      let matchChip = true;
      if (chip === "Inativos") matchChip = !ativoAtual;
      else if (chip === "Sem categoria") matchChip = !produto.Categoria;
      else if (chip !== "Todos") matchChip = produto.Categoria === chip;
      if (!matchChip) return false;

      if (!term) return true;
      return normalizar(produto.nome).includes(term);
    });
  }, [produtos, search, chip, ativoOverrides]);

  const totalCount = produtos.length;
  const hasFilter = search.trim().length > 0 || chip !== "Todos";
  const resultLabel = rows.length === 1 ? "1 produto" : `${rows.length} produtos`;

  function limparFiltros() {
    setSearch("");
    setChip("Todos");
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {avisoExclusao && (
        <div
          role="alert"
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            background: "var(--pdm-cream-warm)",
            borderRadius: "var(--radius)",
            boxShadow: "var(--shadow-rest)",
            padding: "16px 24px",
            color: "var(--pdm-error)",
          }}
        >
          <Icon name="error" size={24} tone="inherit" />
          <span>{avisoExclusao}</span>
        </div>
      )}
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

      {/* overflow:visible sobrescreve o overflow:hidden padrão do Card: a
          barra de busca+chips logo abaixo usa position:sticky (rolagem no
          mobile), e sticky não funciona dentro de um ancestral com overflow
          diferente de visible — bug relatado em 23/09/2026 (primeiro item
          cortado, chips não respondiam ao toque). Compensado com o
          borderRadius no topo da própria barra, já que ela deixa de ser
          clipada pelo cantos arredondados do Card. */}
      <Card tone="white" padding="0" style={{ overflow: "visible" }}>
        <div
          className="admin-table-toolbar produtos-toolbar-sticky"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            padding: 24,
            borderBottom: "1px solid var(--border-subtle)",
            borderTopLeftRadius: "var(--radius)",
            borderTopRightRadius: "var(--radius)",
          }}
        >
          {/* width:100% + minWidth:0 explícitos: sem isso, esta linha (item
              flex do toolbar em coluna) mede sua largura pelo conteúdo
              intrínseco do Input+contador em vez de encolher pro container —
              o cálculo de largura mínima de um item flex ignora width:100%
              de filhos percentuais (percentual não resolve em contexto de
              tamanho intrínseco), então o Input e o card inteiro vazavam pra
              fora da tela no mobile. Bug relatado em 23/09/2026. */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", width: "100%", minWidth: 0 }}>
            <div className="admin-table-search">
              <Input
                icon="search"
                placeholder="Buscar pelo nome do produto"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onClear={() => setSearch("")}
              />
            </div>
            <div style={{ marginLeft: "auto", fontSize: 14, color: "var(--pdm-muted)" }}>{resultLabel}</div>
          </div>

          <div className="produtos-chip-row">
            {CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                className={`produtos-chip${chip === c ? " produtos-chip--active" : ""}`}
                aria-pressed={chip === c}
                onClick={() => setChip(c)}
              >
                {c}
              </button>
            ))}
          </div>
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
                    <td data-label="Destaque" style={{ padding: "16px 24px", textAlign: "center" }}>
                      <DestaqueIndicator show={destaqueOverrides[produto.nome] ?? produto.destaque} />
                    </td>
                    <td data-label="Status" style={{ padding: "16px 24px" }}>
                      <AtivoToggleCell
                        nome={produto.nome}
                        ativo={ativoOverrides[produto.nome] ?? produto.ativo}
                        saving={savingAtivo[produto.nome] ?? false}
                        feedback={feedbackAtivo[produto.nome]}
                        onToggle={(next) => handleToggleAtivo(produto, next, "desktop")}
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
            {rows.map((produto) => {
              const ativoAtual = ativoOverrides[produto.nome] ?? produto.ativo;
              const destaqueAtual = destaqueOverrides[produto.nome] ?? produto.destaque;
              const feedback = mobileFeedback[produto.nome];
              return (
                <div
                  key={produto.nome}
                  className="produto-mobile-row-card"
                  style={{ opacity: ativoAtual ? 1 : 0.6 }}
                >
                  <Link
                    href={`/admin/produtos/${encodeURIComponent(produto.nome)}`}
                    className="produto-mobile-row-card-link"
                    aria-label={`Editar ${produto.nome}`}
                  />
                  <div className="produto-mobile-row-card-content">
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
                    <div style={{ minWidth: 0, flex: 1, paddingRight: 40 }}>
                      <div className="produto-mobile-row-card-nome">{produto.nome}</div>

                      {!ativoAtual || destaqueAtual ? (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 4 }}>
                          {!ativoAtual ? <Badge variant="outline">Inativo</Badge> : null}
                          {destaqueAtual ? <Badge variant="gold">Destaque</Badge> : null}
                        </div>
                      ) : null}

                      <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 6, flexWrap: "wrap" }}>
                        <span style={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{formatPreco(produto.preco)}</span>
                        <span style={{ fontSize: 13, color: "var(--pdm-muted)" }}>{produto.pedido_minimo} un. mín.</span>
                      </div>

                      <div style={{ marginTop: 4, fontSize: 13 }}>
                        {produto.Categoria ? (
                          <span style={{ color: "var(--pdm-muted)" }}>{produto.Categoria}</span>
                        ) : (
                          <span style={{ color: "var(--pdm-brown-deep)" }}>Sem categoria</span>
                        )}
                      </div>

                      {feedback ? (
                        <div style={{ marginTop: 6 }}>
                          <span
                            role={feedback.tom === "erro" ? "alert" : "status"}
                            style={{ fontSize: 12, color: feedback.tom === "erro" ? "var(--pdm-error)" : "var(--pdm-success-text)" }}
                          >
                            {feedback.texto}
                          </span>
                        </div>
                      ) : null}
                    </div>
                  </div>

                  <div className="produto-mobile-row-card-menu">
                    <ProductActionMenu
                      nome={produto.nome}
                      ativo={ativoAtual}
                      destaque={destaqueAtual}
                      editHref={`/admin/produtos/${encodeURIComponent(produto.nome)}`}
                      onToggleAtivo={() => handleToggleAtivo(produto, !ativoAtual, "mobile")}
                      onToggleDestaque={() => handleToggleDestaque(produto, !destaqueAtual)}
                      onDelete={() => setProdutoParaExcluir(produto.nome)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {rows.length === 0 && (
          <div
            className="admin-empty-state"
            style={{
              padding: "80px 24px",
              display: "grid",
              placeItems: "center",
              textAlign: "center",
              background: "var(--pdm-cream-warm)",
              borderBottomLeftRadius: "var(--radius)",
              borderBottomRightRadius: "var(--radius)",
            }}
          >
            <div style={{ maxWidth: "46ch", display: "grid", justifyItems: "center", gap: 16 }}>
              <Icon name="cake" size={40} tone="accent" />
              <h3 className="admin-empty-state-title" style={{ fontFamily: "var(--font-heading)", fontSize: 24, lineHeight: 1.4, margin: 0, color: "var(--pdm-brown)" }}>
                {totalCount === 0 ? "Seu cardápio ainda está vazio" : "Nenhum produto encontrado"}
              </h3>
              <p style={{ margin: 0, color: "var(--pdm-muted)" }}>
                {totalCount === 0
                  ? "Cadastre o primeiro produto e ele já aparece aqui no painel."
                  : "Ajuste a busca ou a categoria para ver os produtos cadastrados."}
              </p>
              {totalCount === 0 ? (
                <Link href="/admin/produtos/novo">
                  <Button iconLeft="add">Cadastrar o primeiro produto</Button>
                </Link>
              ) : hasFilter ? (
                <Button variant="secondary" onClick={limparFiltros}>
                  Limpar busca e filtro
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
              const { aviso } = await deleteProduto(produtoParaExcluir);
              setAvisoExclusao(aviso ?? null);
              setProdutoParaExcluir(null);
            });
          }}
        />
      )}
    </div>
  );
}
