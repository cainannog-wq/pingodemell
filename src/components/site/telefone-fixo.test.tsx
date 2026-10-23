// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LOJA } from "@/lib/site/config";
import { SiteFooter } from "./SiteFooter";

afterEach(cleanup);

describe("telefone fixo no rodapé", () => {
  it("aparece ao lado do WhatsApp, como link tel:, com o endereço novo", () => {
    render(<SiteFooter />);
    const fixo = screen.getByRole("link", { name: "(41) 3627-5234" });
    expect(fixo).toHaveAttribute("href", "tel:+554136275234");
    expect(document.querySelector("footer")).toHaveTextContent(LOJA.telefone);
    expect(document.querySelector("footer")).toHaveTextContent("Av. Mato Grosso, 1831 - Estados, Fazenda Rio Grande - PR, 83830-481");
  });
});
