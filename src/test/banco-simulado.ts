// Banco simulado para testes do site público (só testes importam este
// arquivo). Imita o cliente do Supabase que o site usa — from(tabela)
// .select().eq().in().order().maybeSingle()/await — sobre dados em memória,
// sem ler nada real.
//
// papel "admin": simula o ADMIN LOGADO navegando no site, cuja sessão lê
// tudo: o filtro de ativo pedido na consulta é ignorado, e o sabor inativo
// chega com ativo = false. Prova que o código segura o inativo sozinho.
// papel "anon": o filtro de ativo vale, e o sabor inativo chega null (a RLS
// de produtos esconde o produto embutido).

export type Papel = "anon" | "admin";
type Linha = Record<string, unknown>;

export type BancoSimulado = {
  papel: Papel;
  tabelas: Record<string, Linha[]>;
  // Tabelas que respondem com erro.
  falhas: Set<string>;
  // Consultas feitas, como "tabela.coluna=valor", para conferir filtros.
  consultas: string[];
};

export function novoBanco(tabelas: Record<string, Linha[]> = {}, papel: Papel = "anon"): BancoSimulado {
  return { papel, tabelas, falhas: new Set(), consultas: [] };
}

function aplicarRls(banco: BancoSimulado, tabela: string, linha: Linha): Linha {
  if (tabela !== "produto_cento_itens") return linha;
  const produto = (banco.tabelas.produtos ?? []).find((p) => p.nome === linha.subitem_nome);
  let sabor: Linha | null = produto ? { nome: produto.nome, ativo: produto.ativo } : null;
  if (banco.papel === "anon" && produto && produto.ativo !== true) sabor = null;
  return { ...linha, sabor };
}

export function clienteSimulado(banco: BancoSimulado) {
  return {
    from(tabela: string) {
      const filtros: ((l: Linha) => boolean)[] = [];
      let ordem: string | null = null;
      const resultado = () => {
        if (banco.falhas.has(tabela)) return { data: null, error: { message: `falha simulada em ${tabela}` } };
        let linhas = (banco.tabelas[tabela] ?? []).filter((l) => filtros.every((f) => f(l)));
        if (ordem) {
          const col = ordem;
          linhas = [...linhas].sort((a, b) => Number(a[col]) - Number(b[col]));
        }
        return { data: linhas.map((l) => aplicarRls(banco, tabela, l)), error: null };
      };
      const b = {
        select: () => b,
        eq: (coluna: string, valor: unknown) => {
          banco.consultas.push(`${tabela}.${coluna}=${String(valor)}`);
          // Sessão do admin lê inativos mesmo pedindo só ativos.
          if (!(coluna === "ativo" && banco.papel === "admin")) filtros.push((l) => l[coluna] === valor);
          return b;
        },
        in: (coluna: string, valores: unknown[]) => {
          banco.consultas.push(`${tabela}.${coluna} in ${valores.join("|")}`);
          filtros.push((l) => valores.includes(l[coluna]));
          return b;
        },
        order: (coluna: string) => {
          ordem = coluna;
          return b;
        },
        maybeSingle: async () => {
          const r = resultado();
          return { data: r.data?.[0] ?? null, error: r.error };
        },
        then: (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resultado()).then(ok, erro),
      };
      return b;
    },
    storage: {
      from: () => ({
        getPublicUrl: (caminho: string) => ({ data: { publicUrl: `https://storage/${caminho}` } }),
      }),
    },
  };
}
