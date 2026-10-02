// A janela do limite de pedidos por IP precisa ser MENOR que o prazo de
// exclusão do IP (24 horas, privado.exclusao_constantes em
// supabase/exclusao-dados.sql). A rotina apaga a linha de
// pedidos_rate_limit 24 horas depois do início da última janela: com uma
// janela maior que isso, ela zeraria o contador de uma janela ainda ativa.
//
// Este teste falha se a janela mudar, de propósito: quem mudar
// JANELA_SEGUNDOS em src/app/api/pedidos/route.ts confere o prazo do IP e
// atualiza o valor esperado aqui. scripts/banco/exclusao-dados.mjs confere a
// mesma relação contra o banco.

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const rota = readFileSync(path.resolve(__dirname, "..", "..", "src", "app", "api", "pedidos", "route.ts"), "utf8");
const JANELA = rota
  .match(/const JANELA_SEGUNDOS = ([\d\s*]+);/)[1]
  .split("*")
  .reduce((total, fator) => total * Number(fator.trim()), 1);
const PRAZO_IP_SEGUNDOS = 24 * 3600;

describe("janela do limite por IP e prazo de exclusão do IP", () => {
  it("a janela continua de 1 hora (mudou? confira o prazo do IP)", () => {
    expect(JANELA).toBe(3600);
  });

  it("a janela é menor que o prazo de exclusão do IP (24 horas)", () => {
    expect(JANELA).toBeLessThan(PRAZO_IP_SEGUNDOS);
  });
});
