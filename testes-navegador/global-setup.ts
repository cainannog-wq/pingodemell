import { chromium } from "@playwright/test";

// Sem o Chrome instalado, falha com mensagem clara (o teste nunca pula).
export default async function conferirChrome() {
  try {
    const navegador = await chromium.launch({ channel: "chrome", headless: true });
    await navegador.close();
  } catch (erro) {
    throw new Error(
      `test:consentimento precisa do Google Chrome instalado nesta máquina (channel "chrome"); nenhum navegador é baixado. ` +
        `Instale o Chrome e rode de novo. Erro original: ${(erro as Error).message.split("\n")[0]}`
    );
  }
}
