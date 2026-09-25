import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Nos testes (Node puro, sem a condição "react-server" do Next), o
      // marcador server-only quebraria qualquer import de módulo de
      // servidor. No build do Next ele continua valendo de verdade.
      "server-only": path.resolve(__dirname, "./node_modules/server-only/empty.js"),
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    // A suíte inteira roda duas vezes: no fuso do servidor (UTC, Netlify e
    // Supabase) e no da loja (America/Sao_Paulo). Um teste que dependa do
    // fuso do processo falha em um dos dois (PR fuso-brasilia).
    projects: [
      { extends: true, test: { name: "fuso-utc", env: { TZ: "UTC" } } },
      { extends: true, test: { name: "fuso-brasilia", env: { TZ: "America/Sao_Paulo" } } },
    ],
  },
});
