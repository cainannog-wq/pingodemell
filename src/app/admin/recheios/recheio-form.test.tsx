// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recheio } from "@/lib/recheios/types";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("./actions", () => ({ updateRecheioAtivo: vi.fn(async () => ({})) }));

const { RecheioForm } = await import("./recheio-form");
const { RecheiosLista } = await import("./recheios-lista");
const acao = vi.fn(async () => ({}));

afterEach(cleanup);

const preco = () => screen.queryByLabelText(/Preço por kg/);
const grupo = () => screen.queryByLabelText(/^Grupo/);
const enviado = () => new FormData(document.querySelector("form") as HTMLFormElement);

describe("Formulário de recheio", () => {
  it("sem marcação de onde vale: preço e grupo sempre aparecem e são obrigatórios; vale_bento nunca vai no envio", () => {
    render(<RecheioForm action={acao} rotuloEnviar="Cadastrar recheio" />);
    expect(screen.queryByLabelText(/Bento Cake/)).toBeNull();
    expect(screen.queryByLabelText(/Bolo grande/)).toBeNull();
    expect(preco()).toBeRequired();
    expect(grupo()).toBeRequired();
    expect(enviado().has("vale_bento")).toBe(false);
  });

  it("edição de recheio que valia nos dois: abre com preço e grupo, sem a marcação de Bento; novo recheio nasce ativo", () => {
    const r: Recheio = {
      id: "1", nome: "Chocolate", vale_bolo: true, vale_bento: true, preco_kg: 60, grupo: "chocolate_outros",
      ativo: true, criado_em: "", atualizado_em: "",
    };
    render(<RecheioForm action={acao} recheio={r} rotuloEnviar="Salvar alterações" />);
    expect(screen.queryByLabelText(/Bento Cake/)).toBeNull();
    expect((grupo() as HTMLSelectElement).value).toBe("chocolate_outros");
    cleanup();
    render(<RecheioForm action={acao} rotuloEnviar="Cadastrar recheio" />);
    expect(screen.getByLabelText(/Recheio ativo/)).toBeChecked();
  });
});

describe("Formulário de recheio — erro do servidor", () => {
  it("mostra o erro e mantém o que foi digitado (não limpa o formulário)", async () => {
    const recusa = vi.fn(async () => ({ error: "Já existe um recheio com esse nome." }));
    render(<RecheioForm action={recusa} rotuloEnviar="Cadastrar recheio" />);
    fireEvent.change(screen.getByLabelText(/Nome do recheio/), { target: { value: "Ninho" } });
    fireEvent.submit(document.querySelector("form") as HTMLFormElement);
    expect(await screen.findByText("Já existe um recheio com esse nome.")).toBeInTheDocument();
    expect(recusa).toHaveBeenCalledTimes(1);
    expect((screen.getByLabelText(/Nome do recheio/) as HTMLInputElement).value).toBe("Ninho");
  });
});

describe("Lista de recheios", () => {
  const base = { criado_em: "", atualizado_em: "" };
  const recheios: Recheio[] = [
    { ...base, id: "1", nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros", ativo: true },
    { ...base, id: "2", nome: "Ninho", vale_bolo: false, vale_bento: true, preco_kg: null, grupo: null, ativo: false },
  ];

  it("mostra preço e grupo (só do Bolo), marca o que não tem uso e o status; sem botão de excluir", () => {
    render(<RecheiosLista recheios={recheios} />);
    expect(screen.getByText("R$ 80,00")).toBeInTheDocument();
    expect(screen.getByText("Recheio com chocolate e outros")).toBeInTheDocument();
    expect(screen.queryByText("Bento Cake")).toBeNull();
    expect(screen.getAllByText("Bolo grande")).toHaveLength(1);
    expect(screen.getAllByText("Sem uso")).toHaveLength(1);
    expect(screen.getByLabelText("Recheio Brigadeiro ativo")).toBeChecked();
    expect(screen.getByLabelText("Recheio Ninho ativo")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /excluir|apagar|remover/i })).toBeNull();
  });
});
