"use client";

import Image from "next/image";
import Link from "next/link";
import { startTransition, useActionState, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import {
  CATEGORIA_DO_TIPO,
  CATEGORIA_VALUES,
  STEP_QUANTIDADE_LABELS,
  STEP_QUANTIDADE_VALUES,
  TIPO_PRODUTO_LABELS,
  TIPO_PRODUTO_VALUES,
  UNIDADE_VENDA_MAX,
  UNIDADES_VENDA_SUGERIDAS,
  type Produto,
  type TipoProduto,
} from "@/lib/produtos/types";
import { campoVisivel } from "@/lib/produtos/campos";
import type { RecheioDoProduto } from "@/lib/produtos/recheios-produto";
import { categoriaCanonica } from "@/lib/produtos/categorias";
import { opcoesDoSeletor, temSubcategoriaParaEscolher } from "@/lib/subcategorias/regras";
import type { SubcategoriaOpcao } from "@/lib/subcategorias/types";
import { descartarEnviosFotos, prepararEnvioFotos, type ProdutoFormState } from "./actions";
import { Badge, Card, Field, Input, PriceInput, Textarea, Select, Toggle, Button, Icon } from "@/components/ds";
import { SubitensPicker, type SubitemCandidato } from "./subitens-picker";
import { createClient } from "@/lib/supabase/client";
import { BUCKET_FOTOS } from "@/lib/galeria/regras";
import { reduzirFoto, type FotoReduzida } from "@/lib/galeria/reduzir";
import { concluirSalvarPendente, guardarSalvarPendente, type TempoReducao } from "@/lib/admin/tempos";
import { GaleriaFotosExtras } from "./galeria-fotos";
import {
  CamposEscondidosDosRecheios,
  erroDosRecheios,
  estadoInicialDosRecheios,
  RecheiosDoProdutoCampo,
  type EstadoRecheios,
} from "./recheios-produto-campo";
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

// Capa escolhida e ainda não salva: arquivo já reduzido, só na memória do
// navegador até o Salvar.
type CapaNaTela = { foto: FotoReduzida; previewUrl: string; arquivo: string; reducao: TempoReducao };

export function ProdutoForm({
  action,
  produto,
  produtoId,
  submitLabel,
  produtosDisponiveis = [],
  initialSubitens = [],
  fotosIniciais = [],
  recheiosIniciais = [],
  subcategorias = [],
}: {
  action: ProdutoFormAction;
  produto?: Produto;
  // Id do produto: o do banco na edição; no cadastro, um uuid novo gerado
  // no servidor pela página (as fotos extras sobem para galeria/{id}/
  // antes de o produto existir).
  produtoId: string;
  submitLabel: string;
  fotosIniciais?: FotoExtraSalva[];
  // Recheios personalizados já salvos (produto_recheios), na ordem do admin.
  recheiosIniciais?: RecheioDoProduto[];
  // Todas as subcategorias (o servidor lê uma vez); o formulário filtra pela
  // categoria escolhida. Vazio: o seletor não aparece.
  subcategorias?: SubcategoriaOpcao[];
  // Candidatos a subitem do tipo "Cento" — todo o catálogo, exceto o
  // próprio produto em edição. Vem vazio na tela de cadastro de um produto
  // "normal" comum sem custo de consulta extra desnecessária.
  produtosDisponiveis?: SubitemCandidato[];
  initialSubitens?: string[];
}) {
  const [state, formAction, pending] = useActionState(action, initialState);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [capaNova, setCapaNova] = useState<CapaNaTela | null>(null);
  const [preparandoCapa, setPreparandoCapa] = useState(false);
  const [erroCapa, setErroCapa] = useState<string | null>(null);
  const [tipo, setTipo] = useState<TipoProduto>(produto?.tipo ?? "normal");
  const [categoria, setCategoria] = useState<string>(categoriaCanonica(produto?.Categoria) ?? "");
  const [nome, setNome] = useState(produto?.nome ?? "");
  const categoriaSalva = categoriaCanonica(produto?.Categoria);
  const subcategoriaSalva = produto?.subcategoria_id ?? "";
  const [subcategoriaId, setSubcategoriaId] = useState<string>(subcategoriaSalva);
  const [fotos, setFotos] = useState<FotoNaTela[]>(() =>
    fotosIniciais.map((foto) => ({ chave: foto.id, tipo: "existente", id: foto.id, url: foto.url }))
  );
  const [recheios, setRecheios] = useState<EstadoRecheios>(() => estadoInicialDosRecheios(recheiosIniciais));
  const [tentouSalvar, setTentouSalvar] = useState(false);
  const [enviandoFotos, setEnviandoFotos] = useState(false);
  const [erroEnvio, setErroEnvio] = useState<string | null>(null);
  const salvando = pending || enviandoFotos;
  // Quais campos aparecem sai da tabela de campos (campos.ts), a mesma que o
  // servidor usa: o Bolo não usa preço, quantidade mínima, step nem unidade
  // (o preço vem do recheio × kg); o Bento Cake tem peso fechado, sem step
  // (a unidade aparece: "o combo" no combo, "unidade" no simples); o Cento
  // tem os subitens; só Bolos de tipo normal e Bento Cake têm recheios
  // personalizados. Campo escondido é desmontado, nunca escondido por CSS.
  const categoriaTravada = CATEGORIA_DO_TIPO[tipo] ?? null;
  const categoriaAtual = categoriaTravada ?? categoria;
  // O vínculo que o produto já tem só vale para a categoria salva dele.
  const vinculo = produto ? { subcategoriaId: subcategoriaSalva || null, categoriaSalva } : null;
  const contexto = {
    categoria: categoriaAtual,
    tipo,
    temSubcategoriaParaEscolher: temSubcategoriaParaEscolher(subcategorias, categoriaAtual, vinculo),
  };
  const comSubcategoria = campoVisivel("subcategoria", contexto);
  const opcoesSubcategoria = opcoesDoSeletor(subcategorias, categoriaAtual, vinculo);
  const comPreco = campoVisivel("preco", contexto);
  const comPedidoMinimo = campoVisivel("pedido_minimo", contexto);
  const comStep = campoVisivel("step_quantidade", contexto);
  const comUnidade = campoVisivel("unidade_venda", contexto);
  const comSubitens = campoVisivel("subitens", contexto);
  const aceitaRecheios = campoVisivel("recheios", contexto);
  // Textos que mudam com o tipo (não são campos).
  const bolo = tipo === "bolo";
  const bento = tipo === "bento_cake";
  // Kit por pessoa: criado só pela carga CSV. O formulário só o mostra ao editar
  // um produto que já é kit (a opção nunca aparece para os outros).
  const kit = tipo === "kit_pessoa";
  const tiposDaLista = produto?.tipo === "kit_pessoa" ? (["kit_pessoa"] as const) : TIPO_PRODUTO_VALUES.filter((t) => t !== "kit_pessoa");

  // Bolo e Bento Cake só existem em Bolos e Bento Cake (a categoria acompanha
  // o tipo); e a categoria Bento Cake só aceita o tipo Bento Cake.
  // A subcategoria acompanha a categoria: ao trocar de categoria o seletor
  // zera, e voltar à categoria salva do produto restaura a subcategoria salva.
  // Escolha manual vale até a próxima troca. Se a categoria não mudou, nada
  // muda no seletor.
  function trocarCategoria(nova: string) {
    if (nova === categoriaAtual) return;
    setCategoria(nova);
    setSubcategoriaId(nova !== "" && nova === categoriaSalva ? subcategoriaSalva : "");
  }
  function aoMudarTipo(novo: TipoProduto) {
    setTipo(novo);
    const exigida = CATEGORIA_DO_TIPO[novo];
    if (exigida) trocarCategoria(exigida);
    else if (categoria === "Bento Cake") trocarCategoria("");
  }
  function aoMudarCategoria(nova: string) {
    trocarCategoria(nova);
    if (nova === "Bento Cake") setTipo("bento_cake");
  }
  const erro = erroEnvio ?? state?.error;

  // Registro de tempo (só na homologação): Salvar que voltou com erro.
  useEffect(() => {
    if (state?.error) concluirSalvarPendente("erro");
  }, [state]);

  // Capa escolhida: reduzida aqui mesmo, antes de qualquer envio. Se a foto
  // for recusada, a escolha anterior (ou a capa salva) continua.
  async function escolherCapa(arquivo: File | undefined) {
    if (!arquivo) return;
    setErroCapa(null);
    setPreparandoCapa(true);
    const inicio = performance.now();
    const resultado = await reduzirFoto(arquivo);
    const ms = performance.now() - inicio;
    setPreparandoCapa(false);
    if (!resultado.ok) {
      setErroCapa(resultado.erro);
      return;
    }
    if (capaNova) URL.revokeObjectURL(capaNova.previewUrl);
    const { foto } = resultado;
    setCapaNova({
      foto,
      previewUrl: URL.createObjectURL(foto.blob),
      arquivo: arquivo.name,
      reducao: {
        arquivo: arquivo.name,
        bytesOriginal: arquivo.size,
        bytesFinal: foto.blob.size,
        largura: foto.largura,
        altura: foto.altura,
        ms,
      },
    });
  }

  function descartarCapaEscolhida() {
    if (capaNova) URL.revokeObjectURL(capaNova.previewUrl);
    setCapaNova(null);
    setErroCapa(null);
  }

  // Salvar: primeiro sobe a capa e as fotos extras novas (nada antes disso),
  // depois manda o formulário para a Server Action com a capa nova e a lista
  // final da galeria.
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Interruptor ligado com lista vazia, em branco ou repetida: não salva.
    setTentouSalvar(true);
    if (aceitaRecheios && erroDosRecheios(recheios)) return;
    const inicio = Date.now();
    const formData = new FormData(event.currentTarget);
    setErroEnvio(null);
    setEnviandoFotos(true);
    const envio = await enviarFotosNovas(produtoId, fotos, DEPENDENCIAS_ENVIO, capaNova?.foto ?? null);
    setEnviandoFotos(false);
    if (!envio.ok) {
      setErroEnvio(envio.erro);
      return;
    }
    formData.set("galeria", JSON.stringify(envio.itens));
    if (envio.capa) formData.set("capa", JSON.stringify(envio.capa));
    guardarSalvarPendente({
      produtoId,
      nome: String(formData.get("nome") ?? ""),
      inicio,
      prepararMs: envio.tempos.prepararMs,
      enviarMs: envio.tempos.enviarMs,
      inicioGravar: Date.now(),
      reducao: capaNova?.reducao ?? null,
    });
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

      <form onSubmit={handleSubmit}>
        {!produto && <input type="hidden" name="id" value={produtoId} />}
        <CamposEscondidosDosRecheios visivel={aceitaRecheios} salvos={recheiosIniciais.length} estado={recheios} />
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
              <Field
                label="Categoria"
                htmlFor="f-categoria"
                required
                hint={
                  categoriaTravada
                    ? `Definida pelo tipo de produto: ${categoriaTravada}.`
                    : "Usada no filtro do catálogo público."
                }
              >
                {/* Select desabilitado não vai no envio: a categoria travada pelo
                    tipo segue num campo escondido. */}
                {categoriaTravada ? <input type="hidden" name="categoria" value={categoriaTravada} /> : null}
                <Select
                  id="f-categoria"
                  name={categoriaTravada ? undefined : "categoria"}
                  value={categoriaTravada ?? categoria}
                  onChange={(e) => aoMudarCategoria(e.target.value)}
                  disabled={categoriaTravada !== null}
                  required
                >
                  <option value="" disabled>
                    Selecione a categoria
                  </option>
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
                  tipo === "kit_pessoa"
                    ? "Kit por pessoa: a composição e as listas vêm da carga e de Cardápio, Kit Festa. O preço é por pessoa; o tipo não pode mudar."
                    : tipo === "cento"
                    ? "Cento: quantidade sempre fixa em 100 unidades, o preço é o preço normal deste cadastro (não soma o dos subitens)."
                    : tipo === "bolo"
                      ? "Bolo tradicional: o cliente escolhe tamanho (kg), formato e um recheio do catálogo de recheios. O preço é o R$/kg do recheio × o tamanho."
                      : tipo === "bento_cake"
                        ? "Bento Cake: cada tema é um produto, com preço fixo. Se você ligar os recheios personalizados, o cliente escolhe um da lista do produto (sem efeito no preço)."
                        : "Produto normal (inclui o Smash Cake, na categoria Bolos), Cento com lista de subitens (sabores), Bolo ou Bento Cake."
                }
              >
                <Select
                  id="f-tipo"
                  name="tipo"
                  value={tipo}
                  onChange={(e) => aoMudarTipo(e.target.value as TipoProduto)}
                  required
                >
                  {tiposDaLista.map((valor) => (
                    <option key={valor} value={valor}>
                      {TIPO_PRODUTO_LABELS[valor]}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            {comSubcategoria && (
              <div className="produto-form-grid" style={{ gridTemplateColumns: "1fr 1fr", marginTop: 24 }}>
                <Field
                  label="Subcategoria"
                  htmlFor="f-subcategoria"
                  hint="Opcional. Agrupa o produto dentro da categoria; deixe em “Sem subcategoria” se não se aplica."
                >
                  <Select
                    id="f-subcategoria"
                    name="subcategoria_id"
                    value={subcategoriaId}
                    onChange={(e) => setSubcategoriaId(e.target.value)}
                  >
                    <option value="">Sem subcategoria</option>
                    {opcoesSubcategoria.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.rotulo}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </FormSection>

          <FormSection title={bolo ? "Prazo de produção" : "Preço e pedido mínimo"}>
            {bolo ? (
              <p className="produto-form-aviso" style={{ margin: "0 0 24px", color: "var(--pdm-muted)" }}>
                O preço de um Bolo vem do catálogo de recheios: R$/kg do recheio escolhido × tamanho em kg. Por isso
                preço, quantidade mínima, step e unidade de venda não se aplicam a este produto.
              </p>
            ) : null}
            <div className="produto-form-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)" }}>
              {comPreco && (
              <Field label={kit ? "Preço por pessoa" : "Preço"} htmlFor="f-preco" required hint="Digite só números — a formatação em reais é automática.">
                <PriceInput id="f-preco" name="preco" defaultValue={produto?.preco} required />
              </Field>
              )}

              {comPedidoMinimo && (
              <Field label="Quantidade mínima" htmlFor="f-min" required hint="Menor quantidade aceita por encomenda, sempre número inteiro, na unidade de venda (em kg: 1 = 1 kg).">
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
              )}

              {comStep && (
              <Field label="Step de quantidade" htmlFor="f-step" required hint="Incremento aceito ao ajustar a quantidade no pedido.">
                <Select id="f-step" name="step_quantidade" defaultValue={produto?.step_quantidade ?? "livre"} required>
                  {STEP_QUANTIDADE_VALUES.map((step) => (
                    <option key={step} value={step}>
                      {STEP_QUANTIDADE_LABELS[step]}
                    </option>
                  ))}
                </Select>
              </Field>
              )}

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
            {comUnidade && (
            <div className="produto-form-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", marginTop: 24 }}>
              <Field
                label="Unidade de venda"
                htmlFor="f-unidade"
                hint={
                  bento
                    ? "Combo: escreva \"o combo\" (o preço aparece como R$ 95,00 o combo). Bento Cake simples: \"unidade\" ou vazio."
                    : "Aparece no preço do card (ex.: R$ 90,00 o kg). Vazio mostra só o preço. Quantidade é sempre inteira: em kg, sem meio quilo."
                }
              >
                <Input
                  id="f-unidade"
                  name="unidade_venda"
                  list="f-unidade-sugestoes"
                  maxLength={UNIDADE_VENDA_MAX}
                  placeholder="Ex.: kg"
                  defaultValue={produto?.unidade_venda ?? ""}
                  autoComplete="off"
                />
                <datalist id="f-unidade-sugestoes">
                  {UNIDADES_VENDA_SUGERIDAS.map((unidade) => (
                    <option key={unidade} value={unidade} />
                  ))}
                </datalist>
              </Field>
            </div>
            )}
          </FormSection>

          {comSubitens && (
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

          {aceitaRecheios && (
            <FormSection title="Recheios">
              <RecheiosDoProdutoCampo
                estado={recheios}
                aoMudar={setRecheios}
                mostrarErro={tentouSalvar}
                desabilitado={salvando}
              />
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
                  hint="Uma foto só: é a que aparece nos cards do site. Para mais fotos, use Fotos extras, logo abaixo. JPG, PNG ou WebP de até 20 MB: a foto é reduzida automaticamente antes de salvar. Luz natural e foco no produto. Nada é gravado até você clicar em Salvar."
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                        {capaNova ? (
                          // eslint-disable-next-line @next/next/no-img-element -- prévia local (blob:)
                          <img src={capaNova.previewUrl} alt="Prévia da nova foto de capa" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : produto?.image_url ? (
                          <Image src={produto.image_url} alt={produto.nome} width={56} height={56} style={{ objectFit: "cover" }} />
                        ) : (
                          <Icon name="photo_camera" size={24} />
                        )}
                      </div>
                      {/* Sem name: o arquivo nunca vai no formulário para a
                          Server Action (limite de 1 MB); sobe direto para o
                          storage no Salvar. */}
                      <input
                        ref={fileInputRef}
                        id="f-foto"
                        type="file"
                        accept="image/*"
                        aria-hidden="true"
                        tabIndex={-1}
                        data-testid="capa-input"
                        style={{ position: "absolute", width: 1, height: 1, opacity: 0, pointerEvents: "none" }}
                        onChange={async (e) => {
                          const alvo = e.target;
                          await escolherCapa(alvo.files?.[0]);
                          alvo.value = "";
                        }}
                      />
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        iconLeft="upload"
                        disabled={salvando || preparandoCapa}
                        onClick={() => fileInputRef.current?.click()}
                        style={{ minHeight: 44 }}
                      >
                        {preparandoCapa ? "Preparando foto…" : produto?.image_url || capaNova ? "Trocar foto" : "Escolher foto"}
                      </Button>
                      {capaNova && (
                        <>
                          <Badge variant="soft">Ainda não salva</Badge>
                          <Button type="button" variant="ghost" size="sm" disabled={salvando} onClick={descartarCapaEscolhida} style={{ minHeight: 44 }}>
                            {produto?.image_url ? "Manter a capa atual" : "Remover foto escolhida"}
                          </Button>
                        </>
                      )}
                    </div>
                    {capaNova && (
                      <span style={{ fontSize: "var(--fs-small)", color: "var(--pdm-muted)", overflowWrap: "anywhere" }}>{capaNova.arquivo}</span>
                    )}
                    {erroCapa && (
                      <p role="alert" style={{ margin: 0, fontSize: "var(--fs-small)", color: "var(--pdm-error)" }}>
                        {erroCapa}
                      </p>
                    )}
                  </div>
                </Field>

                <Field label="Fotos extras">
                  <GaleriaFotosExtras
                    fotos={fotos}
                    onChange={setFotos}
                    nomeProduto={nome}
                    temCapa={Boolean(capaNova || produto?.image_url)}
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
            <Button type="submit" iconLeft="check" disabled={salvando || preparandoCapa}>
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
