import { vi } from "vitest";

// Prova de que os testes não dependem do relógio real (PR fuso-brasilia):
// com RELOGIO_TESTE=<instante ISO> na linha de comando, toda a suíte roda com
// a data do processo fixada nesse instante (e andando dali em diante). Os
// testes que fixam o próprio relógio continuam mandando no deles.
//   RELOGIO_TESTE=2026-09-28T01:00:00Z npm run test   (domingo 22h de Brasília)
const relogio = process.env.RELOGIO_TESTE;
if (relogio) {
  vi.useFakeTimers({ toFake: ["Date"], shouldAdvanceTime: true });
  vi.setSystemTime(new Date(relogio));
}
