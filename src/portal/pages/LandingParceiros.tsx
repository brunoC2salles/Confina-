import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import '@/portal/landing-parceiros.css'

// Página pública de parceiros.confinamais.com para cooperativas e revendas
// de ração, no mesmo design da landing principal (public/landing.html):
// classes e estilos copiados de lá, com escopo em .lpp. Contato pelo
// WhatsApp do Bruno com mensagem pronta; quem já tem acesso entra pelo login.
const WHATSAPP = `https://wa.me/5555999937665?text=${encodeURIComponent(
  'Olá! Represento uma cooperativa/revenda de ração e tenho interesse no portal de parceiros do Confina+. Podemos conversar?',
)}`

// Ícones das abas (traço 1.6, mesmo estilo da faixa de diferenciais).
const ICONES_ABA: Record<string, JSX.Element> = {
  painel: <><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>,
  pedidos: <><path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" /><circle cx="10" cy="20" r="1.2" /><circle cx="17" cy="20" r="1.2" /></>,
  demanda: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
  clientes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.3a6.5 6.5 0 0 1 3.5 5.7" /></>,
  produtos: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><line x1="12" y1="13" x2="12" y2="21" /></>,
}
const TROCA_AUTOMATICA_MS = 6000

const TELAS_VENDEDOR = [
  { id: 'painel', rotulo: 'Painel', img: '/parceiros/painel-vendedor.webp', titulo: 'O dia do vendedor em uma tela', texto: 'Pedidos novos, produtos que acabam nos próximos 7 dias, demanda prevista e clientes conectados, atualizados pelo consumo real das fazendas.' },
  { id: 'pedidos', rotulo: 'Pedidos', img: '/parceiros/pedidos.webp', titulo: 'Do pedido novo até a entrega', texto: 'Cada solicitação e cada alerta entram no funil: novo, em cotação, cotado, aprovado e entregue. A cotação chega ao cliente pelo portal e pelo WhatsApp.' },
  { id: 'demanda', rotulo: 'Demanda', img: '/parceiros/demanda.webp', titulo: 'Quanto entregar em 15 ou 30 dias', texto: 'O consumo previsto de toda a carteira, por produto ou por dieta. Base para produção, estoque e logística.' },
  { id: 'clientes', rotulo: 'Clientes', img: '/parceiros/clientes.webp', titulo: 'Consumo real contra o previsto', texto: 'Cabeças, dieta em uso e próxima reposição de cada fazenda. Quem consome abaixo do esperado aparece para a visita técnica.' },
  { id: 'produtos', rotulo: 'Produtos', img: '/parceiros/produtos.webp', titulo: 'Você decide o que o cliente pede', texto: 'Rações, núcleos, minerais, grãos e farelos com embalagem, pedido mínimo, prazo e região. Cada produto liga e desliga para os clientes.' },
]

const FAIXAS: Array<[string, string]> = [['1 a 50', 'R$ 35'], ['51 a 100', 'R$ 33'], ['101 a 300', 'R$ 30'], ['301 a 500', 'R$ 28'], ['501 a 1.000', 'R$ 25']]
const EXEMPLOS: Array<[string, string, string]> = [['20 clientes', 'R$ 2.700', 'R$ 135 por cliente'], ['100 clientes', 'R$ 5.400', 'R$ 54 por cliente'], ['300 clientes', 'R$ 11.400', 'R$ 38 por cliente'], ['1.000 clientes', 'R$ 29.500', 'R$ 29,50 por cliente']]

const CAMINHO_WHATS = 'M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15-.2.3-.77.96-.94 1.16-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.47-1.76-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.03-.52-.07-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.07 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.31 1.26.49 1.69.63.71.23 1.36.2 1.87.12.57-.08 1.75-.72 2-1.41.25-.69.25-1.29.17-1.41-.07-.12-.27-.2-.57-.35M12.05 21.5h-.01a9.43 9.43 0 0 1-4.8-1.32l-.35-.2-3.57.93.95-3.48-.22-.36a9.4 9.4 0 0 1-1.44-5.02c0-5.2 4.24-9.43 9.45-9.43a9.4 9.4 0 0 1 9.43 9.44c0 5.2-4.24 9.44-9.44 9.44M20.08 3.9A11.32 11.32 0 0 0 12.05.58C5.79.58.69 5.68.69 11.94c0 2 .52 3.96 1.52 5.68L.6 23.42l5.94-1.56a11.33 11.33 0 0 0 5.43 1.38h.01c6.26 0 11.36-5.1 11.36-11.36 0-3.04-1.18-5.89-3.32-8.04'

const Whats = () => <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={CAMINHO_WHATS} /></svg>
const Ck = () => <span className="ck"><svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12" /></svg></span>

function Tela({ src, alt, eager }: { src: string; alt: string; eager?: boolean }) {
  return (
    <figure className="mock shot">
      <img src={src} alt={alt} width={1600} height={841} loading={eager ? 'eager' : 'lazy'} decoding="async" />
    </figure>
  )
}

export default function LandingParceiros() {
  const [tela, setTela] = useState(TELAS_VENDEDOR[0].id)
  const [rolou, setRolou] = useState(false)
  // As abas trocam sozinhas (com barra de progresso) até o visitante clicar
  // em uma delas: deixa claro que dá para explorar as telas.
  const [automatico, setAutomatico] = useState(true)
  const atual = TELAS_VENDEDOR.find(t => t.id === tela) ?? TELAS_VENDEDOR[0]

  useEffect(() => {
    const aoRolar = () => setRolou(window.scrollY > 8)
    window.addEventListener('scroll', aoRolar, { passive: true })
    return () => window.removeEventListener('scroll', aoRolar)
  }, [])

  useEffect(() => {
    if (!automatico) return
    const t = window.setTimeout(() => {
      const i = TELAS_VENDEDOR.findIndex(x => x.id === tela)
      setTela(TELAS_VENDEDOR[(i + 1) % TELAS_VENDEDOR.length].id)
    }, TROCA_AUTOMATICA_MS)
    return () => window.clearTimeout(t)
  }, [automatico, tela])

  return (
    <div className="lpp">
      <nav className={rolou ? 'scrolled' : undefined} aria-label="Principal">
        <a href="/" className="nav-logo" aria-label="Confina+ Parceiros">
          <img src="/img/lp/logo-96.png" width={36} height={36} alt="Logotipo Confina+" />
          <span className="nav-logo-text">Confina+ Parceiros</span>
        </a>
        <ul className="nav-links">
          <li><a href="#produtor">Para o produtor</a></li>
          <li><a href="#vendedor">Para o vendedor</a></li>
          <li><a href="#planos">Planos</a></li>
          <li><a href="https://www.confinamais.com">Confina+</a></li>
        </ul>
        <div className="nav-right">
          <Link to="/login" className="btn btn-sm btn-ghost">Entrar</Link>
          <a href={WHATSAPP} target="_blank" rel="noopener" className="btn btn-sm btn-green">Quero ser parceiro</a>
        </div>
      </nav>

      <main>
        <section className="hero" aria-labelledby="hero-h">
          <div className="wrap hero-grid">
            <div>
              <p className="tag">Para cooperativas e revendas de ração</p>
              <h1 id="hero-h">Venda ração <span className="g">antes de o cliente</span> ficar sem.</h1>
              <p className="hero-sub">As dietas da sua cooperativa dentro do Confina+, o estoque de cada fazenda acompanhado pelo consumo real dos lotes e o pedido em 1 clique direto no e-mail do vendedor.</p>
              <div className="hero-cta">
                <a href={WHATSAPP} target="_blank" rel="noopener" className="btn btn-lg btn-green"><Whats />Quero ser parceiro</a>
                <Link to="/login" className="btn btn-lg btn-outline">Já tenho acesso</Link>
              </div>
              <ul className="hero-checks">
                <li><Ck />Alerta 7 dias antes de faltar</li>
                <li><Ck />Pedido em 1 clique</li>
                <li><Ck />Clientes veem só os seus produtos</li>
              </ul>
            </div>
            <div className="hero-vis">
              <Tela src="/parceiros/painel-vendedor.webp" alt="Painel do vendedor com pedidos, rupturas previstas e demanda da carteira" eager />
              <img className="hero-modal" src="/parceiros/modal-pedido.webp" alt="Pedido de cotação em 1 clique preenchido com os dados da fazenda" width={800} height={634} />
            </div>
          </div>
        </section>

        <section className="strip" aria-label="Diferenciais">
          <div className="wrap strip-grid">
            <div className="strip-item"><div className="strip-ic"><svg viewBox="0 0 24 24"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg></div><div><div className="strip-t">Alerta de estoque</div><div className="strip-d">7 dias antes de faltar ração</div></div></div>
            <div className="strip-item"><div className="strip-ic"><svg viewBox="0 0 24 24"><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></svg></div><div><div className="strip-t">Demanda prevista</div><div className="strip-d">15 e 30 dias de toda a carteira</div></div></div>
            <div className="strip-item"><div className="strip-ic"><svg viewBox="0 0 24 24"><path d="M4 4h16v16H4z" /><polyline points="22 6 12 13 2 6" /></svg></div><div><div className="strip-t">Pedido em 1 clique</div><div className="strip-d">Direto no e-mail do vendedor</div></div></div>
            <div className="strip-item"><div className="strip-ic"><svg viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg></div><div><div className="strip-t">Exclusividade</div><div className="strip-d">Seus clientes veem só a sua marca</div></div></div>
          </div>
        </section>

        <section className="sec" id="produtor" aria-labelledby="prod-h">
          <div className="wrap">
            <div className="feat-head">
              <p className="tag">Para o produtor</p>
              <h2 id="prod-h">Ele monta a dieta com os seus produtos e repõe com 1 clique.</h2>
              <p className="lead">Sem sair do Confina+, onde ele já controla custo, ganho de peso e lucro de cada animal.</p>
            </div>
            <div className="pillars">
              <div className="pillar">
                <div className="pillar-txt">
                  <h3>Suas dietas na tela de dietas</h3>
                  <p className="pillar-lead">Composição, consumo e GMD esperado definidos pela sua equipe técnica. O produtor usa como base e ajusta ao lote. Cada ingrediente é um produto do seu catálogo.</p>
                  <ul className="ai-list"><li><Ck />Clientes veem só as dietas e produtos da sua marca</li><li><Ck />Composição e níveis nutricionais, sem expor seus preços</li></ul>
                </div>
                <Tela src="/parceiros/dietas-produtor.webp" alt="Tela de dietas do produtor com as dietas completas do fornecedor parceiro" />
              </div>
              <div className="pillar rev">
                <div className="pillar-txt">
                  <h3>O sistema avisa antes de faltar ração</h3>
                  <p className="pillar-lead">A previsão de fim de estoque vem do consumo das dietas dos lotes. O que acaba em menos de 7 dias fica em destaque, com o botão de pedido ao lado.</p>
                  <ul className="ai-list"><li><Ck />Saldo, consumo médio e data de fim por produto</li><li><Ck />O mesmo alerta chega ao vendedor por e-mail</li></ul>
                </div>
                <Tela src="/parceiros/alerta-estoque.webp" alt="Compras com alerta de estoque e botão para solicitar cotação" />
              </div>
              <div className="pillar">
                <div className="pillar-txt">
                  <h3>Pedido em 1 clique, com tudo preenchido</h3>
                  <p className="pillar-lead">Fazenda, responsável e contato vêm da conta do produtor. A quantidade é sugerida pelos dias de consumo que ele quer cobrir, e a entrega, antes do fim do estoque.</p>
                  <ul className="ai-list"><li><Ck />Chega ao vendedor pela plataforma e por e-mail</li><li><Ck />O produtor aprova a cotação no próprio Confina+</li></ul>
                </div>
                <Tela src="/parceiros/pedido-1-clique.webp" alt="Pedido de cotação em 1 clique" />
              </div>
            </div>
          </div>
        </section>

        <section className="sec ai" id="vendedor" aria-labelledby="vend-h">
          <div className="wrap">
            <div className="feat-head">
              <p className="tag">Para o vendedor</p>
              <h2 id="vend-h" className="uma-linha">Ele conhece a necessidade antes da ligação.</h2>
              <p className="lead">Um portal no padrão do Confina+ para gestores e vendedores, em que cada um vê a própria carteira.</p>
            </div>
            <p className="abas-dica">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 11V4.5a1.5 1.5 0 0 1 3 0V10" /><path d="M12 9.5a1.5 1.5 0 0 1 3 0V11" /><path d="M15 10.5a1.5 1.5 0 0 1 3 0V15a6 6 0 0 1-6 6h-.6a6 6 0 0 1-4.6-2.2L4.3 15.9a1.5 1.5 0 0 1 2.3-1.9L9 16.5V11" /></svg>
              Clique em cada tela para explorar o portal
            </p>
            <div className="abas" role="tablist" aria-label="Telas do portal do vendedor">
              {TELAS_VENDEDOR.map(t => (
                <button key={t.id} type="button" role="tab" aria-selected={t.id === tela}
                  className={`aba${t.id === tela ? ' ativa' : ''}`}
                  onClick={() => { setAutomatico(false); setTela(t.id) }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">{ICONES_ABA[t.id]}</svg>
                  <span>{t.rotulo}</span>
                  {automatico && t.id === tela && <i className="aba-prog" key={`p-${t.id}`} style={{ animationDuration: `${TROCA_AUTOMATICA_MS}ms` }} />}
                </button>
              ))}
            </div>
            <div className="vitrine" role="tabpanel">
              <div className="vitrine-txt" key={`t-${atual.id}`}>
                <h3>{atual.titulo}</h3>
                <p className="pillar-lead">{atual.texto}</p>
              </div>
              <div className="vitrine-img" key={`i-${atual.id}`}>
                <Tela src={atual.img} alt={atual.titulo} />
              </div>
            </div>
            <div className="incl">
              <ul className="incl-list incl-3">
                <li><Ck /><span><b>E-mail a cada pedido e a cada alerta</b>, com produto, quantidade, data, estoque e contato do cliente.</span></li>
                <li><Ck /><span><b>WhatsApp com a mensagem pronta</b> para responder a cotação ou agendar a visita técnica.</span></li>
                <li><Ck /><span><b>Corte e leite</b>: clientes sem Confina+ ganham uma conta de estoque e pedidos.</span></li>
              </ul>
            </div>
          </div>
        </section>

        <section className="sec" id="planos" aria-labelledby="planos-h">
          <div className="wrap">
            <div className="center">
              <p className="tag">Planos</p>
              <h2 id="planos-h">Três formas de parceria.</h2>
              <p className="lead">Do uso integrado ao Confina+ até a plataforma com a marca da sua cooperativa.</p>
            </div>
            <div className="price-grid">
              <div className="pc">
                <div className="pc-plan">Parceria integrada</div>
                <div className="pc-for">Para os clientes que usam o Confina+, trazidos por você</div>
                <div className="pc-price">R$ 0</div>
                <div className="pc-period">para a cooperativa. O produtor mantém o plano dele (Free, Pro ou Master)</div>
                <div className="pc-div" />
                <ul className="pc-feats">
                  <li><Ck />Suas dietas na tela de dietas do produtor</li>
                  <li><Ck />Pedido em 1 clique e alerta de estoque</li>
                  <li><Ck />Portal do vendedor com pedidos, alertas e demanda</li>
                  <li><Ck />Exclusividade: o cliente vê só os seus produtos</li>
                </ul>
                <a href={WHATSAPP} target="_blank" rel="noopener" className="pc-btn">Quero esta parceria</a>
              </div>
              <div className="pc feat">
                <div className="pc-badge">Mais completo</div>
                <div className="pc-plan">Plataforma de venda de ração</div>
                <div className="pc-for">Portal do vendedor e estoque para clientes de corte e leite</div>
                <div className="pc-price"><sup>R$</sup>2.000<small>/mês</small></div>
                <div className="pc-period">mais o valor por cliente, escalonado</div>
                <div className="pc-div" />
                <table className="faixas">
                  <caption>Valor por cliente, por mês</caption>
                  <tbody>{FAIXAS.map(([f, v]) => <tr key={f}><td>{f} clientes</td><td>{v}</td></tr>)}</tbody>
                </table>
                <ul className="pc-feats">
                  <li><Ck />Catálogo de produtos e dietas da sua marca</li>
                  <li><Ck />Controle de estoque para os clientes</li>
                  <li><Ck />Implantação e treinamento inclusos</li>
                </ul>
                <a href={WHATSAPP} target="_blank" rel="noopener" className="pc-btn">Falar sobre a plataforma</a>
              </div>
              <div className="pc">
                <div className="pc-plan">White label</div>
                <div className="pc-for">A tecnologia do Confina+ com a identidade da sua cooperativa</div>
                <div className="pc-price pc-price-txt">Sob consulta</div>
                <div className="pc-period">conforme escopo e demanda</div>
                <div className="pc-div" />
                <ul className="pc-feats">
                  <li><Ck />Plataforma com a marca da cooperativa</li>
                  <li><Ck />Você administra os clientes e o relacionamento</li>
                  <li><Ck />Base de gestão e venda do Confina+</li>
                </ul>
                <a href={WHATSAPP} target="_blank" rel="noopener" className="pc-btn">Pedir uma proposta</a>
              </div>
            </div>
            <div className="all-plans exemplos">
              <b>Plataforma de venda, na prática:</b>
              {EXEMPLOS.map(([n, total, por]) => <span key={n}>{n}: <strong>{total}/mês</strong> ({por})</span>)}
            </div>
            <p className="price-note">Cada faixa aplica o seu preço só aos clientes dentro dela. Acima de 1.000 clientes, sob consulta.</p>
          </div>
        </section>

        <section className="cta-sec" aria-labelledby="cta-h">
          <p className="tag">Parceria</p>
          <h2 id="cta-h">Leve as suas dietas para dentro da fazenda.</h2>
          <p className="lead">Fale com a gente pelo WhatsApp e veja o portal funcionando com os seus produtos.</p>
          <div className="cta-row">
            <a href={WHATSAPP} target="_blank" rel="noopener" className="btn btn-lg btn-white">Quero ser parceiro</a>
            <Link to="/login" className="btn btn-lg btn-outline-w">Entrar no portal</Link>
          </div>
        </section>
      </main>

      <footer>
        <div className="ft-logo">
          <img src="/img/lp/logo-96.png" width={36} height={36} alt="Logotipo Confina+" loading="lazy" />
          <span className="ft-brand">Confina+ Parceiros</span>
        </div>
        <ul className="ft-links">
          <li><a href="#produtor">Para o produtor</a></li>
          <li><a href="#vendedor">Para o vendedor</a></li>
          <li><a href="#planos">Planos</a></li>
          <li><a href="https://www.confinamais.com">Confina+</a></li>
          <li><Link to="/login">Entrar</Link></li>
        </ul>
        <div className="ft-copy">
          <p>CONFINAMAIS LTDA · CNPJ 68.246.114/0001-50</p>
          <p><a href={WHATSAPP} target="_blank" rel="noopener">WhatsApp (55) 99993-7665</a></p>
          <p><a href="https://www.confinamais.com/privacidade">Privacidade</a></p>
        </div>
      </footer>

      <a className="wa-float" href={WHATSAPP} target="_blank" rel="noopener" aria-label="Falar sobre o portal de parceiros no WhatsApp"><Whats /></a>
    </div>
  )
}
