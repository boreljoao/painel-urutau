import { CONTATO_PRIVACIDADE, PaginaLegal } from "../legal";

export const metadata = { title: "Política de privacidade" };

export default function Privacidade() {
  const email = (
    <a className="link" href={`mailto:${CONTATO_PRIVACIDADE}`}>
      {CONTATO_PRIVACIDADE}
    </a>
  );
  return (
    <PaginaLegal titulo="Política de privacidade">
      <p>
        Esta política explica quais dados o Painel Urutau guarda, para quê, com quem eles passam e como você pede para ver, corrigir ou apagar. Ela segue a Lei
        Geral de Proteção de Dados (Lei 13.709/2018).
      </p>

      <h2>Quem cuida dos dados</h2>
      <p>
        A Urutau, de Maricá (RJ), é a controladora dos dados da sua conta. Sobre os dados dos clientes e pacientes que a sua empresa lança, a sua empresa é a
        controladora e a Urutau é a operadora. O contato para qualquer assunto de privacidade, inclusive com o encarregado, é {email}.
      </p>

      <h2>O que guardamos</h2>
      <ul>
        <li>
          <strong>Da sua conta:</strong> nome, e-mail e a senha, guardada embaralhada (nem nós conseguimos ler). Guardamos também a data de criação, a
          versão dos termos que você aceitou, a última vez que o painel esteve aberto e em qual tela.
        </li>
        <li>
          <strong>Da sua empresa:</strong> nome, ramo, regime de imposto, cidade, e tudo o que você lança: vendas, despesas, contas, clientes, agenda e
          observações.
        </li>
        <li>
          <strong>Dos seus clientes e pacientes:</strong> o que você cadastra (nome, telefone, e-mail, CPF ou CNPJ, compras, horários) e, se ligar o
          atendente, as mensagens trocadas pelo WhatsApp.
        </li>
        <li>
          <strong>Das opiniões:</strong> o texto que você manda pelo botão "Dar opinião", a tela de onde mandou e, se você deixar, o contato para resposta.
        </li>
        <li>
          <strong>Registro de ações:</strong> quem criou, mudou ou apagou o quê, e quando, para você conferir e para a nossa segurança.
        </li>
      </ul>
      <p>Não usamos cookies de propaganda nem de rastreamento. O único cookie é o da sessão, que mantém você conectado.</p>

      <h2>Para quê</h2>
      <ul>
        <li>Fazer o painel funcionar e mostrar os seus números. Base legal: a execução do contrato com você.</li>
        <li>Dar suporte, avisar sobre mudanças e responder às suas opiniões. Base legal: execução do contrato e legítimo interesse.</li>
        <li>Proteger as contas e investigar abusos. Base legal: legítimo interesse e cumprimento de obrigação legal.</li>
        <li>Melhorar o painel olhando como ele é usado. Nunca vendemos os seus dados nem os usamos para propaganda de terceiros.</li>
      </ul>

      <h2>Com quem os dados passam</h2>
      <ul>
        <li><strong>Vercel</strong>, que hospeda o painel.</li>
        <li><strong>Neon</strong>, que guarda o banco de dados.</li>
        <li>
          <strong>Anthropic</strong>, que fornece a inteligência artificial do atendente no WhatsApp e da sugestão de ramo. Ela recebe só o necessário para
          responder (a conversa e as informações da empresa que o atendente usa) e não usa esses dados para treinar os modelos.
        </li>
        <li><strong>Meta (WhatsApp)</strong>, quando você liga o atendente: as mensagens passam pelo WhatsApp.</li>
        <li>A equipe Urutau, para dar suporte e acompanhar a sua empresa no painel interno.</li>
        <li>Autoridades, só quando a lei ou uma ordem judicial exigir.</li>
      </ul>
      <p>
        Alguns desses fornecedores guardam os dados fora do Brasil, em países como os Estados Unidos. A transferência segue o que a LGPD permite para
        cumprir o contrato com você, com fornecedores que se comprometem com a proteção dos dados.
      </p>

      <h2>Por quanto tempo</h2>
      <ul>
        <li>Enquanto a conta existir. Ao pedir para apagar, apagamos a conta e os dados da empresa em até 30 dias.</li>
        <li>O que a lei obriga a guardar (por exemplo, para fins fiscais) fica guardado pelo prazo da lei e depois é apagado.</li>
        <li>O painel de exemplo e a conta de visitante são apagados sozinhos em até um dia.</li>
      </ul>

      <h2>Os seus direitos</h2>
      <p>
        Você pode pedir a qualquer momento: confirmação de que tratamos seus dados, acesso a eles, correção, uma cópia para levar a outro serviço, a exclusão,
        informação sobre com quem compartilhamos e a revisão do seu consentimento. Escreva para {email}. Respondemos em até 15 dias. Se o pedido for de um
        cliente ou paciente da sua empresa, encaminhamos para você, que é quem decide sobre esses dados, e ajudamos a atender.
      </p>
      <p>Se achar que não fomos corretos, você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD).</p>

      <h2>Segurança</h2>
      <p>
        A conexão é cifrada, a senha é guardada embaralhada de um jeito que não dá para desfazer, cada empresa só vê os próprios dados e as ações ficam registradas. Se houver um
        incidente que possa causar risco a você, avisamos você e a ANPD, como manda a lei.
      </p>

      <h2>Dados de saúde</h2>
      <p>
        Agenda, faltas e recebimentos de um consultório podem revelar que alguém faz tratamento. Por isso, só a sua empresa e a equipe de suporte da Urutau,
        quando precisa, têm acesso. O painel ainda não tem prontuário: não lance registros clínicos nas observações até ele existir.
      </p>

      <h2>Mudanças</h2>
      <p>Quando esta política mudar, avisamos no painel antes de a mudança valer e mostramos a data da nova versão no topo desta página.</p>
    </PaginaLegal>
  );
}
