"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Button, Icon, Input, Select, Textarea, TextLink } from "@/components/ds";
import { useCarrinho } from "@/components/site/CarrinhoProvider";
import { Hive } from "@/components/site/Hive";
import { PilhaDeAvisos, type Aviso } from "@/components/site/PilhaDeAvisos";
import { useMontado } from "@/components/site/useMontado";
import type { LinhaCarrinho } from "@/lib/carrinho/regras";
import {
  dataPorExtenso,
  horariosDoDia,
  itemMaisDemorado,
  motivoBloqueio,
  prazoCurto,
  primeiraDataPermitida,
  prontoEm,
  rotuloHorario,
  DOMINGO,
  SABADO,
} from "@/lib/checkout/datas";
import {
  camposComErro,
  FORMAS_PAGAMENTO,
  mascararWhatsApp,
  MAXIMO,
  validarCheckout,
  type Campo,
  type DadosCheckout,
} from "@/lib/checkout/formulario";
import { quantidadeDaOferta, selecionarOfertas, type Oferta } from "@/lib/checkout/ofertas";
import { carregarRascunho, salvarRascunho } from "@/lib/checkout/rascunho";
import { LOJA } from "@/lib/site/config";
import { ROTAS } from "@/lib/site/rotas";
import { diaDaSemana, hojeBrasilia, somarDias } from "@/lib/tempo/brasilia";
import { nomeDaUnidade, textoQuantidadeNaUnidade } from "@/lib/vitrine/minimo";
import { CarrinhoVazio } from "../../carrinho/_carrinho/CarrinhoVazio";
import { Calendario } from "./Calendario";
import { Ofertas } from "./Ofertas";
import { ResumoPedido } from "./ResumoPedido";

// Checkout (página 5 do site): dados da cliente, data e hora, como
// receber, ocasião, pagamento e observações, numa página só (decisão do
// Cainan; o handoff usa acordeão de 5 etapas).
//
// - As linhas do carrinho vêm do CarrinhoProvider (localStorage) e são
//   mostradas como estão gravadas. NENHUMA consulta confere preço ou
//   disponibilidade delas (risco aceito).
// - "Hoje" é o dia de Brasília (hojeBrasilia), nunca o do aparelho.
// - O que a cliente preenche fica no sessionStorage (rascunho.ts).
// - Nada é gravado no banco e nada é cobrado: o botão final confere o
//   formulário e só leva para a confirmação (ROTAS.confirmacao), que ainda
//   não existe (404 até o próximo item).

export const TEXTO_ARTESANAL =
  "Pode haver diferenças em relação à imagem enviada, a gente capricha, mas cada peça é única.";

const ids: Record<Campo, string> = {
  nome: "checkout-nome",
  whatsapp: "checkout-whatsapp",
  email: "checkout-email",
  aceite: "checkout-aceite",
  data: "checkout-data",
  hora: "checkout-hora",
  modo: "checkout-modo",
  cidade: "checkout-cidade",
  bairro: "checkout-bairro",
  rua: "checkout-rua",
  numero: "checkout-numero",
  complemento: "checkout-complemento",
  ocasiao: "checkout-ocasiao",
  pagamento: "checkout-pagamento",
  observacoes: "checkout-observacoes",
};
const idErro = (c: Campo) => `${ids[c]}-erro`;

const ROTULOS: Record<Campo, string> = {
  nome: "Seu nome completo",
  whatsapp: "Seu WhatsApp",
  email: "Seu e-mail",
  aceite: "Política de Privacidade",
  data: "Data",
  hora: "Horário",
  modo: "Como receber",
  cidade: "Cidade",
  bairro: "Bairro",
  rua: "Endereço",
  numero: "Número",
  complemento: "Complemento",
  ocasiao: "Ocasião",
  pagamento: "Forma de pagamento",
  observacoes: "Observações",
};

export function Checkout({
  diasOff,
  prazos,
  ofertas,
}: {
  diasOff: string[];
  prazos: Record<string, number>;
  ofertas: Oferta[];
}) {
  const { linhas } = useCarrinho();
  const montado = useMontado();

  if (!montado) {
    return (
      <div className="checkout">
        <Topo />
        <div className="site-container checkout-corpo" aria-busy="true" />
      </div>
    );
  }
  if (linhas.length === 0) {
    return (
      <div className="checkout">
        <CarrinhoVazio />
      </div>
    );
  }
  return <Formulario linhas={linhas} diasOff={diasOff} prazos={prazos} ofertas={ofertas} />;
}

function Topo() {
  return (
    <section className="checkout-topo">
      <Hive />
      <div className="site-container checkout-topo-inner">
        <TextLink href={ROTAS.carrinho}>
          <Icon name="arrow_back" size={18} tone="inherit" />
          Voltar ao pedido
        </TextLink>
        <h1>Quase lá</h1>
        <p>
          Preencha seus dados e envie seu pedido pelo WhatsApp. A gente confirma tudo e combina o pagamento por lá.
        </p>
      </div>
    </section>
  );
}

// Primeiro render do formulário: o rascunho salvo, sem a data que deixou de
// valer (o dia passou, virou dia sem produção) e sem o horário que não
// existe no dia.
function rascunhoInicial(hoje: string, diasOff: ReadonlySet<string>): DadosCheckout {
  const dados = carregarRascunho();
  if (dados.data && motivoBloqueio(dados.data, hoje, diasOff) !== null) {
    dados.data = "";
    dados.hora = "";
  }
  if (dados.hora && !horariosDoDia(dados.data).includes(dados.hora)) dados.hora = "";
  return dados;
}

let sequenciaAviso = 0;

function Formulario({
  linhas,
  diasOff,
  prazos,
  ofertas,
}: {
  linhas: LinhaCarrinho[];
  diasOff: string[];
  prazos: Record<string, number>;
  ofertas: Oferta[];
}) {
  const router = useRouter();
  const { adicionar } = useCarrinho();
  const [hoje] = useState(() => hojeBrasilia());
  const bloqueados = useMemo(() => new Set(diasOff), [diasOff]);
  const [dados, setDados] = useState<DadosCheckout>(() => rascunhoInicial(hoje, bloqueados));
  const [tocados, setTocados] = useState<ReadonlySet<Campo>>(new Set());
  const [tentou, setTentou] = useState(false);
  const [avisos, setAvisos] = useState<Aviso[]>([]);
  const focoPendente = useRef<Campo | "ofertas" | "resumo" | null>(null);
  const tituloOfertas = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    salvarRascunho(dados);
  }, [dados]);

  // Foco depois de renderizar: primeiro campo com erro, ou o título das
  // ofertas depois de somar uma (o cartão some da lista).
  useEffect(() => {
    const alvo = focoPendente.current;
    if (!alvo) return;
    focoPendente.current = null;
    if (alvo === "ofertas" || alvo === "resumo") {
      const el = tituloOfertas.current ?? document.getElementById("checkout-resumo-titulo");
      el?.focus();
      return;
    }
    focarCampo(alvo);
  });

  const erros = validarCheckout(dados, hoje, bloqueados);
  const listaErros = camposComErro(erros);
  const erroVisivel = (c: Campo) => (tentou || tocados.has(c) ? erros[c] : undefined);

  const maisDemorado = itemMaisDemorado(linhas, prazos);
  const primeiraLivre = primeiraDataPermitida(hoje, bloqueados) ?? somarDias(hoje, 1);
  const curto = dados.data ? prazoCurto(dados.data, hoje, maisDemorado) : false;
  const horarios = dados.data ? horariosDoDia(dados.data) : [];
  const ofertasVisiveis = selecionarOfertas(ofertas, linhas, dados.data || null, hoje);

  function mudar<C extends Campo>(campo: C, valor: DadosCheckout[C]) {
    setDados((atual) => {
      const novo = { ...atual, [campo]: valor };
      // Trocou a data: o horário que não existe no dia novo (domingo fecha
      // mais cedo) volta vazio.
      if (campo === "data" && novo.hora && !horariosDoDia(novo.data).includes(novo.hora)) novo.hora = "";
      return novo;
    });
  }
  function tocar(campo: Campo) {
    setTocados((atual) => (atual.has(campo) ? atual : new Set([...atual, campo])));
  }

  function aoEnviar(e: FormEvent) {
    e.preventDefault();
    setTentou(true);
    if (listaErros.length > 0) {
      focoPendente.current = listaErros[0];
      // Força um render mesmo se `tentou` já era true.
      setTocados((atual) => new Set(atual));
      return;
    }
    salvarRascunho(dados);
    router.push(ROTAS.confirmacao);
  }

  function aoAdicionarOferta(oferta: Oferta) {
    const quantidade = quantidadeDaOferta(oferta);
    adicionar({
      tipo: "normal",
      produtoId: oferta.id,
      slug: oferta.slug,
      nome: oferta.nome,
      preco: Number(oferta.preco),
      unidade_venda: oferta.unidade_venda,
      quantidade,
      pedidoMinimo: oferta.pedido_minimo,
      step: oferta.step_quantidade,
      foto: oferta.image_url,
      observacao: null,
    });
    sequenciaAviso += 1;
    const id = `oferta-${sequenciaAviso}`;
    // Quanto entrou ("30 unidades"); sem unidade de venda, só o número, e
    // nada quando é 1.
    const qtd = nomeDaUnidade(quantidade, oferta.unidade_venda)
      ? textoQuantidadeNaUnidade(quantidade, oferta.unidade_venda)
      : quantidade > 1
        ? `quantidade ${quantidade}`
        : null;
    const texto = `${oferta.nome}${qtd ? ` (${qtd})` : ""} entrou no seu pedido.`;
    setAvisos((atuais) => [...atuais, { id, texto }].slice(-3));
    focoPendente.current = ofertasVisiveis.length > 1 ? "ofertas" : "resumo";
  }

  return (
    <div className="checkout">
      <Topo />

      <form id="checkout-form" className="site-container checkout-corpo" noValidate onSubmit={aoEnviar}>
        <div className="checkout-coluna-form">
          <ResumoDosErros visivel={tentou} erros={listaErros} />

          <Secao numero={1} id="checkout-secao-dados" titulo="Seus dados" sub="É por aqui que a gente vai te responder.">
            <div className="checkout-campos">
              <CampoTexto aoSair={tocar} campo="nome" obrigatorio erro={erroVisivel("nome")}>
                <Input
                  id={ids.nome}
                  data-campo="nome"
                  value={dados.nome}
                  maxLength={MAXIMO.nome}
                  autoComplete="name"
                  aria-required="true"
                  aria-invalid={Boolean(erroVisivel("nome"))}
                  aria-describedby={idErro("nome")}
                  invalid={Boolean(erroVisivel("nome"))}
                  onChange={(e) => mudar("nome", e.target.value)}
                />
              </CampoTexto>
              <div className="checkout-campos-dupla">
                <CampoTexto aoSair={tocar} campo="whatsapp" obrigatorio erro={erroVisivel("whatsapp")}>
                  <Input
                    id={ids.whatsapp}
                    data-campo="whatsapp"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    placeholder="(41) 90000-0000"
                    value={dados.whatsapp}
                    maxLength={MAXIMO.whatsapp}
                    aria-required="true"
                    aria-invalid={Boolean(erroVisivel("whatsapp"))}
                    aria-describedby={idErro("whatsapp")}
                    invalid={Boolean(erroVisivel("whatsapp"))}
                    onChange={(e) => mudar("whatsapp", mascararWhatsApp(e.target.value))}
                  />
                </CampoTexto>
                <CampoTexto aoSair={tocar} campo="email" semOpcional erro={erroVisivel("email")}>
                  <Input
                    id={ids.email}
                    data-campo="email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="nome@email.com"
                    value={dados.email}
                    maxLength={MAXIMO.email}
                    aria-invalid={Boolean(erroVisivel("email"))}
                    aria-describedby={idErro("email")}
                    invalid={Boolean(erroVisivel("email"))}
                    onChange={(e) => mudar("email", e.target.value)}
                  />
                </CampoTexto>
              </div>

              {/* Ciência da Política de Privacidade: nasce desmarcada e é
                  obrigatória, validada só na tela. Não é consentimento: a
                  base legal do tratamento é a execução do pedido (LGPD, art.
                  7º, V). Por isso o rótulo diz "li e estou ciente", não
                  "concordo", e o aceite não vai para o /api/pedidos. */}
              <div className="checkout-aceite" data-invalido={erroVisivel("aceite") ? true : undefined}>
                <label className="checkout-aceite-caixa">
                  <input
                    id={ids.aceite}
                    data-campo="aceite"
                    type="checkbox"
                    checked={dados.aceite}
                    aria-required="true"
                    aria-invalid={Boolean(erroVisivel("aceite"))}
                    aria-describedby={idErro("aceite")}
                    onChange={(e) => {
                      mudar("aceite", e.target.checked);
                      tocar("aceite");
                    }}
                  />
                  <span>
                    Li e estou ciente da{" "}
                    <a href={ROTAS.privacidade} target="_blank" rel="noopener noreferrer">
                      Política de Privacidade
                      <span className="site-visually-hidden"> (abre em nova aba)</span>
                    </a>
                    .<span aria-hidden="true"> *</span>
                  </span>
                </label>
                <p id={idErro("aceite")} className="checkout-erro" aria-live="polite">
                  {erroVisivel("aceite")}
                </p>
              </div>
            </div>
          </Secao>

          <Secao
            numero={2}
            id="checkout-secao-quando"
            titulo="Quando é a festa?"
            sub="A data manda no prazo. As que não dão já aparecem bloqueadas."
          >
            <div className="checkout-quando">
              <div className="checkout-quando-cal">
                <p id="checkout-data-rotulo" className="checkout-rotulo">
                  Data <span aria-hidden="true">*</span>
                  <span className="site-visually-hidden">(obrigatório)</span>
                </p>
                <div data-campo="data">
                  <Calendario
                    id={ids.data}
                    hoje={hoje}
                    valor={dados.data}
                    mesInicial={primeiraLivre}
                    aoEscolher={(iso) => {
                      mudar("data", iso);
                      tocar("data");
                    }}
                    motivo={(iso) => motivoBloqueio(iso, hoje, bloqueados)}
                    curto={(iso) => prazoCurto(iso, hoje, maisDemorado)}
                    invalido={Boolean(erroVisivel("data"))}
                    descricaoId={`${idErro("data")} checkout-data-porque`}
                  />
                </div>
                <p id={idErro("data")} className="checkout-erro" aria-live="polite">
                  {erroVisivel("data")}
                </p>
              </div>

              {/* Horário logo depois do calendário: no celular fica embaixo
                  dele; no desktop o CSS o põe no fim da coluna da direita. */}
              <div className="checkout-quando-hora">
                <CampoTexto
                  aoSair={tocar}
                  campo="hora"
                  obrigatorio
                  rotulo="Horário em que precisa"
                  erro={erroVisivel("hora")}
                  dica={dados.data ? undefined : "Escolha a data primeiro."}
                >
                  <Select
                    id={ids.hora}
                    data-campo="hora"
                    value={dados.hora}
                    disabled={!dados.data}
                    aria-required="true"
                    aria-invalid={Boolean(erroVisivel("hora"))}
                    aria-describedby={`${idErro("hora")} ${ids.hora}-dica`}
                    invalid={Boolean(erroVisivel("hora"))}
                    onChange={(e) => {
                      mudar("hora", e.target.value);
                      tocar("hora");
                    }}
                  >
                    <option value="">Escolha um horário</option>
                    {horarios.map((h) => (
                      <option key={h} value={h}>
                        {rotuloHorario(h)}
                      </option>
                    ))}
                  </Select>
                </CampoTexto>
              </div>

              <div aria-live="polite" className="checkout-quando-status">
                {dados.data && curto && maisDemorado ? (
                  <AvisoPrazo data={dados.data} hoje={hoje} item={maisDemorado} />
                ) : dados.data ? (
                  <div className="checkout-caixa" data-tom="ok">
                    <Icon name="event_available" size={22} color="var(--pdm-success-text)" />
                    <div>
                      <p className="checkout-caixa-titulo">{dataPorExtenso(dados.data)}</p>
                      <p>{textoDentroDoPrazo(dados.data)}</p>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="checkout-caixa checkout-quando-porque" data-tom="info" id="checkout-data-porque">
                <div>
                  <p className="checkout-caixa-titulo">Por que algumas datas ficam bloqueadas</p>
                  <p>
                    Não atendemos na segunda-feira. Dias de semana: 1 dia de antecedência; fins de semana: pedidos até
                    quinta-feira. Dias sem produção também ficam bloqueados.
                  </p>
                </div>
              </div>
            </div>
          </Secao>

          <Secao
            numero={3}
            id="checkout-secao-receber"
            titulo="Como você quer receber?"
            sub="Retirada na loja ou entrega no endereço que você escolher."
          >
            <fieldset className="checkout-grupo" data-campo="modo">
              <legend className="site-visually-hidden">Como você quer receber? (obrigatório)</legend>
              <div className="checkout-opcoes">
                <Opcao
                  nome="modo"
                  valor="retirada"
                  escolhido={dados.modo === "retirada"}
                  icone="storefront"
                  titulo="Retirar na loja"
                  texto={`${LOJA.endereco} · sem custo`}
                  descricaoId={idErro("modo")}
                  invalido={Boolean(erroVisivel("modo"))}
                  aoEscolher={() => {
                    mudar("modo", "retirada");
                    tocar("modo");
                  }}
                />
                <Opcao
                  nome="modo"
                  valor="entrega"
                  escolhido={dados.modo === "entrega"}
                  icone="local_shipping"
                  titulo="Entrega"
                  texto="Acréscimo a combinar no WhatsApp"
                  descricaoId={idErro("modo")}
                  invalido={Boolean(erroVisivel("modo"))}
                  aoEscolher={() => {
                    mudar("modo", "entrega");
                    tocar("modo");
                  }}
                />
              </div>
              <p id={idErro("modo")} className="checkout-erro" aria-live="polite">
                {erroVisivel("modo")}
              </p>
            </fieldset>

            {dados.modo === "entrega" ? (
              <div className="checkout-campos checkout-endereco">
                <div className="checkout-campos-dupla">
                  <CampoTexto aoSair={tocar} campo="cidade" obrigatorio erro={erroVisivel("cidade")}>
                    <Input
                      id={ids.cidade}
                      data-campo="cidade"
                      placeholder="Ex.: Fazenda Rio Grande"
                      autoComplete="address-level2"
                      value={dados.cidade}
                      maxLength={MAXIMO.cidade}
                      aria-required="true"
                      aria-invalid={Boolean(erroVisivel("cidade"))}
                      aria-describedby={idErro("cidade")}
                      invalid={Boolean(erroVisivel("cidade"))}
                      onChange={(e) => mudar("cidade", e.target.value)}
                    />
                  </CampoTexto>
                  <CampoTexto aoSair={tocar} campo="bairro" obrigatorio erro={erroVisivel("bairro")}>
                    <Input
                      id={ids.bairro}
                      data-campo="bairro"
                      placeholder="Ex.: Nações"
                      autoComplete="address-level3"
                      value={dados.bairro}
                      maxLength={MAXIMO.bairro}
                      aria-required="true"
                      aria-invalid={Boolean(erroVisivel("bairro"))}
                      aria-describedby={idErro("bairro")}
                      invalid={Boolean(erroVisivel("bairro"))}
                      onChange={(e) => mudar("bairro", e.target.value)}
                    />
                  </CampoTexto>
                </div>
                <CampoTexto aoSair={tocar} campo="rua" rotulo="Endereço (rua)" obrigatorio erro={erroVisivel("rua")}>
                  <Input
                    id={ids.rua}
                    data-campo="rua"
                    placeholder="Nome da rua"
                    autoComplete="address-line1"
                    value={dados.rua}
                    maxLength={MAXIMO.rua}
                    aria-required="true"
                    aria-invalid={Boolean(erroVisivel("rua"))}
                    aria-describedby={idErro("rua")}
                    invalid={Boolean(erroVisivel("rua"))}
                    onChange={(e) => mudar("rua", e.target.value)}
                  />
                </CampoTexto>
                <div className="checkout-campos-dupla">
                  <CampoTexto aoSair={tocar} campo="numero" obrigatorio erro={erroVisivel("numero")}>
                    <Input
                      id={ids.numero}
                      data-campo="numero"
                      placeholder="412"
                      value={dados.numero}
                      maxLength={MAXIMO.numero}
                      aria-required="true"
                      aria-invalid={Boolean(erroVisivel("numero"))}
                      aria-describedby={idErro("numero")}
                      invalid={Boolean(erroVisivel("numero"))}
                      onChange={(e) => mudar("numero", e.target.value)}
                    />
                  </CampoTexto>
                  <CampoTexto campo="complemento" erro={undefined}>
                    <Input
                      id={ids.complemento}
                      data-campo="complemento"
                      placeholder="Casa, apto..."
                      value={dados.complemento}
                      maxLength={MAXIMO.complemento}
                      aria-describedby={idErro("complemento")}
                      onChange={(e) => mudar("complemento", e.target.value)}
                    />
                  </CampoTexto>
                </div>
                <div className="checkout-caixa" data-tom="info">
                  <Icon name="info" size={22} color="var(--brown-700)" />
                  <p>A entrega tem um acréscimo que depende da cidade e do bairro. A gente confirma o valor no WhatsApp antes de fechar.</p>
                </div>
              </div>
            ) : null}
          </Secao>

          <Secao
            numero={4}
            id="checkout-secao-detalhes"
            titulo="Detalhes do pedido"
            sub="A ocasião ajuda a gente a caprichar. O pagamento é combinado no WhatsApp."
          >
            <div className="checkout-campos">
              <CampoTexto campo="ocasiao" erro={undefined}>
                <Input
                  id={ids.ocasiao}
                  data-campo="ocasiao"
                  placeholder="Ex.: aniversário de 1 ano, chá de bebê, casamento"
                  value={dados.ocasiao}
                  maxLength={MAXIMO.ocasiao}
                  aria-describedby={idErro("ocasiao")}
                  onChange={(e) => mudar("ocasiao", e.target.value)}
                />
              </CampoTexto>

              <fieldset className="checkout-grupo" data-campo="pagamento" aria-describedby="checkout-pagamento-dica">
                <legend className="checkout-rotulo">
                  Forma de pagamento <span aria-hidden="true">*</span>
                  <span className="site-visually-hidden">(obrigatório)</span>
                </legend>
                <div className="checkout-chips">
                  {FORMAS_PAGAMENTO.map((f) => (
                    <label key={f.valor} className="checkout-chip" data-escolhido={dados.pagamento === f.valor || undefined}>
                      <input
                        type="radio"
                        name="pagamento"
                        value={f.valor}
                        checked={dados.pagamento === f.valor}
                        aria-describedby={idErro("pagamento")}
                        onChange={() => {
                          mudar("pagamento", f.valor);
                          tocar("pagamento");
                        }}
                      />
                      <span>{f.rotulo}</span>
                    </label>
                  ))}
                </div>
                <p id="checkout-pagamento-dica" className="checkout-dica">
                  Nada é cobrado aqui no site. A gente confirma tudo e combina o pagamento pelo WhatsApp.
                </p>
                <p id={idErro("pagamento")} className="checkout-erro" aria-live="polite">
                  {erroVisivel("pagamento")}
                </p>
              </fieldset>
            </div>
          </Secao>

          <Secao numero={5} id="checkout-secao-obs" titulo="Observações gerais" sub="Qualquer coisa que a gente precise saber.">
            <CampoTexto campo="observacoes" erro={undefined} dica={`Até ${MAXIMO.observacoes} caracteres. As observações de cada item continuam no item.`}>
              <Textarea
                id={ids.observacoes}
                data-campo="observacoes"
                rows={4}
                placeholder="Ex.: tema e cores da festa, quem vai retirar, se tem alguma alergia"
                value={dados.observacoes}
                maxLength={MAXIMO.observacoes}
                aria-describedby={`${ids.observacoes}-dica`}
                onChange={(e) => mudar("observacoes", e.target.value)}
              />
            </CampoTexto>
          </Secao>
        </div>

        <aside className="checkout-coluna-resumo">
          <ResumoPedido linhas={linhas} />
          <div className="checkout-enviar">
            <p className="checkout-artesanal">
              <Icon name="favorite" size={20} color="var(--brown-500)" />
              <span>{TEXTO_ARTESANAL}</span>
            </p>
            <Button type="submit" variant="primary" size="lg" fullWidth iconRight="arrow_forward">
              Revisar e enviar
            </Button>
            <p className="checkout-sem-pagamento">
              <Icon name="payments" size={18} color="var(--brown-500)" />
              Nenhum pagamento é feito aqui no site.
            </p>
          </div>
        </aside>
      </form>

      <Ofertas
        ofertas={ofertasVisiveis}
        dataEscolhida={Boolean(dados.data)}
        aoAdicionar={aoAdicionarOferta}
        tituloRef={tituloOfertas}
      />

      <PilhaDeAvisos avisos={avisos} aoFechar={(id) => setAvisos((atuais) => atuais.filter((a) => a.id !== id))} />
    </div>
  );
}

// Foco no campo: o próprio campo, ou o que dá para focar dentro dele (o dia
// com Tab do calendário, a opção marcada de um grupo, a primeira opção).
function focarCampo(campo: Campo) {
  const el = document.querySelector<HTMLElement>(`[data-campo="${campo}"]`);
  if (!el) return;
  const alvo = el.matches("input, select, textarea")
    ? el
    : el.querySelector<HTMLElement>('button[tabindex="0"], input:checked, input, select, textarea');
  alvo?.focus();
  if (typeof alvo?.scrollIntoView === "function") alvo.scrollIntoView({ block: "center" });
}

function textoDentroDoPrazo(data: string): string {
  const dia = diaDaSemana(data);
  return dia === SABADO || dia === DOMINGO
    ? "Dentro do prazo: pedidos de fim de semana até quinta-feira."
    : "Dentro do prazo: pedidos com 1 dia de antecedência.";
}

function AvisoPrazo({ data, hoje, item }: { data: string; hoje: string; item: { nome: string; dias: number } }) {
  const pronto = prontoEm(hoje, item.dias);
  // Sem botão de WhatsApp: a cliente envia o pedido normalmente e o prazo
  // é combinado no WhatsApp depois do envio.
  return (
    <div className="checkout-caixa" data-tom="alerta">
      <Icon name="schedule" size={22} color="var(--brown-700)" />
      <div>
        <p className="checkout-caixa-titulo">{dataPorExtenso(data)}: prazo curto para {item.nome}</p>
        <p>
          {item.nome} leva {item.dias} {item.dias === 1 ? "dia" : "dias"} para ficar pronto (a partir de{" "}
          {dataPorExtenso(pronto).toLowerCase()}). Pode seguir com o pedido: depois do envio, a gente combina o prazo
          com você pelo WhatsApp e faz o possível pra te atender 💛.
        </p>
      </div>
    </div>
  );
}

function ResumoDosErros({ visivel, erros }: { visivel: boolean; erros: Campo[] }) {
  // Sempre no HTML (região de alerta que já existe é anunciada quando o
  // conteúdo muda).
  return (
    <div role="alert" className="checkout-erros" data-vazio={!visivel || erros.length === 0 || undefined}>
      {visivel && erros.length > 0 ? (
        <>
          <Icon name="error" size={22} color="var(--pdm-error)" />
          <div>
            <p className="checkout-caixa-titulo">
              {erros.length === 1 ? "Falta 1 campo para continuar." : `Faltam ${erros.length} campos para continuar.`}
            </p>
            <ul>
              {erros.map((c) => (
                <li key={c}>
                  <button type="button" className="checkout-erros-link" onClick={() => focarCampo(c)}>
                    {ROTULOS[c]}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </>
      ) : null}
    </div>
  );
}

function Secao({
  numero,
  id,
  titulo,
  sub,
  children,
}: {
  numero: number;
  id: string;
  titulo: string;
  sub: string;
  children: ReactNode;
}) {
  return (
    <section className="checkout-secao" aria-labelledby={`${id}-titulo`}>
      <div className="checkout-secao-cabeca">
        <span className="checkout-secao-numero" aria-hidden="true">
          {numero}
        </span>
        <div>
          <h2 id={`${id}-titulo`}>{titulo}</h2>
          <p>{sub}</p>
        </div>
      </div>
      <div className="checkout-secao-corpo">{children}</div>
    </section>
  );
}

function CampoTexto({
  campo,
  rotulo,
  obrigatorio = false,
  semOpcional = false,
  erro,
  dica,
  aoSair,
  children,
}: {
  campo: Campo;
  rotulo?: string;
  obrigatorio?: boolean;
  // Campo opcional sem a marca "(opcional)" (e-mail, decisão do Cainan).
  semOpcional?: boolean;
  erro: string | undefined;
  dica?: string;
  // Saiu do campo: o erro dele passa a aparecer. Fica no contêiner (o blur
  // sobe até aqui) para não tirar do Input/Select do design system o onBlur
  // que desliga a borda de foco.
  aoSair?: (campo: Campo) => void;
  children: ReactNode;
}) {
  return (
    <div className="checkout-campo" onBlur={aoSair ? () => aoSair(campo) : undefined}>
      <label htmlFor={ids[campo]} className="checkout-rotulo">
        {rotulo ?? ROTULOS[campo]}
        {obrigatorio ? (
          <>
            <span aria-hidden="true"> *</span>
            <span className="site-visually-hidden"> (obrigatório)</span>
          </>
        ) : semOpcional ? null : (
          <span className="checkout-opcional"> (opcional)</span>
        )}
      </label>
      {children}
      {dica ? (
        <p id={`${ids[campo]}-dica`} className="checkout-dica">
          {dica}
        </p>
      ) : null}
      <p id={idErro(campo)} className="checkout-erro" aria-live="polite">
        {erro}
      </p>
    </div>
  );
}

function Opcao({
  nome,
  valor,
  escolhido,
  icone,
  titulo,
  texto,
  descricaoId,
  invalido,
  aoEscolher,
}: {
  nome: string;
  valor: string;
  escolhido: boolean;
  icone: string;
  titulo: string;
  texto: string;
  descricaoId: string;
  invalido: boolean;
  aoEscolher: () => void;
}) {
  return (
    <label className="checkout-opcao" data-escolhido={escolhido || undefined} data-invalido={invalido || undefined}>
      <input
        type="radio"
        name={nome}
        value={valor}
        checked={escolhido}
        aria-describedby={descricaoId}
        onChange={aoEscolher}
      />
      <Icon name={icone} size={26} color="var(--brown-700)" />
      <span className="checkout-opcao-texto">
        <span className="checkout-opcao-titulo">{titulo}</span>
        <span>{texto}</span>
      </span>
    </label>
  );
}
