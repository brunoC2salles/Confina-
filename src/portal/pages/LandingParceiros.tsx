import { useState } from 'react'
import { Link } from 'react-router-dom'
import '@/portal/landing-parceiros.css'

// Página pública de parceiros.confinamais.com para cooperativas e revendas
// de ração. Contato pelo WhatsApp do Bruno com mensagem pronta; quem já
// tem acesso entra pelo login.
const WHATSAPP = `https://wa.me/5555999937665?text=${encodeURIComponent(
  'Olá! Represento uma cooperativa/revenda de ração e tenho interesse no portal de parceiros do Confina+. Podemos conversar?',
)}`

const TELAS_VENDEDOR = [
  { id: 'painel', rotulo: 'Painel', img: '/parceiros/painel-vendedor.webp', titulo: 'O dia do vendedor em uma tela', texto: 'Pedidos novos, produtos que acabam nos próximos 7 dias, demanda prevista e clientes conectados, atualizados pelo consumo real das fazendas.' },
  { id: 'pedidos', rotulo: 'Pedidos', img: '/parceiros/pedidos.webp', titulo: 'Do pedido novo até a entrega', texto: 'Cada solicitação e cada alerta entram no funil: novo, em cotação, cotado, aprovado e entregue. A cotação vai ao cliente pelo portal e pelo WhatsApp.' },
  { id: 'demanda', rotulo: 'Demanda', img: '/parceiros/demanda.webp', titulo: 'Quanto entregar em 15 ou 30 dias', texto: 'O consumo previsto de toda a carteira, por produto ou por dieta. Base para produção, estoque e logística.' },
  { id: 'clientes', rotulo: 'Clientes', img: '/parceiros/clientes.webp', titulo: 'Consumo real contra o previsto', texto: 'Cabeças, dieta em uso e próxima reposição de cada fazenda. Quem consome abaixo do esperado aparece para a visita técnica.' },
  { id: 'produtos', rotulo: 'Produtos', img: '/parceiros/produtos.webp', titulo: 'Você decide o que o cliente pede', texto: 'Rações, núcleos, minerais, grãos e farelos com embalagem, pedido mínimo, prazo e região. Cada produto liga e desliga para os clientes.' },
]

const FAIXAS: Array<[string, string]> = [['1 a 50', 'R$ 35'], ['51 a 100', 'R$ 33'], ['101 a 300', 'R$ 30'], ['301 a 500', 'R$ 28'], ['501 a 1.000', 'R$ 25']]
const EXEMPLOS: Array<[string, string, string]> = [['20 clientes', 'R$ 2.700', 'R$ 135 por cliente'], ['100 clientes', 'R$ 5.400', 'R$ 54 por cliente'], ['300 clientes', 'R$ 11.400', 'R$ 38 por cliente'], ['1.000 clientes', 'R$ 29.500', 'R$ 29,50 por cliente']]

function IconeWhats() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3.5 20.5l1.3-4.2A8.5 8.5 0 1 1 8 19.4l-4.5 1.1z" />
      <path d="M9 9.2c0 3 2.6 5.8 5.8 5.8l1.1-1.3-1.8-1-1 .8c-1-.4-2-1.4-2.4-2.4l.8-1-1-1.8L9 9.2z" />
    </svg>
  )
}
function IconeCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  )
}

function Janela({ src, alt, prioridade }: { src: string; alt: string; prioridade?: boolean }) {
  return (
    <figure className="lpp-janela">
      <img src={src} alt={alt} width={1600} height={841} loading={prioridade ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  )
}

export default function LandingParceiros() {
  const [tela, setTela] = useState(TELAS_VENDEDOR[0].id)
  const atual = TELAS_VENDEDOR.find(t => t.id === tela) ?? TELAS_VENDEDOR[0]

  return (
    <div className="lpp">
      <header className="lpp-topo">
        <div className="lpp-wrap lpp-topo-in">
          <a href="/" className="lpp-marca" aria-label="Confina+ Parceiros">
            <img src="/logo.png" alt="" width={40} height={40} />
            <span>Confina+ <b>Parceiros</b></span>
          </a>
          <nav className="lpp-nav" aria-label="Seções">
            <a href="#produtor">Para o produtor</a>
            <a href="#vendedor">Para o vendedor</a>
            <a href="#planos">Planos</a>
          </nav>
          <div className="lpp-topo-acoes">
            <Link to="/login" className="lpp-btn lpp-btn-linha">Entrar</Link>
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="lpp-btn lpp-btn-ouro lpp-so-desktop">Quero ser parceiro</a>
          </div>
        </div>
      </header>

      <section className="lpp-hero">
        <div className="lpp-wrap lpp-hero-in">
          <div className="lpp-hero-texto">
            <h1>Venda ração antes de o cliente ficar sem.</h1>
            <p>
              As dietas da sua cooperativa dentro do Confina+, o estoque de cada fazenda acompanhado pelo consumo real dos lotes
              e o pedido em 1 clique direto no e-mail do vendedor.
            </p>
            <div className="lpp-hero-acoes">
              <a href={WHATSAPP} target="_blank" rel="noreferrer" className="lpp-btn lpp-btn-ouro lpp-btn-grande"><IconeWhats /> Quero ser parceiro</a>
              <Link to="/login" className="lpp-btn lpp-btn-claro lpp-btn-grande">Já tenho acesso</Link>
            </div>
            <ul className="lpp-hero-fatos">
              <li><strong>7 dias</strong> de antecedência no alerta de estoque</li>
              <li><strong>15 a 30 dias</strong> de demanda prevista da carteira</li>
              <li><strong>Exclusividade</strong>: seus clientes veem só os seus produtos</li>
            </ul>
          </div>
          <div className="lpp-hero-visual">
            <Janela src="/parceiros/painel-vendedor.webp" alt="Painel do vendedor com pedidos, rupturas previstas e demanda da carteira" prioridade />
            <img className="lpp-hero-modal" src="/parceiros/modal-pedido.webp" alt="Pedido de cotação em 1 clique preenchido com os dados da fazenda" width={800} height={634} />
          </div>
        </div>
      </section>

      <section className="lpp-secao" id="produtor">
        <div className="lpp-wrap">
          <h2 className="lpp-h2">O produtor monta a dieta com os seus produtos e repõe com 1 clique.</h2>
          <p className="lpp-lead">Sem sair do Confina+, onde ele já controla custo, ganho de peso e lucro de cada animal.</p>

          <div className="lpp-linha">
            <div className="lpp-linha-texto">
              <h3>Suas dietas na tela de dietas</h3>
              <p>Composição, consumo e GMD esperado definidos pela sua equipe técnica. O produtor usa como base e ajusta ao lote. Cada ingrediente é um produto do seu catálogo.</p>
              <ul className="lpp-lista"><li><IconeCheck />Clientes veem só as dietas e produtos da sua marca</li><li><IconeCheck />Mudanças chegam a eles só quando você publica</li></ul>
            </div>
            <Janela src="/parceiros/dietas-produtor.webp" alt="Tela de dietas do produtor com as dietas completas do fornecedor parceiro" />
          </div>

          <div className="lpp-linha lpp-linha-inv">
            <div className="lpp-linha-texto">
              <h3>O sistema avisa antes de faltar ração</h3>
              <p>A previsão de fim de estoque vem do consumo das dietas dos lotes. O que acaba em menos de 7 dias fica em destaque, com o botão de pedido ao lado.</p>
              <ul className="lpp-lista"><li><IconeCheck />Saldo, consumo médio e data de fim por produto</li><li><IconeCheck />O mesmo alerta chega ao vendedor por e-mail</li></ul>
            </div>
            <Janela src="/parceiros/alerta-estoque.webp" alt="Compras com alerta de estoque e botão para solicitar cotação" />
          </div>

          <div className="lpp-linha">
            <div className="lpp-linha-texto">
              <h3>Pedido em 1 clique, com tudo preenchido</h3>
              <p>Fazenda, responsável e contato vêm da conta do produtor. A quantidade é sugerida pelos dias de consumo que ele quer cobrir, e a entrega, antes do fim do estoque.</p>
              <ul className="lpp-lista"><li><IconeCheck />Chega ao vendedor pela plataforma e por e-mail</li><li><IconeCheck />O produtor aprova a cotação no próprio Confina+</li></ul>
            </div>
            <Janela src="/parceiros/pedido-1-clique.webp" alt="Pedido de cotação em 1 clique" />
          </div>
        </div>
      </section>

      <section className="lpp-secao lpp-escuro" id="vendedor">
        <div className="lpp-wrap">
          <h2 className="lpp-h2">O vendedor conhece a necessidade antes da ligação.</h2>
          <p className="lpp-lead">Um portal com o padrão do Confina+ para gestores e vendedores: cada um vê a própria carteira.</p>
          <div className="lpp-abas" role="tablist" aria-label="Telas do portal do vendedor">
            {TELAS_VENDEDOR.map(t => (
              <button key={t.id} type="button" role="tab" aria-selected={t.id === tela} className={`lpp-aba${t.id === tela ? ' ativa' : ''}`} onClick={() => setTela(t.id)}>
                {t.rotulo}
              </button>
            ))}
          </div>
          <div className="lpp-vitrine" role="tabpanel">
            <div className="lpp-vitrine-texto" key={`t-${atual.id}`}>
              <h3>{atual.titulo}</h3>
              <p>{atual.texto}</p>
            </div>
            <div className="lpp-vitrine-img" key={`i-${atual.id}`}>
              <Janela src={atual.img} alt={atual.titulo} />
            </div>
          </div>
          <div className="lpp-faixa">
            <p><strong>E-mail a cada pedido e a cada alerta</strong>, com produto, quantidade, data de entrega, estoque e contato do cliente.</p>
            <p><strong>WhatsApp com a mensagem pronta</strong> para responder a cotação ou agendar a visita técnica.</p>
            <p><strong>Corte e leite</strong>: clientes sem Confina+ ganham uma conta de estoque e pedidos.</p>
          </div>
        </div>
      </section>

      <section className="lpp-secao" id="planos">
        <div className="lpp-wrap">
          <h2 className="lpp-h2">Três formas de parceria.</h2>
          <p className="lpp-lead">Do uso integrado ao Confina+ até a plataforma com a sua marca.</p>
          <div className="lpp-planos">
            <article className="lpp-plano">
              <h3>Parceria integrada</h3>
              <div className="lpp-preco">Sem custo<span>para a cooperativa</span></div>
              <p>Para os clientes que usam o Confina+, trazidos por você. O produtor mantém o plano dele (Free, Pro ou Master).</p>
              <ul className="lpp-lista">
                <li><IconeCheck />Suas dietas na tela de dietas do produtor</li>
                <li><IconeCheck />Pedido em 1 clique e alerta de estoque</li>
                <li><IconeCheck />Portal do vendedor com pedidos, alertas e demanda</li>
                <li><IconeCheck />Exclusividade: o cliente vê só os seus produtos</li>
              </ul>
            </article>
            <article className="lpp-plano lpp-plano-destaque">
              <h3>Plataforma de venda de ração</h3>
              <div className="lpp-preco">R$ 2.000<small>/mês</small><span>mais o valor por cliente, escalonado</span></div>
              <p>Portal do vendedor e controle de estoque para os seus clientes de corte e leite, mesmo os que não usam o Confina+.</p>
              <table className="lpp-tabela">
                <caption>Valor por cliente, por mês</caption>
                <tbody>{FAIXAS.map(([f, v]) => <tr key={f}><td>{f} clientes</td><td>{v}</td></tr>)}</tbody>
              </table>
              <p className="lpp-nota">Cada faixa aplica o seu preço só aos clientes dentro dela. Acima de 1.000 clientes, sob consulta. Implantação e treinamento inclusos.</p>
            </article>
            <article className="lpp-plano">
              <h3>White label</h3>
              <div className="lpp-preco">Sob consulta<span>conforme escopo e demanda</span></div>
              <p>A tecnologia do Confina+ com a identidade da sua cooperativa. Você administra os clientes e o relacionamento; nós cuidamos da plataforma.</p>
            </article>
          </div>

          <div className="lpp-exemplos" aria-label="Exemplos de valor mensal da plataforma de venda">
            {EXEMPLOS.map(([n, total, por]) => (
              <div key={n}><span>{n}</span><strong>{total}</strong><em>{por}</em></div>
            ))}
          </div>
        </div>
      </section>

      <section className="lpp-cta">
        <div className="lpp-wrap lpp-cta-in">
          <h2>Leve as suas dietas para dentro da fazenda.</h2>
          <div className="lpp-hero-acoes">
            <a href={WHATSAPP} target="_blank" rel="noreferrer" className="lpp-btn lpp-btn-ouro lpp-btn-grande"><IconeWhats /> Falar no WhatsApp</a>
            <Link to="/login" className="lpp-btn lpp-btn-claro lpp-btn-grande">Entrar no portal</Link>
          </div>
        </div>
      </section>

      <footer className="lpp-rodape">
        <div className="lpp-wrap lpp-rodape-in">
          <span>CONFINAMAIS LTDA · CNPJ 68.246.114/0001-50</span>
          <span><a href="https://www.confinamais.com">confinamais.com</a> · <a href="https://www.confinamais.com/privacidade">Privacidade</a></span>
        </div>
      </footer>
    </div>
  )
}
