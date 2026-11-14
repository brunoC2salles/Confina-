// /privacidade — política de privacidade da plataforma Confina+ e do conector
// para assistentes de IA. URL informada nos diretórios de conectores.
import { Link } from 'react-router-dom'
import { PaginaInstitucional, EMAIL_CONTATO } from './Institucional'

const ATUALIZADA_EM = '14 de novembro de 2026'

export default function Privacidade() {
  return (
    <PaginaInstitucional
      ativo="privacidade"
      selo={`Atualizada em ${ATUALIZADA_EM}`}
      titulo="Política de privacidade"
      subtitulo="Como a plataforma Confina+ e o conector para assistentes de IA coletam, usam, armazenam e protegem os seus dados."
    >
      <section>
        <h2>Quem somos</h2>
        <p>
          A plataforma Confina+ de manejo bovino e o conector Confina+ para assistentes de IA são operados pela
          <strong> CONFINAMAIS LTDA</strong>, CNPJ 68.246.114/0001-50, que é a controladora dos dados pessoais
          tratados nos termos da Lei Geral de Proteção de Dados (Lei 13.709/2018).
        </p>
        <p>Contato para assuntos de privacidade: <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.</p>
      </section>

      <section>
        <h2>Dados que coletamos</h2>
        <h3>Dados da conta</h3>
        <p>Nome, e-mail, senha (armazenada de forma criptografada pelo serviço de autenticação) e informações do plano contratado.</p>
        <h3>Dados que você cadastra na plataforma</h3>
        <p>
          Lotes, ciclos, animais, pesagens, dietas, ingredientes, compras, fornecimentos de ração, custos, vendas,
          simulações e parceiros (fornecedores, corretores, frigoríficos e produtores), incluindo os dados de contato
          e documento de parceiros que você decidir informar.
        </p>
        <h3>Pagamentos</h3>
        <p>
          As assinaturas são processadas pela Stripe. Os dados do cartão são informados diretamente à Stripe e não
          ficam armazenados nos nossos sistemas; recebemos apenas a situação da assinatura.
        </p>
        <h3>Dados técnicos</h3>
        <p>
          Registros de acesso e de erros gerados pela infraestrutura de hospedagem (como endereço IP, data e hora e o
          recurso acessado), usados para segurança e diagnóstico. O app guarda no navegador a sessão de login.
        </p>
      </section>

      <section>
        <h2>Conector para assistentes de IA</h2>
        <p>
          Quando você conecta o Confina+ a um assistente de IA (como o Claude), autoriza esse assistente a consultar e
          lançar dados na sua conta em seu nome. Nesse uso:
        </p>
        <ul>
          <li>
            O conector recebe somente os parâmetros de cada pedido feito pelo assistente (por exemplo, o lote a
            consultar ou a pesagem a lançar) e devolve as informações da sua conta necessárias para atender ao pedido.
          </li>
          <li>O conector não acessa o histórico das suas conversas, a memória do assistente nem arquivos enviados a ele.</li>
          <li>
            O acesso usa um token emitido pelo nosso serviço de autenticação depois do seu login e da sua autorização.
            O assistente não recebe a sua senha. Você pode revogar o acesso a qualquer momento desconectando o conector
            no assistente.
          </li>
          <li>
            As respostas do conector passam a fazer parte da sua conversa com o assistente, que é tratada pela empresa
            responsável por ele segundo a política de privacidade dela.
          </li>
        </ul>
      </section>

      <section>
        <h2>Como usamos os dados</h2>
        <ul>
          <li>Prestar o serviço: calcular custos, GMD, rateios, comparativos, relatórios e simulações a partir dos dados que você cadastra.</li>
          <li>Autenticar o acesso pelo app e pelo conector, e manter a segurança da conta.</li>
          <li>Gerenciar a assinatura e o atendimento ao cliente.</li>
          <li>Diagnosticar erros e melhorar o funcionamento da plataforma.</li>
        </ul>
        <p>Não vendemos dados pessoais nem os usamos para publicidade de terceiros.</p>
      </section>

      <section>
        <h2>Armazenamento e segurança</h2>
        <p>
          Os dados ficam em banco de dados gerenciado pela Supabase, com controle de acesso por usuário em todas as
          tabelas: cada conta só lê e altera os próprios registros, tanto pelo app quanto pelo conector. A comunicação
          é feita sempre por conexão criptografada (HTTPS).
        </p>
      </section>

      <section>
        <h2>Compartilhamento com terceiros</h2>
        <p>Compartilhamos dados apenas com os fornecedores necessários para operar o serviço:</p>
        <ul>
          <li><strong>Supabase:</strong> banco de dados e autenticação.</li>
          <li><strong>Vercel:</strong> hospedagem do app e do conector.</li>
          <li><strong>Cloudflare:</strong> DNS e proteção do domínio.</li>
          <li><strong>Stripe:</strong> processamento de pagamentos.</li>
          <li><strong>Assistentes de IA que você conectar:</strong> recebem as respostas aos pedidos feitos em seu nome, como descrito acima.</li>
        </ul>
        <p>Também podemos compartilhar dados quando exigido por lei ou por ordem de autoridade competente.</p>
      </section>

      <section>
        <h2>Retenção</h2>
        <p>
          Os dados da conta e os dados cadastrados são mantidos enquanto a conta estiver ativa. Mediante solicitação
          de exclusão da conta, os dados são excluídos, exceto aqueles que precisemos manter para cumprir obrigações
          legais. Registros técnicos são mantidos apenas pelo tempo necessário para segurança e diagnóstico.
        </p>
      </section>

      <section>
        <h2>Seus direitos</h2>
        <p>
          Nos termos da LGPD, você pode pedir confirmação do tratamento, acesso, correção, portabilidade e exclusão dos
          seus dados, além de informações sobre compartilhamento e a revogação de consentimentos. Para exercer esses
          direitos, escreva para <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
      </section>

      <section>
        <h2>Alterações</h2>
        <p>
          Esta política pode ser atualizada. A data da última atualização aparece no topo da página. Mudanças
          relevantes serão comunicadas pelos canais da plataforma.
        </p>
        <p>Veja também como funciona o <Link to="/assistentes">conector para assistentes de IA</Link>.</p>
      </section>
    </PaginaInstitucional>
  )
}
