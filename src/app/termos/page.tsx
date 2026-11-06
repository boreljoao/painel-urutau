import Link from "next/link";
import { CONTATO_PRIVACIDADE, PaginaLegal } from "../legal";

export const metadata = { title: "Termos de uso" };

export default function Termos() {
  return (
    <PaginaLegal titulo="Termos de uso">
      <p>
        Estes termos valem para quem usa o Painel Urutau, o painel de gestão para pequenos negócios feito pela Urutau, de Maricá (RJ). Ao criar a conta, você
        concorda com eles e com a <Link className="link" href="/privacidade">Política de privacidade</Link>.
      </p>

      <h2>1. O que é o painel</h2>
      <p>
        O painel organiza as vendas, as despesas, o caixa, os clientes, a agenda e o atendimento pelo WhatsApp da sua empresa. As abas e as palavras mudam
        conforme o ramo que você escolhe. Os números de imposto, lucro e caixa são estimativas feitas com o que você lançou: ajudam a decidir, mas não
        substituem o seu contador nem as guias oficiais.
      </p>

      <h2>2. A sua conta</h2>
      <ul>
        <li>Use um e-mail que seja seu e uma senha que você não usa em outro lugar. Não compartilhe a senha.</li>
        <li>Quem cria a empresa no painel é o dono dela ali e responde pelo que as pessoas convidadas fazem.</li>
        <li>As informações lançadas precisam ser verdadeiras e você precisa ter o direito de guardá-las, incluindo os dados dos seus clientes e pacientes.</li>
        <li>O painel é para maiores de 18 anos.</li>
      </ul>

      <h2>3. Os seus dados e os dos seus clientes</h2>
      <p>
        O que você lança é seu. A Urutau guarda e processa esses dados só para fazer o painel funcionar, para dar suporte e para melhorar o serviço, como explica a
        política de privacidade. Sobre os dados dos seus clientes e pacientes, a sua empresa é a controladora e a Urutau é a operadora: tratamos esses dados
        apenas seguindo o uso que você faz do painel.
      </p>
      <p>
        Se você atende na área da saúde, lembre que as regras do seu conselho profissional continuam valendo. O painel ainda não tem prontuário: não lance
        registros clínicos nas observações.
      </p>

      <h2>4. Atendente no WhatsApp</h2>
      <p>
        O atendente responde com inteligência artificial e pode errar. Você revê as conversas, decide o que ele pode prometer e responde aos seus clientes pelo
        que ele combinou em nome da empresa. As regras do WhatsApp continuam valendo para a sua conta lá.
      </p>

      <h2>5. Painel de exemplo</h2>
      <p>
        O painel de exemplo usa uma empresa inventada, com números inventados. Ele é apagado sozinho em até um dia. Não lance dados reais nele.
      </p>

      <h2>6. O que não pode</h2>
      <ul>
        <li>Usar o painel para algo ilegal, para enviar mensagens em massa sem consentimento ou para guardar dados que você não tem direito de guardar.</li>
        <li>Tentar entrar na conta de outra pessoa ou em partes do sistema que não são suas, ou atrapalhar o funcionamento do serviço.</li>
        <li>Copiar o painel para revender.</li>
      </ul>
      <p>Se isso acontecer, podemos suspender a conta, avisando antes sempre que der.</p>

      <h2>7. Preço</h2>
      <p>
        Durante o período de testes o painel é gratuito. Antes de começar qualquer cobrança, avisamos por e-mail com pelo menos 30 dias de antecedência, com o
        preço e o que está incluído. Você decide se continua.
      </p>

      <h2>8. Disponibilidade</h2>
      <p>
        Trabalhamos para o painel ficar no ar o tempo todo e fazemos cópias de segurança do banco de dados, mas pode haver paradas e erros, principalmente
        durante os testes. Não respondemos por prejuízos indiretos, como lucro que deixou de entrar, causados por uma parada ou por uma estimativa errada.
      </p>

      <h2>9. Sair</h2>
      <p>
        Você pode parar de usar quando quiser. Para apagar a conta e os dados da empresa, escreva para <a className="link" href={`mailto:${CONTATO_PRIVACIDADE}`}>{CONTATO_PRIVACIDADE}</a>.
        Antes de apagar, mandamos uma cópia dos seus lançamentos se você pedir.
      </p>

      <h2>10. Mudanças e contato</h2>
      <p>
        Quando estes termos mudarem, avisamos no painel antes de a mudança valer. Dúvidas: <a className="link" href={`mailto:${CONTATO_PRIVACIDADE}`}>{CONTATO_PRIVACIDADE}</a>.
        Vale a lei brasileira, e o foro é o da comarca de Maricá (RJ), sem prejuízo do seu direito de entrar com ação no seu domicílio quando a lei permitir.
      </p>
    </PaginaLegal>
  );
}
