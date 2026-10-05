// Versão da Política de Privacidade (src/app/(site)/politica-de-privacidade/
// politica.tsx), num módulo sem JSX para a configuração e o código do
// navegador lerem sem carregar o texto da página.
//
// Ela decide duas coisas além da página (PR 2 da Fase 4):
// - o banner de consentimento pergunta de novo a quem escolheu numa versão
//   diferente (src/lib/consentimento/consentimento.ts);
// - a trava de produção do GA4 (src/lib/analitica/id.ts): com versão menor
//   que 2, o build de produção nunca envia nada, mesmo com GA4_ID definida.
//   A versão 2 da Política destrava.
export const VERSAO_POLITICA = 1;
