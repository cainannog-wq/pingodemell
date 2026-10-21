// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useEffect, useState } from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { ResultadoReducao } from "@/lib/galeria/reduzir";
import { GaleriaFotosExtras } from "./galeria-fotos";
import type { FotoNaTela } from "./galeria-envio";

beforeAll(() => {
  URL.createObjectURL = vi.fn(() => `blob:${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => cleanup());

function existentes(n: number): FotoNaTela[] {
  return Array.from({ length: n }, (_, i) => ({
    chave: `f${i + 1}`,
    tipo: "existente" as const,
    id: `id-${i + 1}`,
    url: `https://storage/foto-${i + 1}.webp`,
  }));
}

const reduzirOk = vi.fn(
  async (arquivo: File): Promise<ResultadoReducao> => ({
    ok: true,
    foto: { blob: new Blob([arquivo.name], { type: "image/webp" }), ext: "webp", largura: 2000, altura: 1500 },
  })
);

// Última lista que o componente devolveu ao pai, para conferir a ordem.
const registro: { lista: FotoNaTela[] } = { lista: [] };
function Galeria({ iniciais, temCapa = true }: { iniciais: FotoNaTela[]; temCapa?: boolean }) {
  const [fotos, setFotos] = useState(iniciais);
  useEffect(() => {
    registro.lista = fotos;
  }, [fotos]);
  return <GaleriaFotosExtras fotos={fotos} onChange={setFotos} nomeProduto="Morango Banhado" temCapa={temCapa} reduzir={reduzirOk} />;
}

function urls() {
  return registro.lista.map((f) => (f.tipo === "existente" ? f.url.replace("https://storage/", "") : "nova"));
}

describe("GaleriaFotosExtras — limite de 9", () => {
  it("com 9 fotos, o botão de adicionar fica desabilitado, com a mensagem visível e associada a ele", () => {
    render(<Galeria iniciais={existentes(9)} />);
    const botao = screen.getByRole("button", { name: /adicionar fotos/i });
    expect(botao).toBeDisabled();
    const mensagem = screen.getByText("Limite de 9 fotos extras atingido (10 com a capa). Remova uma foto para adicionar outra.");
    expect(mensagem).toBeVisible();
    expect(botao).toHaveAttribute("aria-describedby", mensagem.id);
    expect(botao).toHaveAccessibleDescription(/Limite de 9 fotos extras atingido/);
  });

  it("escolhendo mais fotos do que cabe, entram só as que cabem, com aviso", async () => {
    render(<Galeria iniciais={existentes(7)} />);
    const input = screen.getByTestId("galeria-input");
    const arquivos = ["a.jpg", "b.jpg", "c.jpg"].map((n) => new File(["x"], n, { type: "image/jpeg" }));
    await act(async () => {
      fireEvent.change(input, { target: { files: arquivos } });
    });
    expect(registro.lista).toHaveLength(9);
    expect(screen.getByRole("alert")).toHaveTextContent("Só cabem mais 2 foto(s) extra(s): 1 não foi adicionada.");
    expect(screen.getByRole("button", { name: /adicionar fotos/i })).toBeDisabled();
  });
});

describe("GaleriaFotosExtras — adicionar uma de cada vez", () => {
  it("cada foto nova entra no fim da lista, sem substituir a anterior", async () => {
    render(<Galeria iniciais={[]} />);
    const input = screen.getByTestId("galeria-input");
    for (const nome of ["a.jpg", "b.jpg", "c.jpg"]) {
      await act(async () => {
        fireEvent.change(input, { target: { files: [new File(["x"], nome, { type: "image/jpeg" })] } });
      });
    }
    expect(registro.lista).toHaveLength(3);
    expect(screen.getAllByText("Ainda não salva")).toHaveLength(3);
    expect(screen.getByText("3 de 9")).toBeInTheDocument();
  });
});

describe("GaleriaFotosExtras — ordem e remoção", () => {
  it("não há setas de subir e descer: cada foto tem a alça de seis pontos, e os rótulos identificam a foto", () => {
    render(<Galeria iniciais={existentes(3)} />);
    expect(screen.queryByRole("button", { name: /para cima|para baixo/ })).toBeNull();
    for (const n of [1, 2, 3]) expect(screen.getByRole("button", { name: new RegExp(`Reordenar foto extra ${n}`) })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Remover foto extra 2" })).toBeEnabled();
  });

  it("com uma foto só a alça fica desligada (nada a ordenar)", () => {
    render(<Galeria iniciais={existentes(1)} />);
    expect(screen.getByRole("button", { name: /Reordenar foto extra 1/ })).toBeDisabled();
  });

  it("mover pelo teclado a última até a primeira: ordem certa, foco acompanha a alça e a mudança é anunciada", () => {
    render(<Galeria iniciais={existentes(3)} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar foto extra 3/ }), { key: "ArrowUp" });
    expect(urls()).toEqual(["foto-1.webp", "foto-3.webp", "foto-2.webp"]);
    expect(screen.getByRole("button", { name: /Reordenar foto extra 2/ })).toHaveFocus();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto extra 3 movida para a posição 2 de 3.");

    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar foto extra 2/ }), { key: "ArrowUp" });
    expect(urls()).toEqual(["foto-3.webp", "foto-1.webp", "foto-2.webp"]);
    expect(screen.getByRole("button", { name: /Reordenar foto extra 1/ })).toHaveFocus();
    expect(screen.getAllByRole("status")[0]).toHaveTextContent("Foto extra 2 movida para a posição 1 de 3.");
  });

  it("Home e End levam a foto ao começo e ao fim; na ponta, a seta não faz nada", () => {
    render(<Galeria iniciais={existentes(3)} />);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar foto extra 1/ }), { key: "ArrowUp" });
    expect(urls()).toEqual(["foto-1.webp", "foto-2.webp", "foto-3.webp"]);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar foto extra 1/ }), { key: "End" });
    expect(urls()).toEqual(["foto-2.webp", "foto-3.webp", "foto-1.webp"]);
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar foto extra 3/ }), { key: "Home" });
    expect(urls()).toEqual(["foto-1.webp", "foto-2.webp", "foto-3.webp"]);
  });

  it("arrastar a alça da primeira sobre a terceira (ponteiro) deixa a primeira no fim", () => {
    const { container } = render(<Galeria iniciais={existentes(3)} />);
    const itens = Array.from(container.querySelectorAll<HTMLElement>("[data-ordenar-id]"));
    // jsdom não tem layout: cada item ocupa uma faixa de 100 px na vertical.
    itens.forEach((el, i) => {
      el.getBoundingClientRect = () => ({ left: 0, right: 300, top: i * 100, bottom: i * 100 + 90, width: 300, height: 90, x: 0, y: i * 100, toJSON: () => ({}) });
    });
    const alca = screen.getByRole("button", { name: /Reordenar foto extra 1/ });
    fireEvent.pointerDown(alca, { pointerId: 1, button: 0, clientX: 10, clientY: 10 });
    fireEvent.pointerMove(alca, { pointerId: 1, clientX: 10, clientY: 250 });
    fireEvent.pointerUp(alca, { pointerId: 1, clientX: 10, clientY: 250 });
    expect(urls()).toEqual(["foto-2.webp", "foto-3.webp", "foto-1.webp"]);
  });

  it("soltar no mesmo lugar, ou cancelar, não muda a ordem", () => {
    const { container } = render(<Galeria iniciais={existentes(3)} />);
    Array.from(container.querySelectorAll<HTMLElement>("[data-ordenar-id]")).forEach((el, i) => {
      el.getBoundingClientRect = () => ({ left: 0, right: 300, top: i * 100, bottom: i * 100 + 90, width: 300, height: 90, x: 0, y: i * 100, toJSON: () => ({}) });
    });
    const alca = screen.getByRole("button", { name: /Reordenar foto extra 2/ });
    fireEvent.pointerDown(alca, { pointerId: 1, button: 0, clientX: 10, clientY: 110 });
    fireEvent.pointerUp(alca, { pointerId: 1, clientX: 10, clientY: 120 });
    expect(urls()).toEqual(["foto-1.webp", "foto-2.webp", "foto-3.webp"]);
    fireEvent.pointerDown(alca, { pointerId: 1, button: 0, clientX: 10, clientY: 110 });
    fireEvent.pointerCancel(alca, { pointerId: 1 });
    expect(urls()).toEqual(["foto-1.webp", "foto-2.webp", "foto-3.webp"]);
  });

  it("remover tira a foto da lista (só na tela), anuncia e leva o foco para a vizinha", () => {
    render(<Galeria iniciais={existentes(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover foto extra 2" }));
    expect(urls()).toEqual(["foto-1.webp", "foto-3.webp"]);
    expect(screen.getByRole("status")).toHaveTextContent("Foto extra 2 removida. Restam 2 fotos extras; a remoção só vale depois de Salvar.");
    expect(screen.getByRole("button", { name: "Remover foto extra 2" })).toHaveFocus();
  });

  it("nenhuma caixa de diálogo nativa do navegador", () => {
    const alerta = vi.spyOn(window, "alert").mockImplementation(() => undefined);
    const confirma = vi.spyOn(window, "confirm").mockImplementation(() => true);
    render(<Galeria iniciais={existentes(3)} />);
    fireEvent.click(screen.getByRole("button", { name: "Remover foto extra 1" }));
    fireEvent.keyDown(screen.getByRole("button", { name: /Reordenar foto extra 2/ }), { key: "ArrowUp" });
    expect(alerta).not.toHaveBeenCalled();
    expect(confirma).not.toHaveBeenCalled();
  });
});

describe("GaleriaFotosExtras — texto alternativo e dica sem capa", () => {
  it("texto alternativo conta a capa como foto 1", () => {
    render(<Galeria iniciais={existentes(2)} />);
    expect(screen.getByAltText("Morango Banhado, foto 2 de 3")).toBeInTheDocument();
    expect(screen.getByAltText("Morango Banhado, foto 3 de 3")).toBeInTheDocument();
    expect(screen.queryByText(/Sem foto de capa/)).not.toBeInTheDocument();
  });

  it("sem capa: primeira extra é a foto 1, e a dica aparece", () => {
    render(<Galeria iniciais={existentes(2)} temCapa={false} />);
    expect(screen.getByAltText("Morango Banhado, foto 1 de 2")).toBeInTheDocument();
    expect(screen.getByText("Sem foto de capa: no site, o card deste produto aparece sem foto.")).toBeVisible();
  });
});
