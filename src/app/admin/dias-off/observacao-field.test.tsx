// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ObservacaoField } from "./observacao-field";

describe("ObservacaoField", () => {
  afterEach(() => cleanup());

  it("salva no blur quando o valor muda, e anuncia sucesso via role=status", async () => {
    const onSave = vi.fn().mockResolvedValue({});
    render(<ObservacaoField value="" ariaLabel="Observação para teste" onSave={onSave} />);

    const input = screen.getByRole("textbox", { name: /observação para teste/i });
    fireEvent.change(input, { target: { value: "manutenção do forno" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledWith("manutenção do forno");
    });
    await waitFor(() => {
      expect(screen.getByRole("status")).toHaveTextContent("Observação salva");
    });
  });

  it("não chama onSave se o valor não mudou", () => {
    const onSave = vi.fn();
    render(<ObservacaoField value="viagem" ariaLabel="Observação para teste" onSave={onSave} />);

    const input = screen.getByRole("textbox", { name: /observação para teste/i });
    fireEvent.blur(input);

    expect(onSave).not.toHaveBeenCalled();
  });

  it("anuncia erro via role=alert quando o Supabase falha", async () => {
    const onSave = vi.fn().mockResolvedValue({ error: "falha de rede" });
    render(<ObservacaoField value="" ariaLabel="Observação para teste" onSave={onSave} />);

    const input = screen.getByRole("textbox", { name: /observação para teste/i });
    fireEvent.change(input, { target: { value: "nova observação" } });
    fireEvent.blur(input);

    await waitFor(() => {
      expect(screen.getByRole("alert")).toHaveTextContent("Erro ao salvar observação");
    });
  });
});
