// Cadastra pedidos de demonstração cobrindo os 4 status do enum
// pedido_status, pra dar pra clicar no painel de pedidos sem precisar
// esperar o checkout do carrinho existir — mesma lógica de
// seed-produtos-demo.mjs (semear manualmente antes do fluxo real nascer).
//
// Idempotente: pula pedidos cujo par cliente/ocasião já existe.
//
// Datas geradas relativas ao momento em que o script roda (X dias atrás /
// à frente), não fixas, para o pedido continuar parecendo "recente" e
// contar nos cards de estatística (que olham o mês atual) não importa
// quando este script for executado.
//
// Requisito em .env.local: SUPABASE_SERVICE_ROLE_KEY (mesmo padrão de
// seed-produtos-demo.mjs — bypassa RLS por ser script local de seed).
//
// Uso: node scripts/seed-pedidos-demo.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

function loadDotEnv(filePath) {
  if (!existsSync(filePath)) return {};
  const out = {};
  for (const line of readFileSync(filePath, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const dotenv = loadDotEnv(path.join(projectRoot, ".env.local"));
function getEnv(name) {
  return process.env[name] || dotenv[name] || "";
}

const SUPABASE_URL = getEnv("SUPABASE_URL");
const SERVICE_ROLE_KEY = getEnv("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERRO: faltam SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY em .env.local.");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// Horário de Brasília é UTC-3 fixo (sem horário de verão desde 2019), daí
// o offset "-03:00" literal abaixo — não depende do fuso da máquina que
// roda o script.
function bzTime(daysOffset, hour, minute = 0) {
  const now = new Date();
  const base = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  base.setUTCDate(base.getUTCDate() + daysOffset);
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  const hh = String(hour).padStart(2, "0");
  const mm = String(minute).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:${mm}:00-03:00`;
}

function calcularTotais(itens, valor_entrega) {
  const subtotal = itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
  return { subtotal: Number(subtotal.toFixed(2)), total: Number((subtotal + valor_entrega).toFixed(2)) };
}

const PEDIDOS_DEMO = [
  {
    cliente_nome: "Fernanda Ribeiro",
    cliente_whatsapp: "(41) 99811-2233",
    cliente_email: "fernanda.ribeiro@gmail.com",
    ocasiao: "Aniversário de 30 anos",
    modo_entrega: "entrega",
    endereco: "Rua das Araucárias, 210 — Curitiba/PR",
    data_hora_entrega: bzTime(9, 15, 0),
    forma_pagamento: "PIX",
    observacoes: "Bolo sem glúten, por favor. Topo com o número 30.",
    itens: [
      { nome: "Bolo de Chocolate com Ninho", variacao: "Tamanho 25cm", quantidade: 1, preco_unitario: 45.0 },
      { nome: "Brigadeiro Gourmet (unidade)", variacao: null, quantidade: 40, preco_unitario: 3.5 },
    ],
    valor_entrega: 20,
    status: "aguardando_confirmacao",
    criado_em: bzTime(0, 12, 30),
  },
  {
    cliente_nome: "Juliano Camargo",
    cliente_whatsapp: "(41) 99722-4455",
    cliente_email: null,
    ocasiao: "Confraternização de fim de ano da empresa",
    modo_entrega: "retirada",
    endereco: null,
    data_hora_entrega: bzTime(14, 17, 0),
    forma_pagamento: "Cartão de crédito na retirada",
    observacoes: null,
    itens: [{ nome: "Coxinha de Frango (cento)", variacao: "Massa tradicional", quantidade: 2, preco_unitario: 90.0 }],
    valor_entrega: 0,
    status: "aguardando_confirmacao",
    criado_em: bzTime(-1, 9, 15),
  },
  {
    cliente_nome: "Patrícia Souza",
    cliente_whatsapp: "(41) 98877-6655",
    cliente_email: "patricia.souza@outlook.com",
    ocasiao: "Chá de bebê",
    modo_entrega: "entrega",
    endereco: "Av. Sete de Setembro, 4521 — Curitiba/PR",
    data_hora_entrega: bzTime(3, 16, 0),
    forma_pagamento: "50% no PIX, restante na entrega",
    observacoes: "Entregar na portaria do salão de festas.",
    itens: [
      { nome: "Bolo de Chocolate com Ninho", variacao: "2 andares, tema chá de bebê", quantidade: 1, preco_unitario: 45.0 },
      { nome: "Brigadeiro Gourmet (unidade)", variacao: "Granulado belga", quantidade: 60, preco_unitario: 3.5 },
    ],
    valor_entrega: 30,
    status: "em_producao",
    criado_em: bzTime(-4, 11, 0),
    status_atualizado_em: bzTime(-2, 14, 20),
  },
  {
    cliente_nome: "Roberto Alencar",
    cliente_whatsapp: "(41) 99333-1122",
    cliente_email: "roberto.alencar@empresa.com.br",
    ocasiao: "Reunião de diretoria",
    modo_entrega: "entrega",
    endereco: "Rua XV de Novembro, 1000, sala 12 — Curitiba/PR",
    data_hora_entrega: bzTime(-6, 10, 0),
    forma_pagamento: "Boleto empresarial",
    observacoes: "Levar talheres e guardanapos descartáveis.",
    itens: [
      { nome: "Coxinha de Frango (cento)", variacao: null, quantidade: 1, preco_unitario: 90.0 },
      { nome: "Brigadeiro Gourmet (unidade)", variacao: null, quantidade: 20, preco_unitario: 3.5 },
    ],
    valor_entrega: 25,
    status: "entregue",
    criado_em: bzTime(-10, 8, 40),
    status_atualizado_em: bzTime(-6, 10, 20),
  },
  {
    cliente_nome: "Camila Duarte",
    cliente_whatsapp: "(41) 99654-3210",
    cliente_email: "camila.duarte@gmail.com",
    ocasiao: "Aniversário de 15 anos",
    modo_entrega: "retirada",
    endereco: null,
    data_hora_entrega: bzTime(-8, 18, 0),
    forma_pagamento: "Pago integralmente no PIX",
    observacoes: null,
    itens: [
      { nome: "Bolo de Chocolate com Ninho", variacao: "3 andares, tema festa de 15 anos", quantidade: 1, preco_unitario: 45.0 },
      { nome: "Brigadeiro Gourmet (unidade)", variacao: null, quantidade: 80, preco_unitario: 3.5 },
    ],
    valor_entrega: 0,
    status: "entregue",
    criado_em: bzTime(-14, 19, 0),
    status_atualizado_em: bzTime(-8, 18, 30),
  },
  {
    cliente_nome: "Diego Martins",
    cliente_whatsapp: "(41) 99456-7890",
    cliente_email: "diego.martins@hotmail.com",
    ocasiao: "Mêsversário do filho",
    modo_entrega: "entrega",
    endereco: "Rua Marechal Deodoro, 300 — Curitiba/PR",
    data_hora_entrega: bzTime(-3, 15, 0),
    forma_pagamento: "Sinal devolvido no PIX",
    observacoes: "Cliente remarcou a festa para outubro e pediu para cancelar este pedido.",
    itens: [{ nome: "Coxinha de Frango (cento)", variacao: null, quantidade: 1, preco_unitario: 90.0 }],
    valor_entrega: 20,
    status: "cancelado",
    criado_em: bzTime(-12, 10, 0),
    status_atualizado_em: bzTime(-9, 9, 0),
  },
];

async function main() {
  for (const pedido of PEDIDOS_DEMO) {
    const { data: existing } = await supabase
      .from("pedidos")
      .select("numero")
      .eq("cliente_nome", pedido.cliente_nome)
      .eq("ocasiao", pedido.ocasiao)
      .maybeSingle();

    if (existing) {
      console.log(`- "${pedido.cliente_nome}" (${pedido.ocasiao}) já existe como #${existing.numero}, pulando.`);
      continue;
    }

    const { subtotal, total } = calcularTotais(pedido.itens, pedido.valor_entrega);
    const status_atualizado_em = pedido.status_atualizado_em ?? pedido.criado_em;

    const { data, error } = await supabase
      .from("pedidos")
      .insert({ ...pedido, subtotal, total, status_atualizado_em })
      .select("numero")
      .single();

    if (error) {
      console.error(`- ERRO ao cadastrar "${pedido.cliente_nome}": ${error.message}`);
    } else {
      console.log(`- Pedido #${data.numero} — "${pedido.cliente_nome}" (${pedido.status}) cadastrado.`);
    }
  }

  console.log("\nPronto.");
}

main().catch((err) => {
  console.error("Erro inesperado:", err);
  process.exit(1);
});
