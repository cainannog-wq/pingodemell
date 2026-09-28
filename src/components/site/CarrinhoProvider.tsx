"use client";

import { createContext, useCallback, useContext, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { assinar, gravar, lerNoNavegador, lerNoServidor } from "@/lib/carrinho/armazenamento";
import {
  adicionarLinha,
  alterarLinha,
  contarItens,
  removerLinha,
  type LinhaCarrinho,
  type NovaLinha,
} from "@/lib/carrinho/regras";

// Estado do carrinho para o site público inteiro (montado no SiteChrome).
// Mora no localStorage (src/lib/carrinho/armazenamento.ts); as regras de
// juntar, alterar e validar ficam em src/lib/carrinho/regras.ts. A página
// do carrinho usa este mesmo contexto.

type Carrinho = {
  linhas: LinhaCarrinho[];
  // Número de itens diferentes (contador do cabeçalho).
  totalItens: number;
  adicionar: (nova: NovaLinha) => void;
  alterar: (id: string, linha: LinhaCarrinho) => void;
  remover: (id: string) => void;
  limpar: () => void;
};

const CarrinhoContext = createContext<Carrinho | null>(null);

function novoId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `l-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function CarrinhoProvider({ children }: { children: ReactNode }) {
  const linhas = useSyncExternalStore(assinar, lerNoNavegador, lerNoServidor);

  // Cada ação lê o estado salvo na hora (não o do último render), para duas
  // ações seguidas não se atropelarem.
  const adicionar = useCallback((nova: NovaLinha) => gravar(adicionarLinha(lerNoNavegador(), nova, novoId)), []);
  const alterar = useCallback((id: string, linha: LinhaCarrinho) => gravar(alterarLinha(lerNoNavegador(), id, linha)), []);
  const remover = useCallback((id: string) => gravar(removerLinha(lerNoNavegador(), id)), []);
  const limpar = useCallback(() => gravar([]), []);

  const valor = useMemo(
    () => ({ linhas, totalItens: contarItens(linhas), adicionar, alterar, remover, limpar }),
    [linhas, adicionar, alterar, remover, limpar]
  );

  return <CarrinhoContext.Provider value={valor}>{children}</CarrinhoContext.Provider>;
}

export function useCarrinho(): Carrinho {
  const carrinho = useContext(CarrinhoContext);
  if (!carrinho) throw new Error("useCarrinho precisa estar dentro do CarrinhoProvider (SiteChrome).");
  return carrinho;
}
