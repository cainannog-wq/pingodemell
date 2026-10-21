"use client";

/* eslint-disable react-hooks/refs -- useOrdenarArrastando guarda uma ref do contêiner, lida só em eventos e efeitos (nunca na renderização); a regra enxerga o objeto devolvido como se o lesse ao renderizar. */

import { useState, useTransition, type FormEvent } from "react";
import { Button, Card, Icon, Input, Toggle } from "@/components/ds";
import { DESCRICAO_ITEM_MAX, NOME_ITEM_MAX, type ItemDaLista, type Lista } from "@/lib/kit/listas";
import { AlcaDeOrdem, AnuncioDeOrdem, useOrdenarArrastando } from "../ordenar-arrastando";
import { adicionarOpcao, atualizarAtivoOpcao, editarOpcao, reordenarOpcoes, type ResultadoKitLista } from "./actions";

const ESTILO_ERRO = { margin: "8px 0 0", fontSize: 14, color: "var(--pdm-error)" };

type Comum = {
  pendente: boolean;
  ativoLocal: Record<string, boolean>;
  editando: { id: string; nome: string; descricao: string } | null;
  setEditando: (v: { id: string; nome: string; descricao: string } | null) => void;
  novo: Record<string, { nome: string; descricao: string }>;
  setNovo: (f: (n: Record<string, { nome: string; descricao: string }>) => Record<string, { nome: string; descricao: string }>) => void;
  mensagemDe: (alvo: string) => React.ReactNode;
  alternar: (item: ItemDaLista, proximo: boolean) => void;
  salvarEdicao: (e: FormEvent<HTMLFormElement>) => void;
  adicionar: (e: FormEvent<HTMLFormElement>, lista: Lista) => void;
  limparErro: () => void;
  ordenar: (listaId: string, ids: string[]) => void;
  ordemLocal: Record<string, string[]>;
};

// Uma lista por cartão, com as opções em linhas (alça de arrastar, interruptor,
// editar nome e descrição) e o campo de adicionar no fim. A ordem muda
// arrastando a alça de seis pontos (ou pelas setas do teclado, com o foco na
// alça). Sem apagar: opção usada não pode sumir, então se desativa.
export function KitListasEditor({ listas }: { listas: Lista[] }) {
  const [erro, setErro] = useState<{ alvo: string; texto: string } | null>(null);
  const [ativoLocal, setAtivoLocal] = useState<Record<string, boolean>>({});
  const [editando, setEditando] = useState<{ id: string; nome: string; descricao: string } | null>(null);
  const [novo, setNovo] = useState<Record<string, { nome: string; descricao: string }>>({});
  // Ordem mostrada enquanto o servidor grava (e depois, até a página recarregar).
  const [ordemLocal, setOrdemLocal] = useState<Record<string, string[]>>({});
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

  function ordenar(listaId: string, ids: string[]) {
    setOrdemLocal((o) => ({ ...o, [listaId]: ids }));
    setErro(null);
    iniciar(async () => {
      const r = await reordenarOpcoes(listaId, ids);
      if (r.error) {
        setOrdemLocal((o) => {
          const { [listaId]: _descartada, ...resto } = o;
          void _descartada;
          return resto;
        });
        setErro({ alvo: `lista:${listaId}`, texto: r.error });
      }
    });
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

  const comum: Comum = {
    pendente,
    ativoLocal,
    editando,
    setEditando,
    novo,
    setNovo,
    mensagemDe,
    alternar,
    salvarEdicao,
    adicionar,
    limparErro: () => setErro(null),
    ordenar,
    ordemLocal,
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {listas.map((lista) => (
        <CartaoDaLista key={lista.id} lista={lista} comum={comum} />
      ))}

      <p style={{ margin: 0, fontSize: 13, color: "var(--pdm-muted)", display: "flex", gap: 8, alignItems: "center" }}>
        <Icon name="info" size={18} tone="inherit" />
        Para mudar a ordem, segure os seis pontos e arraste a opção. Não dá para apagar uma opção: desative. Quantidades já gravadas continuam e a cliente deixa de ver a opção.
      </p>
    </div>
  );
}

function CartaoDaLista({ lista, comum }: { lista: Lista; comum: Comum }) {
  const { pendente, ativoLocal, editando, setEditando, novo, setNovo, mensagemDe, alternar, salvarEdicao, adicionar, limparErro, ordenar, ordemLocal } = comum;

  // Ordem local (a que acabou de ser arrastada) vale se ainda cobre os mesmos itens.
  const local = ordemLocal[lista.id];
  const mesmos = local && local.length === lista.itens.length && lista.itens.every((i) => local.includes(i.id));
  const itens = mesmos ? (local.map((id) => lista.itens.find((i) => i.id === id)) as ItemDaLista[]) : lista.itens;
  const ids = itens.map((i) => i.id);

  const ordem = useOrdenarArrastando(ids, (nova) => ordenar(lista.id, nova), (id) => itens.find((i) => i.id === id)?.nome ?? "opção");

  return (
    <Card tone="white" padding="0">
      <h2 style={{ fontFamily: "var(--font-heading)", fontSize: 22, lineHeight: 1.3, margin: 0, padding: "20px 24px 12px", color: "var(--pdm-brown)" }}>
        {lista.nome}
      </h2>

      {itens.length === 0 ? (
        <p style={{ margin: 0, padding: "0 24px 16px", color: "var(--pdm-muted)" }}>Nenhuma opção</p>
      ) : (
        <ul ref={ordem.registrarRaiz} style={{ listStyle: "none", margin: 0, padding: 0 }}>
          {itens.map((item) => {
            const ativo = ativoLocal[item.id] ?? item.ativo;
            return (
              <li key={item.id} {...ordem.propsDoItem(item.id)} style={{ padding: "12px 24px", borderBottom: "1px solid var(--border-subtle)" }}>
                <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
                  <AlcaDeOrdem nome={item.nome} desligada={pendente || itens.length < 2} {...ordem.propsDaAlca(item.id)} />
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
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    iconLeft="edit"
                    aria-label={`Editar ${item.nome}`}
                    title="Editar"
                    disabled={pendente}
                    onClick={() => {
                      limparErro();
                      setEditando({ id: item.id, nome: item.nome, descricao: item.descricao ?? "" });
                    }}
                  />
                </div>
                {mensagemDe(item.id)}
              </li>
            );
          })}
        </ul>
      )}
      <AnuncioDeOrdem texto={ordem.anuncio} />

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
  );
}
