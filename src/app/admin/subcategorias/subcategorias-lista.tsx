"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Badge, Button, Card, Icon, Input, Toggle } from "@/components/ds";
import { agruparPorCategoria } from "@/lib/subcategorias/regras";
import { NOME_SUBCATEGORIA_MAX, type Subcategoria } from "@/lib/subcategorias/types";
import {
  apagarSubcategoria,
  atualizarAtivoSubcategoria,
  criarSubcategoria,
  moverSubcategoria,
  renomearSubcategoria,
  type ResultadoSubcategoria,
} from "./actions";
import { SubcategoriaMenu } from "./subcategoria-menu";

const thStyle = {
  textAlign: "left" as const,
  fontSize: 13,
  fontWeight: 700,
  textTransform: "uppercase" as const,
  letterSpacing: ".05em",
  color: "var(--pdm-brown)",
  padding: "12px 24px",
};

const ESTILO_ERRO = { margin: "8px 0 0", fontSize: 14, color: "var(--pdm-error)" };

// As 7 categorias, cada uma com a sua lista de subcategorias (as vazias
// também), setas de ordem e a criação ali mesmo. Desktop: tabela com botões só
// de ícone; celular: cards com o menu de 3 pontinhos (como a lista de
// produtos). Os dois ficam no DOM; o CSS mostra um por largura de tela.
export function SubcategoriasLista({
  subcategorias,
  produtosPorSubcategoria,
}: {
  subcategorias: Subcategoria[];
  produtosPorSubcategoria: Record<string, number>;
}) {
  // O erro aparece junto de onde o clique foi dado (na linha, ou no campo de
  // criar da categoria), não num aviso lá no topo da página.
  const [erro, setErro] = useState<{ alvo: string; texto: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ativoLocal, setAtivoLocal] = useState<Record<string, boolean>>({});
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [apagando, setApagando] = useState<string | null>(null);
  const [novoNome, setNovoNome] = useState<Record<string, string>>({});
  const [pendente, iniciar] = useTransition();

  function executar(alvo: string, acao: () => Promise<ResultadoSubcategoria>, aoTerminar?: () => void) {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await acao();
      if (r.error) setErro({ alvo, texto: r.error });
      else aoTerminar?.();
    });
  }

  function alternar(s: Subcategoria, proximo: boolean) {
    const anterior = ativoLocal[s.id] ?? s.ativo;
    setAtivoLocal((a) => ({ ...a, [s.id]: proximo }));
    setErro(null);
    iniciar(async () => {
      const r = await atualizarAtivoSubcategoria(s.id, proximo);
      if (r.error) {
        setAtivoLocal((a) => ({ ...a, [s.id]: anterior }));
        setErro({ alvo: s.id, texto: r.error });
      }
    });
  }

  function criar(evento: FormEvent<HTMLFormElement>, categoria: string) {
    evento.preventDefault();
    executar(
      `cat:${categoria}`,
      () => criarSubcategoria(categoria, novoNome[categoria] ?? ""),
      () => setNovoNome((n) => ({ ...n, [categoria]: "" }))
    );
  }

  function salvarNome(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!renomeando) return;
    const { id, nome } = renomeando;
    executar(id, () => renomearSubcategoria(id, nome), () => setRenomeando(null));
  }

  function apagar(s: Subcategoria) {
    executar(
      s.id,
      () => apagarSubcategoria(s.id),
      () => {
        setApagando(null);
        setAviso(`Subcategoria “${s.nome}” apagada.`);
      }
    );
  }

  function abrirRenomear(s: Subcategoria) {
    setErro(null);
    setApagando(null);
    setRenomeando({ id: s.id, nome: s.nome });
  }

  function abrirApagar(s: Subcategoria) {
    setErro(null);
    setRenomeando(null);
    setApagando(s.id);
  }

  const mensagemDe = (alvo: string) =>
    erro?.alvo === alvo ? (
      <p role="alert" style={ESTILO_ERRO}>
        {erro.texto}
      </p>
    ) : null;

  // Campo de renomear (desktop e celular).
  const formularioDeNome = (s: Subcategoria) => (
    <form onSubmit={salvarNome} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
      <Input
        aria-label={`Novo nome da subcategoria ${s.nome}`}
        value={renomeando?.nome ?? ""}
        maxLength={NOME_SUBCATEGORIA_MAX}
        onChange={(e) => setRenomeando({ id: s.id, nome: e.target.value })}
        autoFocus
      />
      <Button type="submit" size="sm" iconLeft="check" disabled={pendente}>
        Salvar nome
      </Button>
      <Button type="button" size="sm" variant="secondary" onClick={() => setRenomeando(null)}>
        Cancelar
      </Button>
    </form>
  );

  // Confirmação de apagar (desktop e celular), com a recusa do servidor logo abaixo.
  const confirmacaoDeApagar = (s: Subcategoria) => (
    <div>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <span>Apagar “{s.nome}”?</span>
        <Button type="button" size="sm" iconLeft="delete" disabled={pendente} onClick={() => apagar(s)}>
          Sim, apagar
        </Button>
        <Button type="button" size="sm" variant="secondary" onClick={() => setApagando(null)}>
          Não
        </Button>
      </div>
      {mensagemDe(s.id)}
    </div>
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div aria-live="polite">
        {aviso ? (
          <p role="status" style={{ margin: 0, padding: "16px 24px", background: "var(--pdm-cream-warm)", borderRadius: "var(--radius)", color: "var(--pdm-brown)" }}>
            {aviso}
          </p>
        ) : null}
      </div>

      {agruparPorCategoria(subcategorias).map((grupo) => (
        <Card key={grupo.categoria} tone="white" padding="0">
          <h2
            style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.3, margin: 0, padding: "20px 24px 12px", color: "var(--pdm-brown)" }}
          >
            {grupo.rotulo}
          </h2>

          {grupo.itens.length === 0 ? (
            <p style={{ margin: 0, padding: "0 24px 16px", color: "var(--pdm-muted)" }}>Nenhuma subcategoria</p>
          ) : (
            <>
              <div className="admin-table-desktop-wrap" style={{ overflowX: "auto" }}>
                <table className="admin-table" style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "var(--pdm-cream)" }}>
                      <th style={thStyle}>Nome</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Produtos</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Ordem</th>
                      <th style={{ ...thStyle, textAlign: "right" }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.itens.map((s, i) => {
                      const ativo = ativoLocal[s.id] ?? s.ativo;
                      const quantos = produtosPorSubcategoria[s.id] ?? 0;
                      return (
                        <tr key={s.id} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                          <td className="admin-table-title" style={{ padding: "12px 24px" }}>
                            {renomeando?.id === s.id ? (
                              <>
                                {formularioDeNome(s)}
                                {mensagemDe(s.id)}
                              </>
                            ) : (
                              <>
                                <div style={{ fontWeight: 600 }}>{s.nome}</div>
                                <div style={{ fontSize: 13, color: "var(--pdm-muted)" }}>Endereço: {s.slug} (fixo)</div>
                              </>
                            )}
                          </td>
                          <td style={{ padding: "12px 24px", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{quantos}</td>
                          <td style={{ padding: "12px 24px" }}>
                            <Toggle
                              checked={ativo}
                              onCheckedChange={(v) => alternar(s, v)}
                              label={ativo ? "Ativa" : "Inativa"}
                              aria-label={`Subcategoria ${s.nome} ativa`}
                            />
                          </td>
                          <td style={{ padding: "12px 24px" }}>
                            <div style={{ display: "flex", gap: 8 }}>
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                iconLeft="arrow_upward"
                                aria-label={`Subir ${s.nome}`}
                                title="Subir"
                                disabled={i === 0 || pendente}
                                onClick={() => executar(s.id, () => moverSubcategoria(s.id, "subir"))}
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                iconLeft="arrow_downward"
                                aria-label={`Descer ${s.nome}`}
                                title="Descer"
                                disabled={i === grupo.itens.length - 1 || pendente}
                                onClick={() => executar(s.id, () => moverSubcategoria(s.id, "descer"))}
                              />
                            </div>
                            {renomeando?.id !== s.id && apagando !== s.id ? mensagemDe(s.id) : null}
                          </td>
                          <td style={{ padding: "12px 24px", textAlign: "right" }}>
                            {apagando === s.id ? (
                              confirmacaoDeApagar(s)
                            ) : (
                              <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  iconLeft="edit"
                                  aria-label={`Renomear ${s.nome}`}
                                  title="Renomear"
                                  onClick={() => abrirRenomear(s)}
                                />
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  iconLeft="delete"
                                  aria-label={`Apagar ${s.nome}`}
                                  title="Apagar"
                                  onClick={() => abrirApagar(s)}
                                />
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="admin-mobile-cards" style={{ paddingTop: 0 }}>
                {grupo.itens.map((s, i) => {
                  const ativo = ativoLocal[s.id] ?? s.ativo;
                  const quantos = produtosPorSubcategoria[s.id] ?? 0;
                  return (
                    <div key={s.id} className="produto-mobile-row-card" style={{ background: "var(--pdm-cream)", opacity: ativo ? 1 : 0.7 }}>
                      <div style={{ paddingRight: 44 }}>
                        {renomeando?.id === s.id ? (
                          formularioDeNome(s)
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{s.nome}</div>
                            <div style={{ fontSize: 13, color: "var(--pdm-muted)" }}>
                              Endereço: {s.slug} (fixo) · {quantos} {quantos === 1 ? "produto" : "produtos"}
                            </div>
                          </>
                        )}
                        <div style={{ marginTop: 8, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                          <Toggle
                            checked={ativo}
                            onCheckedChange={(v) => alternar(s, v)}
                            label={ativo ? "Ativa" : "Inativa"}
                            aria-label={`Subcategoria ${s.nome} ativa`}
                          />
                          {!ativo ? <Badge variant="soft">Inativa</Badge> : null}
                        </div>
                        {apagando === s.id ? <div style={{ marginTop: 8 }}>{confirmacaoDeApagar(s)}</div> : null}
                        {apagando !== s.id ? mensagemDe(s.id) : null}
                      </div>
                      <div className="produto-mobile-row-card-menu">
                        <SubcategoriaMenu
                          nome={s.nome}
                          podeSubir={i > 0 && !pendente}
                          podeDescer={i < grupo.itens.length - 1 && !pendente}
                          onSubir={() => executar(s.id, () => moverSubcategoria(s.id, "subir"))}
                          onDescer={() => executar(s.id, () => moverSubcategoria(s.id, "descer"))}
                          onRenomear={() => abrirRenomear(s)}
                          onApagar={() => abrirApagar(s)}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          <form
            onSubmit={(e) => criar(e, grupo.categoria)}
            style={{ padding: "16px 24px", background: "var(--pdm-cream)" }}
          >
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Input
                aria-label={`Nome da nova subcategoria de ${grupo.rotulo}`}
                placeholder="Nome da nova subcategoria"
                value={novoNome[grupo.categoria] ?? ""}
                maxLength={NOME_SUBCATEGORIA_MAX}
                onChange={(e) => setNovoNome((n) => ({ ...n, [grupo.categoria]: e.target.value }))}
              />
              <Button type="submit" iconLeft="add" disabled={pendente}>
                Adicionar em {grupo.rotulo}
              </Button>
            </div>
            {mensagemDe(`cat:${grupo.categoria}`)}
          </form>
        </Card>
      ))}

      <p style={{ margin: 0, fontSize: 13, color: "var(--pdm-muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <Icon name="info" size={18} tone="inherit" />
        Só dá para apagar uma subcategoria que nenhum produto usa; senão, desative. A categoria não muda depois de criada.
      </p>
    </div>
  );
}
