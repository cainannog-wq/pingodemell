import { carimbarCarrinho, escreverCarrinho, lerCarrinhoGuardado, type LinhaCarrinho } from "./regras";

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

// Grava o texto sem avisar os ouvintes (usado só pela própria leitura:
// carimbar a data ou apagar o vencido não muda as linhas que a tela já vê).
function guardarTexto(texto: string | null): void {
  naMemoria = texto;
  if (soNaMemoria) return;
  try {
    if (texto === null) window.localStorage.removeItem(CHAVE_CARRINHO);
    else window.localStorage.setItem(CHAVE_CARRINHO, texto);
  } catch {
    soNaMemoria = true;
  }
}

// Validade (regras.ts, VALIDADE_CARRINHO_HORAS): carrinho vencido é
// descartado em silêncio (apagado, a tela vê vazio); carrinho sem data
// recebe a data desta leitura. O texto em cache passa a ser o guardado, para
// a leitura seguinte devolver o mesmo array (exigência do React).
export function lerNoNavegador(): LinhaCarrinho[] {
  const texto = lerTexto();
  if (texto !== textoEmCache) {
    const agora = Date.now();
    const lido = lerCarrinhoGuardado(texto, agora);
    let guardado = texto;
    if (lido.vencido) {
      guardado = null;
      guardarTexto(null);
    } else if (lido.semData && texto !== null && lido.linhas.length > 0) {
      guardado = carimbarCarrinho(texto, agora);
      guardarTexto(guardado);
    }
    textoEmCache = guardado;
    linhasEmCache = lido.linhas.length === 0 ? VAZIO : lido.linhas;
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
