import { categoriaCanonica } from "./categorias";
import { aceitaRecheiosPersonalizados } from "./recheios-produto";
import { CATEGORIA_DO_TIPO, CATEGORIA_VALUES, TIPO_PRODUTO_VALUES } from "./types";
import type { CategoriaProduto, TipoProduto } from "./types";

// Tabela única de visibilidade dos campos do formulário de produto.
//
// O formulário (src/app/admin/produtos/produto-form.tsx), o parser
// (parse.ts) e o montador do UPDATE e do INSERT (montar.ts) leem ESTA tabela;
// ninguém mais decide em que categoria e tipo um campo vale. Já houve um bug
// por isso: salvar um Bento Cake apagava a unidade de venda e voltava o step
// para livre, porque um campo que a tela não mostrava ia no UPDATE com valor
// neutro.
//
// Regra: campo escondido NUNCA vai ao UPDATE de edição (o que está no banco
// fica como está). Só o cadastro novo grava o valor neutro do campo escondido,
// porque a coluna é obrigatória.
//
// EXCEÇÃO DELIBERADA (decisão de Cainan, 13/10/2026), não "consertar": a regra
// vale para COLUNAS de `produtos`. Os campos marcados com efeitoEmTabelaFilha
// (sabores do Cento e recheios do produto) gravam em tabelas filhas, e a
// limpeza delas ao trocar de tipo ou de categoria continua: o Cento que vira
// outro tipo perde os sabores, e o produto que deixa de aceitar recheios perde
// a lista.
//
// Campo novo: UMA entrada aqui, e um caso novo em salvar-sem-mudar.test.tsx.
// A visibilidade recebe um contexto, não só categoria e tipo, porque o seletor
// de subcategoria depende também de haver subcategoria para escolher.

export type ContextoCampo = {
  // Pode ser o nome antigo do banco ("Kits"): a tabela usa o nome canônico.
  categoria: string | null | undefined;
  tipo: TipoProduto;
  // Só o seletor de subcategoria lê isto: há subcategoria para escolher (a
  // categoria tem alguma ativa, ou o produto já está ligado a uma dela, mesmo
  // inativa; ver temSubcategoriaParaEscolher em lib/subcategorias/regras.ts).
  // O servidor calcula o fato com o banco; o navegador nunca o envia.
  temSubcategoriaParaEscolher?: boolean;
};

export type CampoProduto =
  | "nome"
  | "descricao"
  | "categoria"
  | "subcategoria"
  | "tipo"
  | "preco"
  | "pedido_minimo"
  | "step_quantidade"
  | "unidade_venda"
  | "prazo_producao_dias"
  | "destaque"
  | "ativo"
  | "capa"
  | "galeria"
  | "subitens"
  | "recheios";

// Colunas da tabela produtos que o formulário grava.
export type ColunaProduto =
  | "nome"
  | "descricao"
  | "Categoria"
  | "subcategoria_id"
  | "tipo"
  | "preco"
  | "pedido_minimo"
  | "step_quantidade"
  | "unidade_venda"
  | "prazo_producao_dias"
  | "destaque"
  | "ativo";

type DefinicaoCampo = {
  // Coluna em produtos. Ausente: o campo grava em tabela filha ou no storage.
  coluna?: ColunaProduto;
  // Valor que o cadastro novo grava quando o campo está escondido. Sem neutro
  // (undefined), o cadastro omite a coluna e vale o padrão do banco.
  // Pode depender do contexto (a unidade neutra do kit por pessoa é "a pessoa").
  neutro?: unknown | ((contexto: ContextoCampo) => unknown);
  // Grava em tabela filha: não segue a regra "escondido não vai ao UPDATE"
  // (ver a exceção deliberada acima).
  efeitoEmTabelaFilha?: boolean;
  // Atributos `name` que o formulário renderiza para o campo quando visível.
  nomesNoFormulario: readonly string[];
  visivel: (contexto: ContextoCampo) => boolean;
};

const sempre = () => true;

// A ordem das entradas é a ordem em que as colunas escondidas aparecem em
// naoGravarNaEdicao (preço, mínimo, step, unidade).
export const CAMPOS: Record<CampoProduto, DefinicaoCampo> = {
  nome: { coluna: "nome", nomesNoFormulario: ["nome"], visivel: sempre },
  descricao: { coluna: "descricao", nomesNoFormulario: ["descricao"], visivel: sempre },
  categoria: { coluna: "Categoria", nomesNoFormulario: ["categoria"], visivel: sempre },
  // Opcional. Escondido: nunca vai ao UPDATE (o vínculo do banco fica como
  // está) e o cadastro novo omite a coluna, que nasce nula (sem padrão no
  // banco; nulo é "sem subcategoria").
  subcategoria: {
    coluna: "subcategoria_id",
    nomesNoFormulario: ["subcategoria_id"],
    visivel: ({ temSubcategoriaParaEscolher }) => temSubcategoriaParaEscolher === true,
  },
  tipo: { coluna: "tipo", nomesNoFormulario: ["tipo"], visivel: sempre },
  // O Bolo tem o preço no recheio × kg: preço, mínimo, step e unidade não valem.
  preco: { coluna: "preco", neutro: 0, nomesNoFormulario: ["preco"], visivel: ({ tipo }) => tipo !== "bolo" },
  pedido_minimo: {
    coluna: "pedido_minimo",
    neutro: 1,
    nomesNoFormulario: ["pedido_minimo"],
    visivel: ({ tipo }) => tipo !== "bolo" && tipo !== "kit_pessoa",
  },
  // O Bento Cake tem peso fechado: sem step (a unidade vale).
  step_quantidade: {
    coluna: "step_quantidade",
    neutro: "livre",
    nomesNoFormulario: ["step_quantidade"],
    visivel: ({ tipo }) => tipo !== "bolo" && tipo !== "bento_cake" && tipo !== "kit_pessoa",
  },
  unidade_venda: {
    coluna: "unidade_venda",
    neutro: ({ tipo }: ContextoCampo) => (tipo === "kit_pessoa" ? "a pessoa" : null),
    nomesNoFormulario: ["unidade_venda"],
    visivel: ({ tipo }) => tipo !== "bolo" && tipo !== "kit_pessoa",
  },
  prazo_producao_dias: { coluna: "prazo_producao_dias", nomesNoFormulario: ["prazo_producao_dias"], visivel: sempre },
  destaque: { coluna: "destaque", nomesNoFormulario: ["destaque"], visivel: sempre },
  ativo: { coluna: "ativo", nomesNoFormulario: ["ativo"], visivel: sempre },
  // Arquivos: a capa e as fotos extras sobem direto para o storage e entram no
  // envio só no Salvar (campos "capa" e "galeria", montados pelo formulário).
  capa: { nomesNoFormulario: [], visivel: sempre },
  galeria: { nomesNoFormulario: [], visivel: sempre },
  subitens: {
    efeitoEmTabelaFilha: true,
    nomesNoFormulario: ["subitem_nome"],
    visivel: ({ tipo }) => tipo === "cento",
  },
  recheios: {
    efeitoEmTabelaFilha: true,
    nomesNoFormulario: ["recheios_ligados", "recheios_produto"],
    visivel: ({ categoria, tipo }) =>
      aceitaRecheiosPersonalizados({ Categoria: categoriaCanonica(categoria), tipo }),
  },
};

const CHAVES = Object.keys(CAMPOS) as CampoProduto[];

export function campoVisivel(campo: CampoProduto, contexto: ContextoCampo): boolean {
  return CAMPOS[campo].visivel(contexto);
}

// Colunas de produtos que a edição grava: as dos campos visíveis.
export function colunasDaEdicao(contexto: ContextoCampo): ColunaProduto[] {
  return CHAVES.filter((c) => CAMPOS[c].coluna && campoVisivel(c, contexto)).map((c) => CAMPOS[c].coluna as ColunaProduto);
}

// Colunas que a edição NÃO grava (campo escondido).
export function colunasEscondidas(contexto: ContextoCampo): ColunaProduto[] {
  return CHAVES.filter((c) => CAMPOS[c].coluna && !campoVisivel(c, contexto)).map((c) => CAMPOS[c].coluna as ColunaProduto);
}

// Valor neutro de cada coluna escondida, só para o cadastro novo.
export function neutrosDoCadastro(contexto: ContextoCampo): Partial<Record<ColunaProduto, unknown>> {
  const saida: Partial<Record<ColunaProduto, unknown>> = {};
  for (const c of CHAVES) {
    const { coluna, neutro } = CAMPOS[c];
    if (coluna && !campoVisivel(c, contexto) && neutro !== undefined) {
      saida[coluna] = typeof neutro === "function" ? (neutro as (x: ContextoCampo) => unknown)(contexto) : neutro;
    }
  }
  return saida;
}

export function colunasDoProduto(): ColunaProduto[] {
  return CHAVES.map((c) => CAMPOS[c].coluna).filter((c): c is ColunaProduto => Boolean(c));
}

// Todas as combinações de categoria e tipo que o cadastro aceita: o Bolo só
// em Bolos, o Bento Cake só em Bento Cake, e a categoria Bento Cake só aceita
// o tipo Bento Cake (as mesmas regras de parseProdutoForm).
export function combinacoesValidas(): { categoria: CategoriaProduto; tipo: TipoProduto }[] {
  const saida: { categoria: CategoriaProduto; tipo: TipoProduto }[] = [];
  for (const tipo of TIPO_PRODUTO_VALUES) {
    for (const categoria of CATEGORIA_VALUES) {
      const exigida = CATEGORIA_DO_TIPO[tipo];
      if (exigida && categoria !== exigida) continue;
      if (categoria === "Bento Cake" && tipo !== "bento_cake") continue;
      saida.push({ categoria, tipo });
    }
  }
  return saida;
}
