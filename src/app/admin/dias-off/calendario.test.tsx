// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { DiaOff, SegundaReabertura } from "@/lib/dias-off/types";
import { Calendario } from "./calendario";

const createDiaOffMock = vi.fn();
const deleteDiaOffMock = vi.fn();
const updateDiaOffObservacaoMock = vi.fn();
const createReaberturaMock = vi.fn();
const deleteReaberturaMock = vi.fn();
const updateReaberturaObservacaoMock = vi.fn();

vi.mock("./actions", () => ({
  createDiaOff: (...args: unknown[]) => createDiaOffMock(...args),
  deleteDiaOff: (...args: unknown[]) => deleteDiaOffMock(...args),
  updateDiaOffObservacao: (...args: unknown[]) => updateDiaOffObservacaoMock(...args),
  createReabertura: (...args: unknown[]) => createReaberturaMock(...args),
  deleteReabertura: (...args: unknown[]) => deleteReaberturaMock(...args),
  updateReaberturaObservacao: (...args: unknown[]) => updateReaberturaObservacaoMock(...args),
}));

function pad(n: number) {
  return String(n).padStart(2, "0");
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const today = new Date();

// O calendário abre no mês corrente. Para não depender de quanto falta até
// o fim do mês, as datas de teste ficam sempre no PRÓXIMO mês — o teste
// navega até lá clicando em "Próximo mês" primeiro.
const proximoMes = new Date(today.getFullYear(), today.getMonth() + 1, 1);

// Dias 10 e 15 de qualquer mês existem sempre; ajusta pra terça-feira (dia
// comum, não-segunda) achando o primeiro dia >= 10 que não seja segunda.
function primeiraTercaAPartirDe(dia: number) {
  const d = new Date(proximoMes.getFullYear(), proximoMes.getMonth(), dia);
  while (d.getDay() === 1) d.setDate(d.getDate() + 1);
  return d;
}
// E a primeira segunda-feira a partir de um dia, pros testes de segunda.
function primeiraSegundaAPartirDe(dia: number) {
  const d = new Date(proximoMes.getFullYear(), proximoMes.getMonth(), dia);
  while (d.getDay() !== 1) d.setDate(d.getDate() + 1);
  return d;
}

const diaComumMarcado = primeiraTercaAPartirDe(3);
const diaComumLivre = primeiraTercaAPartirDe(10);
const segundaFechadaPadrao = primeiraSegundaAPartirDe(15);
const segundaReaberta = primeiraSegundaAPartirDe(20);

const DIA_OFF: DiaOff = { id: "dia-1", data: toIso(diaComumMarcado), criado_em: null, observacao: null };
const REABERTURA: SegundaReabertura = { id: "reab-1", data: toIso(segundaReaberta), criado_em: null, observacao: null };

function botoesDoDia(dia: number) {
  return screen.getAllByRole("button").filter((b) => b.textContent === String(dia));
}

function irParaProximoMes() {
  fireEvent.click(screen.getByRole("button", { name: /próximo mês/i }));
}

async function confirmar(nomeBotao: RegExp) {
  const dialog = await screen.findByRole("alertdialog");
  fireEvent.click(within(dialog).getByRole("button", { name: nomeBotao }));
}

describe("Calendario de dias off", () => {
  afterEach(() => {
    cleanup();
    createDiaOffMock.mockReset();
    deleteDiaOffMock.mockReset();
    createReaberturaMock.mockReset();
    deleteReaberturaMock.mockReset();
  });

  it("pede confirmação antes de marcar um dia comum como sem produção", async () => {
    createDiaOffMock.mockResolvedValue({ id: "novo-id" });
    render(<Calendario diasOff={[]} reaberturas={[]} />);
    irParaProximoMes();

    fireEvent.click(botoesDoDia(diaComumLivre.getDate())[0]);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/como sem produção\?/i);
    expect(createDiaOffMock).not.toHaveBeenCalled();

    await confirmar(/^marcar$/i);

    await waitFor(() => {
      expect(createDiaOffMock).toHaveBeenCalledWith(toIso(diaComumLivre));
    });
  });

  it("pede confirmação antes de remover um dia comum já marcado", async () => {
    deleteDiaOffMock.mockResolvedValue({});
    render(<Calendario diasOff={[DIA_OFF]} reaberturas={[]} />);
    irParaProximoMes();

    const botoes = botoesDoDia(diaComumMarcado.getDate());
    const marcado = botoes.find((b) => b.getAttribute("aria-pressed") === "true");
    expect(marcado).toBeTruthy();
    fireEvent.click(marcado!);

    await confirmar(/^remover$/i);

    await waitFor(() => {
      expect(deleteDiaOffMock).toHaveBeenCalledWith("dia-1");
    });
  });

  it("uma segunda-feira sem reabertura já aparece marcada como sem produção, sem estar na lista antiga", async () => {
    render(<Calendario diasOff={[]} reaberturas={[]} />);
    irParaProximoMes();

    const botoes = botoesDoDia(segundaFechadaPadrao.getDate());
    const segunda = botoes.find((b) => b.getAttribute("aria-label")?.includes("sem produção (padrão)"));
    expect(segunda).toBeTruthy();
    expect(segunda).toHaveAttribute("aria-pressed", "true");
  });

  it("clicar numa segunda fechada por padrão pergunta se quer reabrir, e chama createReabertura", async () => {
    createReaberturaMock.mockResolvedValue({ id: "reab-novo" });
    render(<Calendario diasOff={[]} reaberturas={[]} />);
    irParaProximoMes();

    const botoes = botoesDoDia(segundaFechadaPadrao.getDate());
    const segunda = botoes.find((b) => b.getAttribute("aria-label")?.includes("sem produção (padrão)"));
    fireEvent.click(segunda!);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/reabrir .* para produção\?/i);

    await confirmar(/^reabrir$/i);

    await waitFor(() => {
      expect(createReaberturaMock).toHaveBeenCalledWith(toIso(segundaFechadaPadrao));
    });
  });

  it("clicar numa segunda já reaberta pergunta se quer fechar de novo, e chama deleteReabertura", async () => {
    deleteReaberturaMock.mockResolvedValue({});
    render(<Calendario diasOff={[]} reaberturas={[REABERTURA]} />);
    irParaProximoMes();

    const botoes = botoesDoDia(segundaReaberta.getDate());
    const segunda = botoes.find((b) => b.getAttribute("aria-label")?.includes("reaberta para produção"));
    expect(segunda).toBeTruthy();
    expect(segunda).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(segunda!);

    const dialog = await screen.findByRole("alertdialog");
    expect(dialog).toHaveTextContent(/fechar .* novamente\?/i);

    await confirmar(/^fechar$/i);

    await waitFor(() => {
      expect(deleteReaberturaMock).toHaveBeenCalledWith("reab-1");
    });
  });

  it("distingue os rótulos na lista de datas marcadas", () => {
    render(<Calendario diasOff={[DIA_OFF]} reaberturas={[REABERTURA]} />);

    expect(screen.getByText("Dia sem produção")).toBeInTheDocument();
    expect(screen.getByText("Segunda-feira reaberta para produção")).toBeInTheDocument();
  });

  it("não deixa clicar num dia no passado", () => {
    render(<Calendario diasOff={[]} reaberturas={[]} />);

    const ontem = new Date(today);
    ontem.setDate(ontem.getDate() - 1);
    if (ontem.getMonth() !== today.getMonth()) return; // vira o mês: pula, sem mockar Date

    const botaoOntem = botoesDoDia(ontem.getDate()).find((b) => b.getAttribute("aria-label")?.includes("indisponível"));
    expect(botaoOntem).toBeTruthy();
    expect(botaoOntem).toBeDisabled();
  });
});
