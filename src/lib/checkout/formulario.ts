import { dataPermitida, horariosDoDia, type DiasOff } from "./datas";

// Campos do formulário do checkout e a validação de cada um, em função
// pura coberta por teste. Os nomes seguem as colunas de public.pedidos
// (cliente_nome, cliente_whatsapp, cliente_email, ocasiao, modo_entrega,
// endereco, data_hora_entrega, forma_pagamento, observacoes), que a tela
// de confirmação (próximo item) grava pelo POST /api/pedidos. Aqui nada é
// gravado: o formulário só fica no navegador (rascunho.ts).

export type ModoEntrega = "retirada" | "entrega";
export type FormaPagamento = "pix" | "credito" | "debito";

export const FORMAS_PAGAMENTO: { valor: FormaPagamento; rotulo: string }[] = [
  { valor: "pix", rotulo: "Pix" },
  { valor: "credito", rotulo: "Cartão de crédito" },
  { valor: "debito", rotulo: "Cartão de débito" },
];

export type DadosCheckout = {
  nome: string; // completo: pelo menos nome e sobrenome
  whatsapp: string;
  email: string;
  // Leu e está ciente da Política de Privacidade (obrigatório; nasce
  // desmarcado). É ciência, não consentimento: validado só na tela.
  aceite: boolean;
  data: string; // AAAA-MM-DD, calendário de Brasília
  hora: string; // HH:MM
  modo: ModoEntrega | "";
  // Entrega: pode ser em cidade próxima, por isso a cidade é um campo.
  cidade: string;
  bairro: string;
  rua: string;
  numero: string;
  complemento: string;
  ocasiao: string;
  pagamento: FormaPagamento | "";
  observacoes: string;
};

export type Campo = keyof DadosCheckout;
type CampoDeTexto = Exclude<Campo, "aceite" | "data" | "hora" | "modo" | "pagamento">;

export const VAZIO: DadosCheckout = {
  nome: "",
  whatsapp: "",
  email: "",
  aceite: false,
  data: "",
  hora: "",
  modo: "",
  cidade: "",
  bairro: "",
  rua: "",
  numero: "",
  complemento: "",
  ocasiao: "",
  pagamento: "",
  observacoes: "",
};

// Tamanho máximo de cada campo de texto (o campo não deixa passar disso).
export const MAXIMO: Record<CampoDeTexto, number> = {
  nome: 100,
  whatsapp: 16, // "(41) 99999-9999"
  email: 120,
  cidade: 80,
  bairro: 80,
  rua: 150,
  numero: 20,
  complemento: 80,
  ocasiao: 100,
  observacoes: 500,
};

// Ordem dos campos na tela: o primeiro com erro recebe o foco.
export const ORDEM_DOS_CAMPOS: Campo[] = [
  "nome",
  "whatsapp",
  "email",
  "aceite",
  "data",
  "hora",
  "modo",
  "cidade",
  "bairro",
  "rua",
  "numero",
  "complemento",
  "ocasiao",
  "pagamento",
  "observacoes",
];

// ---------- Nome ----------

// Nome completo: pelo menos duas palavras (nome e sobrenome).
export function nomeCompleto(texto: string): boolean {
  return texto.trim().split(/\s+/).filter(Boolean).length >= 2;
}

// ---------- WhatsApp ----------

export function soDigitos(texto: string): string {
  return texto.replace(/\D/g, "");
}

// Máscara enquanto digita: "41999998888" -> "(41) 99999-8888";
// "4133334444" -> "(41) 3333-4444". Ignora o que passar de 11 dígitos.
export function mascararWhatsApp(texto: string): string {
  const d = soDigitos(texto).slice(0, 11);
  if (d.length === 0) return "";
  if (d.length <= 2) return `(${d}`;
  const ddd = d.slice(0, 2);
  const resto = d.slice(2);
  if (resto.length <= 4) return `(${ddd}) ${resto}`;
  const corte = resto.length === 9 ? 5 : 4;
  return `(${ddd}) ${resto.slice(0, corte)}-${resto.slice(corte)}`;
}

// DDD (dois dígitos de 1 a 9) + 8 dígitos (fixo) ou 9 começando em 9
// (celular).
export function whatsAppValido(texto: string): boolean {
  const d = soDigitos(texto);
  if (!/^[1-9]{2}/.test(d)) return false;
  if (d.length === 10) return /^[2-5]/.test(d.slice(2));
  if (d.length === 11) return d[2] === "9";
  return false;
}

// ---------- E-mail ----------

export function emailValido(texto: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(texto.trim());
}

// ---------- Endereço ----------

// Texto único gravado em pedidos.endereco (e mostrado no painel), só com
// vírgulas, sem hífen como separador (PR confirmacao-e-gravacao):
// "Rua X, 412, Casa 2, Nações, Fazenda Rio Grande".
export function enderecoCompleto(
  dados: Pick<DadosCheckout, "rua" | "numero" | "complemento" | "bairro" | "cidade">
): string {
  return [dados.rua, dados.numero, dados.complemento, dados.bairro, dados.cidade]
    .map((p) => p.trim())
    .filter(Boolean)
    .join(", ");
}

// ---------- Validação ----------

export type Erros = Partial<Record<Campo, string>>;

export const MENSAGENS = {
  nomeVazio: "Conta pra gente o seu nome completo.",
  nomeIncompleto: "Informe o nome completo, com nome e sobrenome.",
  whatsappVazio: "Ops, esse campo ficou em branco. É por aqui que a gente te responde.",
  whatsappInvalido: "Confira o número: DDD + número, por exemplo (41) 99999-9999.",
  email: "Confira o e-mail: ele precisa ter @ e o domínio, por exemplo nome@email.com.",
  aceite: "Para continuar, marque que leu a Política de Privacidade.",
  dataVazia: "Escolha a data no calendário.",
  dataBloqueada: "Essa data não está mais disponível. Escolha outra no calendário.",
  horaVazia: "Escolha o horário em que precisa.",
  horaSemData: "Escolha a data primeiro, depois o horário.",
  horaInvalida: "Escolha um horário da lista.",
  modo: "Escolha se vai retirar na loja ou receber por entrega.",
  cidade: "Informe a cidade da entrega.",
  bairro: "Informe o bairro da entrega.",
  rua: "Informe a rua da entrega.",
  numero: "Informe o número (ou s/n).",
  pagamento: "Escolha a forma de pagamento.",
} as const;

export function validarCheckout(dados: DadosCheckout, hoje: string, diasOff: DiasOff): Erros {
  const erros: Erros = {};

  if (!dados.nome.trim()) erros.nome = MENSAGENS.nomeVazio;
  else if (!nomeCompleto(dados.nome)) erros.nome = MENSAGENS.nomeIncompleto;

  if (!soDigitos(dados.whatsapp)) erros.whatsapp = MENSAGENS.whatsappVazio;
  else if (!whatsAppValido(dados.whatsapp)) erros.whatsapp = MENSAGENS.whatsappInvalido;

  // E-mail é opcional; se preenchido, precisa estar no formato.
  if (dados.email.trim() && !emailValido(dados.email)) erros.email = MENSAGENS.email;

  if (dados.aceite !== true) erros.aceite = MENSAGENS.aceite;

  if (!dados.data) erros.data = MENSAGENS.dataVazia;
  else if (!dataPermitida(dados.data, hoje, diasOff)) erros.data = MENSAGENS.dataBloqueada;

  if (!dados.hora) erros.hora = dados.data ? MENSAGENS.horaVazia : MENSAGENS.horaSemData;
  else if (!dados.data || !horariosDoDia(dados.data).includes(dados.hora)) erros.hora = MENSAGENS.horaInvalida;

  if (dados.modo !== "retirada" && dados.modo !== "entrega") erros.modo = MENSAGENS.modo;
  if (dados.modo === "entrega") {
    if (!dados.cidade.trim()) erros.cidade = MENSAGENS.cidade;
    if (!dados.bairro.trim()) erros.bairro = MENSAGENS.bairro;
    if (!dados.rua.trim()) erros.rua = MENSAGENS.rua;
    if (!dados.numero.trim()) erros.numero = MENSAGENS.numero;
  }

  if (!FORMAS_PAGAMENTO.some((f) => f.valor === dados.pagamento)) erros.pagamento = MENSAGENS.pagamento;

  return erros;
}

// Campos com erro, na ordem da tela.
export function camposComErro(erros: Erros): Campo[] {
  return ORDEM_DOS_CAMPOS.filter((c) => erros[c]);
}
