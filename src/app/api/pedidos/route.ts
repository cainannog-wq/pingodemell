import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { PedidoModoEntrega } from "@/lib/pedidos/types";

// Endpoint que o futuro formulário de checkout deve chamar em vez de
// inserir direto na tabela `pedidos` pelo navegador. Ver explicação
// completa em supabase/pedidos-schema.sql (seção "Rate limit por IP").
//
// A tabela `pedidos` continua com INSERT público via RLS (exigido pelo
// checkout sem login) e é isso que scripts/test-rls-pedidos.mjs testa.
// Este arquivo é a camada extra de proteção contra flood, testada
// separadamente por scripts/test-rate-limit-pedidos.mjs.

const JANELA_SEGUNDOS = 10 * 60; // 10 minutos
const LIMITE_POR_JANELA = 5; // 5 pedidos por IP a cada 10 minutos

const MODOS_ENTREGA: PedidoModoEntrega[] = ["entrega", "retirada"];

function getClientIp(request: NextRequest): string {
  const netlifyIp = request.headers.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;

  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();

  return "unknown";
}

type ItemInput = {
  nome?: unknown;
  variacao?: unknown;
  quantidade?: unknown;
  preco_unitario?: unknown;
};

type PedidoInput = {
  cliente_nome?: unknown;
  cliente_whatsapp?: unknown;
  cliente_email?: unknown;
  ocasiao?: unknown;
  modo_entrega?: unknown;
  endereco?: unknown;
  data_hora_entrega?: unknown;
  forma_pagamento?: unknown;
  observacoes?: unknown;
  itens?: unknown;
  valor_entrega?: unknown;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validarPedido(body: PedidoInput):
  | { valid: true; data: ReturnType<typeof montarPedido> }
  | { valid: false; error: string } {
  if (!isNonEmptyString(body.cliente_nome)) {
    return { valid: false, error: "Informe o nome do cliente." };
  }

  const whatsappDigitos = isNonEmptyString(body.cliente_whatsapp)
    ? body.cliente_whatsapp.replace(/\D/g, "")
    : "";
  if (whatsappDigitos.length < 10 || whatsappDigitos.length > 13) {
    return { valid: false, error: "Informe um WhatsApp válido, com DDD." };
  }

  if (body.cliente_email !== undefined && body.cliente_email !== null && body.cliente_email !== "") {
    if (typeof body.cliente_email !== "string" || !EMAIL_RE.test(body.cliente_email)) {
      return { valid: false, error: "Informe um e-mail válido (ou deixe em branco)." };
    }
  }

  if (typeof body.modo_entrega !== "string" || !MODOS_ENTREGA.includes(body.modo_entrega as PedidoModoEntrega)) {
    return { valid: false, error: "Informe o modo de entrega (entrega ou retirada)." };
  }
  const modo_entrega = body.modo_entrega as PedidoModoEntrega;

  if (modo_entrega === "entrega" && !isNonEmptyString(body.endereco)) {
    return { valid: false, error: "Informe o endereço de entrega." };
  }

  if (typeof body.data_hora_entrega !== "string" || Number.isNaN(Date.parse(body.data_hora_entrega))) {
    return { valid: false, error: "Informe uma data e hora de entrega válidas." };
  }

  if (!isNonEmptyString(body.forma_pagamento)) {
    return { valid: false, error: "Informe a forma de pagamento." };
  }

  if (!Array.isArray(body.itens) || body.itens.length === 0) {
    return { valid: false, error: "O pedido precisa ter ao menos um item." };
  }

  const itens: { nome: string; variacao: string | null; quantidade: number; preco_unitario: number }[] = [];
  for (const raw of body.itens as ItemInput[]) {
    if (!isNonEmptyString(raw.nome)) {
      return { valid: false, error: "Todo item precisa de nome." };
    }
    const quantidade = Number(raw.quantidade);
    if (!Number.isFinite(quantidade) || quantidade <= 0) {
      return { valid: false, error: `Quantidade inválida para "${raw.nome}".` };
    }
    const preco_unitario = Number(raw.preco_unitario);
    if (!Number.isFinite(preco_unitario) || preco_unitario < 0) {
      return { valid: false, error: `Preço inválido para "${raw.nome}".` };
    }
    itens.push({
      nome: raw.nome,
      variacao: isNonEmptyString(raw.variacao) ? raw.variacao : null,
      quantidade,
      preco_unitario,
    });
  }

  const valor_entrega = body.valor_entrega === undefined ? 0 : Number(body.valor_entrega);
  if (!Number.isFinite(valor_entrega) || valor_entrega < 0) {
    return { valid: false, error: "Valor de entrega inválido." };
  }

  return {
    valid: true,
    data: montarPedido({
      cliente_nome: (body.cliente_nome as string).trim(),
      cliente_whatsapp: (body.cliente_whatsapp as string).trim(),
      cliente_email: isNonEmptyString(body.cliente_email) ? body.cliente_email.trim() : null,
      ocasiao: isNonEmptyString(body.ocasiao) ? body.ocasiao.trim() : null,
      modo_entrega,
      endereco: isNonEmptyString(body.endereco) ? body.endereco.trim() : null,
      data_hora_entrega: new Date(body.data_hora_entrega as string).toISOString(),
      forma_pagamento: (body.forma_pagamento as string).trim(),
      observacoes: isNonEmptyString(body.observacoes) ? body.observacoes.trim() : null,
      itens,
      valor_entrega,
    }),
  };
}

function montarPedido(input: {
  cliente_nome: string;
  cliente_whatsapp: string;
  cliente_email: string | null;
  ocasiao: string | null;
  modo_entrega: PedidoModoEntrega;
  endereco: string | null;
  data_hora_entrega: string;
  forma_pagamento: string;
  observacoes: string | null;
  itens: { nome: string; variacao: string | null; quantidade: number; preco_unitario: number }[];
  valor_entrega: number;
}) {
  // Total sempre recalculado no servidor — nunca confiar em subtotal/total
  // vindos do cliente (poderiam ser adulterados no corpo da requisição).
  const subtotal = input.itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
  const total = subtotal + input.valor_entrega;

  return {
    cliente_nome: input.cliente_nome,
    cliente_whatsapp: input.cliente_whatsapp,
    cliente_email: input.cliente_email,
    ocasiao: input.ocasiao,
    modo_entrega: input.modo_entrega,
    endereco: input.endereco,
    data_hora_entrega: input.data_hora_entrega,
    forma_pagamento: input.forma_pagamento,
    observacoes: input.observacoes,
    itens: input.itens,
    subtotal: Number(subtotal.toFixed(2)),
    valor_entrega: Number(input.valor_entrega.toFixed(2)),
    total: Number(total.toFixed(2)),
  };
}

export async function POST(request: NextRequest) {
  let body: PedidoInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição precisa ser JSON." }, { status: 400 });
  }

  const ip = getClientIp(request);

  const admin = createAdminClient();
  const { data: rateLimitRows, error: rateLimitError } = await admin.rpc("registrar_tentativa_pedido", {
    p_ip: ip,
    p_janela_segundos: JANELA_SEGUNDOS,
    p_limite: LIMITE_POR_JANELA,
  });

  if (rateLimitError) {
    console.error("Falha ao checar rate limit de pedidos:", rateLimitError);
    return NextResponse.json({ error: "Não foi possível processar o pedido. Tente novamente." }, { status: 500 });
  }

  const permitido = rateLimitRows?.[0]?.permitido ?? true;
  if (!permitido) {
    return NextResponse.json(
      { error: "Muitos pedidos enviados em pouco tempo. Aguarde alguns minutos e tente de novo." },
      { status: 429 }
    );
  }

  const resultado = validarPedido(body);
  if (!resultado.valid) {
    return NextResponse.json({ error: resultado.error }, { status: 400 });
  }

  // Insert com a service role (mesmo client "admin" já usado pro rate
  // limit acima) em vez da anon key. Motivo: a policy de SELECT de
  // `pedidos` é restrita a authenticated, e o Postgres também aplica essa
  // policy ao RETURNING de um INSERT — um insert anônimo pedindo o id/
  // numero de volta (.select() depois de .insert()) falha com "new row
  // violates row-level security policy", mesmo o insert em si sendo
  // permitido. Não abre brecha nova: este endpoint já valida/sanitiza tudo
  // acima antes de gravar, e o insert público direto na tabela (sem passar
  // por aqui) continua funcionando e protegido só pelas policies + CHECK
  // constraints, que é o que scripts/test-rls-pedidos.mjs testa.
  const { data: pedido, error: insertError } = await admin
    .from("pedidos")
    .insert(resultado.data)
    .select("id, numero")
    .single();

  if (insertError) {
    console.error("Falha ao criar pedido:", insertError);
    return NextResponse.json({ error: "Não foi possível registrar o pedido." }, { status: 500 });
  }

  return NextResponse.json({ id: pedido.id, numero: pedido.numero }, { status: 201 });
}
