"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { CATEGORIA_VALUES, STEP_QUANTIDADE_LABELS, STEP_QUANTIDADE_VALUES, type Produto } from "@/lib/produtos/types";
import type { ProdutoFormState } from "./actions";
import { Card, Field, Input, Textarea, Select, Toggle, Button, Icon } from "@/components/ds";

type ProdutoFormAction = (prevState: ProdutoFormState, formData: FormData) => Promise<ProdutoFormState>;

const initialState: ProdutoFormState = {};

export function ProdutoForm({
  action,
  produto,
  submitLabel,
}: {
  action: ProdutoFormAction;
  produto?: Produto;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  return (
    <div className="produto-form-root" style={{ display: "flex", flexDirection: "column", gap: 24, maxWidth: 980 }}>
      {state?.error && (
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
          <span>{state.error}</span>
        </div>
      )}

      <form action={formAction} encType="multipart/form-data">
        <Card tone="white" padding="0">
          <div
            className="produto-form-band"
            style={{
              padding: 24,
              borderBottom: "1px solid var(--border-subtle)",
              fontSize: 14,
              textTransform: "uppercase",
              letterSpacing: ".05em",
              fontWeight: 700,
              color: "var(--pdm-brown)",
            }}
          >
            Dados do produto
          </div>

          <div
            className="produto-form-body"
            style={{ padding: "32px 24px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 24 }}
          >
            <div style={{ gridColumn: "span 2" }}>
              <Field label="Nome do produto" htmlFor="f-nome" required hint="Como o cliente vai ver no cardápio.">
                <Input
                  id="f-nome"
                  name="nome"
                  placeholder="Ex.: bolo de cenoura com brigadeiro"
                  defaultValue={produto?.nome}
                  required
                />
              </Field>
            </div>

            <Field label="Preço" htmlFor="f-preco" required hint="Só números, com no máximo duas casas depois da vírgula.">
              <Input id="f-preco" name="preco" placeholder="R$ 0,00" defaultValue={produto?.preco} inputMode="decimal" required />
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

            <Field label="Prazo de produção" htmlFor="f-prazo" required hint="Em dias, contados a partir da confirmação do pedido.">
              <Input
                id="f-prazo"
                name="prazo_producao_dias"
                type="number"
                min={1}
                step={1}
                placeholder="Ex.: 3"
                defaultValue={produto?.prazo_producao_dias ?? 1}
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

            <div style={{ gridColumn: "span 2" }}>
              <Field label="Descrição" htmlFor="f-desc" hint="Ingredientes, tamanho e prazo de produção.">
                <Textarea id="f-desc" name="descricao" rows={4} placeholder="Conte o que torna esse produto especial." defaultValue={produto?.descricao ?? ""} />
              </Field>
            </div>

            <Field label="Produto em destaque">
              <Toggle name="destaque" defaultChecked={produto?.destaque ?? false} label="Exibir como destaque" />
            </Field>

            <Field label="Status do produto">
              <Toggle name="ativo" defaultChecked={produto?.ativo ?? true} label="Produto ativo" />
            </Field>

            <Field label="Foto" hint="JPG, PNG ou WebP, luz natural e foco no produto. Até 2 MB.">
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
          </div>

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
            <Button type="submit" iconLeft="check" disabled={pending}>
              {pending ? "Salvando…" : submitLabel}
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
