"use client";

import { useState } from "react";
import { AlcaDeOrdem, ListaOrdenavel } from "../ordenar-arrastando";
import { Button, Field, Input, Toggle } from "@/components/ds";
import { RECHEIO_PRODUTO_NOME_MAX, validarRecheiosDoProduto, type RecheioDoProduto } from "@/lib/produtos/recheios-produto";

// Linha da lista na tela: o id só existe para recheio que já estava salvo
// (o carrinho de quem já escolheu continua batendo); a chave é da tela.
type LinhaTela = { chave: string; id?: string; nome: string };

export type EstadoRecheios = { ligado: boolean; linhas: LinhaTela[] };

let contador = 0;
const novaChave = () => `r${++contador}`;

export function estadoInicialDosRecheios(iniciais: RecheioDoProduto[]): EstadoRecheios {
  return { ligado: iniciais.length > 0, linhas: iniciais.map((r) => ({ chave: novaChave(), id: r.id, nome: r.nome })) };
}

// Mensagem de bloqueio do Salvar (ou null). Só vale com o interruptor
// ligado; o servidor confere de novo.
export function erroDosRecheios(estado: EstadoRecheios): string | null {
  if (!estado.ligado) return null;
  const r = validarRecheiosDoProduto(estado.linhas.map(({ id, nome }) => ({ id, nome })));
  return r.ok ? null : r.erro;
}

const BOTAO_ICONE = { minWidth: 44, minHeight: 44, padding: 0 } as const;

// Campos escondidos do envio. Visível (produto elegível): o interruptor e a
// lista. Não elegível mas com lista salva (a categoria ou o tipo mudou): manda
// lista vazia para o servidor limpar. Senão, nada vai.
export function CamposEscondidosDosRecheios({
  visivel,
  salvos,
  estado,
}: {
  visivel: boolean;
  salvos: number;
  estado: EstadoRecheios;
}) {
  if (!visivel && salvos === 0) return null;
  const ligado = visivel && estado.ligado;
  return (
    <>
      <input type="hidden" name="recheios_ligados" value={ligado ? "1" : "0"} />
      <input
        type="hidden"
        name="recheios_produto"
        value={JSON.stringify(ligado ? estado.linhas.map(({ id, nome }) => (id ? { id, nome } : { nome })) : [])}
      />
    </>
  );
}

// Interruptor "Recheios personalizados" e a lista editável (um campo de texto
// por recheio, adicionar, remover e a alça de seis pontos para arrastar). Sem ativo/inativo por
// recheio: a Taami remove e cadastra de novo. Componente controlado: o estado
// vive no ProdutoForm, que bloqueia o Salvar enquanto houver erro.
export function RecheiosDoProdutoCampo({
  estado,
  aoMudar,
  mostrarErro,
  desabilitado = false,
}: {
  estado: EstadoRecheios;
  aoMudar: (estado: EstadoRecheios) => void;
  mostrarErro: boolean;
  desabilitado?: boolean;
}) {
  const [foco, setFoco] = useState<string | null>(null);
  const erro = mostrarErro ? erroDosRecheios(estado) : null;

  function definirLinhas(linhas: LinhaTela[]) {
    aoMudar({ ...estado, linhas });
  }
  function ligar(ligado: boolean) {
    // Ligar com a lista vazia já abre o primeiro campo.
    const linhas = ligado && estado.linhas.length === 0 ? [{ chave: novaChave(), nome: "" }] : estado.linhas;
    aoMudar({ ligado, linhas });
  }
  // Nova ordem vinda da alça (arrastar, ou setas do teclado com o foco nela).
  function ordenar(chaves: string[]) {
    definirLinhas(chaves.map((c) => estado.linhas.find((l) => l.chave === c) as LinhaTela));
  }

  return (
    <div className="produto-recheios" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <Toggle
        checked={estado.ligado}
        onCheckedChange={ligar}
        disabled={desabilitado}
        label="Recheios personalizados"
        aria-label="Recheios personalizados"
      />
      <p style={{ margin: 0, color: "var(--pdm-muted)", fontSize: 14 }}>
        Ligado, o cliente escolhe um destes recheios na página do produto (obrigatório). O preço continua sendo o do
        produto. Desligado, a lista é apagada ao salvar.
      </p>

      {estado.ligado ? (
        <Field label="Recheios deste produto" hint="Na ordem em que o cliente vai ver. Não pode repetir nem ficar em branco.">
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <ListaOrdenavel
              ids={estado.linhas.map((l) => l.chave)}
              aoOrdenar={ordenar}
              nomeDe={(chave) => `recheio ${estado.linhas.findIndex((l) => l.chave === chave) + 1}`}
              style={{ display: "flex", flexDirection: "column", gap: 8 }}
            >
              {(ordem) =>
            estado.linhas.map((linha, i) => (
              <div key={linha.chave} {...ordem.propsDoItem(linha.chave)} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <AlcaDeOrdem nome={`recheio ${i + 1}`} desligada={desabilitado || estado.linhas.length < 2} {...ordem.propsDaAlca(linha.chave)} />
                <Input
                  aria-label={`Recheio ${i + 1}`}
                  value={linha.nome}
                  maxLength={RECHEIO_PRODUTO_NOME_MAX}
                  placeholder="Ex.: Brigadeiro"
                  autoFocus={foco === linha.chave}
                  disabled={desabilitado}
                  onChange={(e) => definirLinhas(estado.linhas.map((l) => (l.chave === linha.chave ? { ...l, nome: e.target.value } : l)))}
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  iconLeft="delete"
                  aria-label={`Remover o recheio ${i + 1}`}
                  title="Remover"
                  style={BOTAO_ICONE}
                  disabled={desabilitado}
                  onClick={() => definirLinhas(estado.linhas.filter((l) => l.chave !== linha.chave))}
                />
              </div>
            ))
              }
            </ListaOrdenavel>
            <div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                iconLeft="add"
                style={{ minHeight: 44 }}
                disabled={desabilitado}
                onClick={() => {
                  const chave = novaChave();
                  setFoco(chave);
                  definirLinhas([...estado.linhas, { chave, nome: "" }]);
                }}
              >
                Adicionar recheio
              </Button>
            </div>
            <p role="alert" aria-live="polite" style={{ margin: 0, minHeight: 20, color: "var(--pdm-error)", fontSize: 14 }}>
              {erro ?? ""}
            </p>
          </div>
        </Field>
      ) : null}
    </div>
  );
}
