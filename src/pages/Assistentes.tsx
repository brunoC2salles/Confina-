// /assistentes — documentação pública do conector Confina+ para assistentes
// de IA (servidor MCP em mcp.confinamais.com). Também é a URL de
// documentação informada nos diretórios de conectores.
import { Link } from 'react-router-dom'
import { PaginaInstitucional, EMAIL_CONTATO, URL_MCP } from './Institucional'

const EXEMPLOS: Array<{ titulo: string; itens: string[] }> = [
  {
    titulo: 'Acompanhar o rebanho',
    itens: [
      'Como está a fazenda hoje? Quantos animais em cada lote e ciclo?',
      'Qual o GMD real do lote Recria Norte neste ciclo?',
      'Mostre o histórico de pesagens do brinco 1042.',
    ],
  },
  {
    titulo: 'Custos e resultado',
    itens: [
      'Qual o custo acumulado por cabeça do lote Terminação 2?',
      'Compare meus lotes ativos com preço de R$ 15,50 o kg vivo.',
      'Quais os 10 animais com maior lucro projetado?',
      'Resuma o resultado financeiro das vendas dos últimos 90 dias.',
    ],
  },
  {
    titulo: 'Lançamentos do dia a dia',
    itens: [
      'Lance a pesagem de hoje: brinco 1042 com 412 kg e 1043 com 398 kg.',
      'Avance o lote Recria Norte para o próximo ciclo a partir de hoje.',
      'Registre a compra de 12 t de milho a R$ 1.380 a tonelada.',
      'Registre a venda de 20 animais do lote Terminação 2.',
    ],
  },
  {
    titulo: 'Planejamento',
    itens: [
      'Simule a terminação do lote Recria Norte por 90 dias na dieta de alto grão.',
      'Qual dieta tem o menor custo por kg de matéria seca?',
      'Como funciona o comparativo de lotes na plataforma?',
    ],
  },
]

export default function Assistentes() {
  return (
    <PaginaInstitucional
      ativo="assistentes"
      selo="Conector para assistentes de IA"
      titulo="Converse com a sua fazenda no Claude"
      subtitulo="Conecte a sua conta Confina+ ao assistente e consulte lotes, custos, pesagens e vendas, ou faça lançamentos, só conversando. Os dados são os mesmos da plataforma, com as mesmas regras de cálculo."
    >
      <section>
        <h2>O que o conector faz</h2>
        <p>
          O conector Confina+ dá ao assistente acesso à sua conta da plataforma de manejo bovino, com a sua
          autorização. Ele usa exatamente o mesmo motor de cálculo do app: custo por animal, GMD real por ciclo,
          rateios de ração e medicamentos, comparativo, ranking e simulador.
        </p>
        <ul>
          <li><strong>Consultas:</strong> resumo da fazenda, situação de hoje por lote, ciclo e dieta, detalhe de lotes e animais, ranking, comparativo, relatório financeiro, estoque de ingredientes, fornecimento de ração e simulações.</li>
          <li><strong>Lançamentos:</strong> lotes e ciclos, entrada de animais, pesagens, troca de dieta, avanço de ciclo, custos, compras de ingredientes, dieta pronta, medicamentos, fornecimentos, vendas, dietas, ingredientes, parceiros e simulações.</li>
          <li><strong>Dúvidas de uso:</strong> o assistente consulta o guia da plataforma para explicar como fazer cada coisa.</li>
        </ul>
      </section>

      <section>
        <h2>Antes de conectar</h2>
        <ul>
          <li>Você precisa de uma conta no Confina+ (qualquer plano). Os limites do seu plano continuam valendo nos lançamentos feitos pelo assistente.</li>
          <li>Cada pessoa acessa somente a própria conta. O assistente vê e altera apenas os dados que você vê e altera no app.</li>
          <li>Assinatura e pagamento, funções de administração e importação de planilhas continuam disponíveis só no app.</li>
        </ul>
      </section>

      <section>
        <h2>Como conectar no Claude</h2>
        <h3>Pelo diretório de conectores</h3>
        <ol className="inst-passos">
          <li>No Claude, abra a área de conectores e procure por <strong>Confina+</strong>.</li>
          <li>Clique em <strong>Conectar</strong>. Abre a tela de login do Confina+: entre com o seu e-mail e senha da plataforma.</li>
          <li>Na tela de autorização, confira a conta e clique em <strong>Autorizar</strong>. Você volta para o Claude com o conector ativo.</li>
        </ol>
        <h3>Pelo endereço do servidor</h3>
        <ol className="inst-passos">
          <li>Em <strong>Configurações &gt; Conectores</strong>, escolha <strong>Adicionar conector personalizado</strong>.</li>
          <li>Dê o nome <strong>Confina+</strong> e use o endereço <code>{URL_MCP}</code>.</li>
          <li>Em autenticação, mantenha o login pelo servidor e o registro automático do cliente. Deixe ID e segredo em branco.</li>
          <li>Clique em <strong>Conectar</strong>, entre com a sua conta Confina+ e autorize o acesso.</li>
        </ol>
      </section>

      <section>
        <h2>O que dá para pedir</h2>
        <p>Fale como falaria com alguém da equipe. Alguns exemplos:</p>
        <div className="inst-grade">
          {EXEMPLOS.map(g => (
            <div className="inst-cartao" key={g.titulo}>
              <h3>{g.titulo}</h3>
              <ul>{g.itens.map(i => <li key={i}>{i}</li>)}</ul>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h2>Segurança e controle</h2>
        <ul>
          <li><strong>Login próprio:</strong> a conexão usa OAuth 2.1. O assistente nunca recebe a sua senha, só um acesso autorizado por você.</li>
          <li><strong>Confirmação antes de gravar:</strong> o assistente mostra o que vai lançar e pede a sua confirmação. Exclusões só acontecem depois de uma confirmação explícita.</li>
          <li><strong>Mesmas regras do app:</strong> datas, limites do plano e validações são as da plataforma. Quando algo não é permitido, o assistente explica o motivo.</li>
          <li><strong>Revogar a qualquer momento:</strong> desconecte o Confina+ nas configurações de conectores do assistente para encerrar o acesso.</li>
        </ul>
        <div className="inst-aviso">
          <p>
            Assistentes de IA podem interpretar um pedido de forma diferente da pretendida. Confira os dados antes de
            confirmar um lançamento e, na dúvida, verifique o resultado no app.
          </p>
        </div>
      </section>

      <section>
        <h2>Dados e privacidade</h2>
        <p>
          O conector recebe apenas os dados de cada pedido feito pelo assistente (por exemplo, o lote consultado ou a
          pesagem lançada) e devolve as informações da sua conta necessárias para responder. Ele não acessa o histórico
          das suas conversas. Os detalhes estão na <Link to="/privacidade">política de privacidade</Link>.
        </p>
      </section>

      <section>
        <h2>Suporte</h2>
        <p>
          Dúvidas, problemas na conexão ou sugestões: <a href={`mailto:${EMAIL_CONTATO}`}>{EMAIL_CONTATO}</a>.
        </p>
      </section>
    </PaginaInstitucional>
  )
}
