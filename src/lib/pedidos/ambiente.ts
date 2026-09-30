// Em que ambiente a rota de pedidos está rodando (PR confirmacao-e-gravacao).
//
// CONTEXTO_NETLIFY é o CONTEXT da Netlify ("production", "deploy-preview",
// "branch-deploy") EMBUTIDO NO BUILD por next.config.ts: cada contexto gera o
// seu build, então o valor bate com o deploy que está no ar. Ler CONTEXT com
// o site já rodando não é garantido pela Netlify (é variável de build).
// Sem valor (máquina local, testes) conta como fora da produção: o lado
// seguro, o pedido sai marcado como teste.
//
// Nenhum campo enviado pelo navegador influencia isto.

export type ContextoGravacao = "producao" | "fora_producao";

export function emProducao(contexto: string | undefined = process.env.CONTEXTO_NETLIFY): boolean {
  return contexto === "production";
}

// Linha do interruptor (tabela pedidos_gravacao) que vale neste ambiente.
export function contextoDaGravacao(contexto: string | undefined = process.env.CONTEXTO_NETLIFY): ContextoGravacao {
  return emProducao(contexto) ? "producao" : "fora_producao";
}

// Pedido gravado fora da produção sai com teste = true.
export function pedidoDeTeste(contexto: string | undefined = process.env.CONTEXTO_NETLIFY): boolean {
  return !emProducao(contexto);
}
