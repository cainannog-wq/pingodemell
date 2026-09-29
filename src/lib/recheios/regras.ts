import { GRUPO_RECHEIO_LABELS, GRUPO_RECHEIO_VALUES, type GrupoRecheio, type Recheio } from "./types";

// Regras do catálogo de recheios na vitrine, em funções puras cobertas por
// teste. A consulta ao banco fica em src/lib/vitrine/buscar.ts.
//
// Quem filtra o inativo é o código, não a RLS: o admin logado navegando no
// site lê também os recheios inativos.
//
// Bolo grande e Bento Cake enxergam o mesmo catálogo por filtros
// independentes: esvaziar um lado (nenhum ativo com vale_bolo, ou nenhum
// ativo com vale_bento) não mexe no outro.

type Vitrine = Pick<Recheio, "id" | "nome" | "vale_bolo" | "vale_bento" | "preco_kg" | "grupo" | "ativo">;

// Ordem alfabética como um leitor brasileiro espera (acento e maiúscula não
// separam).
const COLLATOR = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true });

function porNome(a: Pick<Recheio, "nome">, b: Pick<Recheio, "nome">): number {
  const r = COLLATOR.compare(a.nome, b.nome);
  if (r !== 0) return r;
  return a.nome < b.nome ? -1 : a.nome > b.nome ? 1 : 0;
}

// Recheio que o Bolo grande pode oferecer: ativo, vale_bolo, com preço e
// grupo (o banco já exige, a checagem aqui segura dado inconsistente).
export function recheiosDoBolo<T extends Vitrine>(recheios: T[]): T[] {
  return recheios
    .filter((r) => r.ativo === true && r.vale_bolo === true && Number(r.preco_kg) > 0 && r.grupo !== null)
    .sort(porNome);
}

export function recheiosDoBento<T extends Vitrine>(recheios: T[]): T[] {
  return recheios.filter((r) => r.ativo === true && r.vale_bento === true).sort(porNome);
}

export function boloDisponivel(recheios: Vitrine[]): boolean {
  return recheiosDoBolo(recheios).length > 0;
}

export function bentoDisponivel(recheios: Vitrine[]): boolean {
  return recheiosDoBento(recheios).length > 0;
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
