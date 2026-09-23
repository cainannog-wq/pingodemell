// Configuração única do site público: dados reais da loja, WhatsApp e
// imagens dos tiles de categoria. Tudo que o cabeçalho, o rodapé, o menu
// mobile e a Home precisam de "dado da loja" sai daqui, pra trocar num
// lugar só.

import type { CategoriaProduto } from "@/lib/produtos/types";

export const LOJA = {
  nome: "Pingo de Mell",
  endereco: "Rua das Acácias, 412, Nações, Fazenda Rio Grande/PR",
  enderecoCurto: "Rua das Acácias, 412, Nações",
  horario: "Terça a sábado, 9h às 18h · domingo, 9h às 15h",
  horarioAtendimento:
    "Terça a sábado, 9h às 18h · domingo, 9h às 15h · segunda fechado. Fim de semana: peça até quinta.",
  telefone: "(41) 98800-2315",
  instagram: "@pingodemell.frg",
  cnpj: "22.066.065/0001-72",
  avaliacoesGoogleUrl:
    "https://www.google.com/search?q=pingo+de+mell#lrd=0x94dc5570c97917bd:0x6afc7f109f7f4b13,1",
} as const;

export const WHATSAPP = {
  // Só dígitos, com DDI 55 + DDD 41 — formato exigido pelo wa.me.
  numero: "5541988002315",
  // Mensagem de contato geral (botão flutuante, hero e menu mobile). A
  // mensagem de PEDIDO, gerada na página de Confirmação, é outra coisa e
  // vai morar junto do fluxo de checkout.
  mensagemContato: "Olá, vim do site da Pingo de Mell e gostaria de fazer um pedido.",
} as const;

// Tiles de "O que você vai encontrar". A ordem aqui é a ordem na tela.
// `imagem: null` mostra o fundo da marca, sem foto (caso de Bebidas até
// existir foto própria — basta preencher `imagem` e `alt` aqui).
export type TileCategoria = {
  categoria: CategoriaProduto;
  rotulo: string;
  imagem: string | null;
  alt: string;
};

export const TILES_CATEGORIA: TileCategoria[] = [
  { categoria: "Bolos", rotulo: "Bolos", imagem: "/fotos/cat-bolos.jpeg", alt: "Bolo de três andares com rosas vermelhas" },
  { categoria: "Doces", rotulo: "Doces", imagem: "/fotos/cat-doces-tradicionais.jpeg", alt: "Caixa de brigadeiros, beijinhos e casadinhos" },
  { categoria: "Salgados", rotulo: "Salgados", imagem: "/fotos/cat-salgados.jpeg", alt: "Bandeja de empadas e mini pizzas" },
  { categoria: "Bebidas", rotulo: "Bebidas", imagem: null, alt: "" },
];
