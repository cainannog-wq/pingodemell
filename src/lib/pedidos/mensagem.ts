import { rotuloHorario, dataCompleta } from "@/lib/checkout/datas";
import { FORMAS_PAGAMENTO, type FormaPagamento, type ModoEntrega } from "@/lib/checkout/formulario";
import { formatMoeda } from "@/lib/pedidos/format";
import { linkWhatsApp } from "@/lib/site/whatsapp";
import type { ItemEnvio } from "./envio";

// Mensagem do pedido para o WhatsApp da loja (PR confirmacao-e-gravacao).
// Primeira pessoa da cliente, sem emoji, sem hífen como separador nem
// marcador de lista. Valores sempre de centavos inteiros (formatMoeda).
//
// Os valores de cada linha e o total vêm da resposta do servidor quando o
// pedido foi registrado (a tela e o painel nunca divergem). No caminho sem
// registro, vêm da mesma conta feita no navegador.
//
// Orçamento: a URL do wa.me JÁ CODIFICADA (acento e quebra de linha incham a
// codificação) até ORCAMENTO_URL. Cabe o completo: vai o completo. Senão o
// curto; senão o mínimo. Nunca corta texto no meio. Sem registro não há
// número para "Detalhes completos no pedido nº X": vai sempre o completo, e
// a tela destaca "Copiar mensagem" quando passar do orçamento.

export const ORCAMENTO_URL = 3000;

export const TEXTO_ENTREGA_DECORACAO =
  "O valor da entrega e o da decoração são informados no atendimento, e o total pode mudar.";
export const TEXTO_FOTO = "Se eu tiver foto de referência, mando nesta conversa.";
export const TEXTO_INSTABILIDADE = "Pedido não registrado no site, por instabilidade.";

export type LinhaMensagem = ItemEnvio & { valor_centavos: number };

export type DadosMensagem = {
  // null = sem registro.
  numero: number | null;
  // Sem registro: "instabilidade" (saída de emergência) acrescenta a linha
  // de instabilidade; "desligado" (interruptor) não.
  semRegistro: "instabilidade" | "desligado" | null;
  nome: string;
  whatsapp: string;
  email: string;
  modo: ModoEntrega;
  cidade: string;
  bairro: string;
  rua: string;
  numeroEndereco: string;
  complemento: string;
  data: string;
  hora: string;
  ocasiao: string;
  pagamento: FormaPagamento;
  observacoes: string;
  linhas: LinhaMensagem[];
  totalCentavos: number;
};

export type Formato = "completo" | "curto" | "minimo";
export type Mensagem = { texto: string; url: string; formato: Formato; cabe: boolean };

const reais = (centavos: number) => formatMoeda(centavos / 100);

// "50 un", "2 kg", "3 caixas": avulso na unidade de venda; sem unidade (ou
// "unidade") vira "un".
function quantidadeAvulso(quantidade: number, unidade: string | null): string {
  const u = unidade?.trim().toLowerCase();
  if (!u || u === "unidade" || u === "unidades" || u === "un") return `${quantidade} un`;
  return `${quantidade} ${unidade!.trim()}`;
}

export function quantidadeDaLinha(l: ItemEnvio): string {
  if (l.tipo === "cento") return `${l.quantidade} ${l.quantidade === 1 ? "cento" : "centos"}`;
  if (l.tipo === "bolo") return `${l.quantidade} kg`;
  if (l.tipo === "bento") return `${l.quantidade} un`;
  return quantidadeAvulso(l.quantidade, l.unidade_venda);
}

function linhaCompleta(l: LinhaMensagem, i: number): string[] {
  const valor = reais(l.valor_centavos);
  const saida: string[] = [];
  if (l.tipo === "cento") {
    saida.push(`${i}. ${l.nome}, ${quantidadeDaLinha(l)}, ${valor}`);
    const sabores = l.sabores.filter((s) => s.quantidade > 0).map((s) => `${s.nome} ${s.quantidade}`);
    if (sabores.length) saida.push(`   Sabores: ${sabores.join(", ")}`);
  } else if (l.tipo === "bolo") {
    saida.push(`${i}. ${l.nome}, recheio ${l.recheio.nome}, ${l.quantidade} kg, ${l.formato}, ${valor} (valor base, sem decoração)`);
  } else if (l.tipo === "bento") {
    saida.push(`${i}. ${l.nome}, recheio ${l.recheio.nome}, ${quantidadeDaLinha(l)}, ${valor}`);
  } else {
    saida.push(`${i}. ${l.nome}, ${quantidadeDaLinha(l)}, ${valor}`);
  }
  if (l.observacao) saida.push(`   Obs.: ${l.observacao}`);
  return saida;
}

export function enderecoDaMensagem(d: Pick<DadosMensagem, "rua" | "numeroEndereco" | "complemento" | "bairro" | "cidade">): string {
  return [d.rua, d.numeroEndereco, d.complemento, d.bairro, d.cidade].map((p) => p.trim()).filter(Boolean).join(", ");
}

function dataEHora(d: DadosMensagem): string {
  return `Data: ${dataCompleta(d.data)}, às ${rotuloHorario(d.hora)}`;
}

function abertura(d: DadosMensagem): string[] {
  if (d.numero !== null) return [`Olá! Fiz o pedido nº ${d.numero} pelo site.`];
  return d.semRegistro === "instabilidade"
    ? ["Olá! Quero fazer um pedido pelo site.", TEXTO_INSTABILIDADE]
    : ["Olá! Quero fazer um pedido pelo site."];
}

export function textoCompleto(d: DadosMensagem): string {
  const pagamento = FORMAS_PAGAMENTO.find((f) => f.valor === d.pagamento)?.rotulo ?? d.pagamento;
  return [
    ...abertura(d),
    "",
    "Meus dados",
    `Nome: ${d.nome}`,
    `WhatsApp: ${d.whatsapp}`,
    ...(d.email.trim() ? [`E-mail: ${d.email.trim()}`] : []),
    "",
    "Itens",
    ...d.linhas.flatMap((l, i) => linhaCompleta(l, i + 1)),
    "",
    d.modo === "entrega" ? `Entrega em: ${enderecoDaMensagem(d)}` : "Retirada na loja",
    dataEHora(d),
    ...(d.ocasiao.trim() ? [`Ocasião: ${d.ocasiao.trim()}`] : []),
    `Pagamento: ${pagamento}`,
    ...(d.observacoes.trim() ? [`Observações: ${d.observacoes.trim()}`] : []),
    "",
    `Total dos itens: ${reais(d.totalCentavos)}`,
    TEXTO_ENTREGA_DECORACAO,
    TEXTO_FOTO,
  ].join("\n");
}

function entregaCurta(d: DadosMensagem): string {
  if (d.modo === "retirada") return "Retirada";
  const lugar = [d.bairro, d.cidade].map((p) => p.trim()).filter(Boolean).join(", ");
  return `Entrega em: ${lugar}`;
}

function cabecalhoCurto(d: DadosMensagem): string[] {
  return [`Olá! Fiz o pedido nº ${d.numero} pelo site.`, "", `Nome: ${d.nome}`, `WhatsApp: ${d.whatsapp}`, dataEHora(d), entregaCurta(d)];
}

function rodapeCurto(d: DadosMensagem): string[] {
  return ["", `Total dos itens: ${reais(d.totalCentavos)}`, TEXTO_ENTREGA_DECORACAO, "", `Detalhes completos no pedido nº ${d.numero}.`];
}

export function textoCurto(d: DadosMensagem): string {
  return [...cabecalhoCurto(d), "", "Itens", ...d.linhas.map((l) => `${l.nome}, ${quantidadeDaLinha(l)}`), ...rodapeCurto(d)].join("\n");
}

export function textoMinimo(d: DadosMensagem): string {
  const n = d.linhas.length;
  return [...cabecalhoCurto(d), `Itens: ${n} ${n === 1 ? "item" : "itens"} no pedido`, ...rodapeCurto(d)].join("\n");
}

export function tamanhoDaUrl(texto: string): number {
  return linkWhatsApp(texto).length;
}

export function montarMensagem(d: DadosMensagem): Mensagem {
  const candidatos: [Formato, string][] =
    d.numero === null
      ? [["completo", textoCompleto(d)]]
      : [
          ["completo", textoCompleto(d)],
          ["curto", textoCurto(d)],
          ["minimo", textoMinimo(d)],
        ];
  for (const [formato, texto] of candidatos) {
    const url = linkWhatsApp(texto);
    if (url.length <= ORCAMENTO_URL) return { texto, url, formato, cabe: true };
  }
  const [formato, texto] = candidatos[candidatos.length - 1];
  return { texto, url: linkWhatsApp(texto), formato, cabe: false };
}
