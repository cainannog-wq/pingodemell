import type { Metadata } from "next";
import { Geist, Geist_Mono, Merriweather, Nunito, Yellowtail } from "next/font/google";
import { fonteIcones } from "@/fonts/icones";
import { SITE_INDEXAVEL, metadataRobots } from "@/lib/site/indexacao";
import { SEO_SITE } from "@/lib/site/seo";
import { SITE_URL } from "@/lib/site/url";
import "@/styles/ds/styles.css";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// Fontes do design system, auto-hospedadas pelo next/font/google: baixadas
// em build time e servidas pela própria origem, sem <link> pra
// fonts.googleapis.com (que bloqueava a renderização — diagnóstico de
// 22/09/2026 em docs/status-pingo-de-mell.md). Os ícones também são da
// própria origem: subconjunto por next/font/local (src/fonts/icones.ts).
// As CSS custom properties
// geradas (--font-merriweather etc.) são consumidas em
// src/styles/ds/tokens/typography.css.
const merriweather = Merriweather({
  variable: "--font-merriweather",
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
});

const nunito = Nunito({
  variable: "--font-nunito",
  subsets: ["latin"],
  weight: ["400", "600", "700", "800"],
  style: ["normal", "italic"],
  display: "swap",
});

const yellowtail = Yellowtail({
  variable: "--font-yellowtail",
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  // Endereço base para os metadados com caminho relativo (src/lib/site/url.ts).
  metadataBase: new URL(SITE_URL),
  // Título e descrição padrão do site. Canonical e Open Graph ficam em cada
  // página indexável (metadadosIndexaveis), nunca aqui: senão as páginas
  // noindex herdariam.
  title: SEO_SITE.titulo,
  description: SEO_SITE.descricao,
  // Trava de indexação (src/lib/site/indexacao.ts): herdada por toda página
  // sem robots próprio.
  robots: metadataRobots(SITE_INDEXAVEL),
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${merriweather.variable} ${nunito.variable} ${yellowtail.variable} ${fonteIcones.variable}`}
    >
      <body>{children}</body>
    </html>
  );
}
