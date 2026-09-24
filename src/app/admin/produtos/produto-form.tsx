"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useActionState, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CATEGORIA_VALUES,
  STEP_QUANTIDADE_LABELS,
  STEP_QUANTIDADE_VALUES,
  TIPO_PRODUTO_LABELS,
  TIPO_PRODUTO_VALUES,
  type Produto,
  type TipoProduto,
} from "@/lib/produtos/types";
import { descartarEnviosFotos, prepararEnvioFotos, type ProdutoFormState } from "./actions";
import { Card, Field, Input, PriceInput, Textarea, Select, Toggle, Button, Icon } from "@/components/ds";
import { SubitensPicker, type SubitemCandidato } from "./subitens-picker";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_FOTOS } from "@/lib/galeria/regras";
import { GaleriaFotosExtras } from "./galeria-fotos";
import { enviarFotosNovas, type DependenciasEnvio, type FotoNaTela } from "./galeria-envio";

type ProdutoFormAction = (prevState: ProdutoFormState, formData: FormData) => Promise<ProdutoFormState>;

const initialState: ProdutoFormState = {};

// Envio real das fotos extras no Salvar: o servidor autoriza cada caminho
// (prepararEnvioFotos) e o navegador sobe o arquivo direto para o storage
// com o token de envio daquele caminho.
const DEPENDENCIAS_ENVIO: DependenciasEnvio = {
  preparar: prepararEnvioFotos,
  subir: async (caminho, token, foto) => {
    const { error } = await createClient()
      .storage.from(BUCKET_FOTOS)
      .uploadToSignedUrl(caminho, token, foto.blob, { contentType: foto.blob.type, upsert: false });
    return { error: error?.message };
  },
  descartar: descartarEnviosFotos,
};

export type FotoExtraSalva = { id: string; url: string };

export function ProdutoForm({
  action,
  produto,
  produtoId,
  submitLabel,
  produtosDisponiveis = [],
  initialSubitens = [],
  fotosIniciais = [],
}: {
  action: ProdutoFormAction;
  produto?: Produto;
  // Id do produto: o do banco na edição; no cadastro, um uuid novo gerado
  // no servidor pela página (as fotos extras sobem para galeria/{id}/
  // antes de o produto existir).
  produtoId: string;
  submitLabel: string;
  fotosIniciais?: FotoExtraSalva[];
  // Candidatos a subitem do tipo "Cento" — todo o catálogo, exceto o
  // próprio produto em edição. Vem vazio na tela de cadastro de um produto
  // "normal" comum sem custo de consulta extra desnecessária.
  produtosDisponiveis?: SubitemCandidato[];
  initialSubitens?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoProduto>(produto?.tipo ?? "normal");
  const [nome, setNome] = useState(produto?.nome ?? "");
  const [fotos, setFotos] = useState<FotoNaTela[]>(() =>
    fotosIniciais.map((foto) => ({ chave: foto.id, tipo: "existente", id: foto.id, url: foto.url }))
  );
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const salvando = pending || enviandoFotos;
  const erro = erroEnvio ?? state?.error;

  // Salvar: primeiro sobe as fotos extras novas (nada antes disso), depois
  // manda o formulário para a Server Action com a lista final da galeria.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    setErroEnvio(null);
    setEnviandoFotos(true);
    const envio = await enviarFotosNovas(produtoId, fotos, DEPENDENCIAS_ENVIO);
    setEnviandoFotos(false);
    if (!envio.ok) {
      setErroEnvio(envio.erro);
      return;
    }
    formData.set("galeria", JSON.stringify(envio.itens));
    startTransition(() => formAction(formData));
  }

  return (
    <div className="produto-form-root" style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      {erro && (
        <div
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
          <span>{erro}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} encType="multipart/form-data">
        {!produto && <input type="hidden" name="id" value={produtoId} />}
        <Card tone="white" padding="0">
          <FormSection title="Identificação">
            <div className="produto-form-grid" style={{ gridTemplateColumns: "1fr" }}>
              <Field label="Nome do produto" htmlFor="f-nome" required hint="Como o cliente vai ver no cardápio.">
                <Input
                  id="f-nome"
                  name="nome"
                  placeholder="Ex.: bolo de cenoura com brigadeiro"
                  defaultValue={produto?.nome}
                  onChange={(e) => setNome(e.target.value)}
                  required
                />
              </Field>
            </div>
            <div className="produto-form-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 24 }}>
              <Field label="Categoria" htmlFor="f-categoria" hint="Usada no filtro do catálogo público, quando existir.">
                <Select id="f-categoria" name="categoria" defaultValue={produto?.Categoria ?? ""}>
                  <option value="">Sem categoria</option>
                  {CATEGORIA_VALUES.map((categoria) => (
                    <option key={categoria} value={categoria}>
                      {categoria}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Tipo de produto"
                htmlFor="f-tipo"
                required
                hint={
                  tipo === "cento"
                    ? "Cento: quantidade sempre fixa em 100 unidades, o preço é o preço normal deste cadastro (não soma o dos subitens)."
                    : "Produto normal ou Cento, com lista de subitens (sabores) referenciando outros produtos do catálogo."
                }
              >
                <Select
                  id="f-tipo"
                  name="tipo"
                  defaultValue={tipo}
                  onChange={(e) => setTipo(e.target.value as TipoProduto)}
                  required
                >
                  {TIPO_PRODUTO_VALUES.map((valor) => (
                    <option key={valor} value={valor}>
                      {TIPO_PRODUTO_LABELS[valor]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </FormSection>

          <FormSection title="Preço e pedido mínimo">
            <div className="produto-form-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              <Field label="Preço" htmlFor="f-preco" required hint="Digite só números — a formatação em reais é automática.">
                <PriceInput id="f-preco" name="preco" defaultValue={produto?.preco} required />
              </Field>

              <Field label="Quantidade mínima" htmlFor="f-min" required hint="Menor quantidade aceita por encomenda, em unidades.">
                <Input
                  id="f-min"
                  name="pedido_minimo"
                  type="number"
                  min={1}
                  step={1}
                  placeholder="Ex.: 25"
                  defaultValue={produto?.pedido_minimo}
                  required
                />
              </Field>

              <Field label="Step de quantidade" htmlFor="f-step" required hint="Incremento aceito ao ajustar a quantidade no pedido.">
                <Select id="f-step" name="step_quantidade" defaultValue={produto?.step_quantidade ?? "livre"} required>
                  {STEP_QUANTIDADE_VALUES.map((step) => (
                    <option key={step} value={step}>
                      {STEP_QUANTIDADE_LABELS[step]}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label="Prazo de produção"
                htmlFor="f-prazo"
                required
                hint="Em dias, a partir da confirmação. Use 0 para produto sempre disponível (ex.: uma bebida pronta)."
              >
                <Input
                  id="f-prazo"
                  name="prazo_producao_dias"
                  type="number"
                  min={0}
                  step={1}
                  placeholder="Ex.: 3"
                  defaultValue={produto?.prazo_producao_dias ?? 1}
                  required
                />
              </Field>
            </div>
          </FormSection>

          {tipo === "cento" && (
            <FormSection title="Subitens (sabores)">
              <Field
                required
                hint="Cada subitem é um produto já cadastrado no catálogo. Se um deles for marcado como inativo depois, ele continua aqui com um aviso, até você remover manualmente."
              >
                <SubitensPicker
                  produtosDisponiveis={produtosDisponiveis}
                  initialSubitens={initialSubitens}
                  nomeAtual={produto?.nome}
                />
              </Field>
            </FormSection>
          )}

          <FormSection title="Descrição">
            <Field htmlFor="f-desc" hint="Ingredientes, tamanho e prazo de produção.">
              <Textarea id="f-desc" name="descricao" rows={4} placeholder="Conte o que torna esse produto especial." defaultValue={produto?.descricao ?? ""} />
            </Field>
          </FormSection>

          <FormSection title="Mídia e visibilidade" last>
            <div className="produto-form-grid" style={{ gridTemplateColumns: "2fr 1fr 1fr", alignItems: "start" }}>
              {/* Capa e fotos extras na mesma coluna: a galeria fica colada
                  logo abaixo da capa, no desktop e no celular (onde os
                  toggles vêm depois das duas). */}
              <div style={{ display: "flex", flexDirection: "column", gap: 24, minWidth: 0 }}>
                <Field
                  label="Foto de capa"
                  hint="Uma foto só: é a que aparece nos cards do site. Para mais fotos, use Fotos extras, logo abaixo. JPG, PNG ou WebP, luz natural e foco no produto. Até 2 MB."
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
                    <div
                      style={{
                        width: 56,
                        height: 56,
                        borderRadius: "var(--radius)",
                        background: "var(--pdm-cream-warm)",
                        display: "grid",
                        placeItems: "center",
                        flex: "none",
                        overflow: "hidden",
                      }}
                    >
                      {previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={previewUrl} alt="Prévia da foto selecionada" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      ) : produto?.image_url ? (
                        <Image src={produto.image_url} alt={produto.nome} width={56} height={56} style={{ objectFit: "cover" }} />
                      ) : (
                        <Icon name="photo_camera" size={24} />
                      )}
                    </div>
                    <input
                      ref={fileInputRef}
                      id="f-foto"
                      name="foto"
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (!file) {
                          setPreviewUrl(null);
                          setFileName(null);
                          return;
                        }
                        setFileName(file.name);
                        setPreviewUrl(URL.createObjectURL(file));
                      }}
                    />
                    <Button type="button" variant="secondary" size="sm" iconLeft="upload" onClick={() => fileInputRef.current?.click()}>
                      Escolher foto
                    </Button>
                    {fileName && <span style={{ fontSize: "var(--fs-small)", color: "var(--pdm-muted)" }}>{fileName}</span>}
                  </div>
                </Field>

                <Field label="Fotos extras">
                  <GaleriaFotosExtras
                    fotos={fotos}
                    onChange={setFotos}
                    nomeProduto={nome}
                    temCapa={Boolean(previewUrl || produto?.image_url)}
                    desabilitado={salvando}
                  />
                </Field>
              </div>

              <Field label="Produto em destaque">
                <Toggle name="destaque" defaultChecked={produto?.destaque ?? false} label="Exibir como destaque" />
              </Field>

              <Field label="Status do produto">
                <Toggle name="ativo" defaultChecked={produto?.ativo ?? true} label="Produto ativo" />
              </Field>
            </div>
          </FormSection>

          <div
            className="produto-form-actions"
            style={{
              padding: 24,
              borderTop: "1px solid var(--border-subtle)",
              background: "var(--pdm-cream)",
              display: "flex",
              alignItems: "center",
              gap: 16,
              flexWrap: "wrap",
            }}
          >
            <Button type="submit" iconLeft="check" disabled={salvando}>
              {enviandoFotos ? "Enviando fotos…" : pending ? "Salvando…" : submitLabel}
            </Button>
            <Link href="/admin/produtos" className="produto-form-cancel-link">
              <Button type="button" variant="secondary">
                Cancelar
              </Button>
            </Link>
          </div>
        </Card>
      </form>
    </div>
  );
}

// Um bloco de campos relacionados dentro do Card do formulário (ex.:
// "Identificação", "Preço e pedido mínimo"), cada um com seu próprio
// título e divisor — em vez de uma única grade auto-fit com todos os
// campos soltos, que reflui de forma imprevisível e mistura campos sem
// relação (foi o que motivou essa reorganização). `.produto-form-grid`
// (definida em admin.css) força 1 coluna no mobile independente da grade
// de colunas definida aqui pra desktop.
function FormSection({ title, last = false, children }: { title: string; last?: boolean; children: ReactNode }) {
  return (
    <div className="produto-form-section" style={{ borderBottom: last ? "none" : "1px solid var(--border-subtle)" }}>
      <div
        className="produto-form-band"
        style={{
          fontSize: 14,
          textTransform: "uppercase",
          letterSpacing: ".05em",
          fontWeight: 700,
          color: "var(--pdm-brown)",
          marginBottom: 20,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}
