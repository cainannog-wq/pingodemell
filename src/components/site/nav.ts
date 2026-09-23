import { ROTAS } from "@/lib/site/rotas";

export type ItemNav = { rotulo: string; href: string; ativo: (pathname: string) => boolean };

// Navegação principal (cabeçalho desktop e menu mobile). Sobre nós e
// Contato caem na 404 até a página Quem Somos existir — esperado.
export const NAV_PRINCIPAL: ItemNav[] = [
  { rotulo: "Home", href: ROTAS.home, ativo: (p) => p === "/" },
  { rotulo: "Produtos", href: ROTAS.lista, ativo: (p) => p === "/produtos" || p.startsWith("/produtos/") },
  { rotulo: "Sobre nós", href: ROTAS.quemSomos, ativo: (p) => p === ROTAS.quemSomos },
  // Contato é âncora dentro de Quem Somos: nunca marcado como página atual.
  { rotulo: "Contato", href: ROTAS.contato, ativo: () => false },
];
