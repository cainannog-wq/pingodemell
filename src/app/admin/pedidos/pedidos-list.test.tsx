// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { Pedido } from "@/lib/pedidos/types";
import { PedidosList } from "./pedidos-list";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

vi.mock("./export-csv", () => ({
  exportarPedidosCSV: vi.fn(),
}));

// Relógio fixo no horário crítico: domingo 27/09/2026 às 22h de Brasília,
// quando em UTC já é segunda 28/09 às 01h. Antes do PR fuso-brasilia, as
// datas vinham do relógio real e o teste falhava entre 21h e meia-noite.
const AGORA = new Date("2026-09-28T01:00:00Z");
const HOJE_BRASILIA = { ano: 2026, mes: 9, dia: 27 };

beforeAll(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AGORA);
});

afterAll(() => {
  vi.useRealTimers();
});

// Data de calendário de Brasília relativa ao "hoje" fixo, na hora pedida.
function bz(diasOffset: number, hora = 12): string {
  const base = new Date(Date.UTC(HOJE_BRASILIA.ano, HOJE_BRASILIA.mes - 1, HOJE_BRASILIA.dia + diasOffset));
  const y = base.getUTCFullYear();
  const m = String(base.getUTCMonth() + 1).padStart(2, "0");
  const d = String(base.getUTCDate()).padStart(2, "0");
  const hh = String(hora).padStart(2, "0");
  return `${y}-${m}-${d}T${hh}:00:00-03:00`;
}

// Deslocamento em horas a partir do instante fixo (domingo 22h).
function bzHoras(horasDeAgora: number): string {
  return new Date(AGORA.getTime() + horasDeAgora * 3_600_000).toISOString();
}

let contador = 0;
function pedido(overrides: Partial<Pedido>): Pedido {
  contador += 1;
  return {
    id: `id-${contador}`,
    numero: contador,
    cliente_nome: `Cliente ${contador}`,
    cliente_whatsapp: "(41) 90000-0000",
    cliente_email: null,
    ocasiao: null,
    modo_entrega: "entrega",
    endereco: null,
    data_hora_entrega: bz(0),
    forma_pagamento: "PIX",
    observacoes: null,
    itens: [{ nome: "Bolo", variacao: null, quantidade: 1, preco_unitario: 50 }],
    subtotal: 50,
    valor_entrega: 0,
    total: 50,
    status: "aguardando_confirmacao",
    criado_em: bz(-1),
    status_atualizado_em: bz(-1),
    ...overrides,
  };
}

const STATS = { pedidosNoMes: 0, aguardandoConfirmacao: 0, entregues: 0, valorNoMes: 0 };

// Reorganização da listagem de pedidos pro mobile (22/09/2026): pedidos em
// aberto vêm primeiro (atrasados no topo, depois agrupados por dia de
// entrega mais próximo), finalizados ficam num bloco à parte, do mais
// recente pro mais antigo, com corte de 7 dias na visualização padrão.
describe("PedidosList — agrupamento mobile", () => {
  afterEach(() => cleanup());

  it("ordena atrasados primeiro, depois por dia (Hoje/Amanhã), e finalizados por último", () => {
    const pedidos = [
      pedido({ cliente_nome: "Cliente Amanhã", status: "em_producao", data_hora_entrega: bz(1, 10) }),
      pedido({ cliente_nome: "Cliente Finalizado Recente", status: "entregue", data_hora_entrega: bz(-2, 9) }),
      pedido({ cliente_nome: "Cliente Atrasado", status: "em_producao", data_hora_entrega: bzHoras(-20) }),
      // Domingo 23h30 de Brasília: ainda é hoje, embora em UTC já seja segunda.
      pedido({ cliente_nome: "Cliente Hoje", status: "aguardando_confirmacao", data_hora_entrega: bzHoras(1.5) }),
    ];

    const { container } = render(<PedidosList pedidos={pedidos} stats={STATS} />);
    const mobile = container.querySelector(".pedidos-mobile-cards") as HTMLElement;
    expect(mobile).toBeTruthy();
    const texto = mobile.textContent ?? "";

    const idxAtrasados = texto.indexOf("Atrasados");
    const idxClienteAtrasado = texto.indexOf("Cliente Atrasado");
    const idxHoje = texto.indexOf("Hoje");
    const idxClienteHoje = texto.indexOf("Cliente Hoje");
    const idxAmanha = texto.indexOf("Amanhã");
    const idxClienteAmanha = texto.indexOf("Cliente Amanhã");
    const idxFinalizados = texto.indexOf("Finalizados");
    const idxClienteFinalizado = texto.indexOf("Cliente Finalizado Recente");

    for (const idx of [idxAtrasados, idxClienteAtrasado, idxHoje, idxClienteHoje, idxAmanha, idxClienteAmanha, idxFinalizados, idxClienteFinalizado]) {
      expect(idx).toBeGreaterThan(-1);
    }
    expect(idxAtrasados).toBeLessThan(idxClienteAtrasado);
    expect(idxClienteAtrasado).toBeLessThan(idxHoje);
    expect(idxHoje).toBeLessThan(idxClienteHoje);
    expect(idxClienteHoje).toBeLessThan(idxAmanha);
    expect(idxAmanha).toBeLessThan(idxClienteAmanha);
    expect(idxClienteAmanha).toBeLessThan(idxFinalizados);
    expect(idxFinalizados).toBeLessThan(idxClienteFinalizado);
  });

  it("esconde finalizado com mais de 7 dias por padrão, mas mostra com busca ativa (todo o histórico)", () => {
    const pedidos = [
      pedido({ cliente_nome: "Cliente Recente Entregue", status: "entregue", data_hora_entrega: bz(-2, 9) }),
      pedido({ cliente_nome: "Cliente Antigo Cancelado", status: "cancelado", data_hora_entrega: bz(-10, 9) }),
    ];

    render(<PedidosList pedidos={pedidos} stats={STATS} />);
    const mobile = document.querySelector(".pedidos-mobile-cards") as HTMLElement;

    expect(within(mobile).queryByText("Cliente Antigo Cancelado")).not.toBeInTheDocument();
    expect(within(mobile).getByText("Cliente Recente Entregue")).toBeInTheDocument();

    const busca = screen.getByPlaceholderText("Buscar por cliente ou nº do pedido");
    fireEvent.change(busca, { target: { value: "Antigo" } });

    expect(within(mobile).getByText("Cliente Antigo Cancelado")).toBeInTheDocument();
  });

  it('mostra "Ver finalizados mais antigos" e revela o pedido oculto ao clicar', () => {
    const pedidos = [
      pedido({ cliente_nome: "Cliente Recente Entregue", status: "entregue", data_hora_entrega: bz(-2, 9) }),
      pedido({ cliente_nome: "Cliente Antigo Cancelado", status: "cancelado", data_hora_entrega: bz(-10, 9) }),
    ];

    render(<PedidosList pedidos={pedidos} stats={STATS} />);
    const mobile = document.querySelector(".pedidos-mobile-cards") as HTMLElement;

    const botao = within(mobile).getByText("Ver finalizados mais antigos");
    fireEvent.click(botao);

    expect(within(mobile).getByText("Cliente Antigo Cancelado")).toBeInTheDocument();
  });
});
