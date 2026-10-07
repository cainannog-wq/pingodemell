import { BotaoPreferencias } from "@/components/site/consentimento/BotaoPreferencias";
import { LOJA } from "@/lib/site/config";
import { VERSAO_POLITICA } from "@/lib/site/politica-versao";
import { LINK_WHATSAPP_GERAL, atributosWhatsApp } from "@/lib/site/whatsapp";

// Texto da Política de Privacidade, versão 2, em redação formal (PR 5 da
// Fase 4). A versão 2 passa a descrever o GA4 com consentimento, os cookies
// de análise, o aviso de cookies, o Cloudflare Turnstile do login e a fonte
// de ícones servida pelo próprio site. A redação foi aprovada pelo Cainan:
// nada aqui é reescrito, resumido ou acrescentado sem pedido dele.
//
// A numeração interna (2.1, 2.2...) é texto corrido do parágrafo, não
// lista. Listas de verdade (ul/li) só nas seções 4 e 6.
//
// CNPJ, endereço, WhatsApp e o email de atendimento ao titular vêm de LOJA,
// a mesma fonte do rodapé (src/lib/site/config.ts). Se algum deles mudar
// lá, o texto aqui muda junto — e a política precisa de versão nova.
//
// Versão 3 (07/10/2026, PR de ajustes visuais): só a seção 8 mudou, o botão
// "Preferências de privacidade" saiu do rodapé e passou a ficar nesta página
// (logo depois do parágrafo que o cita). Subir a versão pergunta de novo a
// quem já tinha escolhido (decisão do Cainan).
//
// Esta página não lê o banco e não grava nada. O único JavaScript próprio é
// o botão "Preferências de privacidade" (só com o GA4 habilitado).

// A versão mora em src/lib/site/politica-versao.ts (lida também pelo banner
// de consentimento e pela trava do GA4); daqui só é repassada.
export { VERSAO_POLITICA };

// "AAAA-MM-DD": o dia do merge da versão, no calendário de Brasília. Nula,
// a página omite a frase "Vigente a partir de" e mostra só "Versão N." —
// para uma versão nova ainda sem data. Não inventar data.
export const DATA_VIGENCIA_POLITICA: string | null = "2026-10-07";

// Formata "AAAA-MM-DD" como "DD/MM/AAAA" só com texto: a data já é o dia
// de vigência, sem fuso nenhum a converter (regra do CLAUDE.md: nada de
// Date para decidir dia).
export function formatarDataVigencia(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) throw new Error(`Data de vigência inválida: ${iso} (use AAAA-MM-DD)`);
  return `${m[3]}/${m[2]}/${m[1]}`;
}

// Ids fixos das seções (âncoras do índice). Não renomear: links externos
// podem apontar para eles. Os títulos podem mudar com o texto; os ids não.
export const SECOES_POLITICA = [
  { id: "responsavel", titulo: "1. Identificação do Controlador" },
  { id: "dados-coletados", titulo: "2. Dados Pessoais Tratados" },
  { id: "uso-dos-dados", titulo: "3. Finalidades e Bases Legais" },
  { id: "compartilhamento", titulo: "4. Compartilhamento de Dados" },
  { id: "retencao", titulo: "5. Prazo de Conservação" },
  { id: "direitos", titulo: "6. Direitos do Titular" },
  { id: "seguranca", titulo: "7. Segurança da Informação" },
  { id: "cookies", titulo: "8. Cookies e Ferramentas de Análise" },
  { id: "mudancas", titulo: "9. Alterações desta Política" },
  { id: "reclamacoes", titulo: "10. Reclamações e Autoridade Nacional" },
] as const;

type IdSecao = (typeof SECOES_POLITICA)[number]["id"];

const EXTERNO = { target: "_blank", rel: "noopener noreferrer" } as const;
const LINK_ANPD = "https://www.gov.br/anpd";

function Secao({ id, children }: { id: IdSecao; children: React.ReactNode }) {
  const { titulo } = SECOES_POLITICA.find((s) => s.id === id)!;
  return (
    <section id={id} className="politica-secao" aria-labelledby={`${id}-titulo`}>
      <h2 id={`${id}-titulo`}>{titulo}</h2>
      {children}
    </section>
  );
}

export function PoliticaDePrivacidade({ dataVigencia }: { dataVigencia: string | null }) {
  return (
    <article className="politica">
      <header className="politica-topo">
        <h1>Política de Privacidade</h1>
        <p className="politica-versao">
          Versão {VERSAO_POLITICA}.
          {dataVigencia ? ` Vigente a partir de ${formatarDataVigencia(dataVigencia)}.` : null}
        </p>
        <p>
          A presente Política de Privacidade (&quot;Política&quot;) estabelece as condições em que a {LOJA.nome}{" "}
          realiza o tratamento de dados pessoais das pessoas que visitam este sítio eletrônico e dos usuários que
          efetuam pedidos por meio dele (&quot;Titular&quot;), em conformidade com a Lei nº 13.709/2018 (Lei Geral de
          Proteção de Dados Pessoais, &quot;LGPD&quot;).
        </p>
      </header>

      <nav className="politica-indice" aria-labelledby="politica-indice-rotulo">
        <p id="politica-indice-rotulo" className="politica-indice-rotulo">
          Nesta página
        </p>
        <ul>
          {SECOES_POLITICA.map((s) => (
            <li key={s.id}>
              <a href={`#${s.id}`}>{s.titulo}</a>
            </li>
          ))}
        </ul>
      </nav>

      <Secao id="responsavel">
        <p>
          O Controlador dos dados pessoais é a Yaguiu Eventos e Esporte LTDA, que atua sob o nome {LOJA.nome},
          inscrita no CNPJ sob o nº {LOJA.cnpj}, estabelecida na {LOJA.endereco}.
        </p>
        <p>
          Os canais de atendimento ao Titular, para o exercício de direitos e para quaisquer questões relativas ao
          tratamento de dados pessoais, são o WhatsApp{" "}
          <a {...atributosWhatsApp("politica", LINK_WHATSAPP_GERAL)}>
            {LOJA.telefone}
            <span className="site-visually-hidden"> (abre em nova aba)</span>
          </a>
          , durante o horário de atendimento da loja, e o correio eletrônico{" "}
          <a href={`mailto:${LOJA.emailPrivacidade}`}>{LOJA.emailPrivacidade}</a>.
        </p>
      </Secao>

      <Secao id="dados-coletados">
        <p>
          2.1. No momento da finalização do pedido, são solicitados os seguintes dados: nome, número de WhatsApp,
          endereço de correio eletrônico (campo facultativo), endereço de entrega (somente quando escolhida a
          modalidade de entrega), data e horário desejados, ocasião, forma de pagamento escolhida, observações e itens
          do pedido, com as respectivas quantidades e preços.
        </p>
        <p>
          2.2. No campo de observações, o Titular poderá informar, por sua iniciativa, dados necessários à produção do
          pedido, como alergias ou restrições alimentares, que podem constituir dados pessoais sensíveis referentes à
          saúde. Tais informações são utilizadas exclusivamente para a preparação do pedido com segurança. O Titular não
          é obrigado a informar esses dados por meio do sítio eletrônico e poderá ajustar esses dados diretamente com a
          equipe, pelo WhatsApp.
        </p>
        <p>
          2.3. Não são coletados números de cartão, dados bancários nem CPF. O sítio eletrônico não realiza
          processamento de pagamentos, sendo a forma de pagamento ajustada no atendimento.
        </p>
        <p>
          2.4. É registrado o endereço IP do Titular a cada envio de pedido, com dados válidos, recebido pelo sítio
          eletrônico, ainda que o pedido não seja concluído. Tal registro tem a finalidade exclusiva de contabilizar os
          pedidos originados de um mesmo endereço em curto período e de prevenir o uso abusivo do sítio eletrônico.
        </p>
        <p>
          2.5. Durante a montagem do pedido, o carrinho é mantido no armazenamento do navegador do Titular, a fim de
          evitar sua perda caso a página seja fechada. Os dados digitados no formulário do pedido (nome, WhatsApp,
          email, endereço, modalidade de atendimento, data, horário, ocasião, forma de pagamento, observações e a
          marcação de ciência desta Política) também são mantidos no navegador, apenas na aba em uso, a fim de evitar
          sua perda caso o Titular retorne ao carrinho, e são eliminados quando a aba é fechada. Concluído o envio do
          pedido, o navegador mantém, igualmente apenas na aba em uso, um resumo do pedido enviado (número do pedido,
          itens, valores e o texto da mensagem a ser encaminhada pelo WhatsApp), a fim de permitir ao Titular rever a
          confirmação e enviar a mensagem, acompanhado de marcas técnicas que registram se a exibição da confirmação e
          o envio já foram contabilizados pela ferramenta de análise descrita na seção 8, sendo esse resumo eliminado
          quando a aba é fechada. O navegador mantém ainda, na aba em uso, um código aleatório destinado a evitar o
          registro em duplicidade do mesmo pedido e a contagem em duplicidade de eventos de análise. O carrinho e o
          formulário permanecem no dispositivo do Titular e somente são transmitidos ao Controlador com a confirmação
          do pedido, ressalvado o disposto na seção 2.7.
        </p>
        <p>
          2.6. Fotografias de referência para bolos e doces não são enviadas por meio do sítio eletrônico, devendo ser
          encaminhadas pelo Titular diretamente pelo WhatsApp.
        </p>
        <p>
          2.7. Quando o Titular consente com o uso da ferramenta de análise descrita na seção 8, o navegador envia ao
          Google Analytics: (a) o endereço e o título de cada página visitada, sem parâmetros, exceto o filtro de
          categoria da lista de produtos, e o endereço da página anterior, limitado ao domínio quando se tratar de
          outro sítio eletrônico, de modo que, nas páginas de produto, o endereço contém o identificador do produto e o
          título da página pode conter o nome do produto; (b) o nome e o identificador do produto adicionado ao
          carrinho; e (c) a ocorrência dos eventos de início do pedido, de exibição da confirmação, de envio do pedido
          e de clique nos botões de WhatsApp, estes com a indicação da área do sítio eletrônico em que o botão se
          encontra. Não são enviados nome, WhatsApp, email, endereço, observações, número do pedido nem valores.
          Segundo a documentação do Google, o Google Analytics coleta por conta própria, independentemente do que o
          Controlador envia, um identificador do navegador, gravado em cookie, o endereço IP, do qual deduz cidade,
          região e país e descarta o endereço completo, e dados do navegador, do idioma, do aparelho e da tela do
          Titular.
        </p>
      </Secao>

      <Secao id="uso-dos-dados">
        <p>
          3.1. Os dados pessoais fornecidos no pedido são tratados exclusivamente para receber, confirmar, produzir e
          entregar o pedido, bem como para contatar o Titular por WhatsApp ou email quando necessário ao atendimento.
        </p>
        <p>
          3.2. Os dados de navegação descritos na seção 2.7 são tratados, somente com o consentimento do Titular, para
          medir de forma estatística o uso do sítio eletrônico, como as páginas mais visitadas e a quantidade de
          pedidos iniciados e enviados, a fim de melhorar o conteúdo e o funcionamento do sítio.
        </p>
        <p>
          3.3. Os dados pessoais não são utilizados para fins publicitários, não há envio de comunicações
          promocionais, e os dados não são vendidos nem cedidos a terceiros para fins publicitários. O Controlador não
          ativa os recursos de publicidade nem de personalização de anúncios da ferramenta de análise, e os dados do
          pedido não são enviados a ela.
        </p>
        <p>
          3.4. A base legal do tratamento dos dados do pedido é a execução de contrato, ou de procedimentos
          preliminares relacionados a contrato do qual seja parte o Titular, a pedido do próprio Titular (art. 7º,
          inciso V, da LGPD). Quanto ao endereço IP registrado no pedido, a base legal é o legítimo interesse do
          Controlador na segurança do sítio eletrônico e na prevenção de abusos (art. 7º, inciso IX, da LGPD). Quanto
          aos dados de navegação descritos na seção 2.7, a base legal é o consentimento do Titular (art. 7º, inciso I,
          da LGPD), que pode ser revogado a qualquer tempo na forma da seção 8.
        </p>
        <p>
          3.5. A utilização dos dados para finalidade diversa, como o envio de comunicações promocionais, dependerá de
          prévia atualização desta Política e da obtenção de consentimento específico do Titular.
        </p>
      </Secao>

      <Secao id="compartilhamento">
        <p>
          Os dados pessoais são compartilhados apenas com os agentes indispensáveis ao funcionamento do sítio
          eletrônico, ao atendimento do pedido e, quando o Titular consente, à medição de uso do sítio, a saber:
        </p>
        <ul>
          <li>
            Supabase, provedor do banco de dados em que os pedidos são armazenados, com servidores localizados em São
            Paulo.
          </li>
          <li>
            Netlify, provedor de hospedagem do sítio eletrônico, que poderá realizar o tratamento de dados em
            servidores localizados fora do Brasil.
          </li>
          <li>
            Google (Google Analytics), ferramenta de medição de uso do sítio eletrônico, ativada somente se o Titular
            aceitar o uso de cookies de análise. Ativada a ferramenta, o navegador do Titular se comunica com
            servidores do Google, que recebem os dados descritos na seção 2.7 e poderão realizar o tratamento em
            servidores localizados fora do Brasil.
          </li>
          <li>
            Cloudflare (Turnstile), serviço de verificação contra acesso automatizado, carregado apenas na página de
            acesso à área administrativa do sítio eletrônico.
          </li>
          <li>
            WhatsApp (Meta), quando o Titular envia a mensagem do pedido. A partir do envio, a conversa é regida pelas
            regras do próprio WhatsApp.
          </li>
          <li>
            Prestador de serviços de desenvolvimento e manutenção do sítio eletrônico, que, na condição de operador,
            tem acesso técnico ao banco de dados e às contas de hospedagem.
          </li>
          <li>Integrantes da equipe da {LOJA.nome} responsáveis pelo atendimento do pedido.</li>
        </ul>
        <p>
          Não há outro compartilhamento de dados, salvo em cumprimento de obrigação legal ou de ordem de autoridade
          competente.
        </p>
      </Secao>

      <Secao id="retencao">
        <p>
          5.1. Os pedidos são conservados por 12 meses, contados da data do pedido. Findo esse prazo, o pedido é
          eliminado integralmente do sistema do Controlador, incluídos os dados do cliente e os itens.
        </p>
        <p>
          5.2. Fica ressalvada a conservação por prazo superior quando exigida por obrigação legal ou regulatória,
          hipótese em que serão conservados apenas os dados necessários, pelo prazo exigido.
        </p>
        <p>
          5.3. O endereço IP utilizado para limitar as tentativas de pedido é conservado por até 30 dias, contados da
          última tentativa registrada daquele endereço.
        </p>
        <p>
          5.4. A conversa mantida entre o Titular e a loja no WhatsApp permanece no aplicativo, no dispositivo da loja,
          e não é eliminada em conjunto com o pedido do sistema. O Titular poderá requerer sua eliminação por meio de
          um dos canais indicados na seção 1.
        </p>
        <p>
          5.5. Os dados de navegação enviados à ferramenta de análise ficam disponíveis, por evento e por usuário, por
          até 14 meses. Os relatórios agregados, que não identificam o Titular, podem ser conservados sem prazo
          definido. Os cookies da ferramenta de análise têm validade de 180 dias.
        </p>
      </Secao>

      <Secao id="direitos">
        <p>Nos termos do art. 18 da LGPD, o Titular poderá requerer, a qualquer tempo:</p>
        <ul>
          <li>a confirmação da existência de tratamento de seus dados;</li>
          <li>o acesso aos dados;</li>
          <li>a correção de dados incompletos, inexatos ou desatualizados;</li>
          <li>
            a anonimização, o bloqueio ou a eliminação de dados desnecessários, excessivos ou tratados em desconformidade
            com a LGPD;
          </li>
          <li>a portabilidade dos dados a outro fornecedor de serviço ou produto, mediante requisição expressa;</li>
          <li>a informação sobre as entidades com as quais o Controlador compartilhou seus dados;</li>
          <li>a revogação do consentimento, que poderá ser feita a qualquer tempo, na forma da seção 8.</li>
        </ul>
        <p>
          A revogação do consentimento interrompe novas coletas, mas não apaga os dados já recebidos pela ferramenta de
          análise, que seguem os prazos da seção 5. Os dados de navegação não são associados a nome, WhatsApp ou email;
          por essa razão, o Controlador em regra não consegue identificar a quem pertencem, e os pedidos de acesso,
          correção ou eliminação relativos a eles poderão não ser atendidos individualmente, hipótese em que o Titular
          será informado.
        </p>
        <p>
          O requerimento deverá ser dirigido a um dos canais indicados na seção 1. Para resguardar o próprio Titular, o
          Controlador poderá solicitar a confirmação do nome e do número de telefone utilizados no pedido. O Controlador
          responderá no prazo de até 15 dias.
        </p>
      </Secao>

      <Secao id="seguranca">
        <p>
          O acesso ao painel administrativo em que os pedidos são consultados é restrito a pessoa autorizada, mediante
          login e senha e verificação contra acesso automatizado. O acesso técnico ao banco de dados e às contas de
          hospedagem é restrito ao prestador de serviços de desenvolvimento e manutenção do sítio eletrônico, descrito
          na seção 4. O banco de dados admite a gravação de pedidos exclusivamente por meio do servidor do sítio
          eletrônico, e a comunicação com o sítio eletrônico é protegida por criptografia (HTTPS).
        </p>
        <p>
          Nenhum sistema é absolutamente imune a falhas. Na hipótese de incidente de segurança que possa acarretar risco
          ou dano relevante ao Titular, o Controlador comunicará o Titular e a Autoridade Nacional de Proteção de Dados
          (ANPD), nos termos da lei.
        </p>
      </Secao>

      <Secao id="cookies">
        <p>
          O sítio eletrônico utiliza cookies de análise de audiência somente com o consentimento do Titular. O aviso
          com as opções Aceitar e Recusar é exibido sempre que a ferramenta de análise estiver habilitada no sítio
          eletrônico. Enquanto o Titular não escolher, nenhum cookie de análise é gravado e nenhum dado é enviado ao
          Google.
        </p>
        <p>
          Se o Titular aceitar, a ferramenta Google Analytics grava no navegador dois cookies, denominados _ga e _ga_
          seguido do código da propriedade de medição, com validade de 180 dias, para distinguir visitantes e medir o
          uso do sítio eletrônico, na forma descrita na seção 2.7. O Controlador não utiliza cookies de publicidade, não
          ativa os recursos de publicidade e de sinais do Google e não utiliza identificação de usuário.
        </p>
        <p>
          O Titular pode alterar sua escolha a qualquer tempo, pelo botão &quot;Preferências de privacidade&quot;,
          disponível nesta página sempre que a ferramenta de análise estiver habilitada. Se o Titular
          revogar um aceite anterior, a página é recarregada e os cookies da ferramenta de análise são apagados do
          navegador. Em qualquer caso, depois da recusa novas coletas deixam de ocorrer. A escolha é registrada no
          armazenamento do navegador e vale por 180 dias; depois desse prazo, ou quando esta Política for alterada de
          modo que exija nova escolha, o aviso é exibido novamente.
        </p>
        <BotaoPreferencias />
        <p>
          Os demais dados armazenados no navegador, descritos na seção 2.5, são necessários ao funcionamento do
          carrinho e do pedido e são gravados independentemente dessa escolha.
        </p>
      </Secao>

      <Secao id="mudancas">
        <p>
          A versão e a data de vigência desta Política constam no topo desta página. Havendo alteração relevante, esta
          será publicada nesta página, com a indicação da nova versão e da nova data de vigência. Quando a alteração
          modificar as finalidades, as ferramentas ou os terceiros descritos nesta Política, o aviso de cookies será
          exibido novamente ao Titular.
        </p>
      </Secao>

      <Secao id="reclamacoes">
        <p>
          Caso entenda que o tratamento de seus dados é indevido, o Titular poderá procurar primeiramente o
          Controlador, por um dos canais indicados na seção 1, sem prejuízo do direito de peticionar à ANPD, em{" "}
          <a href={LINK_ANPD} {...EXTERNO}>
            gov.br/anpd
            <span className="site-visually-hidden"> (abre em nova aba)</span>
          </a>
          .
        </p>
      </Secao>
    </article>
  );
}
