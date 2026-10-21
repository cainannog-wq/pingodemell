// Regras puras da carga dos Kits Festa por pessoa (sem banco, sem arquivo):
// leitura do CSV, validação, plano e relatório. O script que grava é
// scripts/carga/kit-pessoa-carga.mjs. Testes: kit-pessoa-lib.test.mjs.
//
// Entrada: cinco CSV em uma pasta (UTF-8, vírgula, aspas duplas para texto com
// vírgula, primeira linha é o cabeçalho). A ordem das linhas vale como posição.
//
//   listas.csv       lista,opcao,descricao
//   produtos.csv     produto,subcategoria,preco,prazo_producao_dias,destaque,herda_destaque_de,descricao
//   grupos.csv       produto,chave,rotulo,modo,lista,passo
//   tamanhos.csv     produto,pessoas,bolo_kg,descartaveis
//   quantidades.csv  produto,pessoas,grupo,opcao,total,max_sabores,rotulo

export const ARQUIVOS = {
  listas: ["lista", "opcao", "descricao"],
  produtos: ["produto", "subcategoria", "preco", "prazo_producao_dias", "destaque", "herda_destaque_de", "descricao"],
  grupos: ["produto", "chave", "rotulo", "modo", "lista", "passo"],
  tamanhos: ["produto", "pessoas", "bolo_kg", "descartaveis"],
  quantidades: ["produto", "pessoas", "grupo", "opcao", "total", "max_sabores", "rotulo"],
};

export const MODOS = ["escolha_unica", "distribuicao", "fixo"];
const CHAVE = /^[a-z][a-z0-9_]{0,29}$/;

// CSV com aspas duplas (campo com vírgula, aspas dobradas dentro do campo).
export function lerCsv(texto, cabecalhoEsperado, arquivo = "csv") {
  const limpo = texto.replace(/^﻿/, "");
  const linhas = [];
  let campo = "";
  let linha = [];
  let emAspas = false;
  for (let i = 0; i < limpo.length; i += 1) {
    const c = limpo[i];
    if (emAspas) {
      if (c === '"' && limpo[i + 1] === '"') { campo += '"'; i += 1; }
      else if (c === '"') emAspas = false;
      else campo += c;
    } else if (c === '"') emAspas = true;
    else if (c === ",") { linha.push(campo); campo = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && limpo[i + 1] === "\n") i += 1;
      linha.push(campo); campo = "";
      if (!(linha.length === 1 && linha[0] === "")) linhas.push(linha);
      linha = [];
    } else campo += c;
  }
  if (emAspas) throw new Error(`${arquivo}: aspas sem fechar.`);
  if (campo !== "" || linha.length) { linha.push(campo); linhas.push(linha); }
  const cab = linhas.shift() ?? [];
  if (cab.join(",") !== cabecalhoEsperado.join(",")) {
    throw new Error(`${arquivo}: cabeçalho inesperado (${cab.join(",")}); esperado ${cabecalhoEsperado.join(",")}.`);
  }
  return linhas.map((l, i) => {
    if (l.length !== cabecalhoEsperado.length) throw new Error(`${arquivo}, linha ${i + 2}: ${l.length} colunas em vez de ${cabecalhoEsperado.length}.`);
    const reg = { _linha: i + 2 };
    cabecalhoEsperado.forEach((nome, j) => { reg[nome] = l[j].trim().replace(/\s+/g, " "); });
    return reg;
  });
}

const sim = (v) => v.toLowerCase() === "sim";
const simOuNao = (v) => ["sim", "nao", "não"].includes(v.toLowerCase());
const inteiro = (v) => /^\d+$/.test(v) ? Number(v) : NaN;
const decimal = (v) => /^\d+([.,]\d+)?$/.test(v) ? Number(v.replace(",", ".")) : NaN;
const chaveNome = (v) => v.toLowerCase();

// Valida o conjunto e devolve { erros, avisos, plano }. Erro impede a carga;
// aviso entra no relatório (divergência que a pessoa decide).
export function montarPlano(dados) {
  const erros = [];
  const avisos = [];
  const erro = (arq, l, msg) => erros.push(`${arq}, linha ${l}: ${msg}`);

  // Listas: itens na ordem do arquivo (posição 1, 2, 3...).
  const listas = new Map();
  for (const r of dados.listas) {
    if (!r.lista || r.lista.length > 80) { erro("listas", r._linha, "nome da lista de 1 a 80 caracteres."); continue; }
    if (!r.opcao || r.opcao.length > 100) { erro("listas", r._linha, "nome da opção de 1 a 100 caracteres."); continue; }
    if (r.descricao.length > 200) { erro("listas", r._linha, "descrição de no máximo 200 caracteres."); continue; }
    const k = chaveNome(r.lista);
    if (!listas.has(k)) listas.set(k, { nome: r.lista, itens: [] });
    const lista = listas.get(k);
    if (lista.itens.some((i) => chaveNome(i.nome) === chaveNome(r.opcao))) { erro("listas", r._linha, `opção repetida em "${r.lista}": ${r.opcao}.`); continue; }
    if (lista.itens.length >= 200) { erro("listas", r._linha, `lista "${r.lista}" passa de 200 opções.`); continue; }
    lista.itens.push({ nome: r.opcao, descricao: r.descricao || null, posicao: lista.itens.length + 1 });
  }

  const produtos = new Map();
  for (const r of dados.produtos) {
    const preco = decimal(r.preco);
    const prazo = inteiro(r.prazo_producao_dias);
    if (!r.produto) { erro("produtos", r._linha, "nome do produto vazio."); continue; }
    if (produtos.has(chaveNome(r.produto))) { erro("produtos", r._linha, `produto repetido: ${r.produto}.`); continue; }
    if (!r.subcategoria) erro("produtos", r._linha, "subcategoria (slug) vazia.");
    if (!(preco > 0)) erro("produtos", r._linha, `preço inválido: "${r.preco}".`);
    if (!Number.isInteger(prazo)) erro("produtos", r._linha, `prazo inválido: "${r.prazo_producao_dias}".`);
    // Vazio só vale com herda_destaque_de (o destaque vem de um produto que já existe).
    if (r.destaque === "" ? !r.herda_destaque_de : !simOuNao(r.destaque)) erro("produtos", r._linha, 'destaque deve ser "sim" ou "nao" (ou ficar vazio com herda_destaque_de).');
    if (r.destaque && r.herda_destaque_de) erro("produtos", r._linha, "use destaque OU herda_destaque_de, não os dois com valor.");
    produtos.set(chaveNome(r.produto), {
      nome: r.produto, subcategoria: r.subcategoria, preco, prazo, destaque: sim(r.destaque || "nao"),
      herdaDestaqueDe: r.herda_destaque_de || null, descricao: r.descricao,
      grupos: [], tamanhos: [], quantidades: [],
    });
  }

  const doProduto = (arq, r) => {
    const p = produtos.get(chaveNome(r.produto));
    if (!p) erro(arq, r._linha, `produto "${r.produto}" não está em produtos.csv.`);
    return p;
  };

  for (const r of dados.grupos) {
    const p = doProduto("grupos", r);
    if (!p) continue;
    if (!CHAVE.test(r.chave)) { erro("grupos", r._linha, `chave inválida "${r.chave}" (minúsculas, números e _, até 30).`); continue; }
    if (p.grupos.some((g) => g.chave === r.chave)) { erro("grupos", r._linha, `chave repetida no produto: ${r.chave}.`); continue; }
    if (!r.rotulo || r.rotulo.length > 60) { erro("grupos", r._linha, "rótulo de 1 a 60 caracteres."); continue; }
    if (!MODOS.includes(r.modo)) { erro("grupos", r._linha, `modo inválido "${r.modo}" (${MODOS.join(", ")}).`); continue; }
    const passo = r.passo === "" ? null : inteiro(r.passo);
    if (r.modo === "fixo" && (r.lista || r.passo)) { erro("grupos", r._linha, "grupo fixo não tem lista nem passo."); continue; }
    if (r.modo === "escolha_unica" && (!r.lista || r.passo)) { erro("grupos", r._linha, "escolha única tem lista e não tem passo."); continue; }
    if (r.modo === "distribuicao" && (!r.lista || !(passo >= 1 && passo <= 100))) { erro("grupos", r._linha, "distribuição tem lista e passo de 1 a 100."); continue; }
    if (r.lista && !listas.has(chaveNome(r.lista))) { erro("grupos", r._linha, `lista "${r.lista}" não está em listas.csv.`); continue; }
    if (p.grupos.length >= 20) { erro("grupos", r._linha, "no máximo 20 grupos por produto."); continue; }
    p.grupos.push({ chave: r.chave, rotulo: r.rotulo, modo: r.modo, lista: r.lista ? listas.get(chaveNome(r.lista)).nome : null, passo, posicao: p.grupos.length + 1 });
  }

  for (const r of dados.tamanhos) {
    const p = doProduto("tamanhos", r);
    if (!p) continue;
    const pessoas = inteiro(r.pessoas);
    const kg = decimal(r.bolo_kg);
    if (!(pessoas >= 1 && pessoas <= 1000)) { erro("tamanhos", r._linha, `pessoas inválido: "${r.pessoas}".`); continue; }
    if (!(kg > 0) || kg * 2 !== Math.trunc(kg * 2)) { erro("tamanhos", r._linha, `bolo_kg deve ser positivo e em meio quilo: "${r.bolo_kg}".`); continue; }
    if (!simOuNao(r.descartaveis)) { erro("tamanhos", r._linha, 'descartaveis deve ser "sim" ou "nao".'); continue; }
    if (p.tamanhos.some((t) => t.pessoas === pessoas)) { erro("tamanhos", r._linha, `tamanho repetido: ${pessoas}.`); continue; }
    p.tamanhos.push({ pessoas, boloKg: kg, descartaveis: sim(r.descartaveis) });
  }

  for (const r of dados.quantidades) {
    const p = doProduto("quantidades", r);
    if (!p) continue;
    const pessoas = inteiro(r.pessoas);
    const total = inteiro(r.total);
    const max = r.max_sabores === "" ? null : inteiro(r.max_sabores);
    const grupo = p.grupos.find((g) => g.chave === r.grupo);
    if (!p.tamanhos.some((t) => t.pessoas === pessoas)) { erro("quantidades", r._linha, `tamanho ${r.pessoas} não está em tamanhos.csv para ${p.nome}.`); continue; }
    if (!grupo) { erro("quantidades", r._linha, `grupo "${r.grupo}" não existe em ${p.nome}.`); continue; }
    if (!(total >= 1 && total <= 100000)) { erro("quantidades", r._linha, `total inválido: "${r.total}".`); continue; }
    if (max !== null && !(max >= 1)) { erro("quantidades", r._linha, `max_sabores inválido: "${r.max_sabores}".`); continue; }
    if (r.rotulo.length > 80) { erro("quantidades", r._linha, "rótulo de no máximo 80 caracteres."); continue; }
    let opcao = null;
    if (r.opcao) {
      if (grupo.modo !== "escolha_unica") { erro("quantidades", r._linha, "opção só vale em grupo de escolha única."); continue; }
      const item = listas.get(chaveNome(grupo.lista)).itens.find((i) => chaveNome(i.nome) === chaveNome(r.opcao));
      if (!item) { erro("quantidades", r._linha, `opção "${r.opcao}" não está na lista "${grupo.lista}".`); continue; }
      opcao = item.nome;
    }
    if (p.quantidades.some((q) => q.pessoas === pessoas && q.grupo === grupo.chave && q.opcao === opcao)) {
      erro("quantidades", r._linha, `quantidade repetida (${p.nome}, ${pessoas}, ${grupo.chave}, ${opcao ?? "sem opção"}).`); continue;
    }
    p.quantidades.push({ pessoas, grupo: grupo.chave, opcao, total, maxSabores: max, rotulo: r.rotulo || null });
  }

  // Divergências que o banco não confere (relatório, não erro).
  for (const p of produtos.values()) {
    if (p.tamanhos.length === 0) erro("tamanhos", 0, `${p.nome} não tem nenhum tamanho.`);
    for (const g of p.grupos) {
      for (const t of p.tamanhos) {
        const qs = p.quantidades.filter((q) => q.pessoas === t.pessoas && q.grupo === g.chave);
        if (qs.length === 0) avisos.push(`${p.nome}: o grupo "${g.chave}" não tem quantidade para ${t.pessoas} pessoas.`);
        if (g.modo === "distribuicao") {
          for (const q of qs) {
            if (q.total % g.passo !== 0) avisos.push(`${p.nome}, ${t.pessoas} pessoas, "${g.chave}": total ${q.total} não é múltiplo do passo ${g.passo}.`);
          }
        }
        if (g.modo === "escolha_unica") {
          const comOpcao = qs.filter((q) => q.opcao);
          if (comOpcao.length && comOpcao.length !== qs.length) avisos.push(`${p.nome}, ${t.pessoas} pessoas, "${g.chave}": mistura linhas com e sem opção.`);
          if (comOpcao.length) {
            const lista = listas.get(chaveNome(g.lista));
            const faltam = lista.itens.filter((i) => !comOpcao.some((q) => chaveNome(q.opcao) === chaveNome(i.nome)));
            if (faltam.length) avisos.push(`${p.nome}, ${t.pessoas} pessoas, "${g.chave}": sem quantidade para ${faltam.map((i) => i.nome).join(", ")}.`);
          }
        }
      }
    }
    for (const q of p.quantidades) {
      const g = p.grupos.find((x) => x.chave === q.grupo);
      if (g && g.modo !== "distribuicao" && q.maxSabores !== null) avisos.push(`${p.nome}: max_sabores só faz sentido em distribuição ("${g.chave}").`);
    }
  }

  return { erros, avisos, plano: { listas: [...listas.values()], produtos: [...produtos.values()] } };
}

// O menor tamanho de cada kit vira o pedido_minimo gravado (a pessoa é a
// quantidade do produto e só os tamanhos da tabela são aceitos).
export function menorTamanho(produto) {
  return produto.tamanhos.reduce((menor, t) => Math.min(menor, t.pessoas), Infinity);
}

export function relatorio({ plano, avisos }) {
  const linhas = [];
  linhas.push(`listas: ${plano.listas.length} (${plano.listas.map((l) => `${l.nome} ${l.itens.length}`).join(", ")})`);
  for (const p of plano.produtos) {
    const tams = [...p.tamanhos].sort((a, b) => a.pessoas - b.pessoas).map((t) => t.pessoas);
    linhas.push(`produto ${p.nome}: R$ ${p.preco.toFixed(2)} por pessoa, ${p.grupos.length} grupos, tamanhos ${tams.join("/")}, ${p.quantidades.length} quantidades, pedido_minimo gravado = ${menorTamanho(p)}`);
  }
  linhas.push(avisos.length ? `AVISOS (${avisos.length}):` : "avisos: nenhum");
  for (const a of avisos) linhas.push(`  ${a}`);
  return linhas.join("\n");
}
