import type { Metadata } from "next";
import { Geist, Geist_Mono, Merriweather, Nunito, Yellowtail } from "next/font/google";
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
// 22/09/2026 em docs/status-pingo-de-mell.md). As CSS custom properties
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
  title: "Pingo de Mell — Admin",
  description: "Painel administrativo da Pingo de Mell.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} ${merriweather.variable} ${nunito.variable} ${yellowtail.variable}`}
    >
      <head>
        {/* Material Symbols Rounded (ícones) não é servível pelo next/font/google
            (fonte de eixo variável de uso especial, fora da lista suportada pelo
            carregador) — preconnect + display=swap reduz o impacto do <link>
            continuar externo, mantendo o comportamento atual do Icon.tsx
            (font-variation-settings inline). */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0&display=swap"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
