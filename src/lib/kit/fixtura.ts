import { montarConfigKit, type KitConfig, type LinhasDoKit } from "./config";

// Kit fictício para os testes (nenhum dado real). Três grupos: recheio do bolo
// (escolha única), doces (distribuição, passo 10, até 3 sabores) e bebida
// (escolha única com quantidade por opção), mais os descartáveis (fixo).

export const PRODUTO = "11111111-1111-4111-8111-111111111111";
export const GRUPO_BOLO = "aaaaaaaa-0000-4000-8000-000000000001";
export const GRUPO_DOCES = "aaaaaaaa-0000-4000-8000-000000000002";
export const GRUPO_BEBIDA = "aaaaaaaa-0000-4000-8000-000000000003";
export const GRUPO_DESC = "aaaaaaaa-0000-4000-8000-000000000004";
export const LISTA_RECHEIOS = "bbbbbbbb-0000-4000-8000-000000000001";
export const LISTA_DOCES = "bbbbbbbb-0000-4000-8000-000000000002";
export const LISTA_BEBIDAS = "bbbbbbbb-0000-4000-8000-000000000003";
export const NINHO = "cccccccc-0000-4000-8000-000000000001";
export const CHOCOLATE = "cccccccc-0000-4000-8000-000000000002";
export const BRIGADEIRO = "cccccccc-0000-4000-8000-000000000003";
export const BEIJINHO = "cccccccc-0000-4000-8000-000000000004";
export const CAJUZINHO = "cccccccc-0000-4000-8000-000000000005";
export const OLHO = "cccccccc-0000-4000-8000-000000000006";
export const SUCO = "cccccccc-0000-4000-8000-000000000007";
export const REFRI = "cccccccc-0000-4000-8000-000000000008";

export const TAMANHOS_DO_EXEMPLO = [10, 15, 20, 30, 40, 50];

export function linhasDoExemplo(tamanhos: number[] = TAMANHOS_DO_EXEMPLO): LinhasDoKit {
  const q = (pessoas: number, grupo: string, total: number, extra: Partial<LinhasDoKit["quantidades"][number]> = {}) => ({
    pessoas,
    grupo_id: grupo,
    opcao_id: null,
    total,
    max_sabores: null,
    rotulo: null,
    ...extra,
  });
  return {
    tamanhos: tamanhos.map((p) => ({ pessoas: p, bolo_kg: Math.max(1, Math.round((p / 15) * 2) / 2), descartaveis: p >= 20 })),
    grupos: [
      { id: GRUPO_BOLO, chave: "bolo", rotulo: "Recheio do bolo", modo: "escolha_unica", lista_id: LISTA_RECHEIOS, passo: null, posicao: 1 },
      { id: GRUPO_DOCES, chave: "doces", rotulo: "Doces", modo: "distribuicao", lista_id: LISTA_DOCES, passo: 10, posicao: 2 },
      { id: GRUPO_BEBIDA, chave: "bebida", rotulo: "Bebida", modo: "escolha_unica", lista_id: LISTA_BEBIDAS, passo: null, posicao: 3 },
      { id: GRUPO_DESC, chave: "descartaveis", rotulo: "Descartáveis", modo: "fixo", lista_id: null, passo: null, posicao: 4 },
    ],
    itens: [
      { id: NINHO, lista_id: LISTA_RECHEIOS, nome: "Ninho com morango", descricao: null, posicao: 1, ativo: true },
      { id: CHOCOLATE, lista_id: LISTA_RECHEIOS, nome: "Chocolate", descricao: "acréscimo a combinar no WhatsApp", posicao: 2, ativo: true },
      { id: BRIGADEIRO, lista_id: LISTA_DOCES, nome: "Brigadeiro", descricao: null, posicao: 1, ativo: true },
      { id: BEIJINHO, lista_id: LISTA_DOCES, nome: "Beijinho", descricao: null, posicao: 2, ativo: true },
      { id: CAJUZINHO, lista_id: LISTA_DOCES, nome: "Cajuzinho", descricao: null, posicao: 3, ativo: true },
      { id: OLHO, lista_id: LISTA_DOCES, nome: "Olho de sogra", descricao: null, posicao: 4, ativo: true },
      { id: SUCO, lista_id: LISTA_BEBIDAS, nome: "Suco de uva", descricao: null, posicao: 1, ativo: true },
      { id: REFRI, lista_id: LISTA_BEBIDAS, nome: "Refrigerante", descricao: null, posicao: 2, ativo: true },
    ],
    quantidades: tamanhos.flatMap((p) => [
      q(p, GRUPO_BOLO, 1),
      q(p, GRUPO_DOCES, p * 2, { max_sabores: 3 }),
      q(p, GRUPO_BEBIDA, Math.ceil(p / 5), { opcao_id: SUCO, rotulo: `${Math.ceil(p / 5)} Suco de uva 1L` }),
      q(p, GRUPO_BEBIDA, Math.ceil(p / 10), { opcao_id: REFRI, rotulo: `${Math.ceil(p / 10)} Refrigerante 2L` }),
      q(p, GRUPO_DESC, p, { rotulo: "pratos e copos" }),
    ]),
  };
}

export function configDoExemplo(tamanhos?: number[]): KitConfig {
  return montarConfigKit(PRODUTO, linhasDoExemplo(tamanhos));
}
