import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { contextoDaGravacao, pedidoDeTeste } from "@/lib/pedidos/ambiente";
import type { CodigoErro, RespostaPedido } from "@/lib/pedidos/envio";
import { LIMITES, validarPedido } from "@/lib/pedidos/validacao";

// Único caminho de gravação de pedido (a cliente continua sem login). Desde o
// PR seguranca-api, nenhum papel da API (anon, authenticated) grava direto na
// tabela `pedidos` nem chama as funções do limite por IP — só a chave de
// serviço, aqui no servidor.
//
// Ordem (PR confirmacao-e-gravacao):
//   1. corpo até 32 KB e JSON;
//   2. validação de forma e limite (src/lib/pedidos/validacao.ts). NENHUMA
//      chamada ao banco antes de ela passar: tentativa inválida não conta no
//      limite por IP;
//   3. uma chamada só ao banco, public.criar_pedido (supabase/pedidos-gravacao.sql):
//      interruptor do ambiente, trava e procura pela chave de idempotência,
//      limite por IP (só quando vai gravar; chave repetida não conta) e a
//      gravação.
// Respostas: 201 criado; 200 chave repetida (mesmo pedido); 400 inválido;
// 413 grande demais; 409 gravação desligada; 429 limite (Retry-After);
// 500 erro. Nenhuma devolve dado pessoal nem repete o corpo.
//
// Logs: só códigos e números. Nunca o corpo, o erro do banco inteiro (o
// Postgres pode repetir a linha recusada, com nome e endereço) nem o IP.
//
// Testes: route.test.ts (esta rota, com o banco simulado) e
// scripts/banco/gravacao-pedidos.mjs (a função do banco, em transação desfeita).

const JANELA_SEGUNDOS = 60 * 60; // 1 hora, janela fixa
const LIMITE_POR_JANELA = 8; // 8 pedidos gravados por IP por hora

function getClientIp(request: NextRequest): string {
  const netlifyIp = request.headers.get("x-nf-client-connection-ip");
  if (netlifyIp) return netlifyIp;

  // x-forwarded-for é livremente definível pelo cliente e só serve como
  // fallback fora de produção (dev local sem o proxy do Netlify na frente).
  // Confiar nele em produção permitiria burlar o rate limit por IP trocando
  // o header a cada request.
  if (process.env.NODE_ENV !== "production") {
    const forwardedFor = request.headers.get("x-forwarded-for");
    if (forwardedFor) return forwardedFor.split(",")[0].trim();
  }

  return "unknown";
}

function erro(status: number, codigo: CodigoErro, mensagem: string, cabecalhos?: Record<string, string>) {
  return NextResponse.json({ codigo, mensagem }, { status, headers: cabecalhos });
}

const MENSAGEM_ERRO = "Não conseguimos registrar o pedido agora. Tente de novo.";

type LinhaCriarPedido = {
  r_situacao: "criado" | "existente" | "bloqueado" | "desligado";
  r_numero: number | null;
  r_itens: { quantidade: number; preco_unitario: number }[] | null;
  r_subtotal: number | string | null;
  r_total: number | string | null;
  r_retry_segundos: number | null;
};

const centavos = (v: number | string | null) => Math.round(Number(v ?? 0) * 100);

function resposta(linha: LinhaCriarPedido): RespostaPedido {
  return {
    numero: linha.r_numero!,
    itens: (linha.r_itens ?? []).map((i) => ({ valor_centavos: Math.round(Number(i.preco_unitario) * 100) * Number(i.quantidade) })),
    subtotal_centavos: centavos(linha.r_subtotal),
    total_centavos: centavos(linha.r_total),
  };
}

export async function POST(request: NextRequest) {
  const texto = await request.text();
  if (new TextEncoder().encode(texto).length > LIMITES.corpoBytes) {
    return erro(413, "grande_demais", "O pedido ficou grande demais para o site. Tire alguns itens ou encurte as observações.");
  }
  let corpo: unknown;
  try {
    corpo = JSON.parse(texto);
  } catch {
    return erro(400, "invalido", "O pedido chegou incompleto.");
  }

  const validado = validarPedido(corpo);
  if (!validado.ok) return erro(400, "invalido", validado.mensagem);
  const { chave, pedido, subtotalCentavos, totalNavegadorCentavos } = validado.valor;

  const { data, error } = await createAdminClient().rpc("criar_pedido", {
    p_contexto: contextoDaGravacao(),
    p_chave: chave,
    p_pedido: pedido,
    p_teste: pedidoDeTeste(),
    p_ip: getClientIp(request),
    p_janela_segundos: JANELA_SEGUNDOS,
    p_limite: LIMITE_POR_JANELA,
  });

  if (error) {
    console.error("pedidos: falha ao gravar", { codigo: error.code ?? "sem-codigo" });
    return erro(500, "erro", MENSAGEM_ERRO);
  }
  const linha = (Array.isArray(data) ? data[0] : data) as LinhaCriarPedido | undefined;
  if (!linha) {
    console.error("pedidos: resposta vazia do banco");
    return erro(500, "erro", MENSAGEM_ERRO);
  }

  if (linha.r_situacao === "desligado") {
    return erro(409, "gravacao_desligada", "O registro de pedidos pelo site está desligado. Envie o pedido pelo WhatsApp.");
  }
  if (linha.r_situacao === "bloqueado") {
    const espera = Math.max(1, linha.r_retry_segundos ?? JANELA_SEGUNDOS);
    return NextResponse.json(
      {
        codigo: "limite" satisfies CodigoErro,
        mensagem: "Muitos pedidos enviados desta conexão em pouco tempo.",
        espera_segundos: espera,
      },
      { status: 429, headers: { "Retry-After": String(espera) } }
    );
  }

  const devolvido = resposta(linha);
  if (linha.r_situacao === "criado") {
    if (devolvido.subtotal_centavos !== subtotalCentavos) {
      // Não deveria acontecer: a rota e o gatilho fazem a mesma conta.
      console.error("pedidos: total do banco difere do da rota", { numero: devolvido.numero });
    }
    if (totalNavegadorCentavos !== null && totalNavegadorCentavos !== devolvido.total_centavos) {
      // Aceito: grava o recalculado. Sem dado pessoal no log.
      console.warn("pedidos: total do navegador difere do recalculado", {
        numero: devolvido.numero,
        diferenca_centavos: totalNavegadorCentavos - devolvido.total_centavos,
      });
    }
  }
  return NextResponse.json(devolvido, { status: linha.r_situacao === "criado" ? 201 : 200 });
}
