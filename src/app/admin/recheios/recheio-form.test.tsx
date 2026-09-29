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
  it("preço e grupo só aparecem com 'Bolo grande' marcado", () => {
    render(<RecheioForm action={acao} rotuloEnviar="Cadastrar recheio" />);
    expect(preco()).toBeNull();
    expect(grupo()).toBeNull();
    fireEvent.click(screen.getByLabelText(/Bolo grande/));
    expect(preco()).toBeRequired();
    expect(grupo()).toBeRequired();
    fireEvent.click(screen.getByLabelText(/Bolo grande/));
    expect(preco()).toBeNull();
  });

  it("só Bento Cake: nenhum preço nem grupo no envio", () => {
    render(<RecheioForm action={acao} rotuloEnviar="Cadastrar recheio" />);
    fireEvent.click(screen.getByLabelText(/Bento Cake/));
    const dados = enviado();
    expect(dados.get("vale_bento")).toBe("on");
    expect(dados.has("preco_kg")).toBe(false);
    expect(dados.has("grupo")).toBe(false);
  });

  it("edição de recheio que vale nos dois: abre com preço, grupo e os dois marcados; novo recheio nasce ativo", () => {
    const r: Recheio = {
      id: "1", nome: "Chocolate", vale_bolo: true, vale_bento: true, preco_kg: 60, grupo: "chocolate_outros",
      ativo: true, criado_em: "", atualizado_em: "",
    };
    render(<RecheioForm action={acao} recheio={r} rotuloEnviar="Salvar alterações" />);
    expect(screen.getByLabelText(/Bolo grande/)).toBeChecked();
    expect(screen.getByLabelText(/Bento Cake/)).toBeChecked();
    expect((grupo() as HTMLSelectElement).value).toBe("chocolate_outros");
    cleanup();
    render(<RecheioForm action={acao} rotuloEnviar="Cadastrar recheio" />);
    expect(screen.getByLabelText(/Recheio ativo/)).toBeChecked();
  });
});

describe("Lista de recheios", () => {
  const base = { criado_em: "", atualizado_em: "" };
  const recheios: Recheio[] = [
    { ...base, id: "1", nome: "Brigadeiro", vale_bolo: true, vale_bento: true, preco_kg: 80, grupo: "chocolate_outros", ativo: true },
    { ...base, id: "2", nome: "Ninho", vale_bolo: false, vale_bento: true, preco_kg: null, grupo: null, ativo: false },
  ];

  it("mostra onde vale, preço e grupo (só do Bolo) e o status; sem botão de excluir", () => {
    render(<RecheiosLista recheios={recheios} />);
    expect(screen.getByText("R$ 80,00")).toBeInTheDocument();
    expect(screen.getByText("Recheio com chocolate e outros")).toBeInTheDocument();
    expect(screen.getAllByText("Bento Cake")).toHaveLength(2);
    expect(screen.getAllByText("Bolo grande")).toHaveLength(1);
    expect(screen.getByLabelText("Recheio Brigadeiro ativo")).toBeChecked();
    expect(screen.getByLabelText("Recheio Ninho ativo")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /excluir|apagar|remover/i })).toBeNull();
  });
});
