import { GRUPO_RECHEIO_LABELS, GRUPO_RECHEIO_VALUES, type GrupoRecheio, type Recheio } from "./types";

// Regras do catálogo de recheios na vitrine, em funções puras cobertas por
// teste. A consulta ao banco fica em src/lib/vitrine/buscar.ts.
//
// Quem filtra o inativo é o código, não a RLS: o admin logado navegando no
// site lê também os recheios inativos.
//
// O catálogo é só do Bolo tradicional (vale_bolo). A lista de recheios do
// Bento Cake é do próprio produto (src/lib/produtos/recheios-produto.ts); a
// coluna vale_bento continua no banco, sem uso no código, até uma PR futura.

type Vitrine = Pick<Recheio, "id" | "nome" | "vale_bolo" | "vale_bento" | "preco_kg" | "grupo" | "ativo">;

// Ordem alfabética como um leitor brasileiro espera (acento e maiúscula não
// separam).
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function porNome(a: Pick<Recheio, "nome">, b: Pick<Recheio, "nome">): number {
  const r = COLLATOR.compare(a.nome, b.nome);
  if (r !== 0) return r;
  return a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0;
}

// Preço crescente por kg; empate desfeito pelo nome.
function porPrecoENome(a: Pick<Recheio, "nome" | "preco_kg">, b: Pick<Recheio, "nome" | "preco_kg">): number {
  return Number(a.preco_kg) - Number(b.preco_kg) || porNome(a, b);
}

// Recheio que o Bolo grande pode oferecer: ativo, vale_bolo, com preço e
// grupo (o banco já exige, a checagem aqui segura dado inconsistente). Sai
// em ordem crescente de preço por kg (dentro de cada grupo, ao agrupar).
export function recheiosDoBolo<T extends Vitrine>(recheios: T[]): T[] {
  return recheios
    .filter((r) => r.ativo === true && r.vale_bolo === true && Number(r.preco_kg) > 0 && r.grupo !== null)
    .sort(porPrecoENome);
}

export function boloDisponivel(recheios: Vitrine[]): boolean {
  return recheiosDoBolo(recheios).length > 0;
}

// Menor R$/kg entre os recheios do Bolo: o "a partir de" dos cards. null
// quando o Bolo está indisponível.
export function menorPrecoKg(recheios: Vitrine[]): number | null {
  const doBolo = recheiosDoBolo(recheios);
  if (doBolo.length === 0) return null;
  return Math.min(...doBolo.map((r) => Number(r.preco_kg)));
}

export type GrupoDeRecheios<T> = { grupo: GrupoRecheio; rotulo: string; recheios: T[] };

// Os dois grupos do Bolo, sempre nesta ordem (Frutas, depois Chocolate e
// outros); grupo sem recheio ativo não aparece.
export function agruparRecheiosDoBolo<T extends Vitrine>(recheios: T[]): GrupoDeRecheios<T>[] {
  const doBolo = recheiosDoBolo(recheios);
  return GRUPO_RECHEIO_VALUES.map((grupo) => ({
    grupo,
    rotulo: GRUPO_RECHEIO_LABELS[grupo],
    recheios: doBolo.filter((r) => r.grupo === grupo),
  })).filter((g) => g.recheios.length > 0);
}

// Preço do Bolo: R$/kg do recheio × kg, arredondado ao centavo.
export function precoDoBolo(precoKg: number, kg: number): number {
  return Math.round(precoKg * kg * 100) / 100;
}
