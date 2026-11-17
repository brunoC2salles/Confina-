// Tutorial do portal de parceiros para gestor e vendedor: passo a passo com
// mockups animados das telas, no mesmo formato do tutorial do Confina+.

import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import '@/pages/tutorial.css'
import {
  MockProduto, MockDietaProduto, MockConvite, MockClienteEstoque, MockPedido, MockEntregas, MockDemanda, MockSimuladorPortal,
} from '@/portal/tutorialMockups'
import { usePortal } from '@/portal/PortalContext'

interface Secao {
  id: string
  titulo: string
  curto: string
  rota: string
  rotaLabel: string
  resumo: string
  dicas: string[]
  mockups: { titulo?: string; el: ReactNode }[]
  soGestor?: string
}

const SECOES: Secao[] = [
  {
    id: 'produtos', titulo: 'Cadastrar produtos e dietas', curto: 'Produtos e dietas',
    rota: '/catalogo', rotaLabel: 'Abrir Produtos',
    resumo: 'O catálogo é o que os clientes veem e podem pedir. Cadastre os produtos com o preço de referência e monte as dietas da cooperativa com a composição completa.',
    dicas: [
      'O preço de referência é visto só pela equipe. Ele entra no simulador, no custo das dietas e nos PDFs de simulação.',
      'Dieta pronta é vendida como produto: o cliente pede e controla o estoque da mistura. Dieta receita é só a fórmula, e o cliente pede os produtos da composição um a um.',
      'A composição aceita produtos do catálogo, insumos padrão do Confina+ e ingredientes livres, como a silagem da própria fazenda.',
      'A chave "Visível para os clientes" controla o que aparece para eles. Clientes do Confina+ veem a composição e os níveis, sem os preços.',
    ],
    mockups: [
      { titulo: 'Cadastrar um produto', el: <MockProduto /> },
      { titulo: 'Montar uma dieta', el: <MockDietaProduto /> },
    ],
  },
  {
    id: 'clientes', titulo: 'Convidar e acompanhar clientes', curto: 'Clientes',
    rota: '/clientes', rotaLabel: 'Abrir Clientes',
    resumo: 'Os clientes entram por convite. Quem usa o Confina+ tem o estoque acompanhado pelo consumo dos lotes; quem não usa ganha uma conta só de estoque, que a equipe e o próprio cliente operam juntos.',
    dicas: [
      'O convite é enviado pelo gestor, em Equipe e convites, já com o vendedor responsável.',
      'No estoque gerenciado, lance entradas, baixas e ajustes, ou informe o consumo por dia ou por semana: o sistema dá baixa sozinho e prevê o fim do estoque.',
      'Pedidos entregues entram no estoque do cliente automaticamente.',
      'Gestor e vendedor responsável editam o contato e o endereço de entrega do cliente. O e-mail de acesso do produtor não muda.',
    ],
    mockups: [
      { titulo: 'Convidar um cliente', el: <MockConvite /> },
      { titulo: 'Estoque, consumo e contato do cliente', el: <MockClienteEstoque /> },
    ],
    soGestor: 'O envio de convites é feito pelo gestor.',
  },
  {
    id: 'pedidos', titulo: 'Atender pedidos e organizar entregas', curto: 'Pedidos e entregas',
    rota: '/pedidos', rotaLabel: 'Abrir Pedidos',
    resumo: 'Pedidos chegam do cliente, dos alertas de estoque ou são lançados pela equipe. Depois de cotado e aprovado, o pedido entra na agenda de entregas por data e rota.',
    dicas: [
      'Alertas de estoque viram pedidos automaticamente quando o produto do cliente está para acabar.',
      'Use o botão WhatsApp do pedido para falar com o cliente com a mensagem já pronta.',
      'Em Entregas, monte as rotas com os municípios atendidos. Cargas acima da capacidade ficam em vermelho.',
      'Em Ajustar, mude a data, a rota só daquela entrega ou divida o pedido. O cliente recebe e-mail com a nova data.',
      'O romaneio de cada carga tem o endereço de entrega e o link do Google Maps de cada fazenda.',
    ],
    mockups: [
      { titulo: 'Cotar um pedido', el: <MockPedido /> },
      { titulo: 'Ajustar uma carga e gerar o romaneio', el: <MockEntregas /> },
    ],
  },
  {
    id: 'demanda', titulo: 'Prever a demanda e simular resultados', curto: 'Demanda e simulador',
    rota: '/simulador', rotaLabel: 'Abrir Simulador',
    resumo: 'A previsão de demanda soma o consumo da carteira para 15 ou 30 dias. O simulador mostra ao produtor o resultado do manejo com os produtos e as dietas da cooperativa.',
    dicas: [
      'A demanda por dieta considera os clientes do Confina+ que usam a dieta no ciclo atual dos lotes.',
      'No simulador, os produtos do catálogo aparecem primeiro, já com o preço de referência.',
      'Cada vendedor vê as próprias simulações; o gestor vê as da equipe.',
      'O PDF traz o comparativo dos caminhos, os ciclos e a composição com o preço de cada ingrediente, com a marca da cooperativa.',
    ],
    mockups: [
      { titulo: 'Previsão de demanda', el: <MockDemanda /> },
      { titulo: 'Simular e exportar o PDF', el: <MockSimuladorPortal /> },
    ],
  },
]

function IconeDica() {
  return (
    <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
      <circle cx="8" cy="8" r="7" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 7v4.2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="8" cy="4.8" r="0.95" fill="currentColor" />
    </svg>
  )
}

export default function TutorialPortal() {
  const navigate = useNavigate()
  const { papel } = usePortal()
  const [ativa, setAtiva] = useState(SECOES[0].id)

  useEffect(() => {
    const els = SECOES.map(s => document.getElementById(`tut-${s.id}`)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(entries => {
      const visiveis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visiveis[0]) setAtiva(visiveis[0].target.id.replace('tut-', ''))
    }, { rootMargin: '-15% 0px -70% 0px' })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [])

  const irPara = (id: string) => document.getElementById(`tut-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  return (
    <div className="page tut-page">
      <header className="tut-cab">
        <h1>Tutorial do portal</h1>
        <p>Quatro etapas, do catálogo à entrega.</p>
      </header>

      <div className="tut-hero">
        <div className="tut-aviso">
          <span className="tut-aviso-play" aria-hidden="true">
            <svg width="12" height="12" viewBox="0 0 12 12"><path d="M3.5 1.8v8.4l6.6-4.2z" fill="currentColor" /></svg>
          </span>
          <span>Cada etapa tem animações das telas. <strong>Clique no play</strong> para assistir e clique nos passos ao lado para ver cada um com calma.</span>
        </div>
        <ol className="tut-trilha">
          {SECOES.map((s, i) => (
            <li key={s.id}>
              <button type="button" onClick={() => irPara(s.id)}>
                <span className="tut-trilha-n">{i + 1}</span>
                <span className="tut-trilha-t">{s.curto}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      <nav className="tut-chips" aria-label="Etapas do tutorial">
        {SECOES.map((s, i) => (
          <button key={s.id} type="button" className={ativa === s.id ? 'ativa' : ''} onClick={() => irPara(s.id)}>
            {i + 1}. {s.curto}
          </button>
        ))}
      </nav>

      <div className="tut-corpo">
        <aside className="tut-indice" aria-label="Índice do tutorial">
          <div className="tut-indice-titulo">Etapas</div>
          <ol>
            {SECOES.map((s, i) => (
              <li key={s.id}>
                <button type="button" className={ativa === s.id ? 'ativa' : ''} onClick={() => irPara(s.id)}>
                  <span className="tut-indice-n">{i + 1}</span>{s.titulo}
                </button>
              </li>
            ))}
          </ol>
        </aside>

        <div className="tut-secoes">
          {SECOES.map((s, i) => (
            <section key={s.id} id={`tut-${s.id}`} className="tut-secao">
              <div className="tut-secao-cab">
                <span className="tut-secao-n">{i + 1}</span>
                <div className="tut-secao-info">
                  <h2>{s.titulo}</h2>
                  <p>{s.resumo}</p>
                  {s.soGestor && papel !== 'gestor' && <p style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{s.soGestor}</p>}
                </div>
                <button type="button" className="btn btn-ghost btn-sm tut-ir" onClick={() => navigate(s.rota)}>{s.rotaLabel}</button>
              </div>

              {s.mockups.map((m, j) => (
                <div key={j} className="tut-mock">
                  {m.titulo && <div className="tut-mock-titulo">{m.titulo}</div>}
                  {m.el}
                </div>
              ))}

              <ul className="tut-dicas">
                {s.dicas.map(d => <li key={d}><IconeDica /><span>{d}</span></li>)}
              </ul>
            </section>
          ))}

          <div className="tut-fim">
            <div>
              <h2>Pronto para começar</h2>
              <p>Comece pelo catálogo. Você pode voltar a este tutorial quando quiser, pelo menu lateral.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/catalogo')}>Abrir Produtos</button>
          </div>
        </div>
      </div>
    </div>
  )
}
