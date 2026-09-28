import { escreverCarrinho, lerCarrinho, type LinhaCarrinho } from "./regras";

// Onde o carrinho mora: localStorage do navegador, chave pdm-carrinho-v1.
// Sobrevive a recarregar e a fechar a aba, e fica igual entre abas abertas
// (evento "storage"). Nada vai para o banco nem para cookie. Só o carrinho
// (produto, quantidade, sabores, observação do item), sem dado pessoal.
//
// Loja externa para o useSyncExternalStore do CarrinhoProvider:
// - no servidor (e no primeiro render do navegador, antes de hidratar) o
//   carrinho é vazio (lerNoServidor), então o HTML bate com o do servidor e
//   o contador aparece logo depois;
// - lerNoNavegador devolve sempre o mesmo array enquanto o texto salvo não
//   muda (o React exige isso para não renderizar em loop).
// Se o navegador bloquear o localStorage (janela anônima de alguns
// navegadores, armazenamento cheio), o carrinho continua funcionando só na
// memória da aba.

export const CHAVE_CARRINHO = "pdm-carrinho-v1";

const VAZIO: LinhaCarrinho[] = [];
const ouvintes = new Set<() => void>();
// Cópia na memória da aba, usada só depois que o localStorage falhar.
let naMemoria: string | null = null;
let soNaMemoria = false;
let textoEmCache: string | null | undefined;
let linhasEmCache: LinhaCarrinho[] = VAZIO;

function lerTexto(): string | null {
  if (soNaMemoria) return naMemoria;
  try {
    return window.localStorage.getItem(CHAVE_CARRINHO);
  } catch {
    soNaMemoria = true;
    return naMemoria;
  }
}

export function lerNoNavegador(): LinhaCarrinho[] {
  const texto = lerTexto();
  if (texto !== textoEmCache) {
    textoEmCache = texto;
    linhasEmCache = lerCarrinho(texto);
  }
  return linhasEmCache;
}

export function lerNoServidor(): LinhaCarrinho[] {
  return VAZIO;
}

export function assinar(aoMudar: () => void): () => void {
  ouvintes.add(aoMudar);
  const aoMudarEmOutraAba = (e: StorageEvent) => {
    if (e.key === CHAVE_CARRINHO || e.key === null) aoMudar();
  };
  window.addEventListener("storage", aoMudarEmOutraAba);
  return () => {
    ouvintes.delete(aoMudar);
    window.removeEventListener("storage", aoMudarEmOutraAba);
  };
}

export function gravar(linhas: LinhaCarrinho[]): void {
  const texto = escreverCarrinho(linhas);
  naMemoria = texto;
  if (!soNaMemoria) {
    try {
      window.localStorage.setItem(CHAVE_CARRINHO, texto);
    } catch {
      soNaMemoria = true;
    }
  }
  for (const ouvinte of ouvintes) ouvinte();
}

// Só para testes: volta ao estado de página recém-aberta.
export function reiniciarParaTeste(): void {
  naMemoria = null;
  soNaMemoria = false;
  textoEmCache = undefined;
  linhasEmCache = VAZIO;
  ouvintes.clear();
}
