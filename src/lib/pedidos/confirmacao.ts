import { subtotalEmCentavos, type LinhaCarrinho } from "@/lib/carrinho/regras";
import type { DadosCheckout, FormaPagamento, ModoEntrega } from "@/lib/checkout/formulario";
import { itemDaLinha, type RespostaPedido } from "./envio";
import { montarMensagem, quantidadeDaLinha, type DadosMensagem, type LinhaMensagem, type Mensagem } from "./mensagem";
import type { LinhaDoRetrato, Retrato } from "./retrato";

// Liga o checkout à confirmação (PR confirmacao-e-gravacao): monta a
// mensagem e o retrato a partir dos dados da tela e, quando o pedido foi
// registrado, dos valores devolvidos pelo servidor.

function linhasDaMensagem(linhas: LinhaCarrinho[], valores: number[]): LinhaMensagem[] {
  return linhas.map((l, i) => ({ ...itemDaLinha(l), valor_centavos: valores[i] }));
}

function dadosDaMensagem(
  dados: DadosCheckout,
  linhas: LinhaMensagem[],
  totalCentavos: number,
  numero: number | null,
  semRegistro: DadosMensagem["semRegistro"]
): DadosMensagem {
  return {
    numero,
    semRegistro,
    nome: dados.nome.trim(),
    whatsapp: dados.whatsapp.trim(),
    email: dados.email,
    modo: dados.modo as ModoEntrega,
    cidade: dados.cidade,
    bairro: dados.bairro,
    rua: dados.rua,
    numeroEndereco: dados.numero,
    complemento: dados.complemento,
    data: dados.data,
    hora: dados.hora,
    ocasiao: dados.ocasiao,
    pagamento: dados.pagamento as FormaPagamento,
    observacoes: dados.observacoes,
    linhas,
    totalCentavos,
  };
}

function valoresLocais(linhas: LinhaCarrinho[]): number[] {
  return linhas.map(subtotalEmCentavos);
}

// Caminho sem registro: saída de emergência depois de falha ("instabilidade")
// ou interruptor desligado ("desligado"). Valores do navegador, sem número.
export function mensagemSemRegistro(
  dados: DadosCheckout,
  linhas: LinhaCarrinho[],
  motivo: "instabilidade" | "desligado"
): Mensagem {
  const valores = valoresLocais(linhas);
  const total = valores.reduce((a, b) => a + b, 0);
  return montarMensagem(dadosDaMensagem(dados, linhasDaMensagem(linhas, valores), total, null, motivo));
}

function detalheDaLinha(l: LinhaCarrinho): string | null {
  if (l.tipo === "cento") {
    const s = l.sabores.filter((x) => x.quantidade > 0).map((x) => `${x.nome} ${x.quantidade}`);
    return s.length ? s.join(", ") : null;
  }
  if (l.tipo === "bolo") return `Recheio ${l.recheio.nome}, ${l.formato}`;
  if (l.tipo === "bento") return `Recheio ${l.recheio.nome}`;
  return null;
}

export function montarRetrato(args: {
  dados: DadosCheckout;
  linhas: LinhaCarrinho[];
  // null = sem registro (interruptor desligado): valores do navegador.
  resposta: RespostaPedido | null;
  prazo: { nome: string; dias: number } | null;
}): Retrato {
  const { dados, linhas, resposta, prazo } = args;
  // A mesma chave pode voltar com um pedido já gravado de um carrinho que
  // mudou depois (resposta perdida, carrinho editado, reenvio). Aí o número
  // e o total são os do pedido gravado, e o valor de cada linha fica o do
  // navegador, para não colar valor na linha errada.
  const alinhado = resposta !== null && resposta.itens.length === linhas.length;
  const valores = alinhado ? resposta.itens.map((i) => i.valor_centavos) : valoresLocais(linhas);
  const total = resposta ? resposta.total_centavos : valores.reduce((a, b) => a + b, 0);
  const mensagem = montarMensagem(
    dadosDaMensagem(dados, linhasDaMensagem(linhas, valores), total, resposta?.numero ?? null, resposta ? null : "desligado")
  );
  const linhasDoRetrato: LinhaDoRetrato[] = linhas.map((l, i) => ({
    nome: l.nome,
    quantidade: quantidadeDaLinha(itemDaLinha(l)),
    detalhe: detalheDaLinha(l),
    observacao: l.observacao,
    valor_centavos: valores[i],
  }));
  return {
    modo: resposta ? "registrado" : "sem_registro",
    numero: resposta?.numero ?? null,
    mensagem: mensagem.texto,
    formato: mensagem.formato,
    cabe: mensagem.cabe,
    linhas: linhasDoRetrato,
    totalCentavos: total,
    temBolo: linhas.some((l) => l.tipo === "bolo"),
    prazo,
    pendenteEsvaziar: !resposta,
  };
}
