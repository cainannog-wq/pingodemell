"use client";

/* eslint-disable react-hooks/refs -- useOrdenarArrastando guarda uma ref do contêiner, lida só em eventos e efeitos (nunca na renderização); a regra enxerga o objeto devolvido como se o lesse ao renderizar. */

import { useEffect, useId, useRef, useState } from "react";
import { Badge, Button, Icon } from "@/components/ds";
import { reduzirFoto, type ResultadoReducao } from "@/lib/galeria/reduzir";
import { DICA_SEM_CAPA, MAX_FOTOS_EXTRAS, MENSAGEM_LIMITE, textoAlternativo } from "@/lib/galeria/regras";
import { AlcaDeOrdem, useOrdenarArrastando } from "../ordenar-arrastando";
import type { FotoNaTela } from "./galeria-envio";

// Seção "Fotos extras" do formulário de produto. Componente controlado:
// a lista vive no ProdutoForm, que sobe as fotos novas só no Salvar
// (galeria-envio.ts). Adicionar, remover e reordenar aqui só mexe na
// memória do navegador — sair sem salvar descarta tudo.

// Área de toque mínima de 44x44px nos botões de cada foto.
const BOTAO_ICONE = { minWidth: 44, minHeight: 44, padding: 0 } as const;

type Direcao = "remover";

export function GaleriaFotosExtras({
  fotos,
  onChange,
  nomeProduto,
  temCapa,
  desabilitado = false,
  reduzir = reduzirFoto,
}: {
  fotos: FotoNaTela[];
  onChange: (fotos: FotoNaTela[]) => void;
  nomeProduto: string;
  temCapa: boolean;
  desabilitado?: boolean;
  // Injetável nos testes automatizados (o ambiente de teste não tem canvas).
  reduzir?: (arquivo: File) => Promise<ResultadoReducao>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const addRef = useRef<HTMLButtonElement>(null);
  const botoes = useRef(new Map<string, HTMLButtonElement>());
  const [preparando, setPreparando] = useState(false);
  const [erros, setErros] = useState<string[]>([]);
  const [anuncio, setAnuncio] = useState("");
  // Para onde o foco vai depois que a lista re-renderizar (ref, não
  // estado: não precisa de uma renderização a mais).
  const focoPendente = useRef<{ chave: string; direcao: Direcao } | "adicionar" | null>(null);
  const idLimite = useId();
  const idDica = useId();

  const vagas = MAX_FOTOS_EXTRAS - fotos.length;
  const noLimite = vagas <= 0;
  const deslocamento = temCapa ? 1 : 0;
  const totalComCapa = fotos.length + deslocamento;

  // Depois de remover, o foco vai para o botão de remover da vizinha (a alça de
  // ordem cuida do próprio foco ao mover pelo teclado).
  useEffect(() => {
    const foco = focoPendente.current;
    focoPendente.current = null;
    if (!foco) return;
    if (foco === "adicionar") {
      addRef.current?.focus();
    } else {
      const { chave, direcao } = foco;
      botoes.current.get(`${chave}:${direcao}`)?.focus();
    }
  }, [fotos]);

  function registrar(chave: string, direcao: Direcao) {
    return (el: HTMLButtonElement | null) => {
      const id = `${chave}:${direcao}`;
      if (el) botoes.current.set(id, el);
      else botoes.current.delete(id);
    };
  }

  // Nova ordem vinda da alça (arrastar, ou setas do teclado com o foco nela).
  function ordenar(chaves: string[], idMovido: string, destino: number) {
    const de = fotos.findIndex((f) => f.chave === idMovido);
    onChange(chaves.map((c) => fotos.find((f) => f.chave === c) as FotoNaTela));
    setAnuncio(`Foto extra ${de + 1} movida para a posição ${destino + 1} de ${fotos.length}.`);
  }
  const ordem = useOrdenarArrastando(
    fotos.map((f) => f.chave),
    ordenar,
    (chave) => `foto extra ${fotos.findIndex((f) => f.chave === chave) + 1}`
  );

  function remover(indice: number) {
    const removida = fotos[indice];
    if (removida.tipo === "nova") URL.revokeObjectURL(removida.previewUrl);
    const nova = fotos.filter((_, i) => i !== indice);
    onChange(nova);
    setAnuncio(
      `Foto extra ${indice + 1} removida. ${nova.length === 1 ? "Resta 1 foto extra" : `Restam ${nova.length} fotos extras`}; a remoção só vale depois de Salvar.`
    );
    const vizinha = nova[indice] ?? nova[indice - 1];
    focoPendente.current = vizinha ? { chave: vizinha.chave, direcao: "remover" } : "adicionar";
  }

  async function adicionar(lista: FileList | null) {
    if (!lista || lista.length === 0) return;
    const arquivos = Array.from(lista);
    const cabem = arquivos.slice(0, Math.max(0, vagas));
    const novosErros: string[] = [];
    if (arquivos.length > cabem.length) {
      const fora = arquivos.length - cabem.length;
      novosErros.push(
        `Só cabem mais ${cabem.length} foto(s) extra(s): ${fora} ${fora === 1 ? "não foi adicionada" : "não foram adicionadas"}. O limite é 9 fotos extras (10 com a capa).`
      );
    }

    setPreparando(true);
    const adicionadas: FotoNaTela[] = [];
    for (const arquivo of cabem) {
      const resultado = await reduzir(arquivo);
      if (resultado.ok) {
        adicionadas.push({
          chave: crypto.randomUUID(),
          tipo: "nova",
          foto: resultado.foto,
          previewUrl: URL.createObjectURL(resultado.foto.blob),
        });
      } else {
        novosErros.push(resultado.erro);
      }
    }
    setPreparando(false);
    setErros(novosErros);
    if (adicionadas.length > 0) {
      onChange([...fotos, ...adicionadas]);
      setAnuncio(
        `${adicionadas.length === 1 ? "1 foto adicionada" : `${adicionadas.length} fotos adicionadas`}; ${fotos.length + adicionadas.length} de 9 fotos extras. Elas só são gravadas ao Salvar.`
      );
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <p id={idDica} style={{ margin: 0, fontSize: "var(--fs-small)", lineHeight: "var(--lh-small)", color: "var(--text-muted)" }}>
        Até 9 fotos além da capa. JPG, PNG ou WebP de até 20 MB: cada foto é reduzida automaticamente antes de salvar. Nada é gravado até
        você clicar em Salvar.
      </p>

      {!temCapa && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--pdm-brown)", fontSize: "var(--fs-small)" }}>
          <Icon name="info" size={20} tone="inherit" />
          <span>{DICA_SEM_CAPA}</span>
        </div>
      )}

      {fotos.length > 0 && (
        <ol ref={ordem.registrarRaiz} style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 8 }}>
          {fotos.map((foto, i) => {
            const numero = i + 1;
            const url = foto.tipo === "existente" ? foto.url : foto.previewUrl;
            return (
              <li
                key={foto.chave}
                {...ordem.propsDoItem(foto.chave)}
                className="produto-galeria-item"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: 8,
                  borderRadius: "var(--radius)",
                  background: "var(--pdm-cream)",
                }}
              >
                <div
                  style={{
                    width: 64,
                    height: 64,
                    flex: "none",
                    borderRadius: "var(--radius)",
                    overflow: "hidden",
                    background: "var(--pdm-cream-warm)",
                  }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:) ou miniatura do storage */}
                  <img
                    src={url}
                    alt={textoAlternativo(nomeProduto || "Produto", numero + deslocamento, totalComCapa)}
                    style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                  />
                </div>
                {/* Título em cima e botões embaixo, ao lado da miniatura: no
                    celular (375px) o título não cabe numa linha só ao lado
                    de três botões de 44px. */}
                <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 4 }}>
                  <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
                    <span style={{ fontWeight: 600, color: "var(--text-strong)", whiteSpace: "nowrap" }}>
                      Foto extra {numero} de {fotos.length}
                    </span>
                    {foto.tipo === "nova" && <Badge variant="soft">Ainda não salva</Badge>}
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <AlcaDeOrdem nome={`foto extra ${numero}`} desligada={desabilitado || fotos.length < 2} {...ordem.propsDaAlca(foto.chave)} />
                    <Button
                      ref={registrar(foto.chave, "remover")}
                      type="button"
                      variant="ghost"
                      size="sm"
                      iconLeft="delete"
                      className="produto-galeria-botao"
                      aria-label={`Remover foto extra ${numero}`}
                      title="Remover"
                      disabled={desabilitado}
                      onClick={() => remover(i)}
                      style={{ ...BOTAO_ICONE, color: "var(--pdm-error)" }}
                    />
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*"
          aria-hidden="true"
          tabIndex={-1}
          data-testid="galeria-input"
          style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
          onChange={async (e) => {
            const lista = e.target.files;
            await adicionar(lista);
            e.target.value = "";
          }}
        />
        <Button
          ref={addRef}
          type="button"
          variant="secondary"
          size="sm"
          iconLeft="add_photo_alternate"
          className="produto-galeria-botao"
          disabled={desabilitado || noLimite || preparando}
          aria-describedby={noLimite ? idLimite : idDica}
          onClick={() => inputRef.current?.click()}
          style={{ minHeight: 44 }}
        >
          {preparando ? "Preparando fotos…" : "Adicionar fotos"}
        </Button>
        <span style={{ fontSize: "var(--fs-small)", color: "var(--pdm-muted)" }}>{fotos.length} de 9</span>
      </div>

      {noLimite && (
        <p id={idLimite} style={{ margin: 0, fontSize: "var(--fs-small)", lineHeight: "var(--lh-small)", color: "var(--pdm-brown)", fontWeight: 600 }}>
          {MENSAGEM_LIMITE}
        </p>
      )}

      {erros.length > 0 && (
        <div role="alert" style={{ display: "flex", flexDirection: "column", gap: 4, color: "var(--pdm-error)", fontSize: "var(--fs-small)" }}>
          {erros.map((erro) => (
            <p key={erro} style={{ margin: 0 }}>
              {erro}
            </p>
          ))}
        </div>
      )}

      <div aria-live="polite" role="status" style={SR_ONLY}>
        {anuncio}
      </div>
    </div>
  );
}

// Visualmente escondido, mas lido por leitor de tela.
const SR_ONLY = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;
