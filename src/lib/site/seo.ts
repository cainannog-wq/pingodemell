// Textos de SEO e metadados comuns das páginas indexáveis (PR
// fase4/seo-metadados). Os textos vêm do Cainan; seo.test.ts confere o
// tamanho (título até 72, descrição até 160) e que nenhum tem hífen nem
// travessão.

import type { Metadata } from "next";
import type { CategoriaProduto } from "@/lib/produtos/types";
import { LOJA } from "./config";
import { urlDoSite } from "./url";

export type TextoSeo = { titulo: string; descricao: string };

// Título e descrição padrão do site: layout raiz e Home.
export const SEO_SITE: TextoSeo = {
  titulo: "Pingo de Mell | Bolos e doces em Fazenda Rio Grande e Curitiba",
  descricao:
    "Bolos de aniversário, doces e salgados artesanais para festas em Fazenda Rio Grande e Curitiba. Monte seu pedido no site e finalize pelo WhatsApp.",
};

// Lista filtrada por categoria (/produtos?categoria=...). Só vale para
// categoria com pelo menos 1 produto ativo e disponível; sem produto, a
// Lista usa o título e a descrição dela.
export const SEO_CATEGORIAS: Record<CategoriaProduto, TextoSeo> = {
  Bolos: {
    titulo: "Bolos de aniversário em Fazenda Rio Grande e Curitiba | Pingo de Mell",
    descricao:
      "Bolos de aniversário artesanais com recheio à sua escolha, para Fazenda Rio Grande e Curitiba. Monte seu pedido no site e finalize pelo WhatsApp.",
  },
  Doces: {
    titulo: "Doces para festas em Fazenda Rio Grande e Curitiba | Pingo de Mell",
    descricao:
      "Doces artesanais para festas e aniversários em Fazenda Rio Grande e Curitiba. Monte seu pedido no site e finalize pelo WhatsApp.",
  },
  Salgados: {
    titulo: "Salgados para festas em Fazenda Rio Grande e Curitiba | Pingo de Mell",
    descricao:
      "Salgados artesanais, fritos e assados, para festas em Fazenda Rio Grande e Curitiba. Peça por unidade ou por cento e finalize pelo WhatsApp.",
  },
  Bebidas: {
    titulo: "Bebidas em Fazenda Rio Grande e Curitiba | Pingo de Mell",
    descricao:
      "Bebidas para acompanhar o seu pedido na Pingo de Mell, em Fazenda Rio Grande e Curitiba. Finalize pelo WhatsApp.",
  },
  Kits: {
    titulo: "Kits de festa em Fazenda Rio Grande e Curitiba | Pingo de Mell",
    descricao:
      "Kits de festa com doces e salgados artesanais em Fazenda Rio Grande e Curitiba. Monte seu pedido no site e finalize pelo WhatsApp.",
  },
  "Bento Cake": {
    titulo: "Bento Cake em Fazenda Rio Grande e Curitiba | Pingo de Mell",
    descricao:
      "Bento Cake personalizado com tema e recheio à sua escolha, em Fazenda Rio Grande e Curitiba. Monte seu pedido e finalize pelo WhatsApp.",
  },
};

// Imagem do Open Graph das páginas sem foto própria (arquivo de public/).
export const IMAGEM_PADRAO = "/fotos/hero-principal.jpeg";

// Canonical e Open Graph de uma página indexável. `caminho` é o caminho
// canônico, sem parâmetro que não seja o da categoria (nunca ?editar).
// `imagem`: endereço absoluto (capa do produto) ou caminho de public/.
// Páginas noindex (carrinho, checkout, confirmação, Política, login e
// admin) não usam isto.
export function metadadosIndexaveis({
  titulo,
  descricao,
  caminho,
  imagem = IMAGEM_PADRAO,
}: TextoSeo & { caminho: string; imagem?: string }): Metadata {
  const url = urlDoSite(caminho);
  return {
    title: titulo,
    description: descricao,
    alternates: { canonical: url },
    openGraph: {
      title: titulo,
      description: descricao,
      url,
      siteName: LOJA.nome,
      locale: "pt_BR",
      type: "website",
      images: [{ url: /^https?:\/\//.test(imagem) ? imagem : urlDoSite(imagem) }],
    },
  };
}
