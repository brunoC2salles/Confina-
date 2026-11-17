// ─── Mockups animados do tutorial do portal de parceiros ─────────────────────
// Reproduções simplificadas das telas do portal (mesmos rótulos). Todos os
// dados exibidos são ilustrativos.

import { ReactNode } from 'react'
import { Mockup, Digita, type Passo } from '@/components/tutorial/Player'
import { Cab, Btn, Campo, Sel, Linha, Modal, Check, Tabela, Badge } from '@/components/tutorial/Mockups'

const NAV = ['Painel', 'Pedidos', 'Entregas', 'Previsão de demanda', 'Clientes', 'Produtos', 'Simulador', 'Equipe e convites', 'Tutorial']
const DOMINIO = 'parceiros.confinamais.com'

function Tela({ pagina, rota, passos, children }: { pagina: string; rota: string; passos: Passo[]; children: (p: number) => ReactNode }) {
  return <Mockup pagina={pagina} rota={rota} passos={passos} nav={NAV} dominio={DOMINIO}>{children}</Mockup>
}

function Barra({ pct, acima }: { pct: number; acima?: boolean }) {
  return (
    <div style={{ height: 5, background: '#f5f5f4', borderRadius: 3, overflow: 'hidden' }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: '100%', background: acima ? '#b91c1c' : '#2e7d32', borderRadius: 3, transition: 'width .6s cubic-bezier(.16,1,.3,1)' }} />
    </div>
  )
}

// ─── 1. Produtos ─────────────────────────────────────────────────────────────

const P_PRODUTO: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Novo produto ou dieta"', alvo: 'novo', clique: true, dur: 1500 },
  { legenda: 'Informe o nome do produto', alvo: 'nome', dur: 2000 },
  { legenda: 'Escolha a categoria', alvo: 'cat', clique: true, dur: 1400 },
  { legenda: 'Informe a % de matéria seca', alvo: 'ms', dur: 1400 },
  { legenda: 'Informe o preço de referência (só a equipe vê)', alvo: 'preco', dur: 1800 },
  { legenda: 'Embalagem, pedido mínimo e prazo', alvo: 'emb', dur: 1600 },
  { legenda: 'Clique em "Salvar"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'Produto no catálogo, visível para os clientes', alvo: 'linha', dur: 3000 },
]

export function MockProduto() {
  return (
    <Tela pagina="Produtos" rota="/catalogo" passos={P_PRODUTO}>
      {p => {
        const linhas: ReactNode[][] = [
          ['Milho moído', 'Grão', 'R$ 1,25', 'Granel', <Check on />],
          ['Núcleo Terminação 40', 'Núcleo', 'R$ 4,80', 'Saco 25 kg', <Check on />],
        ]
        if (p >= 8) linhas.unshift([<strong data-alvo="linha">Ração Terminação 14%</strong>, 'Ração', 'R$ 2,05', 'Saco 30 kg', <Check on />])
        return (
          <>
            <Cab titulo="Produtos" sub="Produtos e dietas que os clientes veem e podem pedir" acao={<Btn alvo="novo" ativo={p === 1}>+ Novo produto ou dieta</Btn>} />
            <div className="tt-card sem-pad">
              <Tabela cols={['Produto', 'Categoria', 'Preço/kg', 'Embalagem', 'Visível']} linhas={linhas} destaque={p >= 8 ? [0] : []} />
            </div>
            {p >= 2 && p <= 7 && (
              <Modal titulo="Novo produto ou dieta" largura={440}>
                <Linha>
                  <Campo label="Nome" alvo="nome" foco={p === 2} vazio="Nome"><Digita texto="Ração Terminação 14%" ativo={p >= 2} velocidade={45} /></Campo>
                  <Sel label="Categoria" alvo="cat" foco={p === 3} valor={p >= 3 ? 'Ração' : undefined} />
                </Linha>
                <Linha>
                  <Sel label="Entra na dieta como" valor="Concentrado" />
                  <Campo label="% MS" alvo="ms" foco={p === 4} vazio="Ex.: 88"><Digita texto="88" ativo={p >= 4} /></Campo>
                </Linha>
                <Campo label="Preço de referência (R$/kg MN)" alvo="preco" foco={p === 5} vazio="Usado no simulador"><Digita texto="2,05" ativo={p >= 5} /></Campo>
                <Linha>
                  <Campo label="Embalagem" alvo="emb" foco={p === 6} vazio="Saco 30 kg, granel"><Digita texto="Saco 30 kg" ativo={p >= 6} /></Campo>
                  <Campo label="Pedido mínimo (kg)" foco={p === 6}><Digita texto="1500" ativo={p >= 6} /></Campo>
                  <Campo label="Prazo (dias)" foco={p === 6}><Digita texto="3" ativo={p >= 6} /></Campo>
                </Linha>
                <div className="tt-mini" style={{ display: 'flex', gap: 6, alignItems: 'center' }}><Check on /> Visível para os clientes</div>
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 7}>Salvar</Btn></div>
              </Modal>
            )}
          </>
        )
      }}
    </Tela>
  )
}

// ─── 1b. Dietas ──────────────────────────────────────────────────────────────

const P_DIETA: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Escolha a categoria "Dieta"', alvo: 'cat', clique: true, dur: 1500 },
  { legenda: 'Escolha ração pronta ou receita', alvo: 'receita', clique: true, dur: 1700 },
  { legenda: 'Informe GMD, consumo e divisão concentrado e volumoso', alvo: 'gmd', dur: 1800 },
  { legenda: 'Monte a composição com produtos, insumos ou ingredientes livres', alvo: 'comp', dur: 2600 },
  { legenda: 'O custo por kg de MS é calculado na hora', alvo: 'custo', dur: 2000 },
  { legenda: 'Informe os níveis nutricionais', alvo: 'niveis', dur: 1800 },
  { legenda: 'Clique em "Salvar"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'A dieta aparece para os clientes do Confina+ (sem os preços)', alvo: 'linha', dur: 3000 },
]

export function MockDietaProduto() {
  return (
    <Tela pagina="Produtos" rota="/catalogo" passos={P_DIETA}>
      {p => (
        <>
          <Cab titulo="Produtos" sub="Produtos e dietas que os clientes veem e podem pedir" acao={<Btn>+ Novo produto ou dieta</Btn>} />
          <div className="tt-card sem-pad">
            <Tabela cols={['Produto', 'Categoria', 'Custo', 'Visível']} destaque={p >= 8 ? [0] : []} linhas={[
              ...(p >= 8 ? [[<span data-alvo="linha"><strong>Terminação Alto Grão</strong><div className="tt-mini">4 ingredientes · usada por 0 clientes</div></span>, 'Dieta receita', 'R$ 1,85/kg MS', <Check on />]] : []),
              [<strong>Engorda Pronta 75/25</strong>, 'Dieta pronta', 'R$ 1,90/kg MS', <Check on />],
            ]} />
          </div>
          {p >= 1 && p <= 7 && (
            <Modal titulo="Novo produto ou dieta" largura={500}>
              <Linha>
                <Campo label="Nome"><Digita texto="Terminação Alto Grão" ativo={p >= 1} velocidade={35} /></Campo>
                <Sel label="Categoria" alvo="cat" foco={p === 1} valor="Dieta" />
              </Linha>
              {p <= 3 ? (
                <Linha>
                  <div className="tt-bloco" style={{ flex: 1, opacity: p >= 2 ? 0.55 : 1 }}><strong style={{ fontSize: 11 }}>Ração pronta</strong><span className="tt-mini">Vendida como produto</span></div>
                  <div data-alvo="receita" className="tt-bloco" style={{ flex: 1, borderColor: p >= 2 ? '#2e7d32' : undefined, background: p >= 2 ? '#e8f5e9' : undefined }}><strong style={{ fontSize: 11 }}>Receita</strong><span className="tt-mini">Só a fórmula</span></div>
                </Linha>
              ) : <div className="tt-mini">Tipo de dieta: <Badge>Receita</Badge></div>}
              {p >= 3 && (
                <Linha>
                  <Campo label="GMD esperado" alvo="gmd" foco={p === 3}><Digita texto="1,6" ativo={p >= 3} /></Campo>
                  <Campo label="% PV em MS" foco={p === 3}><Digita texto="2,4" ativo={p >= 3} /></Campo>
                  <Campo label="% conc." foco={p === 3}>85</Campo>
                  <Campo label="% vol." foco={p === 3}>15</Campo>
                </Linha>
              )}
              {p >= 4 && (
                <div data-alvo="comp" className="tt-card sem-pad">
                  <Tabela cols={['Ingrediente', '% part.', '% MS', 'R$/kg MS']} alinhar={['l', 'r', 'r', 'r']} linhas={[
                    ['Milho moído (produto)', '75', '88', 'R$ 1,42'],
                    ['Farelo de soja (produto)', '15', '89', 'R$ 2,70'],
                    ['Núcleo Terminação 40 (produto)', '10', '90', 'R$ 5,33'],
                    ['Silagem da fazenda (livre)', '100', '33', 'R$ 0,97'],
                  ]} />
                </div>
              )}
              {p >= 5 && <div data-alvo="custo" className="tt-nota">Custo da dieta: <strong>R$ 1,85/kg MS</strong> · preços e custo ficam só para a equipe</div>}
              {p >= 6 && (
                <Linha>
                  <Campo label="PB (%)" alvo="niveis" foco={p === 6}><Digita texto="13,5" ativo={p >= 6} /></Campo>
                  <Campo label="NDT (%)" foco={p === 6}><Digita texto="78" ativo={p >= 6} /></Campo>
                  <Campo label="Ionóforo" flex={2} foco={p === 6}><Digita texto="Monensina 25 mg/kg MS" ativo={p >= 6} velocidade={35} /></Campo>
                </Linha>
              )}
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 7}>Salvar</Btn></div>
            </Modal>
          )}
        </>
      )}
    </Tela>
  )
}

// ─── 2. Convites ─────────────────────────────────────────────────────────────

const P_CONVITE: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Informe o e-mail do cliente', alvo: 'email', dur: 2000 },
  { legenda: 'Informe o nome', alvo: 'nome', dur: 1500 },
  { legenda: 'Em "Acesso", escolha Cliente', alvo: 'acesso', clique: true, dur: 1400 },
  { legenda: 'Escolha o tipo de conta: Confina+ ou só estoque', alvo: 'tipo', clique: true, dur: 1800 },
  { legenda: 'Defina o vendedor responsável', alvo: 'vend', clique: true, dur: 1400 },
  { legenda: 'Clique em "Enviar convite"', alvo: 'enviar', clique: true, dur: 1400 },
  { legenda: 'O cliente recebe o e-mail com o link de acesso', alvo: 'pend', dur: 3000 },
]

export function MockConvite() {
  return (
    <Tela pagina="Equipe e convites" rota="/equipe" passos={P_CONVITE}>
      {p => (
        <>
          <Cab titulo="Equipe e convites" sub="Convide vendedores e clientes por e-mail" />
          <div className="tt-card">
            <div className="tt-card-titulo">Novo convite</div>
            <Linha>
              <Campo label="E-mail" alvo="email" foco={p === 1} flex={1.4}><Digita texto="fazenda.esperanca@email.com" ativo={p >= 1} velocidade={35} /></Campo>
              <Campo label="Nome" alvo="nome" foco={p === 2}><Digita texto="João Pereira" ativo={p >= 2} /></Campo>
              <Sel label="Acesso" alvo="acesso" foco={p === 3} valor={p >= 3 ? 'Cliente' : 'Vendedor'} />
            </Linha>
            {p >= 3 && (
              <Linha>
                <Sel label="Tipo de conta" alvo="tipo" foco={p === 4} valor={p >= 4 ? 'Só estoque e pedidos' : 'Confina+ (parceria integrada)'} />
                <Sel label="Vendedor responsável" alvo="vend" foco={p === 5} valor={p >= 5 ? 'Ana Souza (vendedor)' : 'Definir depois'} />
              </Linha>
            )}
            <Btn alvo="enviar" ativo={p === 6}>Enviar convite</Btn>
          </div>
          <div className="tt-card sem-pad" style={{ marginTop: 10 }}>
            <Tabela cols={['E-mail', 'Acesso', 'Enviado']} destaque={p >= 7 ? [0] : []} linhas={[
              ...(p >= 7 ? [[<span data-alvo="pend">fazenda.esperanca@email.com</span>, <Badge cor="azul">Cliente · só estoque</Badge>, 'hoje']] : []),
              ['granja.riopardo@email.com', <Badge cor="verde">Cliente · Confina+</Badge>, '12/11'],
            ]} />
          </div>
        </>
      )}
    </Tela>
  )
}

// ─── 2b. Estoque gerenciado e contato ────────────────────────────────────────

const P_CLIENTE: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique no cliente para ver o detalhe', alvo: 'cli', clique: true, dur: 1500 },
  { legenda: 'Contato e endereço de entrega editáveis pela equipe', alvo: 'contato', dur: 2200 },
  { legenda: 'Clique em "Gerenciar estoque e consumo"', alvo: 'gerenciar', clique: true, dur: 1500 },
  { legenda: 'Clique em "Consumo" no produto', alvo: 'consumo', clique: true, dur: 1500 },
  { legenda: 'Informe o consumo por dia ou por semana', alvo: 'valor', dur: 1900 },
  { legenda: 'Clique em "Salvar"', alvo: 'salvar', clique: true, dur: 1300 },
  { legenda: 'O estoque passa a baixar sozinho e o fim é previsto', alvo: 'fim', dur: 3000 },
]

export function MockClienteEstoque() {
  return (
    <Tela pagina="Clientes" rota="/clientes" passos={P_CLIENTE}>
      {p => (
        <>
          <Cab titulo="Clientes" sub="Estoque, consumo e próxima reposição de cada fazenda" />
          <div className="tt-grade2" style={{ gridTemplateColumns: p >= 1 ? '1.1fr 1fr' : '1fr' }}>
            <div className="tt-card sem-pad">
              <Tabela cols={['Fazenda', 'Conta', 'Reposição']} linhas={[
                [<strong data-alvo="cli">Fazenda Esperança</strong>, <Badge cor="cinza">Só estoque</Badge>, '24/11'],
                [<strong>Fazenda Boa Vista</strong>, <Badge cor="verde">Confina+</Badge>, '22/11'],
                [<strong>Granja Rio Pardo</strong>, <Badge cor="cinza">Só estoque</Badge>, '30/11'],
              ]} />
            </div>
            {p >= 1 && (
              <div className="tt-card">
                <div className="tt-card-titulo">Fazenda Esperança</div>
                <div data-alvo="contato" className="tt-mini">João Pereira · (55) 99999-0000 <span style={{ color: '#2e7d32', fontWeight: 600 }}>Editar contato</span></div>
                <div className="tt-nota">BR-472, km 560 · Uruguaiana/RS<br /><span style={{ color: '#1b5e20', fontWeight: 600 }}>Abrir no Google Maps</span></div>
                <div className="tt-mini">Núcleo Terminação 40 · saldo 2.400 kg</div>
                <Btn alvo="gerenciar" ativo={p === 3} sm>Gerenciar estoque e consumo</Btn>
              </div>
            )}
          </div>
          {p >= 4 && (
            <Modal titulo="Estoque de Fazenda Esperança" sub="O cliente vê e altera o mesmo estoque" largura={505}>
              <Tabela cols={['Produto', 'Saldo', 'Consumo', 'Fim previsto', '']} linhas={[
                ['Núcleo Terminação 40', '2.400 kg', p >= 7 ? '120 kg/dia' : '—', p >= 7 ? <span data-alvo="fim"><Badge cor="ambar">20 dias</Badge></span> : '—',
                  <Btn ghost sm alvo="consumo" ativo={p === 4}>Consumo</Btn>],
              ]} />
              {p >= 5 && p <= 6 && (
                <div className="tt-card destaque">
                  <div className="tt-card-titulo">Consumo informado</div>
                  <Linha>
                    <Campo label="Consumo (kg)" alvo="valor" foco={p === 5}><Digita texto="840" ativo={p >= 5} /></Campo>
                    <Sel label="Por" valor="semana" />
                  </Linha>
                  <div className="tt-acoes"><Btn ghost sm>Cancelar</Btn><Btn sm alvo="salvar" ativo={p === 6}>Salvar</Btn></div>
                </div>
              )}
            </Modal>
          )}
        </>
      )}
    </Tela>
  )
}

// ─── 3. Pedidos ──────────────────────────────────────────────────────────────

const P_PEDIDO: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Pedido novo do cliente (ou alerta de estoque)', alvo: 'novo', dur: 1800 },
  { legenda: 'Clique em "Cotar"', alvo: 'cotar', clique: true, dur: 1400 },
  { legenda: 'Confirme quantidade e data de entrega', alvo: 'qtd', dur: 1600 },
  { legenda: 'Informe o preço por kg', alvo: 'preco', dur: 1600 },
  { legenda: 'Escreva a mensagem ao cliente', alvo: 'msg', dur: 2000 },
  { legenda: 'Clique em "Enviar cotação"', alvo: 'enviar', clique: true, dur: 1400 },
  { legenda: 'O cliente aprova e o pedido vai para Entregas', alvo: 'status', dur: 2600 },
]

export function MockPedido() {
  return (
    <Tela pagina="Pedidos" rota="/pedidos" passos={P_PEDIDO}>
      {p => {
        const status = p >= 7 ? <span data-alvo="status"><Badge cor="verde">Aprovado</Badge></span> : <span data-alvo="novo"><Badge cor="azul">Novo</Badge></span>
        return (
          <>
            <Cab titulo="Pedidos" sub="Do pedido novo até a entrega" acao={<Btn>+ Lançar pedido</Btn>} />
            <div className="tt-card sem-pad">
              <Tabela cols={['Nº', 'Cliente', 'Produto', 'Qtd', 'Status', '']} linhas={[
                ['#41', <strong>Fazenda Boa Vista</strong>, 'Ração Recria 18%', '22.000 kg', status,
                  p >= 7 ? <Btn sm ghost>WhatsApp</Btn> : <Btn sm alvo="cotar" ativo={p === 2}>Cotar</Btn>],
                ['#39', <strong>Fazenda Capão Alto</strong>, 'Farelo de soja', '3.000 kg', <Badge cor="ambar">Em cotação</Badge>, <Btn sm>Cotar</Btn>],
              ]} />
            </div>
            {p >= 3 && p <= 6 && (
              <Modal titulo="Cotação do pedido #41" sub="Fazenda Boa Vista · Ração Recria 18%" largura={440}>
                <Linha>
                  <Campo label="Quantidade (kg)" alvo="qtd" foco={p === 3}>22000</Campo>
                  <Campo label="Entrega" foco={p === 3}>20/11/2026</Campo>
                </Linha>
                <Linha>
                  <Campo label="Preço (R$/kg)" alvo="preco" foco={p === 4}><Digita texto="2,25" ativo={p >= 4} /></Campo>
                  <Campo label="Valor total (R$)">{p >= 4 ? '49.500,00' : ''}</Campo>
                </Linha>
                <Campo label="Mensagem ao cliente" alvo="msg" foco={p === 5} vazio="Condições de pagamento, frete"><Digita texto="Pagamento em 30 dias, frete incluso" ativo={p >= 5} velocidade={35} /></Campo>
                <div className="tt-acoes"><Btn ghost>Fechar</Btn><Btn alvo="enviar" ativo={p === 6}>Enviar cotação</Btn></div>
              </Modal>
            )}
          </>
        )
      }}
    </Tela>
  )
}

// ─── 3b. Entregas ────────────────────────────────────────────────────────────

const P_ENTREGAS: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'A carga passou do limite do caminhão', alvo: 'carga', dur: 2000 },
  { legenda: 'Clique em "Sugerir redistribuição"', alvo: 'sugerir', clique: true, dur: 1500 },
  { legenda: 'Confira os pedidos e as novas datas', alvo: 'mov', dur: 2200 },
  { legenda: 'Clique em "Aplicar e avisar clientes"', alvo: 'aplicar', clique: true, dur: 1500 },
  { legenda: 'A carga cabe no caminhão e o cliente recebe e-mail', alvo: 'ok', dur: 2200 },
  { legenda: 'Clique em "Romaneio" para imprimir ou baixar o PDF', alvo: 'romaneio', clique: true, dur: 2400 },
]

export function MockEntregas() {
  return (
    <Tela pagina="Entregas" rota="/entregas" passos={P_ENTREGAS}>
      {p => {
        const ajustado = p >= 5
        const kg = ajustado ? 12.8 : 17.2
        return (
          <>
            <Cab titulo="Entregas" sub="Pedidos aprovados por data e rota, capacidade de carga e romaneio" />
            <div data-alvo="carga" className="tt-card" style={{ borderColor: ajustado ? undefined : '#fca5a5' }}>
              <div className="tt-cab" style={{ marginBottom: 0 }}>
                <div>
                  <div className="tt-card-titulo">19/11 (qui) · Fronteira Oeste</div>
                  <div data-alvo="ok" className="tt-mini" style={{ color: ajustado ? '#57534e' : '#b91c1c' }}>
                    {kg.toFixed(1).replace('.', ',')} t de 15,0 t{ajustado ? ' · 85% da carga' : ' · acima da capacidade em 2,2 t'}
                  </div>
                </div>
                <span style={{ display: 'flex', gap: 5 }}>
                  {!ajustado && <Btn sm alvo="sugerir" ativo={p === 2}>Sugerir redistribuição</Btn>}
                  <Btn sm ghost alvo="romaneio" ativo={p === 6}>Romaneio</Btn>
                </span>
              </div>
              <Barra pct={(kg / 15) * 100} acima={!ajustado} />
              <Tabela cols={['Nº', 'Cliente', 'Produto', 'Qtd', '']} linhas={[
                ['#36', 'Fazenda Boa Vista', 'Ração Recria 18%', '8.000 kg', <Btn sm ghost>Ajustar</Btn>],
                ['#38', 'Estância São Pedro', 'Ração Adaptação 16%', '4.800 kg', <Btn sm ghost>Ajustar</Btn>],
                ...(!ajustado ? [['#40', 'Fazenda Esperança', 'Núcleo Terminação 40', '4.400 kg', <Btn sm ghost>Ajustar</Btn>]] : []),
              ]} />
            </div>
            {ajustado && (
              <div className="tt-card destaque" style={{ marginTop: 8 }}>
                <div className="tt-card-titulo">20/11 (sex) · Fronteira Oeste</div>
                <div className="tt-mini">9,6 t de 15,0 t · inclui o pedido #40</div>
                <Barra pct={64} />
              </div>
            )}
            {p >= 3 && p <= 4 && (
              <Modal titulo="Redistribuir a carga de 19/11 · Fronteira Oeste" sub="17,2 t programadas para 15,0 t de capacidade" largura={480}>
                <div data-alvo="mov">
                  <Tabela cols={['', 'Pedido', 'Cliente', 'Qtd', 'Nova data']} linhas={[
                    [<Check on />, '#40 · Núcleo Terminação 40', 'Fazenda Esperança', '4.400 kg', <span>20/11 (sex)<div className="tt-mini">Estoque até 24/11</div></span>],
                  ]} />
                </div>
                <div className="tt-mini verde">A carga fica com 12,8 t, dentro da capacidade.</div>
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="aplicar" ativo={p === 4}>Aplicar e avisar clientes</Btn></div>
              </Modal>
            )}
          </>
        )
      }}
    </Tela>
  )
}

// ─── 4. Demanda ──────────────────────────────────────────────────────────────

const P_DEMANDA: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Abastecimento necessário nos próximos 15 dias, por produto', alvo: 'lista', dur: 2400 },
  { legenda: 'Clique em "30 dias" para planejar o mês', alvo: 'd30', clique: true, dur: 2000 },
  { legenda: 'Clique em "Por dieta" para ver por dieta da cooperativa', alvo: 'dieta', clique: true, dur: 2600 },
]

export function MockDemanda() {
  return (
    <Tela pagina="Previsão de demanda" rota="/demanda" passos={P_DEMANDA}>
      {p => {
        const f = p >= 2 ? 2 : 1
        const porDieta = p >= 3
        const itens: Array<[string, number, string]> = porDieta
          ? [['Terminação Alto Grão', 41.6, '4 clientes'], ['Engorda Pronta 75/25', 22.4, '2 clientes'], ['Recria Intensiva', 9.8, '1 cliente']]
          : [['Milho moído', 18.4, '5 clientes'], ['Ração Recria 18%', 12.9, '3 clientes'], ['Núcleo Terminação 40', 6.3, '4 clientes'], ['Farelo de soja', 4.1, '3 clientes']]
        const max = Math.max(...itens.map(i => i[1] * f))
        return (
          <>
            <Cab titulo="Previsão de demanda" sub="Consumo previsto da carteira, base para produção, estoque e logística" />
            <div className="tt-pilulas">
              <span className={p < 2 ? 'on' : ''}>15 dias</span>
              <span data-alvo="d30" className={p >= 2 ? 'on' : ''}>30 dias</span>
              <span style={{ marginLeft: 8 }} className={!porDieta ? 'on' : ''}>Por produto</span>
              <span data-alvo="dieta" className={porDieta ? 'on' : ''}>Por dieta</span>
            </div>
            <div data-alvo="lista" className="tt-card" key={porDieta ? 'd' : 'p'}>
              <div className="tt-card-titulo">Abastecimento necessário nos próximos {p >= 2 ? 30 : 15} dias</div>
              {itens.map(([nome, t, cli]) => (
                <div key={nome} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 52px 64px', gap: 8, alignItems: 'center', fontSize: 11 }}>
                  <strong>{nome}</strong>
                  <Barra pct={((t * f) / max) * 100} />
                  <span style={{ textAlign: 'right', fontWeight: 600 }}>{(t * f).toFixed(1).replace('.', ',')} t</span>
                  <span className="tt-mini" style={{ textAlign: 'right' }}>{cli}</span>
                </div>
              ))}
            </div>
          </>
        )
      }}
    </Tela>
  )
}

// ─── 4b. Simulador ───────────────────────────────────────────────────────────

const P_SIM: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Informe o ponto de partida do produtor', alvo: 'partida', dur: 2000 },
  { legenda: 'No ciclo, use uma dieta da cooperativa', alvo: 'dieta', clique: true, dur: 1800 },
  { legenda: 'Composição e preços entram prontos', alvo: 'custo', dur: 1800 },
  { legenda: 'Compare os caminhos', alvo: 'comp', dur: 2400 },
  { legenda: 'Salve e clique em "Exportar PDF"', alvo: 'pdf', clique: true, dur: 1600 },
  { legenda: 'PDF com a marca da cooperativa para entregar ao produtor', alvo: 'doc', dur: 3000 },
]

export function MockSimuladorPortal() {
  return (
    <Tela pagina="Simulador" rota="/simulador" passos={P_SIM}>
      {p => (
        <>
          <Cab titulo="Fazenda Boa Vista: 120 bois" acao={<span style={{ display: 'flex', gap: 5 }}><Btn ghost alvo="pdf" ativo={p === 5}>Exportar PDF</Btn><Btn>Salvar</Btn></span>} />
          <div data-alvo="partida" className="tt-card">
            <div className="tt-card-titulo">Ponto de partida</div>
            <Linha>
              <Campo label="Animais" foco={p === 1}><Digita texto="120" ativo={p >= 1} /></Campo>
              <Campo label="Peso inicial (kg)" foco={p === 1}><Digita texto="360" ativo={p >= 1} /></Campo>
              <Campo label="Compra (R$/kg)" foco={p === 1}><Digita texto="11,50" ativo={p >= 1} /></Campo>
            </Linha>
          </div>
          <div className="tt-card" style={{ marginTop: 8 }}>
            <div className="tt-cab" style={{ marginBottom: 0 }}>
              <div className="tt-card-titulo">Ciclo 1 · Engorda · 100 dias</div>
              <Sel alvo="dieta" foco={p === 2} valor={p >= 2 ? 'Engorda Pronta 75/25' : undefined} vazio="Usar dieta Cooperativa Demo..." flex={0} />
            </div>
            {p >= 3 && <div data-alvo="custo" className="tt-mini">Engorda Pronta 75/25 R$ 1,95/kg · Silagem R$ 0,32/kg · <strong style={{ color: '#2e7d32' }}>R$ 1,90/kg MS</strong></div>}
          </div>
          {p >= 4 && (
            <div data-alvo="comp" className="tt-card sem-pad" style={{ marginTop: 8 }}>
              <Tabela cols={['Indicador', 'Engorda Pronta 75/25', <span>Adaptação e alto grão <Badge>Mais rentável</Badge></span>]} alinhar={['l', 'r', 'r']} linhas={[
                ['Peso final', '510,0 kg', '521,2 kg'],
                ['Custo do kg produzido', 'R$ 12,66', 'R$ 12,46'],
                ['Lucro por cabeça', <span style={{ color: '#2e7d32' }}>R$ 261,26</span>, <span style={{ color: '#2e7d32' }}>R$ 289,69</span>],
              ]} />
            </div>
          )}
          {p >= 6 && (
            <div className="tt-modal-fundo">
              <div data-alvo="doc" className="tt-modal" style={{ width: 300, gap: 6 }}>
                <div style={{ fontFamily: 'Syne, sans-serif', fontWeight: 800, color: '#1b5e20', fontSize: 15 }}>Cooperativa Demo</div>
                <div style={{ fontSize: 8, letterSpacing: '.08em', color: '#c99a2e', fontWeight: 700 }}>SIMULAÇÃO DE MANEJO BOVINO</div>
                <div style={{ height: 2, background: '#1b5e20' }} />
                <div className="tt-metricas" style={{ gridTemplateColumns: '1fr 1fr' }}>
                  <div className="tt-metrica"><span className="tt-mini">Peso final</span><strong>521,2 kg</strong></div>
                  <div className="tt-metrica"><span className="tt-mini">Lucro por cabeça</span><strong style={{ color: '#2e7d32' }}>R$ 289,69</strong></div>
                </div>
                <div className="tt-mini">Comparativo, ciclos e composição com o preço de cada ingrediente</div>
                <Btn sm>Baixar PDF / imprimir</Btn>
              </div>
            </div>
          )}
        </>
      )}
    </Tela>
  )
}
