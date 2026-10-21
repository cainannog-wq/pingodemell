import { linhaGeral, opcoesDeEscolha, type KitConfig, type KitGrupo } from "./config";

// Escolhas da cliente num kit: por grupo (pela chave), pares [id da opção,
// quantidade]. Escolha única: um par; distribuição: um par por sabor com
// quantidade; fixo: nenhum. É o formato do carrinho e do corpo do pedido.
export type EscolhasKit = Record<string, [string, number][]>;

export type ProblemaKit = { chave: string; mensagem: string };

export type ResultadoEscolhas = { ok: true; avisos: string[] } | { ok: false; problemas: ProblemaKit[] };

// Quantos itens a cliente já distribuiu e quantos faltam num grupo (a tela
// mostra "30 de 50" e a falta ou a sobra).
export function progressoDaDistribuicao(grupo: KitGrupo, pessoas: number, pares: [string, number][]) {
  const total = linhaGeral(grupo, pessoas)?.total ?? 0;
  const feitos = pares.reduce((s, [, q]) => s + q, 0);
  return { total, feitos, falta: Math.max(0, total - feitos), sobra: Math.max(0, feitos - total) };
}

export type ModoValidacao = "tela" | "servidor";

// Confere as escolhas contra a configuração. Na tela só valem opções ativas
// da lista; no servidor, um id que a configuração não conhece é ACEITO com
// aviso (a atendente concilia: o cache do servidor pode estar até 5 minutos
// atrás de uma opção recém-criada), e a opção inativa também passa. A
// quantidade, o passo, a soma e o máximo de sabores valem nos dois modos.
export function validarEscolhas(
  config: KitConfig,
  pessoas: number,
  escolhas: EscolhasKit,
  modo: ModoValidacao
): ResultadoEscolhas {
  const problemas: ProblemaKit[] = [];
  const avisos: string[] = [];
  const tamanho = config.tamanhos.find((t) => t.pessoas === pessoas);
  if (!tamanho) return { ok: false, problemas: [{ chave: "", mensagem: `Tamanho de ${pessoas} pessoas não existe neste kit.` }] };

  const chaves = new Set(config.grupos.map((g) => g.chave));
  for (const chave of Object.keys(escolhas)) {
    if (!chaves.has(chave)) problemas.push({ chave, mensagem: `Grupo "${chave}" não existe neste kit.` });
  }

  for (const grupo of config.grupos) {
    const pares = escolhas[grupo.chave] ?? [];
    const falha = (mensagem: string) => problemas.push({ chave: grupo.chave, mensagem });
    const ids = pares.map(([id]) => id);
    if (new Set(ids).size !== ids.length) {
      falha(`${grupo.rotulo}: opção repetida.`);
      continue;
    }
    if (pares.some(([, q]) => !Number.isInteger(q) || q <= 0)) {
      falha(`${grupo.rotulo}: quantidade inválida.`);
      continue;
    }
    const desconhecida = (id: string) => !grupo.opcoes.some((o) => o.id === id);
    const naoVale = (id: string) =>
      modo === "tela" ? !grupo.opcoes.some((o) => o.id === id && o.ativo) : false;

    for (const id of ids) {
      if (modo === "servidor" && desconhecida(id)) avisos.push(`${grupo.chave}: opção desconhecida ${id}`);
    }

    if (grupo.modo === "fixo") {
      if (pares.length > 0) falha(`${grupo.rotulo}: este grupo não tem escolha.`);
      continue;
    }

    if (grupo.modo === "escolha_unica") {
      if (pares.length !== 1) {
        falha(`${grupo.rotulo}: escolha uma opção.`);
        continue;
      }
      const [id, q] = pares[0];
      if (naoVale(id) || (modo === "tela" && desconhecida(id))) {
        falha(`${grupo.rotulo}: opção inválida.`);
        continue;
      }
      const opcoes = opcoesDeEscolha(grupo, pessoas);
      const esperada = opcoes.find((o) => o.opcao.id === id);
      // No servidor, opção inativa ou desconhecida não tem quantidade na
      // configuração (ela só lista as ativas): vale a linha de qualquer opção
      // do grupo se for uma só quantidade geral, senão não dá para conferir.
      if (esperada) {
        if (q !== esperada.total) falha(`${grupo.rotulo}: quantidade diferente da do kit.`);
      } else if (modo === "tela") {
        falha(`${grupo.rotulo}: opção indisponível neste tamanho.`);
      } else {
        const linhas = grupo.porTamanho[pessoas] ?? [];
        const doId = linhas.find((l) => l.opcaoId === id) ?? linhas.find((l) => l.opcaoId === null);
        if (doId && q !== doId.total) falha(`${grupo.rotulo}: quantidade diferente da do kit.`);
      }
      continue;
    }

    // distribuição
    const geral = linhaGeral(grupo, pessoas);
    if (!geral) {
      falha(`${grupo.rotulo}: sem quantidade para ${pessoas} pessoas.`);
      continue;
    }
    const passo = grupo.passo ?? 1;
    if (pares.some(([id]) => naoVale(id) || (modo === "tela" && desconhecida(id)))) {
      falha(`${grupo.rotulo}: opção inválida.`);
      continue;
    }
    if (pares.some(([, q]) => q % passo !== 0)) {
      falha(`${grupo.rotulo}: as quantidades andam de ${passo} em ${passo}.`);
      continue;
    }
    const soma = pares.reduce((s, [, q]) => s + q, 0);
    if (soma !== geral.total) {
      falha(`${grupo.rotulo}: a soma tem de ser ${geral.total} (está em ${soma}).`);
      continue;
    }
    if (geral.maxSabores !== null && pares.length > geral.maxSabores) {
      falha(`${grupo.rotulo}: no máximo ${geral.maxSabores} sabores.`);
    }
  }

  return problemas.length ? { ok: false, problemas } : { ok: true, avisos };
}
