import { FORMAS_PAGAMENTO, emailValido, enderecoCompleto, soDigitos } from "@/lib/checkout/formulario";
import { FORMATOS_BOLO, KG_MAXIMO, KG_MINIMO } from "@/lib/vitrine/bolo";
import { MAX_CENTOS } from "@/lib/vitrine/cento";
import { MAX_QUANTIDADE } from "@/lib/vitrine/quantidade";
import { hojeBrasilia, instanteBrasilia, lerDataIso, somarMesesNaData } from "@/lib/tempo/brasilia";
import { valorDaLinhaEmCentavos, type ItemEnvio } from "./envio";

// Validação do corpo de POST /api/pedidos: FORMA e LIMITE, não verdade de
// negócio (decisão do Cainan, PR confirmacao-e-gravacao):
// - esquema estrito: campo desconhecido é recusado;
// - tamanho máximo de cada texto, número de linhas, quantidade por linha,
//   preço até R$ 50.000 com 2 casas, itens até 16 KB;
// - WhatsApp: só dígitos, com ou sem o 55 na frente, 10 ou 11 dígitos com DDD;
// - data: não pode estar no passado nem passar de 12 meses (Brasília).
// O que NÃO é conferido aqui: produto ou recheio ativo, preço atual, id que
// ainda existe (só o formato), antecedência, dias bloqueados, horário de
// atendimento e prazo de produção — isso vive só no checkout.
//
// Mensagens de erro são genéricas: nunca repetem o que veio no corpo.

export const LIMITES = {
  corpoBytes: 32 * 1024,
  itensBytes: 16 * 1024,
  linhas: 50,
  nome: 100,
  whatsapp: 20,
  email: 120,
  cidade: 80,
  bairro: 80,
  rua: 150,
  numero: 20,
  complemento: 80,
  ocasiao: 100,
  observacoes: 500,
  nomeItem: 200,
  observacaoItem: 300,
  unidadeVenda: 20,
  saboresPorLinha: 30,
  precoMaximoCentavos: 5_000_000,
  mesesAFrente: 12,
} as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

const CAMPOS_PEDIDO = [
  "chave_idempotencia", "nome", "whatsapp", "email", "data", "hora", "modo", "cidade", "bairro", "rua",
  "numero", "complemento", "ocasiao", "pagamento", "observacoes", "itens", "total_navegador_centavos",
] as const;
const CAMPOS_ITEM_BASE = ["tipo", "produto_id", "nome", "quantidade", "preco", "observacao"];
const CAMPOS_ITEM: Record<ItemEnvio["tipo"], string[]> = {
  normal: [...CAMPOS_ITEM_BASE, "unidade_venda"],
  cento: [...CAMPOS_ITEM_BASE, "sabores"],
  bolo: [...CAMPOS_ITEM_BASE, "recheio", "formato"],
  bento: [...CAMPOS_ITEM_BASE, "recheio"],
};
const MAX_POR_TIPO: Record<ItemEnvio["tipo"], [number, number]> = {
  normal: [1, MAX_QUANTIDADE],
  bento: [1, MAX_QUANTIDADE],
  cento: [1, MAX_CENTOS],
  bolo: [KG_MINIMO, KG_MAXIMO],
};

// Item como fica gravado em pedidos.itens. As 4 primeiras chaves são as de
// sempre (o gatilho pedidos_recalcular_totais soma quantidade ×
// preco_unitario, e o painel lê nome e variacao); as outras são o retrato
// completo da linha.
export type ItemGravado = {
  nome: string;
  variacao: string | null;
  quantidade: number;
  preco_unitario: number;
  produto_id: string;
  tipo: ItemEnvio["tipo"];
  unidade_venda?: string | null;
  observacao: string | null;
  sabores?: { nome: string; quantidade: number }[];
  recheio?: { id: string; nome: string };
  formato?: "redondo" | "quadrado";
};

export type PedidoValidado = {
  chave: string;
  pedido: {
    cliente_nome: string;
    cliente_whatsapp: string;
    cliente_email: string | null;
    ocasiao: string | null;
    modo_entrega: "entrega" | "retirada";
    endereco: string | null;
    data_hora_entrega: string;
    forma_pagamento: string;
    observacoes: string | null;
    itens: ItemGravado[];
  };
  valoresCentavos: number[];
  subtotalCentavos: number;
  totalNavegadorCentavos: number | null;
};

export type Resultado = { ok: true; valor: PedidoValidado } | { ok: false; mensagem: string };

class Invalido extends Error {}
function falha(mensagem: string): never {
  throw new Invalido(mensagem);
}

function objeto(v: unknown, permitidos: readonly string[], mensagem: string): Record<string, unknown> {
  if (typeof v !== "object" || v === null || Array.isArray(v)) falha(mensagem);
  const o = v as Record<string, unknown>;
  if (Object.keys(o).some((k) => !permitidos.includes(k))) falha("O pedido tem um campo que o site não reconhece.");
  return o;
}

// Texto opcional: string (pode ser vazia) até o máximo; devolve sem espaços
// nas pontas. Texto livre entra como texto, nunca é interpretado.
function texto(v: unknown, maximo: number, mensagem: string): string {
  if (typeof v !== "string" || v.length > maximo) falha(mensagem);
  return v.trim();
}
function obrigatorio(v: unknown, maximo: number, mensagem: string): string {
  const t = texto(v, maximo, mensagem);
  if (!t) falha(mensagem);
  return t;
}
function inteiro(v: unknown, min: number, max: number, mensagem: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < min || v > max) falha(mensagem);
  return v;
}

// "+55 (41) 99999-8888" -> "41999998888". Com 12 ou 13 dígitos começando por
// 55, tira o 55; depois exige 10 (fixo) ou 11 (celular) dígitos com DDD.
export function normalizarWhatsApp(v: string): string | null {
  let d = soDigitos(v);
  if ((d.length === 12 || d.length === 13) && d.startsWith("55")) d = d.slice(2);
  if (!/^[1-9]{2}/.test(d)) return null;
  if (d.length === 10) return /^[2-5]/.test(d.slice(2)) ? d : null;
  if (d.length === 11) return d[2] === "9" ? d : null;
  return null;
}

// "41999998888" -> "(41) 99999-8888".
export function formatarWhatsApp(digitos: string): string {
  const corte = digitos.length === 11 ? 7 : 6;
  return `(${digitos.slice(0, 2)}) ${digitos.slice(2, corte)}-${digitos.slice(corte)}`;
}

function preco(v: unknown): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) falha("Um item do pedido está com o valor inválido.");
  const centavos = Math.round(v * 100);
  if (Math.abs(centavos - v * 100) > 1e-6 || centavos > LIMITES.precoMaximoCentavos) {
    falha("Um item do pedido está com o valor inválido.");
  }
  return centavos / 100;
}

function recheio(v: unknown): { id: string; nome: string } {
  const r = objeto(v, ["id", "nome"], "Um item do pedido está com o recheio inválido.");
  const id = texto(r.id, 36, "Um item do pedido está com o recheio inválido.");
  if (!UUID.test(id)) falha("Um item do pedido está com o recheio inválido.");
  return { id: id.toLowerCase(), nome: obrigatorio(r.nome, LIMITES.nomeItem, "Um item do pedido está com o recheio inválido.") };
}

function item(v: unknown): { gravado: ItemGravado; centavos: number } {
  if (typeof v !== "object" || v === null || Array.isArray(v)) falha("Um item do pedido está incompleto.");
  const tipo = (v as Record<string, unknown>).tipo;
  if (tipo !== "normal" && tipo !== "cento" && tipo !== "bolo" && tipo !== "bento") falha("Um item do pedido está incompleto.");
  const o = objeto(v, CAMPOS_ITEM[tipo], "Um item do pedido está incompleto.");

  const produtoId = texto(o.produto_id, 36, "Um item do pedido está incompleto.");
  if (!UUID.test(produtoId)) falha("Um item do pedido está incompleto.");
  const nome = obrigatorio(o.nome, LIMITES.nomeItem, "Um item do pedido está incompleto.");
  const [min, max] = MAX_POR_TIPO[tipo];
  const quantidade = inteiro(o.quantidade, min, max, "Um item do pedido está com a quantidade fora do limite.");
  const precoUnitario = preco(o.preco);
  let observacao: string | null = null;
  if (o.observacao !== null && o.observacao !== undefined) {
    observacao = texto(o.observacao, LIMITES.observacaoItem, "A observação de um item passou do tamanho.") || null;
  }

  const gravado: ItemGravado = {
    nome,
    variacao: null,
    quantidade,
    preco_unitario: precoUnitario,
    produto_id: produtoId.toLowerCase(),
    tipo,
    observacao,
  };

  if (tipo === "normal") {
    gravado.unidade_venda =
      o.unidade_venda === null || o.unidade_venda === undefined
        ? null
        : texto(o.unidade_venda, LIMITES.unidadeVenda, "Um item do pedido está incompleto.") || null;
  }
  if (tipo === "cento") {
    if (!Array.isArray(o.sabores) || o.sabores.length === 0 || o.sabores.length > LIMITES.saboresPorLinha) {
      falha("Um Cento do pedido está com os sabores fora do limite.");
    }
    gravado.sabores = o.sabores.map((s) => {
      const sabor = objeto(s, ["nome", "quantidade"], "Um Cento do pedido está com os sabores fora do limite.");
      return {
        nome: obrigatorio(sabor.nome, LIMITES.nomeItem, "Um Cento do pedido está com os sabores fora do limite."),
        quantidade: inteiro(sabor.quantidade, 0, MAX_CENTOS * 100, "Um Cento do pedido está com os sabores fora do limite."),
      };
    });
    gravado.variacao = gravado.sabores.filter((s) => s.quantidade > 0).map((s) => `${s.nome} ${s.quantidade}`).join(" · ") || null;
  }
  if (tipo === "bolo" || tipo === "bento") {
    gravado.recheio = recheio(o.recheio);
    gravado.variacao = `Recheio ${gravado.recheio.nome}`;
  }
  if (tipo === "bolo") {
    if (!(FORMATOS_BOLO as readonly unknown[]).includes(o.formato)) falha("Um bolo do pedido está com o formato inválido.");
    gravado.formato = o.formato as "redondo" | "quadrado";
    gravado.variacao = `Recheio ${gravado.recheio!.nome} · ${gravado.formato}`;
  }

  return { gravado, centavos: valorDaLinhaEmCentavos({ preco: precoUnitario, quantidade }) };
}

// `hoje` é injetável só para teste; o padrão é o dia de Brasília.
export function validarPedido(bruto: unknown, hoje: string = hojeBrasilia()): Resultado {
  try {
    const o = objeto(bruto, CAMPOS_PEDIDO, "O pedido chegou incompleto.");

    const chave = texto(o.chave_idempotencia, 36, "O pedido chegou incompleto.");
    if (!UUID.test(chave)) falha("O pedido chegou incompleto.");

    const nome = obrigatorio(o.nome, LIMITES.nome, "Confira o seu nome.");
    const whatsapp = normalizarWhatsApp(texto(o.whatsapp, LIMITES.whatsapp, "Confira o número de WhatsApp."));
    if (!whatsapp) falha("Confira o número de WhatsApp: DDD e número.");
    const email = texto(o.email, LIMITES.email, "Confira o e-mail.");
    if (email && !emailValido(email)) falha("Confira o e-mail.");

    const data = texto(o.data, 10, "Confira a data do pedido.");
    if (!lerDataIso(data)) falha("Confira a data do pedido.");
    if (data < hoje) falha("A data do pedido já passou. Escolha outra data.");
    if (data > somarMesesNaData(hoje, LIMITES.mesesAFrente)) falha("A data do pedido está longe demais. Escolha outra data.");
    const hora = texto(o.hora, 5, "Confira o horário do pedido.");
    if (!HORA.test(hora)) falha("Confira o horário do pedido.");

    if (o.modo !== "entrega" && o.modo !== "retirada") falha("Escolha retirada ou entrega.");
    const partes = {
      cidade: texto(o.cidade, LIMITES.cidade, "Confira o endereço de entrega."),
      bairro: texto(o.bairro, LIMITES.bairro, "Confira o endereço de entrega."),
      rua: texto(o.rua, LIMITES.rua, "Confira o endereço de entrega."),
      numero: texto(o.numero, LIMITES.numero, "Confira o endereço de entrega."),
      complemento: texto(o.complemento, LIMITES.complemento, "Confira o endereço de entrega."),
    };
    if (o.modo === "entrega" && (!partes.cidade || !partes.bairro || !partes.rua || !partes.numero)) {
      falha("Confira o endereço de entrega.");
    }

    const ocasiao = texto(o.ocasiao, LIMITES.ocasiao, "A ocasião passou do tamanho.");
    const forma = FORMAS_PAGAMENTO.find((f) => f.valor === o.pagamento);
    if (!forma) falha("Escolha a forma de pagamento.");
    const observacoes = texto(o.observacoes, LIMITES.observacoes, "As observações passaram do tamanho.");

    if (!Array.isArray(o.itens) || o.itens.length === 0) falha("O pedido precisa ter pelo menos um item.");
    if (o.itens.length > LIMITES.linhas) falha(`O pedido passou de ${LIMITES.linhas} itens.`);
    const itens = o.itens.map(item);
    const gravados = itens.map((i) => i.gravado);
    if (new TextEncoder().encode(JSON.stringify(gravados)).length > LIMITES.itensBytes) {
      falha("O pedido ficou grande demais para o site. Tire alguns itens ou encurte as observações.");
    }

    let totalNavegador: number | null = null;
    if (o.total_navegador_centavos !== undefined) {
      totalNavegador = inteiro(o.total_navegador_centavos, 0, Number.MAX_SAFE_INTEGER, "O pedido chegou incompleto.");
    }

    const valores = itens.map((i) => i.centavos);
    return {
      ok: true,
      valor: {
        chave: chave.toLowerCase(),
        pedido: {
          cliente_nome: nome,
          cliente_whatsapp: formatarWhatsApp(whatsapp),
          cliente_email: email || null,
          ocasiao: ocasiao || null,
          modo_entrega: o.modo,
          endereco: o.modo === "entrega" ? enderecoCompleto(partes) : null,
          data_hora_entrega: instanteBrasilia(data, hora),
          forma_pagamento: forma.rotulo,
          observacoes: observacoes || null,
          itens: gravados,
        },
        valoresCentavos: valores,
        subtotalCentavos: valores.reduce((a, b) => a + b, 0),
        totalNavegadorCentavos: totalNavegador,
      },
    };
  } catch (erro) {
    if (erro instanceof Invalido) return { ok: false, mensagem: erro.message };
    throw erro;
  }
}
