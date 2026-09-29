import type { LinhaCarrinho } from "@/lib/carrinho/regras";
import { VAZIO, type DadosCheckout } from "@/lib/checkout/formulario";
import fixtura from "./fixtura-valores.json";

// Dados de teste compartilhados pelos testes de pedido (só testes importam
// este arquivo). Nome e contato fictícios.

export const FIXTURA_VALORES = fixtura;
export const LINHAS_TESTE = fixtura.linhas as unknown as LinhaCarrinho[];

export const DADOS_TESTE: DadosCheckout = {
  ...VAZIO,
  nome: "Juliana Ribeiro Teste",
  whatsapp: "(41) 99712-4408",
  email: "juliana.teste@exemplo.com",
  aceite: true,
  data: "2026-10-17",
  hora: "14:00",
  modo: "entrega",
  cidade: "Fazenda Rio Grande",
  bairro: "Nações",
  rua: "Rua das Cerejeiras",
  numero: "88",
  complemento: "Casa dos fundos",
  ocasiao: "Aniversário de 5 anos",
  pagamento: "pix",
  observacoes: "A festa é no salão do condomínio.",
};

export const CHAVE_TESTE = "0f8a3b1c-2d4e-4f60-8a7b-9c0d1e2f3a4b";
