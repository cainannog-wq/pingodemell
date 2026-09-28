import type { Metadata } from "next";
import { PaginaNaoEncontrada } from "@/components/site/PaginaNaoEncontrada";
import { SiteChrome } from "@/components/site/SiteChrome";

// 404 própria do site: todo endereço inexistente cai aqui (inclusive as
// páginas que ainda vão ser construídas, como /quem-somos), com o
// cabeçalho e o rodapé do site público. O notFound() das páginas do site
// (produto inativo na interna) cai em app/(site)/not-found.tsx.
export const metadata: Metadata = {
  title: "Página não encontrada · Pingo de Mell",
};

export default function NotFound() {
  return (
    <SiteChrome>
      <PaginaNaoEncontrada />
    </SiteChrome>
  );
}
