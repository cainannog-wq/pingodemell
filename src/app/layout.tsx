import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
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

export const metadata: Metadata = {
  title: "Pingo de Mell — Admin",
  description: "Painel administrativo da Pingo de Mell.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable}`}>
      <head>
        {/* Fontes do design system (Merriweather, Nunito, Yellowtail e o ícone
            Material Symbols Rounded) — carregadas via <link> porque o Turbopack
            descarta @import de URL externa dentro de CSS local importado. */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;0,700;0,900;1,400&family=Nunito:ital,wght@0,400;0,600;0,700;0,800;1,400&family=Yellowtail&display=swap"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@24,400,1,0"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
