"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Button, Card, Icon, Input, Toggle } from "@/components/ds";
import { DESCRICAO_ITEM_MAX, NOME_ITEM_MAX, type ItemDaLista, type Lista } from "@/lib/kit/listas";
import { adicionarOpcao, atualizarAtivoOpcao, editarOpcao, moverOpcao, type ResultadoKitLista } from "./actions";

const ESTILO_ERRO = { margin: "8px 0 0", fontSize: 14, color: "var(--pdm-error)" };

// Uma lista por cartão, com as opções em linhas (setas de ordem, interruptor,
// editar nome e descrição) e o campo de adicionar no fim. Sem apagar: opção
// usada não pode sumir, então se desativa.
export function KitListasEditor({ listas }: { listas: Lista[] }) {
  const [erro, setErro] = useState<{ alvo: string; texto: string } | null>(null);
  const [ativoLocal, setAtivoLocal] = useState<Record<string, boolean>>({});
  const [editando, setEditando] = useState<{ id: string; nome: string; descricao: string } | null>(null);
  const [novo, setNovo] = useState<Record<string, { nome: string; descricao: string }>>({});
  const [pendente, iniciar] = useTransition();

  function executar(alvo: string, acao: () => Promise<ResultadoKitLista>, aoTerminar?: () => void) {
    setErro(null);
    iniciar(async () => {
      const r = await acao();
      if (r.error) setErro({ alvo, texto: r.error });
      else aoTerminar?.();
    });
  }

  function alternar(item: ItemDaLista, proximo: boolean) {
    const anterior = ativoLocal[item.id] ?? item.ativo;
    setAtivoLocal((a) => ({ ...a, [item.id]: proximo }));
    setErro(null);
    iniciar(async () => {
      const r = await atualizarAtivoOpcao(item.id, proximo);
      if (r.error) {
        setAtivoLocal((a) => ({ ...a, [item.id]: anterior }));
        setErro({ alvo: item.id, texto: r.error });
      }
    });
  }

  function salvarEdicao(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!editando) return;
    const { id, nome, descricao } = editando;
    executar(id, () => editarOpcao(id, nome, descricao), () => setEditando(null));
  }

  function adicionar(evento: FormEvent<HTMLFormElement>, lista: Lista) {
    evento.preventDefault();
    const valores = novo[lista.id] ?? { nome: "", descricao: "" };
    executar(
      `lista:${lista.id}`,
      () => adicionarOpcao(lista.id, valores.nome, valores.descricao),
      () => setNovo((n) => ({ ...n, [lista.id]: { nome: "", descricao: "" } }))
    );
  }

  const mensagemDe = (alvo: string) =>
    erro?.alvo === alvo ? (
      <p role="alert" style={ESTILO_ERRO}>
        {erro.texto}
      </p>
    ) : null;

  if (listas.length === 0) {
    return <p style={{ color: "var(--pdm-muted)" }}>Nenhuma lista ainda. As listas chegam com a carga dos kits.</p>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {listas.map((lista) => (
        <Card key={lista.id} tone="white" padding="0">
          <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.3, margin: 0, padding: "20px 24px 12px", color: "var(--pdm-brown)" }}>
            {lista.nome}
          </h2>

          {lista.itens.length === 0 ? (
            <p style={{ margin: 0, padding: "0 24px 16px", color: "var(--pdm-muted)" }}>Nenhuma opção</p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {lista.itens.map((item, i) => {
                const ativo = ativoLocal[item.id] ?? item.ativo;
                return (
                  <li key={item.id} style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                      <div style={{ flex: "1 1 240px" }}>
                        {editando?.id === item.id ? (
                          <form onSubmit={salvarEdicao} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                            <Input
                              aria-label={`Novo nome da opção ${item.nome}`}
                              value={editando.nome}
                              maxLength={NOME_ITEM_MAX}
                              onChange={(e) => setEditando({ ...editando, nome: e.target.value })}
                              autoFocus
                            />
                            <Input
                              aria-label={`Descrição da opção ${item.nome}`}
                              placeholder="Descrição (opcional)"
                              value={editando.descricao}
                              maxLength={DESCRICAO_ITEM_MAX}
                              onChange={(e) => setEditando({ ...editando, descricao: e.target.value })}
                            />
                            <Button type="submit" size="sm" iconLeft="check" disabled={pendente}>
                              Salvar
                            </Button>
                            <Button type="button" size="sm" variant="secondary" onClick={() => setEditando(null)}>
                              Cancelar
                            </Button>
                          </form>
                        ) : (
                          <>
                            <div style={{ fontWeight: 600 }}>{item.nome}</div>
                            {item.descricao ? <div style={{ fontSize: 13, color: "var(--pdm-muted)" }}>{item.descricao}</div> : null}
                          </>
                        )}
                      </div>
                      <Toggle
                        checked={ativo}
                        onCheckedChange={(v) => alternar(item, v)}
                        label={ativo ? "Ativa" : "Inativa"}
                        aria-label={`Opção ${item.nome} ativa`}
                      />
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          iconLeft="arrow_upward"
                          aria-label={`Subir ${item.nome}`}
                          title="Subir"
                          disabled={i === 0 || pendente}
                          onClick={() => executar(item.id, () => moverOpcao(item.id, "subir"))}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          iconLeft="arrow_downward"
                          aria-label={`Descer ${item.nome}`}
                          title="Descer"
                          disabled={i === lista.itens.length - 1 || pendente}
                          onClick={() => executar(item.id, () => moverOpcao(item.id, "descer"))}
                        />
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          iconLeft="edit"
                          aria-label={`Editar ${item.nome}`}
                          title="Editar"
                          disabled={pendente}
                          onClick={() => {
                            setErro(null);
                            setEditando({ id: item.id, nome: item.nome, descricao: item.descricao ?? "" });
                          }}
                        />
                      </div>
                    </div>
                    {mensagemDe(item.id)}
                  </li>
                );
              })}
            </ul>
          )}

          <form onSubmit={(e) => adicionar(e, lista)} style={{ padding: "16px 24px", background: "var(--pdm-cream)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
              <Input
                aria-label={`Nome da nova opção de ${lista.nome}`}
                placeholder="Nome da nova opção"
                value={novo[lista.id]?.nome ?? ""}
                maxLength={NOME_ITEM_MAX}
                onChange={(e) => setNovo((n) => ({ ...n, [lista.id]: { nome: e.target.value, descricao: n[lista.id]?.descricao ?? "" } }))}
              />
              <Input
                aria-label={`Descrição da nova opção de ${lista.nome}`}
                placeholder="Descrição (opcional)"
                value={novo[lista.id]?.descricao ?? ""}
                maxLength={DESCRICAO_ITEM_MAX}
                onChange={(e) => setNovo((n) => ({ ...n, [lista.id]: { nome: n[lista.id]?.nome ?? "", descricao: e.target.value } }))}
              />
              <Button type="submit" iconLeft="add" disabled={pendente}>
                Adicionar em {lista.nome}
              </Button>
            </div>
            {mensagemDe(`lista:${lista.id}`)}
          </form>
        </Card>
      ))}

      <p style={{ margin: 0, fontSize: 13, color: "var(--pdm-muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <Icon name="info" size={18} tone="inherit" />
        Não dá para apagar uma opção: desative. Quantidades já gravadas continuam e a cliente deixa de ver a opção.
      </p>
    </div>
  );
}
