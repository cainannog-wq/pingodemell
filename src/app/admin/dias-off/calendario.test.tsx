// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiaOff } from "@/lib/dias-off/types";
import { Calendario } from "./calendario";

const createDiaOffMock = vi.fn();
const deleteDiaOffMock = vi.fn();

vi.mock("./actions", () => ({
  createDiaOff: (...args: unknown[]) => createDiaOffMock(...args),
  deleteDiaOff: (...args: unknown[]) => deleteDiaOffMock(...args),
}));

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const today = new Date();

// O calendário abre no mês corrente. Para não depender de quantos dias
// faltam até o fim do mês (o teste rodando no dia 30, por exemplo), as
// datas de teste ficam sempre no PRÓXIMO mês (dias 10 e 15, que existem em
// qualquer mês) — o teste navega até lá clicando em "Próximo mês" primeiro.
const proximoMes = new Date(today.getFullYear(), today.getMonth() + 1, 1);
const futuraMarcada = new Date(proximoMes.getFullYear(), proximoMes.getMonth(), 10);
const futuraMarcadaIso = toIso(futuraMarcada);
const futuraLivre = new Date(proximoMes.getFullYear(), proximoMes.getMonth(), 15);
const futuraLivreIso = toIso(futuraLivre);

const DIA_OFF: DiaOff = { id: "dia-1", data: futuraMarcadaIso, criado_em: null };

// Botões de dia usam aria-label longo (ex.: "quinta-feira, 5 de outubro de
// 2026"), então a busca é pelo texto visível do número dentro do grid.
function botoesDoDia(dia: number) {
  return screen.getAllByRole("button").filter((b) => b.textContent === String(dia));
}

function irParaProximoMes() {
  fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
}

describe("Calendario de dias off", () => {
  afterEach(() => {
    cleanup();
    createDiaOffMock.mockReset();
    deleteDiaOffMock.mockReset();
  });

  it("marca uma data futura ao clicar, chamando createDiaOff", async () => {
    createDiaOffMock.mockResolvedValue({ id: "novo-id" });
    render(<Calendario diasOff={[]} />);
    irParaProximoMes();

    const botoes = botoesDoDia(futuraLivre.getDate());
    expect(botoes.length).toBeGreaterThan(0);

    fireEvent.click(botoes[0]);

    await waitFor(() => {
      expect(createDiaOffMock).toHaveBeenCalledWith(futuraLivreIso);
    });
  });

  it("abre confirmação e chama deleteDiaOff ao remover uma data já marcada", async () => {
    deleteDiaOffMock.mockResolvedValue({});
    render(<Calendario diasOff={[DIA_OFF]} />);
    irParaProximoMes();

    const botoes = botoesDoDia(futuraMarcada.getDate());
    const marcado = botoes.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(marcado).toBeTruthy();

    fireEvent.click(marcado!);

    const dialog = await screen.findByRole("alertdialog");
    const confirmar = within(dialog).getByRole("button", { name: /^remover$/i });
    fireEvent.click(confirmar);

    await waitFor(() => {
      expect(deleteDiaOffMock).toHaveBeenCalledWith("dia-1");
    });
  });

  it("não deixa clicar num dia no passado", () => {
    render(<Calendario diasOff={[]} />);

    const ontem = new Date(today);
    ontem.setDate(ontem.getDate() - 1);
    if (ontem.getMonth() !== today.getMonth()) return; // vira o mês: pula, sem mockar Date

    const botaoOntem = botoesDoDia(ontem.getDate()).find((b) => b.getAttribute("aria-label")?.includes("indisponível"));
    expect(botaoOntem).toBeTruthy();
    expect(botaoOntem).toBeDisabled();
  });
});
