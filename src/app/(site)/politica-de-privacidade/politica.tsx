import { LOJA, WHATSAPP } from "@/lib/site/config";

// Texto da Política de Privacidade, versão 1, em redação formal. A redação
// é do Cainan e passa por validação jurídica: nada aqui é reescrito,
// resumido ou acrescentado sem pedido dele. Só a data de vigência muda (no
// PR que levar o lote para a main).
//
// A numeração interna (2.1, 2.2...) é texto corrido do parágrafo, não
// lista. Listas de verdade (ul/li) só nas seções 4 e 6.
//
// CNPJ, endereço e WhatsApp vêm de LOJA, a mesma fonte do rodapé
// (src/lib/site/config.ts). Se algum deles mudar lá, o texto aqui muda
// junto — e a política precisa de versão nova.
//
// Esta página não lê o banco, não grava nada e não tem JavaScript próprio.

export const VERSAO_POLITICA = 1;

// "AAAA-MM-DD". Nula até o lote ir para a main: enquanto for nula, a página
// omite a frase "Vigente a partir de" e mostra só "Versão 1.". Não inventar
// data.
export const DATA_VIGENCIA_POLITICA: string | null = null;

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
const LINK_WHATSAPP = `https://wa.me/${WHATSAPP.numero}`;
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
          realiza o tratamento de dados pessoais dos usuários que efetuam pedidos por meio deste sítio eletrônico
          (&quot;Titular&quot;), em conformidade com a Lei nº 13.709/2018 (Lei Geral de Proteção de Dados Pessoais,
          &quot;LGPD&quot;).
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
          O canal de atendimento ao Titular, para o exercício de direitos e para quaisquer questões relativas ao
          tratamento de dados pessoais, é o WhatsApp{" "}
          <a href={LINK_WHATSAPP} {...EXTERNO}>
            {LOJA.telefone}
            <span className="site-visually-hidden"> (abre em nova aba)</span>
          </a>
          , durante o horário de atendimento da loja.
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
          2.2. Não são coletados números de cartão, dados bancários nem CPF. O sítio eletrônico não realiza
          processamento de pagamentos, sendo a forma de pagamento ajustada no atendimento.
        </p>
        <p>
          2.3. É registrado o endereço IP do Titular a cada tentativa de envio de pedido recebida pelo sítio
          eletrônico, ainda que o pedido não seja concluído. Tal registro tem a finalidade exclusiva de contabilizar as
          tentativas originadas de um mesmo endereço em curto período e de prevenir o uso abusivo do sítio eletrônico.
        </p>
        <p>
          2.4. Durante a montagem do pedido, o carrinho é mantido no armazenamento do navegador do Titular, a fim de
          evitar sua perda caso a página seja fechada. Os dados digitados no formulário do pedido (nome, WhatsApp,
          email, endereço, data, horário, ocasião, forma de pagamento e observações) também são mantidos no navegador,
          apenas na aba em uso, a fim de evitar sua perda caso o Titular retorne ao carrinho, e são eliminados quando a
          aba é fechada. O carrinho e o formulário permanecem no dispositivo do Titular e somente são transmitidos ao
          Controlador com a confirmação do pedido.
        </p>
        <p>
          2.5. Fotografias de referência para bolos e doces não são enviadas por meio do sítio eletrônico, devendo ser
          encaminhadas pelo Titular diretamente pelo WhatsApp.
        </p>
      </Secao>

      <Secao id="uso-dos-dados">
        <p>
          3.1. Os dados pessoais são tratados exclusivamente para receber, confirmar, produzir e entregar o pedido, bem
          como para contatar o Titular por WhatsApp ou email quando necessário ao atendimento.
        </p>
        <p>
          3.2. Os dados pessoais não são utilizados para fins publicitários, não há envio de comunicações
          promocionais, e os dados não são vendidos nem cedidos a terceiros.
        </p>
        <p>
          3.3. A base legal do tratamento dos dados do pedido é a execução de contrato, ou de procedimentos
          preliminares relacionados a contrato do qual seja parte o Titular, a pedido do próprio Titular (art. 7º,
          inciso V, da LGPD). Quanto ao endereço IP, a base legal é o legítimo interesse do Controlador na segurança do
          sítio eletrônico e na prevenção de abusos (art. 7º, inciso IX, da LGPD).
        </p>
        <p>
          3.4. A utilização dos dados para finalidade diversa, como o envio de comunicações promocionais, dependerá de
          prévia atualização desta Política e da obtenção de consentimento específico do Titular.
        </p>
      </Secao>

      <Secao id="compartilhamento">
        <p>
          Os dados pessoais são compartilhados apenas com os agentes indispensáveis ao funcionamento do sítio
          eletrônico e ao atendimento do pedido, a saber:
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
            Google (Google Fonts), que fornece a fonte dos ícones do sítio eletrônico. Ao carregar uma página, o
            navegador do Titular requisita esse recurso aos servidores do Google, que recebem o endereço IP do Titular.
          </li>
          <li>
            WhatsApp (Meta), quando o Titular envia a mensagem do pedido. A partir do envio, a conversa é regida pelas
            regras do próprio WhatsApp.
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
        <p>5.3. O endereço IP utilizado para limitar as tentativas de pedido é conservado por até 30 dias.</p>
        <p>
          5.4. A conversa mantida entre o Titular e a loja no WhatsApp permanece no aplicativo, no dispositivo da loja,
          e não é eliminada em conjunto com o pedido do sistema. O Titular poderá requerer sua eliminação por meio do
          canal indicado na seção 1.
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
          <li>a revogação do consentimento, quando este constituir a base legal do tratamento.</li>
        </ul>
        <p>
          O requerimento deverá ser dirigido ao canal indicado na seção 1. Para resguardar o próprio Titular, o
          Controlador poderá solicitar a confirmação do nome e do número de telefone utilizados no pedido. O Controlador
          responderá no prazo de até 15 dias.
        </p>
      </Secao>

      <Secao id="seguranca">
        <p>
          O acesso ao painel administrativo em que os pedidos são consultados é restrito a pessoa autorizada, mediante
          login e senha. O banco de dados admite a gravação de pedidos exclusivamente por meio do servidor do sítio
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
          Atualmente, o sítio eletrônico não utiliza cookies de publicidade nem de análise de audiência. Os únicos
          dados armazenados no navegador do Titular são o carrinho e as informações digitadas no formulário do pedido,
          descritos na seção 2.
        </p>
        <p>
          A eventual adoção de ferramentas de análise dependerá de prévia atualização desta Política e da obtenção do
          consentimento do Titular antes de sua ativação.
        </p>
      </Secao>

      <Secao id="mudancas">
        <p>
          A data de vigência desta Política consta no topo desta página. Havendo alteração relevante, esta será
          publicada nesta página, com a indicação da nova data de vigência.
        </p>
      </Secao>

      <Secao id="reclamacoes">
        <p>
          Caso entenda que o tratamento de seus dados é indevido, o Titular poderá procurar primeiramente o
          Controlador, pelo canal indicado na seção 1, sem prejuízo do direito de peticionar à ANPD, em{" "}
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
