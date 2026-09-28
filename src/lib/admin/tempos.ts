// Registro de tempo do Salvar do produto no console do navegador, SÓ na
// homologação (homologacao--pingodemell.netlify.app): serve para medir a
// carga das capas (critério de até 10 s por Salvar). Em qualquer outro
// build (produção, Deploy Preview, local) MEDIR_TEMPOS_ADMIN vem vazio
// (next.config.ts) e cada função sai na primeira linha — o build de
// produção elimina o resto do código, então nada vai para o console.
//
// Como funciona: o formulário guarda o início do Salvar na sessionStorage
// da aba; a listagem de produtos (a tela que confirma o Salvar) fecha o
// registro ao aparecer e escreve no console o histórico desta aba, uma
// linha por Salvar, mais uma linha à parte com a redução da foto.

const PENDENTE = "pdm:tempo-salvar-pendente";
const HISTORICO = "pdm:tempo-salvar-historico";
const VALIDADE_PENDENTE_MS = 2 * 60 * 1000;

export type TempoReducao = {
  arquivo: string;
  bytesOriginal: number;
  bytesFinal: number;
  largura: number;
  altura: number;
  ms: number;
};

export type SalvarPendente = {
  produtoId: string;
  nome: string;
  inicio: number; // Date.now() do clique em Salvar
  prepararMs: number;
  enviarMs: number;
  inicioGravar: number; // Date.now() ao chamar a Server Action
  reducao: TempoReducao | null;
};

type SalvarConcluido = SalvarPendente & { fim: number; resultado: "salvo" | "erro" };

const segundos = (ms: number) => `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
const mb = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(1).replace(".", ",")} MB`;

export function linhaSalvar(r: SalvarConcluido): string {
  return (
    `[tempo capa] ${r.resultado === "salvo" ? "Salvar" : "Salvar COM ERRO"} "${r.nome}" (id ${r.produtoId}): ` +
    `total ${segundos(r.fim - r.inicio)} · preparar ${segundos(r.prepararMs)} · enviar ${segundos(r.enviarMs)} · ` +
    `gravar ${segundos(r.fim - r.inicioGravar)}`
  );
}

export function linhaReducao(r: SalvarConcluido): string {
  if (!r.reducao) return `[tempo redução] "${r.nome}": sem foto de capa nova`;
  const x = r.reducao;
  return (
    `[tempo redução] "${r.nome}": ${segundos(x.ms)} ao escolher "${x.arquivo}" ` +
    `(${mb(x.bytesOriginal)} → ${mb(x.bytesFinal)}, ${x.largura}×${x.altura}) — fora do critério de 10 s`
  );
}

function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = sessionStorage.getItem(chave);
    return bruto ? (JSON.parse(bruto) as T) : padrao;
  } catch {
    return padrao;
  }
}

export function guardarSalvarPendente(registro: SalvarPendente): void {
  if (process.env.MEDIR_TEMPOS_ADMIN !== "1") return;
  try {
    sessionStorage.setItem(PENDENTE, JSON.stringify(registro));
  } catch {
    // Sem sessionStorage (aba privada bloqueada): só não mede.
  }
}

// Fecha o Salvar pendente (se houver) e escreve no console o histórico da
// aba. Chamado pela listagem (salvo) ou pelo formulário quando a Server
// Action devolve erro.
export function concluirSalvarPendente(resultado: "salvo" | "erro", fim = Date.now()): void {
  if (process.env.MEDIR_TEMPOS_ADMIN !== "1") return;
  const pendente = ler<SalvarPendente | null>(PENDENTE, null);
  if (!pendente) return;
  // Salvar que nunca voltou (aba recarregada, falha de rede): não vale
  // como medida de um Salvar que terminou agora.
  if (fim - pendente.inicio > VALIDADE_PENDENTE_MS) {
    try {
      sessionStorage.removeItem(PENDENTE);
    } catch {
      // idem
    }
    return;
  }
  const historico = ler<SalvarConcluido[]>(HISTORICO, []);
  historico.push({ ...pendente, fim, resultado });
  try {
    sessionStorage.removeItem(PENDENTE);
    sessionStorage.setItem(HISTORICO, JSON.stringify(historico));
  } catch {
    // idem
  }
  console.info(`[tempo capa] ${historico.length} Salvar nesta aba (o mais recente por último):`);
  for (const registro of historico) {
    console.info(linhaSalvar(registro));
    console.info(linhaReducao(registro));
  }
}
