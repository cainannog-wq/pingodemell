import { LOJA, WHATSAPP } from "@/lib/site/config";

// Texto da Política de Privacidade, versão 1. A redação é do Cainan e
// passa por validação jurídica: nada aqui é reescrito, resumido ou
// acrescentado sem pedido dele. Só a data de vigência muda (no PR que levar
// o lote para a main).
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
// podem apontar para eles.
export const SECOES_POLITICA = [
  { id: "responsavel", titulo: "1. Quem é o responsável" },
  { id: "dados-coletados", titulo: "2. Quais dados coletamos" },
  { id: "uso-dos-dados", titulo: "3. Para que usamos seus dados" },
  { id: "compartilhamento", titulo: "4. Com quem compartilhamos" },
  { id: "retencao", titulo: "5. Por quanto tempo guardamos" },
  { id: "direitos", titulo: "6. Seus direitos" },
  { id: "seguranca", titulo: "7. Como protegemos seus dados" },
  { id: "cookies", titulo: "8. Cookies e ferramentas de análise" },
  { id: "mudancas", titulo: "9. Mudanças nesta política" },
  { id: "reclamacoes", titulo: "10. Reclamações" },
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
          Esta política explica como a {LOJA.nome} trata os dados pessoais de quem faz um pedido pelo nosso site, de
          acordo com a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).
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
          O responsável pelos seus dados é a Yaguiu Eventos e Esporte LTDA, que atua como {LOJA.nome}, CNPJ{" "}
          {LOJA.cnpj}, {LOJA.endereco}.
        </p>
        <p>
          Para qualquer assunto sobre seus dados, fale com a gente pelo WhatsApp{" "}
          <a href={LINK_WHATSAPP} {...EXTERNO}>
            {LOJA.telefone}
            <span className="site-visually-hidden"> (abre em nova aba)</span>
          </a>
          , no horário de atendimento da loja.
        </p>
      </Secao>

      <Secao id="dados-coletados">
        <p>
          Quando você finaliza um pedido, pedimos: nome, número de WhatsApp, email (opcional), endereço de entrega (só
          se você escolher entrega), data e horário desejados, ocasião, forma de pagamento escolhida, observações e os
          itens do pedido, com quantidades e preços.
        </p>
        <p>
          Não coletamos número de cartão, dados bancários nem CPF. O site não processa pagamento: a forma de pagar é
          combinada no atendimento.
        </p>
        <p>
          Também guardamos o seu endereço IP cada vez que o site recebe uma tentativa de enviar pedido, mesmo quando o
          pedido não é concluído. Ele serve apenas para contar quantos pedidos partem de um mesmo endereço em um curto
          período e barrar uso abusivo do site.
        </p>
        <p>
          Enquanto você monta o pedido, o carrinho fica salvo no armazenamento do seu próprio navegador, para não se
          perder se você fechar a página.
        </p>
        <p>
          O que você digita no formulário do pedido (nome, WhatsApp, email, endereço, data, horário, ocasião, forma de
          pagamento e observações) também fica guardado no seu navegador, apenas nesta aba, para não se perder se você
          voltar ao carrinho. Esses dados somem quando você fecha a aba.
        </p>
        <p>
          O carrinho e o formulário ficam no seu aparelho e só chegam até nós quando você confirma o pedido.
        </p>
        <p>
          Fotos de referência para bolos e doces não são enviadas pelo site. Você as manda direto pelo WhatsApp.
        </p>
      </Secao>

      <Secao id="uso-dos-dados">
        <p>
          Usamos seus dados somente para receber, confirmar, produzir e entregar o seu pedido, e para falar com você
          sobre ele por WhatsApp ou email quando for preciso.
        </p>
        <p>
          Não usamos seus dados para propaganda, não enviamos promoções e não vendemos nem cedemos seus dados a
          terceiros.
        </p>
        <p>
          A base legal é a execução do pedido que você pediu para fazer, incluindo os passos anteriores a ele (LGPD,
          art. 7º, inciso V). Para o endereço IP, a base é o legítimo interesse da loja em proteger o site contra abuso
          (art. 7º, inciso IX).
        </p>
        <p>
          Se um dia quisermos usar seus dados para outra finalidade, como enviar promoções, vamos atualizar esta
          política e pedir o seu consentimento antes.
        </p>
      </Secao>

      <Secao id="compartilhamento">
        <p>Compartilhamos dados apenas com quem é necessário para o site e o pedido funcionarem:</p>
        <ul>
          <li>Supabase, serviço onde os pedidos são guardados. Os servidores ficam em São Paulo.</li>
          <li>Netlify, serviço que hospeda o site. Pode processar dados em servidores fora do Brasil.</li>
          <li>
            Google (Google Fonts), que fornece a fonte dos ícones do site. Ao abrir uma página, o seu navegador busca
            essa fonte nos servidores do Google, que recebem o seu endereço IP.
          </li>
          <li>
            WhatsApp (Meta), quando você envia a mensagem do pedido. A partir desse envio, a conversa segue as regras
            do próprio WhatsApp.
          </li>
          <li>As pessoas da equipe da {LOJA.nome} que atendem o seu pedido.</li>
        </ul>
        <p>Fora isso, só compartilhamos dados se uma ordem legal exigir.</p>
      </Secao>

      <Secao id="retencao">
        <p>
          Os pedidos ficam guardados por 12 meses, contados da data do pedido. Depois disso, o pedido é apagado por
          inteiro do nosso sistema, com os dados do cliente e os itens. Se uma lei exigir que algum dado seja guardado
          por mais tempo, guardamos só o que ela exige, pelo tempo que ela exige.
        </p>
        <p>O endereço IP usado para limitar pedidos é guardado por até 30 dias.</p>
        <p>
          A conversa que você tem com a loja no WhatsApp fica no aplicativo, no aparelho da loja, e não é apagada junto
          com o pedido do sistema. Se você quiser que ela seja apagada, peça pelo contato da seção 1.
        </p>
      </Secao>

      <Secao id="direitos">
        <p>Você pode pedir, a qualquer momento:</p>
        <ul>
          <li>confirmar que tratamos seus dados;</li>
          <li>ter acesso a eles;</li>
          <li>corrigir dados incompletos ou errados;</li>
          <li>apagar dados que não precisamos mais guardar;</li>
          <li>receber seus dados em formato que possa levar a outro serviço;</li>
          <li>saber com quem compartilhamos seus dados;</li>
          <li>retirar um consentimento que tenha dado, quando houver.</li>
        </ul>
        <p>
          Faça o pedido pelo WhatsApp indicado na seção 1. Para proteger você, podemos pedir que confirme o nome e o
          número usados no pedido. Respondemos em até 15 dias.
        </p>
      </Secao>

      <Secao id="seguranca">
        <p>
          O acesso ao painel onde os pedidos aparecem é restrito, com login e senha de uma pessoa autorizada. O banco
          de dados só aceita gravação de pedidos pelo servidor do site, e a conexão com o site é criptografada (HTTPS).
        </p>
        <p>
          Nenhum sistema é totalmente imune a falhas. Se acontecer um incidente que possa causar risco relevante a você,
          avisamos você e a Autoridade Nacional de Proteção de Dados (ANPD), como a lei manda.
        </p>
      </Secao>

      <Secao id="cookies">
        <p>
          Hoje o site não usa cookies de publicidade nem de análise de audiência. Os únicos dados guardados no seu
          navegador são o carrinho e o que você digita no formulário do pedido, explicados na seção 2.
        </p>
        <p>
          Se passarmos a usar ferramentas de análise, vamos atualizar esta política e pedir o seu consentimento antes
          de ativar essas ferramentas.
        </p>
      </Secao>

      <Secao id="mudancas">
        <p>
          A data de vigência fica no topo desta página. Quando houver mudança relevante, ela aparece aqui com a nova
          data.
        </p>
      </Secao>

      <Secao id="reclamacoes">
        <p>
          Se você achar que tratamos seus dados de forma indevida, fale primeiro com a gente pelo contato da seção 1.
          Você também pode reclamar à ANPD, em{" "}
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
