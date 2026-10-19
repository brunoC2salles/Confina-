// ─── Mockups animados do tutorial ───────────────────────────────────────────
// Reproduções simplificadas das telas reais (mesmos rótulos da aplicação).
// Todos os dados exibidos são ilustrativos.

import { ReactNode } from 'react'
import { Mockup, Digita, Passo } from './Player'

// ─── Peças visuais ───────────────────────────────────────────────────────────

function Cab({ titulo, sub, acao }: { titulo: string; sub?: string; acao?: ReactNode }) {
  return (
    <div className="tt-cab">
      <div>
        <div className="tt-cab-titulo">{titulo}</div>
        {sub && <div className="tt-cab-sub">{sub}</div>}
      </div>
      {acao}
    </div>
  )
}

function Btn({ children, alvo, ghost, ativo, sm }: { children: ReactNode; alvo?: string; ghost?: boolean; ativo?: boolean; sm?: boolean }) {
  return <span data-alvo={alvo} className={`tt-btn${ghost ? ' ghost' : ''}${ativo ? ' pulso' : ''}${sm ? ' sm' : ''}`}>{children}</span>
}

function Campo({ label, children, alvo, foco, flex = 1, vazio }: {
  label: string; children?: ReactNode; alvo?: string; foco?: boolean; flex?: number; vazio?: string
}) {
  return (
    <div className="tt-campo" style={{ flex: flex === 0 ? '0 0 auto' : flex }}>
      <div className="tt-label">{label}</div>
      <div data-alvo={alvo} className={`tt-input${foco ? ' foco' : ''}`}>
        {children || <span className="tt-ph">{vazio ?? ''}</span>}
      </div>
    </div>
  )
}

function Sel({ label, valor, alvo, foco, flex = 1, vazio = 'Selecione' }: {
  label?: string; valor?: string; alvo?: string; foco?: boolean; flex?: number; vazio?: string
}) {
  return (
    <div className="tt-campo" style={{ flex: flex === 0 ? '0 0 auto' : flex }}>
      {label && <div className="tt-label">{label}</div>}
      <div data-alvo={alvo} className={`tt-input tt-sel${foco ? ' foco' : ''}`}>
        <span className={valor ? 'tt-trocou' : 'tt-ph'} key={valor ?? 'vazio'}>{valor ?? vazio}</span>
        <svg width="10" height="10" viewBox="0 0 10 10"><path d="M2 3.5l3 3 3-3" fill="none" stroke="currentColor" strokeWidth="1.4" /></svg>
      </div>
    </div>
  )
}

function Linha({ children, gap = 8 }: { children: ReactNode; gap?: number }) {
  return <div className="tt-linha" style={{ gap }}>{children}</div>
}

function Modal({ titulo, sub, children, largura = 440 }: { titulo: string; sub?: string; children: ReactNode; largura?: number }) {
  return (
    <div className="tt-modal-fundo">
      <div className="tt-modal" style={{ width: largura }}>
        <div className="tt-modal-titulo">{titulo}</div>
        {sub && <div className="tt-modal-sub">{sub}</div>}
        <div className="tt-modal-corpo">{children}</div>
      </div>
    </div>
  )
}

function Abas({ itens, ativa, alvos }: { itens: string[]; ativa: number; alvos?: (string | undefined)[] }) {
  return (
    <div className="tt-abas">
      {itens.map((t, i) => <span key={t} data-alvo={alvos?.[i]} className={i === ativa ? 'ativa' : ''}>{t}</span>)}
    </div>
  )
}

function Check({ on, alvo }: { on: boolean; alvo?: string }) {
  return (
    <span data-alvo={alvo} className={`tt-check${on ? ' on' : ''}`}>
      {on && <svg width="9" height="9" viewBox="0 0 10 10"><path d="M2 5.2l2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.8" /></svg>}
    </span>
  )
}

function Tabela({ cols, linhas, destaque, colDestaque, alinhar }: {
  cols: ReactNode[]; linhas: ReactNode[][]; destaque?: number[]; colDestaque?: number; alinhar?: ('l' | 'r')[]
}) {
  return (
    <table className="tt-tabela">
      <thead>
        <tr>{cols.map((c, i) => <th key={i} className={`${alinhar?.[i] === 'r' ? 'r' : ''}${colDestaque === i ? ' col-dest' : ''}`}>{c}</th>)}</tr>
      </thead>
      <tbody>
        {linhas.map((l, i) => (
          <tr key={i} className={destaque?.includes(i) ? 'nova' : ''}>
            {l.map((c, j) => <td key={j} className={`${alinhar?.[j] === 'r' ? 'r' : ''}${colDestaque === j ? ' col-dest' : ''}`}>{c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const Badge = ({ children, cor = 'verde' }: { children: ReactNode; cor?: 'verde' | 'cinza' | 'azul' | 'ambar' }) =>
  <span className={`tt-badge ${cor}`}>{children}</span>

// ─── 1. Ingredientes ─────────────────────────────────────────────────────────

const P_ING: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Novo ingrediente"', alvo: 'novo', clique: true, dur: 1500 },
  { legenda: 'Informe o nome do ingrediente', alvo: 'nome', dur: 1900 },
  { legenda: 'Escolha a categoria', alvo: 'cat', clique: true, dur: 1500 },
  { legenda: 'Informe a % de Matéria Seca (opcional)', alvo: 'ms', dur: 1500 },
  { legenda: 'Informe o preço por kg', alvo: 'preco', dur: 1500 },
  { legenda: 'Clique em "Cadastrar"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'Ingrediente pronto para usar nas dietas', alvo: 'linha', dur: 3000 },
]

export function MockIngredientes() {
  return (
    <Mockup pagina="Ingredientes" rota="/ingredientes" passos={P_ING}>
      {p => {
        const linhas: ReactNode[][] = [
          [<strong>Silagem de milho</strong>, '32%', 'R$ 0,28', <Badge>Ativo</Badge>],
          [<strong>Farelo de soja</strong>, '88%', 'R$ 2,10', <Badge>Ativo</Badge>],
        ]
        if (p >= 7) linhas.push([<strong data-alvo="linha">Farelo de milho</strong>, '88%', 'R$ 0,85', <Badge>Ativo</Badge>])
        return (
          <>
            <Cab titulo="Ingredientes" sub="Gerencie ingredientes personalizados e preços dos ingredientes da base"
              acao={<Btn alvo="novo" ativo={p === 1}>+ Novo ingrediente</Btn>} />
            <Abas itens={['Meus ingredientes (' + (p >= 7 ? 3 : 2) + ')', 'Meus preços da base (4)']} ativa={0} />
            <div className="tt-card sem-pad">
              <Tabela cols={['Nome', '% MS', 'Preço (R$/kg)', 'Status']} linhas={linhas} destaque={p >= 7 ? [2] : []} />
            </div>
            {p >= 2 && p <= 6 && (
              <Modal titulo="Novo ingrediente">
                <Campo label="Nome" alvo="nome" foco={p === 2} vazio="Ex: Farelo de milho"><Digita texto="Farelo de milho" ativo={p >= 2} /></Campo>
                <Sel label="Categoria" alvo="cat" foco={p === 3} valor={p >= 4 ? 'Concentrado Energético' : undefined} vazio="Volumoso" />
                <Linha>
                  <Campo label="% Matéria Seca (opcional)" alvo="ms" foco={p === 4} vazio="Ex: 88"><Digita texto="88" ativo={p >= 4} /></Campo>
                  <Campo label="Preço (R$/kg)" alvo="preco" foco={p === 5} vazio="Ex: 0.85"><Digita texto="0.85" ativo={p >= 5} /></Campo>
                </Linha>
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 6}>Cadastrar</Btn></div>
              </Modal>
            )}
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 2. Dietas ───────────────────────────────────────────────────────────────

const P_DIETA: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Nova dieta"', alvo: 'nova', clique: true, dur: 1500 },
  { legenda: 'Dê um nome e informe o GMD esperado', alvo: 'nome', dur: 1900 },
  { legenda: 'Ajuste consumo e % concentrado / volumoso', alvo: 'conc', dur: 1600 },
  { legenda: 'Digite 3 letras do ingrediente', alvo: 'busca', dur: 1700 },
  { legenda: 'Escolha na lista: % MS e preço vêm do cadastro', alvo: 'sug', clique: true, dur: 1900 },
  { legenda: 'Com estoque em Compras, escolha o preço: cadastro ou custo médio do estoque', alvo: 'preco', clique: true, dur: 2400 },
  { legenda: 'Ingrediente novo: digite o nome e clique em "Cadastrar"', alvo: 'novo', clique: true, dur: 2600 },
  { legenda: 'Escolha a categoria e informe % MS e preço', alvo: 'cat', dur: 2200 },
  { legenda: 'Informe a % de participação de cada ingrediente', alvo: 'part', dur: 1800 },
  { legenda: 'Clique em "Criar dieta"', alvo: 'criar', clique: true, dur: 1400 },
  { legenda: 'Dieta criada; o ingrediente novo já aparece em Ingredientes', alvo: 'card-nova', dur: 3000 },
]

export function MockDietas() {
  return (
    <Mockup pagina="Dietas" rota="/dietas" passos={P_DIETA}>
      {p => {
        const sugestao = (alvo: string | undefined, ativo: boolean, titulo: ReactNode, sub: string) => (
          <div data-alvo={alvo} style={{ padding: '4px 8px', borderBottom: '1px solid #f5f5f4', background: ativo ? '#e8f5e9' : '#fff' }}>
            <div style={{ fontSize: 10.5, fontWeight: 600 }}>{titulo}</div>
            <div className="tt-mini">{sub}</div>
          </div>
        )
        const textoBusca = p === 4 || p === 5
          ? <Digita texto="mil" ativo={p >= 4} velocidade={160} />
          : p === 7
            ? <Digita texto="Caroço de algodão" ativo={p >= 7} velocidade={70} />
            : null
        return (
          <>
            <Cab titulo="Dietas" acao={<Btn alvo="nova" ativo={p === 1}>+ Nova dieta</Btn>} />
            <Abas itens={[`Minhas dietas (${p >= 11 ? 1 : 0})`, 'Templates base (2)']} ativa={0} />
            {p >= 11 ? (
              <div className="tt-grade2">
                <div className="tt-card destaque" data-alvo="card-nova">
                  <div className="tt-card-titulo">Terminação grão <Badge>Acabamento</Badge></div>
                  <div className="tt-mini">GMD esperado 1.6 kg/dia · 100% concentrado</div>
                  <div className="tt-mini">2 ingredientes</div>
                  <div className="tt-mini verde">Caroço de algodão cadastrado em Ingredientes</div>
                </div>
              </div>
            ) : (
              <div className="tt-card tt-vazio">
                <div className="tt-vazio-titulo">Nenhuma dieta cadastrada</div>
                <div className="tt-mini">Crie uma dieta do zero ou use um template base como ponto de partida.</div>
              </div>
            )}
            {p >= 2 && p <= 10 && (
              <Modal titulo="Nova dieta" largura={560}>
                <Linha>
                  <Campo label="Nome da dieta" alvo="nome" foco={p === 2} flex={2}><Digita texto="Terminação grão" ativo={p >= 2} /></Campo>
                  <Campo label="GMD esperado (kg/dia)">{p >= 2 ? '1.6' : ''}</Campo>
                </Linha>
                <Linha>
                  <Campo label="Consumo diário (% PV em MS)">2.2</Campo>
                  <Campo label="% Concentrado" alvo="conc" foco={p === 3}>100</Campo>
                  <Campo label="% Volumoso">0</Campo>
                </Linha>
                <div data-alvo="part" className={`tt-bloco${p === 9 ? ' foco' : ''}`}>
                  <div className="tt-bloco-titulo">Concentrado (100%){p >= 9 ? ' · Soma: 100.00% OK' : ''}</div>
                  {p < 5 ? (
                    <div className="tt-mini">Nenhum ingrediente. Digite o nome abaixo para adicionar.</div>
                  ) : (
                    <Tabela cols={['Ingrediente', '% Part.', '% MS', 'R$/kg MN']} alinhar={['l', 'r', 'r', 'r']} destaque={p === 8 ? [1] : []} linhas={[
                      [<strong>Milho grão</strong>, p >= 9 ? '75' : '', '88', p >= 6 ? '1,22' : '1,05'],
                      ...(p >= 8 ? [[<strong>Caroço de algodão</strong>, p >= 9 ? '25' : '', <Digita texto="92" ativo={p >= 8} velocidade={140} />, <Digita texto="1,60" ativo={p >= 8} velocidade={140} />]] : []),
                    ]} />
                  )}
                  {p >= 5 && (
                    <div className="tt-linha" data-alvo="preco" style={{ gap: 5, alignItems: 'center', flexWrap: 'wrap' }}>
                      <span className="tt-mini">Milho grão · Preço:</span>
                      <span className={`tt-chip${p < 6 ? ' on' : ''}`}>Cadastro R$ 1,05/kg MN</span>
                      <span className={`tt-chip${p >= 6 ? ' on' : ''}`}>Estoque R$ 1,22/kg MN · R$ 1,39/kg MS</span>
                    </div>
                  )}
                  {p >= 8 && (
                    <div className="tt-linha" style={{ gap: 8, alignItems: 'flex-end' }}>
                      <Sel label="Caroço de algodão: categoria" alvo="cat" foco={p === 8} valor="Conc. Proteico" flex={0} />
                      <span className="tt-mini verde">Novo · será cadastrado em Ingredientes ao salvar</span>
                    </div>
                  )}
                </div>
                <Campo label="Adicionar ingrediente" alvo="busca" foco={p === 4 || p === 7} vazio="Digite o nome do ingrediente (mín. 3 letras)">{textoBusca}</Campo>
                {(p === 4 || p === 5) && (
                  <div className="tt-lista">
                    {sugestao('sug', p === 5, <>Milho grão <span className="tt-mini">· Conc. Energético</span></>, 'MS 88% · Cadastro R$ 1,05/kg MN · Estoque R$ 1,39/kg MS')}
                    {p === 4 && sugestao(undefined, false, <>Milheto <span className="tt-mini">· Conc. Energético · próprio · inativo</span></>, 'MS 87% · Cadastro R$ 0,90/kg MN')}
                    {p === 4 && sugestao(undefined, false, <span style={{ color: '#2e7d32' }}>+ Cadastrar "mil"</span>, 'Novo ingrediente: informe categoria, % MS e preço na linha')}
                  </div>
                )}
                {p === 7 && (
                  <div className="tt-lista">
                    {sugestao('novo', true, <span style={{ color: '#2e7d32' }}>+ Cadastrar "Caroço de algodão"</span>, 'Novo ingrediente: informe categoria, % MS e preço na linha')}
                  </div>
                )}
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="criar" ativo={p === 10}>Criar dieta</Btn></div>
              </Modal>
            )}
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 3. Lotes ────────────────────────────────────────────────────────────────

const P_LOTE: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Novo lote"', alvo: 'novo', clique: true, dur: 1500 },
  { legenda: 'Informe o nome do lote', alvo: 'nome', dur: 1900 },
  { legenda: 'Confira a data de criação', alvo: 'data', dur: 1300 },
  { legenda: 'Informe raça e origem', alvo: 'raca', dur: 1500 },
  { legenda: 'Clique em "Próximo"', alvo: 'prox', clique: true, dur: 1400 },
  { legenda: 'Defina o número de ciclos (máx. 8)', alvo: 'nciclos', dur: 1700 },
  { legenda: 'Ciclo 1: tipo, dias planejados, dieta e GMD', alvo: 'dieta1', clique: true, dur: 1900 },
  { legenda: 'Ciclo 2: escolha a dieta', alvo: 'dieta2', clique: true, dur: 1600 },
  { legenda: 'Ciclo 3: escolha a dieta', alvo: 'dieta3', clique: true, dur: 1600 },
  { legenda: 'Clique em "Criar lote"', alvo: 'criar', clique: true, dur: 1400 },
  { legenda: 'Lote criado: cadastre os animais agora ou depois', alvo: 'add', dur: 3000 },
]

const CICLOS = [
  { n: 'Adaptação', t: 'Confinamento', d: '21', dieta: 'Adaptação 21 dias', g: '1.2' },
  { n: 'Crescimento', t: 'Misto (ração + pasto)', d: '60', dieta: 'Crescimento', g: '1.0' },
  { n: 'Acabamento', t: 'Confinamento', d: '90', dieta: 'Terminação', g: '1.6' },
]

export function MockLotes() {
  return (
    <Mockup pagina="Lotes" rota="/lotes" passos={P_LOTE}>
      {p => (
        <>
          <Cab titulo="Lotes" sub="Gestão de lotes e rastreamento individual dos animais"
            acao={<span className="tt-linha" style={{ gap: 6 }}><Btn ghost>Registrar saída</Btn><Btn alvo="novo" ativo={p === 1}>+ Novo lote</Btn></span>} />
          {p >= 11 ? (
            <div className="tt-card">
              <div className="tt-card-titulo">Lote Primavera </div>
            </div>
          ) : (
            <div className="tt-card tt-vazio">
              <div className="tt-vazio-titulo">Nenhum lote ativo</div>
              <Btn sm>Criar lote</Btn>
            </div>
          )}
          {p >= 2 && p <= 5 && (
            <Modal titulo="Novo lote" largura={450}>
              <Linha>
                <Campo label="Nome do lote" alvo="nome" foco={p === 2} flex={2}><Digita texto="Lote Primavera" ativo={p >= 2} /></Campo>
                <Campo label="Código do lote">L-012</Campo>
              </Linha>
              <Linha>
                <Campo label="Prefixo dos animais (opcional)">PRI</Campo>
                <Campo label="Data de criação" alvo="data" foco={p === 3}>01/10/2026</Campo>
              </Linha>
              <Linha>
                <Campo label="Raça predominante" alvo="raca" foco={p === 4}><Digita texto="Angus" ativo={p >= 4} /></Campo>
                <Campo label="Município de origem"><Digita texto="Alegrete" ativo={p >= 4} /></Campo>
                <Campo label="Estado" flex={0.5}>{p >= 4 ? 'RS' : ''}</Campo>
              </Linha>
              <div className="tt-nota">Fornecedor e preço de compra são informados por leva, na tela de "Adicionar animais".</div>
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="prox" ativo={p === 5}>Próximo</Btn></div>
            </Modal>
          )}
          {p >= 6 && p <= 10 && (
            <Modal titulo="Novo lote" largura={480}>
              <Linha>
                <Campo label="Número de ciclos (máx. 8)" alvo="nciclos" foco={p === 6}><Digita texto="3" ativo={p >= 6} /></Campo>
                <Campo label="Começar no ciclo número">1</Campo>
              </Linha>
              {CICLOS.map((c, i) => (
                <div key={c.n} className={`tt-ciclo${p === 7 + i ? ' foco' : ''}`}>
                  <div className="tt-ciclo-top">
                    <span className="tt-ciclo-n">Ciclo {i + 1}</span>
                    <Sel valor={c.t} flex={0} />
                  </div>
                  <Linha gap={6}>
                    <Campo label="Nome">{c.n}</Campo>
                    <Campo label="Dias planejados" flex={0.7}>{c.d}</Campo>
                    <Sel label="Dieta" alvo={`dieta${i + 1}`} foco={p === 7 + i} valor={p >= 8 + i ? c.dieta : undefined} vazio="Sem dieta definida" flex={1.4} />
                    <Campo label="GMD esperado" flex={0.7}>{p >= 8 + i ? c.g : ''}</Campo>
                  </Linha>
                </div>
              ))}
              <div className="tt-acoes"><Btn ghost>Voltar</Btn><Btn alvo="criar" ativo={p === 10}>Criar lote</Btn></div>
            </Modal>
          )}
          {p >= 11 && (
            <Modal titulo="Lote criado" sub="Deseja cadastrar os animais agora?" largura={380}>
              <div className="tt-mini">Você pode adicionar animais agora ou depois, na tela de detalhes do lote.</div>
              <div className="tt-acoes"><Btn ghost>Depois</Btn><Btn alvo="add" ativo>Adicionar animais</Btn></div>
            </Modal>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 4. Adicionar animais ────────────────────────────────────────────────────

const P_ANIMAIS: Passo[] = [
  { legenda: 'Início', dur: 1100 },
  { legenda: 'No lote, clique em "+ Adicionar animais"', alvo: 'add', clique: true, dur: 1500 },
  { legenda: 'Data da 1ª pesagem (data de entrada)', alvo: 'data', dur: 1400 },
  { legenda: 'Fornecedor desta leva (cadastrado ou texto livre)', alvo: 'forn', clique: true, dur: 1700 },
  { legenda: 'Preço de compra desta leva (R$/kg)', alvo: 'preco', dur: 1600 },
  { legenda: 'Modo "Faixa de brincos"', alvo: 'faixa', dur: 1200 },
  { legenda: 'Brinco inicial, final e peso padrão', alvo: 'fim', dur: 2100 },
  { legenda: 'Sexo: Macho ou Fêmea (opcional)', alvo: 'sexo', clique: true, dur: 1400 },
  { legenda: 'Clique em "Gerar"', alvo: 'gerar', clique: true, dur: 1400 },
  { legenda: 'Ajuste peso ou sexo de cada animal, se precisar', alvo: 'lista', dur: 1900 },
  { legenda: 'Clique em "Cadastrar 40 animal(is)"', alvo: 'cad', clique: true, dur: 1400 },
  { legenda: 'Animais cadastrados no lote', alvo: 'tab', dur: 3000 },
]

export function MockAnimais() {
  return (
    <Mockup pagina="Lotes" rota="/lotes" passos={P_ANIMAIS}>
      {p => (
        <>
          <Cab titulo="Lote Primavera" sub="L-012"
            acao={<Btn alvo="add" ativo={p === 1}>+ Adicionar animais</Btn>} />
          {p >= 11 ? (
            <div className="tt-card sem-pad" data-alvo="tab">
              <Tabela cols={['Código', 'Ciclo', 'Peso entrada', 'Data entrada', 'Peso hoje (est.)', 'Dias']} alinhar={['l', 'l', 'r', 'l', 'r', 'r']} destaque={[0, 1, 2, 3]} linhas={[
                ['PRI1001', '1', '280 kg', '01/10/2026', '280 kg', '0'],
                ['PRI1002', '1', '280 kg', '01/10/2026', '280 kg', '0'],
                ['PRI1003', '1', '280 kg', '01/10/2026', '280 kg', '0'],
                ['PRI1004', '1', '280 kg', '01/10/2026', '280 kg', '0'],
              ]} />
            </div>
          ) : (
            <div className="tt-card tt-vazio">
              <div className="tt-vazio-titulo">Nenhum animal neste lote</div>
              <div className="tt-mini">Adicione animais por faixa de brinco, individualmente ou importando um CSV.</div>
            </div>
          )}
          {p >= 2 && p <= 10 && (
            <Modal titulo="Adicionar animais — Lote Primavera" largura={500}>
              <Linha><Campo label="Data da 1ª pesagem (entrada)" alvo="data" foco={p === 2} flex={0.5}>01/10/2026</Campo></Linha>
              <div className="tt-bloco">
                <div className="tt-bloco-titulo">Compra desta leva</div>
                <Linha>
                  <Sel label="Fornecedor cadastrado" alvo="forn" foco={p === 3} valor={p >= 4 ? 'Agropecuária Boa Vista' : undefined} vazio="Sem cadastro (usar texto livre)" />
                  <Campo label="Ou fornecedor em texto livre" vazio="Ex: Alegrete" />
                </Linha>
                <Linha><Campo label="Preço de compra desta leva (R$/kg)" alvo="preco" foco={p === 4} flex={0.5} vazio="18.50"><Digita texto="18.50" ativo={p >= 4} /></Campo><div style={{ flex: 0.5 }} /></Linha>
              </div>
              <div className="tt-modos">
                <span data-alvo="faixa" className={`on${p === 5 ? ' pulso' : ''}`}>Faixa de brincos</span><span>Individual</span><span>Importar CSV</span>
              </div>
              <Linha gap={6}>
                <Campo label="Brinco inicial" foco={p === 6}><Digita texto="1001" ativo={p >= 6} /></Campo>
                <Campo label="Brinco final" alvo="fim" foco={p === 6}><Digita texto="1040" ativo={p >= 6} velocidade={90} /></Campo>
                <Campo label="Peso padrão (kg)" foco={p === 6}><Digita texto="280" ativo={p >= 6} velocidade={110} /></Campo>
                <Sel label="Sexo (opcional)" alvo="sexo" foco={p === 7} valor={p >= 8 ? 'Macho' : undefined} vazio="—" />
                <div className="tt-campo" style={{ flex: '0 0 auto' }}><div className="tt-label">&nbsp;</div><Btn alvo="gerar" ativo={p === 8}>Gerar</Btn></div>
              </Linha>
              {p >= 9 && (
                <div data-alvo="lista" className={`tt-lista${p === 9 ? ' foco' : ''}`}>
                  <div className="tt-lista-cab"><strong>40 animal(is) na lista</strong><span>Peso total (1ª pesagem): <strong>11.200 kg</strong> · Valor total: <strong>R$ 207.200,00</strong></span></div>
                  <Tabela cols={['Código', 'Brinco', 'Peso 1 (kg)', 'Peso 2 (kg)', 'Sexo']} destaque={[0, 1, 2]} linhas={[
                    ['PRI1001', '1001', '280', '—', 'Macho'], ['PRI1002', '1002', '280', '—', 'Macho'],
                  ]} />
                </div>
              )}
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="cad" ativo={p === 10}>{p >= 9 ? 'Cadastrar 40 animal(is)' : 'Cadastrar animal(is)'}</Btn></div>
            </Modal>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 5a. Importar CSV de animais ─────────────────────────────────────────────

const P_CSV: Passo[] = [
  { legenda: 'Início', dur: 1100 },
  { legenda: 'Em "Adicionar animais", escolha "Importar CSV"', alvo: 'csv', clique: true, dur: 1500 },
  { legenda: 'Selecione o arquivo .csv', alvo: 'arquivo', clique: true, dur: 1500 },
  { legenda: 'Os animais entram na lista com pesagem 1 e 2', alvo: 'lista', dur: 2000 },
  { legenda: 'Com pesagem 2, informe a data da 2ª pesagem', alvo: 'data2', dur: 1700 },
  { legenda: 'Clique em "Cadastrar"', alvo: 'cad', clique: true, dur: 1400 },
  { legenda: 'Animais e pesagens registrados', alvo: 'ok', dur: 2800 },
]

export function MockCsv() {
  return (
    <Mockup pagina="Lotes" rota="/lotes" passos={P_CSV}>
      {p => (
        <>
          <Cab titulo="Lote Primavera" sub="L-012" acao={<Btn>+ Adicionar animais</Btn>} />
          {p >= 6 && (
            <div className="tt-card sem-pad" data-alvo="ok">
              <Tabela cols={['Código', 'Ciclo', 'Peso entrada', 'Data entrada', 'Peso hoje (est.)', 'Dias']} alinhar={['l', 'l', 'r', 'l', 'r', 'r']} destaque={[0, 1, 2]} linhas={[
                ['PRI2001', '1', '312 kg', '01/10/2026', '338 kg', '14'],
                ['PRI2002', '1', '298 kg', '01/10/2026', '321 kg', '14'],
                ['PRI2003', '1', '305 kg', '01/10/2026', '322 kg', '14'],
              ]} />
            </div>
          )}
          {p <= 5 && (
            <Modal titulo="Adicionar animais — Lote Primavera" largura={500}>
              <Linha>
                <Campo label="Data da 1ª pesagem (entrada)" flex={1}>01/10/2026</Campo>
                {p >= 4 ? <Campo label="Data da 2ª pesagem" alvo="data2" foco={p === 4}><Digita texto="15/10/2026" ativo={p >= 4} /></Campo> : <div style={{ flex: 1 }} />}
              </Linha>
              <div className="tt-bloco">
                <div className="tt-bloco-titulo">Compra desta leva</div>
                <Linha>
                  <Sel label="Fornecedor cadastrado" valor="Agropecuária Boa Vista" />
                  <Campo label="Preço de compra desta leva (R$/kg)">18.50</Campo>
                </Linha>
              </div>
              <div className="tt-modos">
                <span className={p < 2 ? 'on' : ''}>Faixa de brincos</span><span>Individual</span>
                <span data-alvo="csv" className={`${p >= 2 ? 'on' : ''}${p === 1 ? ' pulso' : ''}`}>Importar CSV</span>
              </div>
              {p >= 2 && (
                <>
                  <div className="tt-mini">Arquivo .csv com as colunas: brinco, pesagem 1, pesagem 2 (a segunda pesagem é opcional). Cabeçalho opcional.</div>
                  <div data-alvo="arquivo" className={`tt-arquivo${p === 2 ? ' foco' : ''}`}>
                    <span className="tt-btn ghost sm">Escolher arquivo</span>
                    <span>{p >= 3 ? 'animais-leva2.csv' : 'Nenhum arquivo escolhido'}</span>
                  </div>
                </>
              )}
              {p >= 3 && (
                <div data-alvo="lista" className={`tt-lista${p === 3 ? ' foco' : ''}`}>
                  <div className="tt-lista-cab"><strong>25 animal(is) na lista</strong><span>Peso total (1ª pesagem): <strong>7.640 kg</strong> · Valor total: <strong>R$ 141.340,00</strong></span></div>
                  <Tabela cols={['Código', 'Brinco', 'Peso 1 (kg)', 'Peso 2 (kg)', 'Sexo']} destaque={[0, 1, 2]} linhas={[
                    ['PRI2001', '2001', '312', '338', '—'], ['PRI2002', '2002', '298', '321', '—'],
                  ]} />
                </div>
              )}
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="cad" ativo={p === 5}>{p >= 3 ? 'Cadastrar 25 animal(is)' : 'Cadastrar animal(is)'}</Btn></div>
            </Modal>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 5b. Importar lote (.xlsx) ───────────────────────────────────────────────

const P_XLSX: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "Baixar modelo (.xlsx)"', alvo: 'modelo', clique: true, dur: 1500 },
  { legenda: 'Preencha as 6 abas do modelo', alvo: 'abas', dur: 3000 },
  { legenda: 'Selecione a planilha preenchida', alvo: 'arquivo', clique: true, dur: 1500 },
  { legenda: 'Clique em "Validar e importar"', alvo: 'importar', clique: true, dur: 1400 },
  { legenda: 'A planilha inteira é validada antes de gravar', alvo: 'importar', dur: 1700 },
  { legenda: 'Lote criado com todo o histórico', alvo: 'ver', dur: 3000 },
]

const ABAS_XLSX = ['Lote', 'Compras', 'Animais', 'Pesagens', 'Vendas', 'Custos']

export function MockImportarLote() {
  return (
    <Mockup pagina="Importar" rota="/importar" passos={P_XLSX}>
      {p => (
        <>
          <Cab titulo="Importar lote" sub="Traga o histórico de um lote a partir de uma planilha — cada arquivo vira um lote novo" />
          <div className="tt-card">
            <div className="tt-card-titulo">Como funciona</div>
            <ol className="tt-ol">
              <li>Baixe o modelo e preencha as 6 abas (Lote, Compras, Animais, Pesagens, Vendas, Custos).</li>
              <li>Os nomes de dieta da aba "Lote" precisam bater com uma dieta já cadastrada.</li>
              <li>Envie o arquivo. Se houver erro, nada é importado.</li>
            </ol>
            <Btn sm ghost alvo="modelo" ativo={p === 1}>Baixar modelo (.xlsx)</Btn>
          </div>
          <div className="tt-card" style={{ marginTop: 10 }}>
            <Campo label="Planilha preenchida (.xlsx)" alvo="arquivo" foco={p === 3}>
              <span className="tt-btn ghost sm">Escolher arquivo</span>&nbsp; {p >= 4 ? 'lote-primavera.xlsx' : 'Nenhum arquivo escolhido'}
            </Campo>
            {p === 5 && <div className="tt-carregando"><span className="tt-spin" />Importando...</div>}
            {p >= 6 && (
              <div className="tt-sucesso">
                <div className="tt-sucesso-titulo">Lote "Lote Primavera" importado com sucesso</div>
                <div className="tt-mini verde">40 animal(is) · 120 pesagem(ns) · 0 venda(s) · 3 custo(s)</div>
                <Btn sm alvo="ver" ativo>Ver lote</Btn>
              </div>
            )}
            <div style={{ marginTop: 10 }}><Btn alvo="importar" ativo={p === 4}>{p === 5 ? 'Importando...' : 'Validar e importar'}</Btn></div>
          </div>
          {p === 2 && (
            <div className="tt-planilha" data-alvo="abas">
              <div className="tt-planilha-nome">modelo-importacao.xlsx</div>
              <div className="tt-planilha-grade">
                {Array.from({ length: 9 }).map((_, r) => (
                  <div key={r} className="tt-planilha-lin">
                    {Array.from({ length: 5 }).map((__, c) => <span key={c} className={r === 0 ? 'cab' : ''} />)}
                  </div>
                ))}
              </div>
              <div className="tt-planilha-abas">
                {ABAS_XLSX.map((a, i) => <span key={a} style={{ animationDelay: `${i * 0.45}s` }}>{a}</span>)}
              </div>
            </div>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 6. Pesagens ─────────────────────────────────────────────────────────────

const P_PESO: Passo[] = [
  { legenda: 'Início', dur: 1100 },
  { legenda: 'Digite o brinco no campo de busca', alvo: 'busca', dur: 1800 },
  { legenda: 'Selecione o animal encontrado', alvo: 'res', clique: true, dur: 1500 },
  { legenda: 'Informe o peso', alvo: 'peso', dur: 1500 },
  { legenda: 'Confira a data da pesagem', alvo: 'data', dur: 1200 },
  { legenda: 'Clique em "Registrar"', alvo: 'reg', clique: true, dur: 1400 },
  { legenda: 'A pesagem entra no histórico do animal', alvo: 'hist', dur: 3000 },
]

export function MockPesagens() {
  return (
    <Mockup pagina="Pesagens" rota="/pesagens" passos={P_PESO}>
      {p => (
        <>
          <Cab titulo="Pesagens" sub="Busque um animal pelo brinco e lance a pesagem direto, sem precisar abrir o lote" />
          <div className="tt-card">
            <Linha>
              <Campo label="" alvo="busca" foco={p === 1} flex={3} vazio="Buscar por brinco..."><Digita texto="1023" ativo={p >= 1} velocidade={120} /></Campo>
              <div className="tt-mini" style={{ display: 'flex', alignItems: 'center', gap: 6, alignSelf: 'flex-end', paddingBottom: 7, whiteSpace: 'nowrap' }}><Check on={false} />Incluir inativos</div>
            </Linha>
            {p === 2 && (
              <div className="tt-resultado" data-alvo="res">
                <span><strong>PRI1023</strong><span className="tt-mini"> brinco 1023</span></span>
                <span className="tt-mini">Lote Primavera</span>
              </div>
            )}
          </div>
          {p >= 3 ? (
            <div className="tt-card" style={{ marginTop: 10 }}>
              <div className="tt-card-titulo">PRI1023 <span className="tt-mini">· brinco 1023 · Lote Primavera</span></div>
              <div className="tt-sec">Lançar pesagem</div>
              <Linha>
                <Campo label="Peso (kg)" alvo="peso" foco={p === 3}><Digita texto="342" ativo={p >= 3} velocidade={110} /></Campo>
                <Campo label="Data" alvo="data" foco={p === 4}>25/11/2026</Campo>
                <Campo label="Observações (opcional)" flex={1.4} />
                <div className="tt-campo" style={{ flex: '0 0 auto' }}><div className="tt-label">&nbsp;</div><Btn alvo="reg" ativo={p === 5}>Registrar</Btn></div>
              </Linha>
              <div data-alvo="hist" style={{ marginTop: 8 }}>
                <Tabela cols={['Data', 'Peso', 'Observações']} destaque={p >= 6 ? [0] : []} linhas={[
                  ...(p >= 6 ? [['25/11/2026', '342 kg', '']] : []),
                  ['01/10/2026', '280 kg', 'Entrada'],
                ]} />
              </div>
            </div>
          ) : p < 2 && (
            <div className="tt-card tt-vazio" style={{ marginTop: 10 }}>
              <div className="tt-vazio-titulo">Busque um animal pelo brinco</div>
              <div className="tt-mini">Digite o brinco no campo acima para achar o animal e lançar a pesagem.</div>
            </div>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 7. Comparativo ──────────────────────────────────────────────────────────

const P_COMP: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Informe o preço esperado (R$/kg vivo)', alvo: 'preco', dur: 1800 },
  { legenda: 'O lucro projetado aparece por lote', alvo: 'lucro', dur: 2000 },
  { legenda: 'Clique no título de uma coluna para ordenar', alvo: 'gmd', clique: true, dur: 1700 },
  { legenda: 'Agrupe por fornecedor para comparar origens', alvo: 'agrupar', clique: true, dur: 2100 },
  { legenda: 'Marque um ciclo para ver só aquele período', alvo: 'ciclo2', clique: true, dur: 1700 },
  { legenda: 'Custo e ganho médios do ciclo escolhido', alvo: 'tab-ciclo', dur: 3000 },
]

export function MockComparativo() {
  return (
    <Mockup pagina="Comparativo" rota="/comparativo" passos={P_COMP}>
      {p => {
        const porForn = p >= 5
        const comLucro = p >= 2
        const lotes = [
          { n: 'Lote Primavera', a: '40', pm: '342', g: '1,38', c: '6,1', ck: 'R$ 9,80', l: 'R$ 812', m: '9,4%' },
          { n: 'Lote Inverno', a: '55', pm: '398', g: '1,52', c: '5,7', ck: 'R$ 9,10', l: 'R$ 1.064', m: '11,2%' },
          { n: 'Lote Recria', a: '32', pm: '301', g: '1,21', c: '6,6', ck: 'R$ 10,40', l: 'R$ 588', m: '7,1%' },
        ]
        const forn = [
          { n: 'Agropecuária Boa Vista', a: '62', pm: '371', g: '1,49', c: '5,8', ck: 'R$ 9,30', l: 'R$ 997', m: '10,6%' },
          { n: 'Fazenda São Pedro', a: '65', pm: '334', g: '1,29', c: '6,4', ck: 'R$ 10,10', l: 'R$ 702', m: '8,2%' },
        ]
        let linhas = porForn ? forn : lotes
        if (p >= 4 && !porForn) linhas = [...lotes].sort((a, b) => parseFloat(b.g.replace(',', '.')) - parseFloat(a.g.replace(',', '.')))
        return (
          <>
            <Cab titulo="Comparativo de lotes" sub="Lotes lado a lado — peso médio, GMD, conversão, custo/kg ganho, lucro e margem" />
            <Abas itens={['Com animais ativos', 'Com vendas registradas']} ativa={0} />
            <Linha>
              <Sel label="Agrupar por" alvo="agrupar" foco={p === 4} valor={porForn ? 'Fornecedor' : 'Lote'} />
              <Sel label="Filtrar por fornecedor" valor="Todos os fornecedores" />
              <Campo label="Preço esperado (R$/kg vivo)" alvo="preco" foco={p === 1}><Digita texto="16.50" ativo={p >= 1} /></Campo>
              <Campo label="% comissão" flex={0.6}>2</Campo>
            </Linha>
            <div className="tt-card sem-pad" style={{ marginTop: 8 }}>
              <Tabela
                colDestaque={p === 2 ? 4 : p === 3 || p === 4 ? 1 : undefined}
                alinhar={['l', 'r', 'r', 'r', 'r']}
                cols={[porForn ? 'Fornecedor' : 'Lote', <span data-alvo="gmd">GMD</span>, 'Conversão', 'Custo/kg ganho', <span data-alvo="lucro">Lucro projetado</span>]}
                linhas={linhas.map(r => [<strong>{r.n}</strong>, r.g, r.c, r.ck, comLucro ? r.l : '—'])}
              />
            </div>
            <div className="tt-ciclos">
              <span className="tt-label" style={{ margin: 0 }}>Ver por ciclo:</span>
              {[1, 2, 3].map(n => (
                <span key={n} data-alvo={`ciclo${n}`} className={`tt-chip${p >= 6 && n === 2 ? ' on' : ''}`}><Check on={p >= 6 && n === 2} />Ciclo {n}</span>
              ))}
            </div>
            {p >= 6 && (
              <div className="tt-card sem-pad" data-alvo="tab-ciclo" style={{ marginTop: 6 }}>
                <Tabela alinhar={['l', 'r', 'r', 'r', 'r']} destaque={[0, 1]}
                  cols={[porForn ? 'Fornecedor' : 'Lote', 'Dias (ciclo)', 'GMD (ciclo)', 'Conversão', 'Custo/kg ganho']}
                  linhas={forn.map(r => [<strong>{r.n}</strong>, '60', r.g, r.c, r.ck])} />
              </div>
            )}
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 8. Ranking ──────────────────────────────────────────────────────────────

const P_RANK: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Escolha o critério em "Ordenar por"', alvo: 'ordenar', clique: true, dur: 1700 },
  { legenda: 'Defina o Top N (ex: os 10 primeiros)', alvo: 'topn', dur: 1600 },
  { legenda: 'Marque todos (ou escolha animal por animal)', alvo: 'todos', clique: true, dur: 1700 },
  { legenda: 'Clique em "Exportar PDF"', alvo: 'pdf', clique: true, dur: 1500 },
  { legenda: 'Lista pronta para o aparte ou para a venda', alvo: 'folha', dur: 3400 },
]

const RANK = [
  ['1', 'PRI1017', 'Lote Primavera', 'Boa Vista', '361 kg', '81 kg'],
  ['2', 'PRI1003', 'Lote Primavera', 'Boa Vista', '358 kg', '78 kg'],
  ['3', 'INV0412', 'Lote Inverno', 'São Pedro', '402 kg', '77 kg'],
  ['4', 'PRI1029', 'Lote Primavera', 'Boa Vista', '355 kg', '75 kg'],
  ['5', 'INV0388', 'Lote Inverno', 'São Pedro', '397 kg', '74 kg'],
  ['6', 'PRI1011', 'Lote Primavera', 'Boa Vista', '349 kg', '72 kg'],
]

export function MockRanking() {
  return (
    <Mockup pagina="Ranking" rota="/ranking" passos={P_RANK}>
      {p => {
        const marcados = p >= 4
        return (
          <>
            <Cab titulo="Ranking" sub="Desempenho dos animais por rendimento, ganho de peso e lucro" />
            <Abas itens={['Ativos', 'Vendidos']} ativa={0} />
            <Linha gap={6}>
              <Sel label="Filtrar por lote" valor="Todos os lotes" />
              <Sel label="Ordenar por" alvo="ordenar" foco={p === 1} valor={p >= 2 ? 'Ganho de peso' : 'Peso'} />
              <Campo label="Top N (opcional)" alvo="topn" foco={p === 2} flex={0.7} vazio="Todos"><Digita texto="10" ativo={p >= 2} velocidade={140} /></Campo>
              <div className="tt-campo" style={{ flex: '0 0 auto' }}><div className="tt-label">&nbsp;</div>
                <Btn alvo="pdf" ativo={p === 4}>{marcados ? 'Exportar PDF (10)' : 'Exportar PDF'}</Btn></div>
            </Linha>
            <div className="tt-card sem-pad" style={{ marginTop: 8 }}>
              <Tabela alinhar={['l', 'l', 'l', 'l', 'l', 'r', 'r']} colDestaque={p >= 2 && p < 5 ? 6 : undefined}
                cols={[<Check on={marcados} alvo="todos" />, '#', 'Código', 'Lote', 'Fornecedor', 'Peso atual', 'Ganho de peso']}
                linhas={RANK.map(r => [<Check on={marcados} />, ...r])} destaque={marcados ? [0, 1, 2, 3, 4, 5] : []} />
            </div>
            {p >= 5 && (
              <div className="tt-folha" data-alvo="folha">
                <div className="tt-folha-titulo">Ranking dos que mais ganharam peso</div>
                <Tabela cols={['Brinco', 'Código', 'Lote', 'Ganho de peso']} alinhar={['l', 'l', 'l', 'r']} linhas={[
                  ['0388', 'INV0388', 'Lote Inverno', '74 kg'],
                  ['0412', 'INV0412', 'Lote Inverno', '77 kg'],
                  ['1003', 'PRI1003', 'Lote Primavera', '78 kg'],
                  ['1011', 'PRI1011', 'Lote Primavera', '72 kg'],
                  ['1017', 'PRI1017', 'Lote Primavera', '81 kg'],
                  ['1029', 'PRI1029', 'Lote Primavera', '75 kg'],
                ]} />
              </div>
            )}
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 9. Fornecedores (Parceiros) ─────────────────────────────────────────────

const P_PARC: Passo[] = [
  { legenda: 'Início', dur: 1100 },
  { legenda: 'Clique em "+ Novo parceiro"', alvo: 'novo', clique: true, dur: 1500 },
  { legenda: 'Informe o nome', alvo: 'nome', dur: 2000 },
  { legenda: 'Em "Tipo", escolha Fornecedor', alvo: 'tipo', clique: true, dur: 1500 },
  { legenda: 'CPF / CNPJ e contato (opcionais)', alvo: 'contato', dur: 2000 },
  { legenda: 'Clique em "Salvar"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'Fornecedor cadastrado', alvo: 'linha', dur: 1800 },
  { legenda: 'Ele aparece ao adicionar animais e nos filtros', alvo: 'uso', dur: 3200 },
]

export function MockParceiros() {
  return (
    <Mockup pagina="Parceiros" rota="/parceiros" passos={P_PARC}>
      {p => {
        const linhas: ReactNode[][] = [
          [<strong>Frigorífico Pampa</strong>, <Badge cor="azul">Frigorífico</Badge>, '—', '(55) 3200-0000'],
        ]
        if (p >= 6) linhas.unshift([<strong data-alvo="linha">Agropecuária Boa Vista</strong>, <Badge cor="cinza">Fornecedor</Badge>, '12.345.678/0001-90', '(55) 99999-0000'])
        return (
          <>
            <Cab titulo="Parceiros" sub="Frigoríficos, corretores e fornecedores" acao={<Btn alvo="novo" ativo={p === 1}>+ Novo parceiro</Btn>} />
            <div className="tt-card sem-pad">
              <Tabela cols={['Nome', 'Tipo', 'CPF/CNPJ', 'Contato']} linhas={linhas} destaque={p >= 6 ? [0] : []} />
            </div>
            {p >= 2 && p <= 5 && (
              <Modal titulo="Novo parceiro" largura={420}>
                <Campo label="Nome" alvo="nome" foco={p === 2} vazio="Nome"><Digita texto="Agropecuária Boa Vista" ativo={p >= 2} velocidade={45} /></Campo>
                <Sel label="Tipo" alvo="tipo" foco={p === 3} valor={p >= 4 ? 'Fornecedor' : 'Corretor'} />
                <Linha>
                  <Campo label="CPF / CNPJ" foco={p === 4} vazio="Opcional"><Digita texto="12.345.678/0001-90" ativo={p >= 4} velocidade={40} /></Campo>
                  <Campo label="Contato" alvo="contato" foco={p === 4} vazio="Telefone ou e-mail"><Digita texto="(55) 99999-0000" ativo={p >= 4} velocidade={45} /></Campo>
                </Linha>
                <Campo label="Endereço" vazio="Opcional" />
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 5}>Salvar</Btn></div>
              </Modal>
            )}
            {p >= 7 && (
              <div className="tt-usos" data-alvo="uso">
                <div className="tt-uso">
                  <div className="tt-uso-onde">Lotes · Adicionar animais</div>
                  <Sel label="Fornecedor cadastrado" valor="Agropecuária Boa Vista" />
                </div>
                <div className="tt-uso">
                  <div className="tt-uso-onde">Ranking e Comparativo</div>
                  <Sel label="Filtrar por fornecedor" valor="Agropecuária Boa Vista" />
                </div>
              </div>
            )}
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 10. Compras ─────────────────────────────────────────────────────────────
// Cabeçalho, botões e abas iguais aos da página Compras (aba Ração).

type AlvoCab = 'grupo' | 'compra'

function CabCompras({ ativo }: { ativo?: AlvoCab }) {
  return (
    <>
      <Cab titulo="Compras" sub="Ração (compras, estoque e fornecimento), medicamentos e outras compras rateadas entre os animais" />
      <div className="tt-linha" style={{ gap: 5, marginBottom: 8, flexWrap: 'wrap' }}>
        <Btn sm ghost alvo="grupo" ativo={ativo === 'grupo'}>+ Novo grupo</Btn>
        <Btn sm alvo="compra" ativo={ativo === 'compra'}>+ Registrar Compra</Btn>
      </div>
      <div className="tt-pilulas"><span className="on">Ração</span><span>Medicamentos</span><span>Outros</span></div>
    </>
  )
}

function Secao({ titulo, texto }: { titulo: string; texto?: string }) {
  return (
    <>
      <div className="tt-secao-titulo">{titulo}</div>
      {texto && <div className="tt-mini" style={{ marginBottom: 6 }}>{texto}</div>}
    </>
  )
}

function Radio({ on, alvo, children }: { on: boolean; alvo?: string; children: ReactNode }) {
  return (
    <span data-alvo={alvo} className="tt-radio-item">
      <span className={`tt-radio${on ? ' on' : ''}`} />{children}
    </span>
  )
}

// Modal "Registrar compra": escolha entre dieta pronta, ingrediente e fornecimento.
function ModalTipoCompra({ tipo, alvoIng, alvoDieta, alvoForn, grupo, alvoGrupo, focoGrupo, alvoCont, contAtivo }: {
  tipo: 'dieta' | 'ingrediente' | 'fornecimento'; alvoIng?: string; alvoDieta?: string; alvoForn?: string; grupo?: string; alvoGrupo?: string; focoGrupo?: boolean; alvoCont?: string; contAtivo?: boolean
}) {
  return (
    <Modal titulo="Registrar compra" largura={410}>
      <div className="tt-label">O que deseja registrar?</div>
      <div className="tt-opcao" data-alvo={alvoDieta}>
        <span className={`tt-radio${tipo === 'dieta' ? ' on' : ''}`} />
        <div><strong>Dieta pronta</strong><div className="tt-mini">Ração comprada pronta para um grupo de consumo.</div></div>
      </div>
      <div className="tt-opcao" data-alvo={alvoIng}>
        <span className={`tt-radio${tipo === 'ingrediente' ? ' on' : ''}`} />
        <div><strong>Ingrediente</strong><div className="tt-mini">Ingrediente comprado ou produzido na fazenda para a ração feita em casa.</div></div>
      </div>
      <div className="tt-opcao" data-alvo={alvoForn}>
        <span className={`tt-radio${tipo === 'fornecimento' ? ' on' : ''}`} />
        <div><strong>Fornecimento</strong><div className="tt-mini">Ração fornecida aos lotes, dividida entre eles pelo consumo previsto de cada um.</div></div>
      </div>
      {tipo === 'dieta' && <Sel label="Grupo de consumo" alvo={alvoGrupo} foco={focoGrupo} valor={grupo} />}
      <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo={alvoCont} ativo={contAtivo}>Continuar</Btn></div>
    </Modal>
  )
}

// ─── 10a. Compra de ingrediente ──────────────────────────────────────────────

const P_COMPRA_ING: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Registrar Compra"', alvo: 'compra', clique: true, dur: 1600 },
  { legenda: 'Escolha "Ingrediente"', alvo: 'opt-ing', clique: true, dur: 1700 },
  { legenda: 'Clique em "Continuar"', alvo: 'cont', clique: true, dur: 1300 },
  { legenda: 'Escolha o ingrediente', alvo: 'ing', clique: true, dur: 1500 },
  { legenda: 'Origem: Compra ou Produção própria', alvo: 'origem', clique: true, dur: 1800 },
  { legenda: 'Quantidade em kg de matéria natural, como pesada', alvo: 'qtd', dur: 1700 },
  { legenda: '% MS do material: vem do cadastro e pode ser alterado', alvo: 'ms', dur: 2000 },
  { legenda: 'Valor total (na produção própria, o custo de produção)', alvo: 'valor', dur: 1900 },
  { legenda: 'Fornecedor: parceiro do tipo Fornecedor, Produtor ou Corretor', alvo: 'forn', dur: 2000 },
  { legenda: 'Clique em "Registrar"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'Estoque em kg de MS: entradas, saldo e custo médio atualizados', alvo: 'linha', dur: 3000 },
]

export function MockCompras() {
  return (
    <Mockup pagina="Compras" rota="/compras" passos={P_COMPRA_ING}>
      {p => {
        const milho = p >= 11
          ? [<strong data-alvo="linha">Milho grão</strong>, '12.320 kg', '4.930 kg', '7.390 kg', 'R$ 1,10']
          : [<strong>Milho grão</strong>, '5.280 kg', '4.930 kg', '350 kg', 'R$ 1,00']
        return (
          <>
            <CabCompras ativo={p === 1 ? 'compra' : undefined} />
            <Secao titulo="Ingredientes (ração feita na fazenda)"
              texto="Saldo = entradas menos o consumo, em kg de matéria seca." />
            <div className="tt-card sem-pad">
              <Tabela cols={['Ingrediente', 'Entradas (MS)', 'Consumo (MS)', 'Saldo (MS)', 'Custo médio/kg MS']} alinhar={['l', 'r', 'r', 'r', 'r']}
                destaque={p >= 11 ? [0] : []} linhas={[
                  milho,
                  [<strong>Farelo de soja</strong>, '2.670 kg', '1.100 kg', '1.570 kg', 'R$ 2,36'],
                  [<strong>Silagem de milho</strong>, '12.800 kg', '5.860 kg', '6.940 kg', 'R$ 0,88'],
                ]} />
            </div>
            {p >= 2 && p <= 3 && (
              <ModalTipoCompra tipo={p >= 3 ? 'ingrediente' : 'dieta'} alvoIng="opt-ing" alvoCont="cont" contAtivo={p === 3} />
            )}
            {p >= 4 && p <= 10 && (
              <Modal titulo="Registrar ingrediente" largura={450}>
                <Linha>
                  <Sel label="Ingrediente" alvo="ing" foco={p === 4} valor={p >= 5 ? 'Milho grão' : undefined} />
                  <Sel label="Origem" alvo="origem" foco={p === 5} valor="Compra" />
                </Linha>
                {p >= 5 && <div className="tt-mini">Informe a quantidade em kg de matéria natural (como pesada) e o % MS do material desta entrada. O estoque entra em kg de MS. % MS do cadastro: 88,0%.</div>}
                <Linha>
                  <Campo label="Data da entrada">20/11/2026</Campo>
                  <Campo label="Quantidade (kg natural)" alvo="qtd" foco={p === 6}><Digita texto="8000" ativo={p >= 6} velocidade={110} /></Campo>
                </Linha>
                <Linha>
                  <Campo label="% MS do material" alvo="ms" foco={p === 7}>{p >= 5 ? '88' : ''}</Campo>
                  <Campo label="Valor total (R$)" alvo="valor" foco={p === 8}><Digita texto="7760" ativo={p >= 8} velocidade={110} /></Campo>
                </Linha>
                {p >= 7 && <div className="tt-mini">Entra no estoque: 7.040 kg de MS.{p >= 8 ? ' R$ 0,97 por kg natural, R$ 1,10 por kg de MS. Entra no custo médio do estoque a partir da data da entrada.' : ''}</div>}
                <Sel label="Fornecedor" alvo="forn" foco={p === 9} valor={p >= 9 ? 'Cerealista Central' : 'Não informado'} />
                <Campo label="Observações" vazio="Opcional" />
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 10}>Registrar</Btn></div>
              </Modal>
            )}
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 10b. Fornecimento de ração ──────────────────────────────────────────────

const P_FORN: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Registrar Compra"', alvo: 'compra', clique: true, dur: 1600 },
  { legenda: 'Escolha "Fornecimento"', alvo: 'opt-forn', clique: true, dur: 1700 },
  { legenda: 'Clique em "Continuar"', alvo: 'cont', clique: true, dur: 1300 },
  { legenda: 'Escolha a dieta: os lotes com essa dieta planejada já vêm marcados', alvo: 'dieta', clique: true, dur: 2200 },
  { legenda: 'Origem: feita na fazenda ou mistura pronta (comprada)', alvo: 'origem', dur: 1800 },
  { legenda: 'Informe o total: os ingredientes vêm pela composição', alvo: 'total', dur: 2200 },
  { legenda: 'Ajuste os kg se a mistura foi diferente', alvo: 'itens', dur: 1900 },
  { legenda: 'Clique em "Registrar Compra"', alvo: 'salvar', clique: true, dur: 1500 },
  { legenda: 'Divisão automática entre os lotes', alvo: 'divisao', dur: 2400 },
  { legenda: 'Planejado x realizado de cada lote', alvo: 'pxr', dur: 3200 },
]

const PXR = [
  ['Consumo MS (% PV)', '2,40%', '2,31%', '-3,8%'],
  ['Concentrado na MS', '80,00%', '76,50%', '-4,4%'],
  ['Custo por cabeça/dia', 'R$ 14,20', 'R$ 13,65', '-3,9%'],
  ['Custo por kg ganho', 'R$ 9,80', 'R$ 9,52', '-2,9%'],
  ['Conversão', '6,10', '5,92', '-3,0%'],
]

export function MockFornecimento() {
  return (
    <Mockup pagina="Compras" rota="/compras" passos={P_FORN}>
      {p => (
        <>
          <CabCompras ativo={p === 1 ? 'compra' : undefined} />
          {p >= 2 && p <= 3 && (
            <ModalTipoCompra tipo={p >= 3 ? 'fornecimento' : 'dieta'} alvoForn="opt-forn" alvoCont="cont" contAtivo={p === 3} />
          )}
          {p < 10 ? (
            <>
              <Secao titulo="Fornecimento de ração" texto="Ração efetivamente fornecida aos lotes, dividida entre eles pelo consumo previsto de cada um." />
              <div className="tt-card sem-pad">
                <Tabela cols={['Data', 'Dieta', 'Origem', 'Quantidade', 'Lotes']} alinhar={['l', 'l', 'l', 'r', 'l']} destaque={p === 9 ? [0] : []} linhas={[
                  ...(p >= 9 ? [['21/11/2026', 'Terminação 80/20', 'Feita na fazenda', '4.200 kg', 'Curral 1, Curral 2']] : []),
                  ['20/11/2026', 'Terminação 80/20', 'Feita na fazenda', '4.100 kg', 'Curral 1, Curral 2'],
                ]} />
              </div>
            </>
          ) : (
            <>
              <Secao titulo="Planejado x realizado" texto="Por lote, desde o primeiro fornecimento. Planejado: dieta dos ciclos do lote. Realizado: ração fornecida." />
              <div className="tt-card sem-pad" data-alvo="pxr" style={{ maxWidth: 380 }}>
                <div style={{ padding: '8px 10px 4px' }}>
                  <strong style={{ fontSize: 12 }}>Curral 1</strong>
                  <div className="tt-mini">desde 20/11/2026 · 2 dias</div>
                </div>
                <Tabela cols={['', 'Planejado', 'Realizado', 'Diferença']} alinhar={['l', 'r', 'r', 'r']} linhas={PXR} />
              </div>
            </>
          )}
          {p >= 4 && p <= 8 && (
            <Modal titulo="Registrar Compra" largura={480}>
              <Linha>
                <Campo label="Data do fornecimento">21/11/2026</Campo>
                <Sel label="Dieta" alvo="dieta" foco={p === 4} valor={p >= 5 ? 'Terminação 80/20' : undefined} />
              </Linha>
              <div className="tt-label">Origem da ração</div>
              <div className="tt-linha" data-alvo="origem" style={{ gap: 14, width: 'auto', alignSelf: 'flex-start' }}>
                <Radio on>Feita na fazenda</Radio><Radio on={false}>Mistura pronta (comprada)</Radio>
              </div>
              <Campo label="Quantidade total (kg)" alvo="total" foco={p === 6}><Digita texto="4200" ativo={p >= 6} velocidade={110} /></Campo>
              {p >= 6 && (
                <>
                  <div className="tt-mini">Dividida nos ingredientes pela composição da dieta. Ajuste os kg abaixo se a mistura foi diferente.</div>
                  <div data-alvo="itens" className={`tt-lista${p === 7 ? ' foco' : ''}`}>
                    <Tabela cols={['Ingrediente', 'Tipo', 'kg', '% MS']} alinhar={['l', 'l', 'r', 'r']} linhas={[
                      ['Milho grão', 'Concentrado', p >= 7 ? '2.450' : '2.430', '88'],
                      ['Farelo de soja', 'Concentrado', '520', '89'],
                      ['Silagem de milho', 'Volumoso', p >= 7 ? '1.230' : '1.250', '32'],
                    ]} />
                  </div>
                </>
              )}
              <div className="tt-label">Lotes que receberam</div>
              <div className="tt-mini" style={{ display: 'flex', gap: 14 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Check on={p >= 5} />Curral 1{p >= 5 && <span className="tt-mini verde">dieta planejada</span>}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><Check on={p >= 5} />Curral 2{p >= 5 && <span className="tt-mini verde">dieta planejada</span>}</span>
              </div>
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 8}>Registrar Compra</Btn></div>
            </Modal>
          )}
          {p === 9 && (
            <Modal titulo="Registrar Compra" largura={360}>
              <div data-alvo="divisao" className="tt-sucesso" style={{ marginTop: 0 }}>
                <div className="tt-sucesso-titulo">Fornecimento registrado</div>
                <div className="tt-mini" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Curral 1</span><span>58,3%</span></div>
                <div className="tt-mini" style={{ display: 'flex', justifyContent: 'space-between', width: '100%' }}><span>Curral 2</span><span>41,7%</span></div>
              </div>
              <div className="tt-acoes"><Btn>Fechar</Btn></div>
            </Modal>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 10d. Dieta pronta (grupo de consumo) ────────────────────────────────────

const P_DIETA_PRONTA: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Novo grupo"', alvo: 'grupo', clique: true, dur: 1500 },
  { legenda: 'Dê um nome ao grupo', alvo: 'nome', dur: 1900 },
  { legenda: 'Escolha a dieta comprada pronta', alvo: 'dieta', clique: true, dur: 1500 },
  { legenda: 'Marque os lotes que dividem essa ração', alvo: 'lotes', dur: 1700 },
  { legenda: 'Clique em "Criar grupo"', alvo: 'criar', clique: true, dur: 1400 },
  { legenda: 'Clique em "+ Registrar Compra"', alvo: 'compra', clique: true, dur: 1600 },
  { legenda: '"Dieta pronta" e o grupo de consumo', alvo: 'gc', clique: true, dur: 1800 },
  { legenda: 'Clique em "Continuar"', alvo: 'cont', clique: true, dur: 1300 },
  { legenda: 'Quantidade, % MS e valor total', alvo: 'valor', dur: 2400 },
  { legenda: 'Data da compra e início de uso', alvo: 'inicio', dur: 1500 },
  { legenda: 'Clique em "Registrar compra"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'Saldo do grupo em matéria seca', alvo: 'saldo', dur: 3200 },
]

export function MockDietaPronta() {
  return (
    <Mockup pagina="Compras" rota="/compras" passos={P_DIETA_PRONTA}>
      {p => (
        <>
          <CabCompras ativo={p === 1 ? 'grupo' : p === 6 ? 'compra' : undefined} />
          <Secao titulo="Dieta pronta" texto="Ração comprada pronta, dividida entre os lotes de um grupo de consumo." />
          {p >= 6 ? (
            <div className="tt-grade2">
              <div className={`tt-card${p === 6 ? ' destaque' : ''}`}>
                <div className="tt-card-titulo" style={{ justifyContent: 'space-between' }}>Currais Terminação <Badge>Ativo</Badge></div>
                <div className="tt-mini">Terminação 80/20</div>
              </div>
            </div>
          ) : (
            <div className="tt-card tt-vazio">
              <div className="tt-vazio-titulo">Nenhum grupo de consumo</div>
              <div className="tt-mini">Crie um grupo quando vários lotes dividirem a mesma leva de ração comprada.</div>
            </div>
          )}
          {p >= 2 && p <= 5 && (
            <Modal titulo="Novo grupo de consumo" largura={470}>
              <Linha>
                <Campo label="Nome do grupo" alvo="nome" foco={p === 2} vazio="Ex: Currais Ciclo 2 — Terminação"><Digita texto="Currais Terminação" ativo={p >= 2} /></Campo>
                <Sel label="Dieta" alvo="dieta" foco={p === 3} valor={p >= 4 ? 'Terminação 80/20' : undefined} />
              </Linha>
              <div className="tt-label">Lotes que compartilham essa leva de ração</div>
              <div data-alvo="lotes" className={`tt-bloco${p === 4 ? ' foco' : ''}`}>
                {[['Curral 1', 'L-010', true], ['Curral 2', 'L-011', true], ['Lote Primavera', 'L-012', false]].map(([n, c, marca]) => (
                  <span key={String(n)} className="tt-mini" style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#1c1917' }}>
                    <Check on={p >= 4 && Boolean(marca)} />{n} <span style={{ color: '#bdbdbd' }}>({c})</span>
                  </span>
                ))}
              </div>
              <Campo label="Observações" vazio="Opcional" />
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="criar" ativo={p === 5}>Criar grupo</Btn></div>
            </Modal>
          )}
          {p >= 7 && p <= 8 && (
            <ModalTipoCompra tipo="dieta" alvoGrupo="gc" focoGrupo={p === 7} grupo={p >= 8 ? 'Currais Terminação' : undefined}
              alvoCont="cont" contAtivo={p === 8} />
          )}
          {p >= 9 && p <= 11 && (
            <Modal titulo="Registrar compra" largura={450}>
              <Linha>
                <Campo label="Quantidade (kg)" foco={p === 9}><Digita texto="12000" ativo={p >= 9} velocidade={100} /></Campo>
                <Campo label="% Matéria seca">88</Campo>
                <Campo label="Valor total" alvo="valor" foco={p === 9}><Digita texto="21600" ativo={p >= 9} velocidade={140} /></Campo>
              </Linha>
              <div className="tt-mini">% MS calculada pelos componentes da dieta: 88,0%. Ajuste se a ração comprada for diferente.</div>
              <Linha>
                <Campo label="Data da compra">18/11/2026</Campo>
                <Campo label="Início de uso" alvo="inicio" foco={p === 10}>20/11/2026</Campo>
              </Linha>
              <Sel label="Fornecedor" valor="Rações Pampa" />
              <Campo label="Observações" vazio="Opcional" />
              <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="salvar" ativo={p === 11}>Registrar compra</Btn></div>
            </Modal>
          )}
          {p >= 12 && (
            <Modal titulo="Currais Terminação" sub="Terminação 80/20" largura={500}>
              <div className="tt-sec" style={{ color: '#1c1917' }}>Saldo</div>
              <div data-alvo="saldo" className="tt-metricas">
                {[['Comprado (MS)', '10.560 kg'], ['Consumido teórico (MS)', '0 kg'], ['Saldo (MS)', '10.560 kg'], ['Custo médio/kg MS vigente', 'R$ 2,05']].map(([r, v]) => (
                  <div key={r} className="tt-metrica"><div className="tt-mini">{r}</div><strong>{v}</strong></div>
                ))}
              </div>
              <div className="tt-sec" style={{ color: '#1c1917' }}>Compras</div>
              <Tabela cols={['Data compra', 'Início de uso', 'Quantidade', '% MS', 'Valor', 'R$/kg']} alinhar={['l', 'l', 'r', 'r', 'r', 'r']} destaque={[0]} linhas={[
                ['18/11/2026', '20/11/2026', '12.000 kg', '88', 'R$ 21.600,00', 'R$ 1,80'],
              ]} />
            </Modal>
          )}
        </>
      )}
    </Mockup>
  )
}

// ─── 10e. Ajustar inventário ─────────────────────────────────────────────────

const P_AJUSTE: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "Ajustar inventário" no ingrediente', alvo: 'ajustar', clique: true, dur: 1700 },
  { legenda: 'Informe a data da contagem', alvo: 'data', dur: 1400 },
  { legenda: 'Informe o saldo contado (kg natural) e o % MS do material', alvo: 'saldo', dur: 2000 },
  { legenda: 'Clique em "Salvar ajuste"', alvo: 'salvar', clique: true, dur: 1400 },
  { legenda: 'O saldo parte do valor contado; o custo médio não muda', alvo: 'novo-saldo', dur: 2200 },
  { legenda: 'Clique em "Entradas"', alvo: 'entradas', clique: true, dur: 1500 },
  { legenda: 'O ajuste fica registrado nas entradas do ingrediente', alvo: 'ajuste-linha', dur: 3200 },
]

export function MockAjusteInventario() {
  return (
    <Mockup pagina="Compras" rota="/compras" passos={P_AJUSTE}>
      {p => {
        const acoes = (alvoE?: string, alvoA?: string) => (
          <span style={{ display: 'flex', gap: 4, justifyContent: 'flex-end' }}>
            <Btn sm ghost alvo={alvoE} ativo={alvoE != null && p === 6}>{p >= 7 && alvoE ? 'Ocultar' : 'Entradas'}</Btn>
            <Btn sm ghost alvo={alvoA} ativo={alvoA != null && p === 1}>Ajustar inventário</Btn>
          </span>
        )
        return (
          <>
            <CabCompras />
            <Secao titulo="Ingredientes (ração feita na fazenda)" />
            <div className="tt-card sem-pad">
              <table className="tt-tabela compacta">
                <thead><tr>{['Ingrediente', 'Entradas (MS)', 'Consumo (MS)', 'Saldo (MS)', 'Custo médio/kg MS'].map((t, i) => (
                  <th key={t} className={i > 0 ? 'r' : ''} style={{ whiteSpace: 'normal' }}>{t}</th>
                ))}<th /></tr></thead>
                <tbody>
                  <tr>
                    <td><strong>Milho grão</strong></td><td className="r">12.320 kg</td><td className="r">4.930 kg</td>
                    <td className={`r${p >= 5 ? ' col-dest' : ''}`}><span data-alvo="novo-saldo">{p >= 5 ? '7.172 kg' : '7.390 kg'}</span></td>
                    <td className="r">R$ 1,10</td>
                    <td>{acoes('entradas', 'ajustar')}</td>
                  </tr>
                  {p >= 2 && p <= 4 && (
                    <tr><td colSpan={6} style={{ background: '#fafafa', whiteSpace: 'normal' }}>
                      <div className="tt-mini" style={{ marginBottom: 6 }}>Informe o saldo contado fisicamente, em kg de matéria natural, e o % MS do material contado. A partir da data, o saldo em MS parte desse valor; o custo médio não muda. Saldo teórico hoje: 7.390 kg de MS.</div>
                      <Linha>
                        <Campo label="Data da contagem" alvo="data" foco={p === 2}>25/11/2026</Campo>
                        <Campo label="Saldo contado (kg natural)" alvo="saldo" foco={p === 3}><Digita texto="8150" ativo={p >= 3} velocidade={120} /></Campo>
                        <Campo label="% MS do material">{p >= 3 ? '88' : ''}</Campo>
                        <Campo label="Observações" vazio="Opcional" />
                      </Linha>
                      <div className="tt-linha" style={{ gap: 6, marginTop: 6 }}><Btn sm alvo="salvar" ativo={p === 4}>Salvar ajuste</Btn><Btn sm ghost>Cancelar</Btn></div>
                    </td></tr>
                  )}
                  {p >= 7 && (
                    <tr><td colSpan={6} style={{ background: '#fafafa', padding: 6 }}>
                      <Tabela cols={['Data', 'Tipo', 'Quantidade', '% MS', 'kg MS', 'Valor', 'R$/kg MS']} destaque={[0]} linhas={[
                        [<span data-alvo="ajuste-linha">25/11/2026</span>, 'Ajuste', 'Contado: 8.150 kg', '88,0%', '7.172 kg', '—', '—'],
                        ['20/11/2026', 'Compra', '8.000 kg', '88,0%', '7.040 kg', 'R$ 7.760,00', 'R$ 1,10'],
                      ]} />
                    </td></tr>
                  )}
                  <tr>
                    <td><strong>Farelo de soja</strong></td><td className="r">2.670 kg</td><td className="r">1.100 kg</td><td className="r">1.570 kg</td><td className="r">R$ 2,36</td>
                    <td>{acoes()}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )
      }}
    </Mockup>
  )
}

// ─── 11. Simulador ───────────────────────────────────────────────────────────

const P_SIM: Passo[] = [
  { legenda: 'Início', dur: 1200 },
  { legenda: 'Clique em "+ Nova simulação"', alvo: 'nova', clique: true, dur: 1500 },
  { legenda: 'Ponto de partida, comum a todos os caminhos: à mão ou puxado de um lote ativo', alvo: 'partida', dur: 2600 },
  { legenda: 'Em cada ciclo: tipo, dias, GMD e mão de obra + estrutura (R$/kg produzido)', alvo: 'ciclo', dur: 2600 },
  { legenda: 'Copie uma dieta cadastrada ou monte à mão', alvo: 'dieta', clique: true, dur: 2000 },
  { legenda: 'Clique em "+ Adicionar ciclo" para seguir até a venda', alvo: 'add-ciclo', clique: true, dur: 1900 },
  { legenda: 'Clique em "Duplicar caminho" para testar outra alternativa: renomeie e ajuste os ciclos', alvo: 'duplicar', clique: true, dur: 2400 },
  { legenda: 'Compare os caminhos lado a lado: dias, peso, GMD e custos', alvo: 'comp', dur: 2800 },
  { legenda: 'Para ver lucro, clique em "Mostrar projeção de lucro"', alvo: 'lucro', clique: true, dur: 1900 },
  { legenda: 'Informe a venda (R$/kg vivo) de cada caminho', alvo: 'venda', dur: 2000 },
  { legenda: 'Lucro por cabeça e o caminho mais rentável', alvo: 'mais', dur: 2600 },
  { legenda: 'Clique em "Salvar"', alvo: 'salvar', clique: true, dur: 2000 },
]

export function MockSimulador() {
  return (
    <Mockup pagina="Simulador" rota="/simulador" passos={P_SIM}>
      {p => {
        if (p <= 1) {
          return (
            <>
              <Cab titulo="Simulador" sub="Monte caminhos do ciclo inicial até a venda e compare qual é mais rentável"
                acao={<Btn alvo="nova" ativo={p === 1}>+ Nova simulação</Btn>} />
              <div className="tt-card tt-vazio">
                <div className="tt-vazio-titulo">Nenhuma simulação salva</div>
                <div className="tt-mini">Crie uma simulação, defina o ponto de partida e monte um ou mais caminhos de ciclos até a venda.</div>
              </div>
            </>
          )
        }
        const cab = (
          <div className="tt-cab">
            <div>
              <div className="tt-mini">Voltar às simulações</div>
              <div className="tt-cab-titulo">Terminação Curral 3</div>
            </div>
            <div className="tt-linha" style={{ gap: 5, width: 'auto' }}>
              <Btn sm ghost>Excluir</Btn><Btn sm alvo="salvar" ativo={p === 11}>Salvar</Btn>
            </div>
          </div>
        )
        if (p <= 6) {
          const caminhos = p >= 6 ? ['Confinamento direto', 'Confinamento direto (cópia)'] : ['Confinamento direto']
          return (
            <>
              {cab}
              {p === 2 && (
                <div data-alvo="partida" className="tt-bloco foco">
                  <div className="tt-linha" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
                    <span className="tt-bloco-titulo">Ponto de partida · comum a todos os caminhos</span>
                    <span className="tt-linha" style={{ gap: 4, width: 'auto' }}>
                      <span className="tt-chip on">Informar à mão</span><span className="tt-chip">Puxar de um lote</span>
                    </span>
                  </div>
                  <Linha>
                    <Campo label="Quantidade de animais"><Digita texto="80" ativo velocidade={140} /></Campo>
                    <Campo label="Peso inicial médio (kg)"><Digita texto="360" ativo velocidade={140} /></Campo>
                    <Sel label="Compra" valor="R$ por kg vivo" />
                  </Linha>
                  <Linha>
                    <Campo label="Preço de compra (R$/kg)">11,50</Campo>
                    <Campo label="Custo já incorrido (R$/cabeça)">0</Campo>
                    <div style={{ flex: 1 }} />
                  </Linha>
                </div>
              )}
              {p >= 3 && (
                <>
                  <div className="tt-linha" style={{ justifyContent: 'space-between', alignItems: 'center', margin: '2px 0 6px' }}>
                    <span className="tt-linha" style={{ gap: 4, width: 'auto' }}>
                      {caminhos.map((c, i) => <span key={c} className={`tt-chip${i === caminhos.length - 1 ? ' on' : ''}`}>{c}</span>)}
                    </span>
                    <span className="tt-linha" style={{ gap: 4, width: 'auto' }}>
                      <Btn sm ghost>+ Novo caminho</Btn><Btn sm ghost alvo="duplicar" ativo={p === 6}>Duplicar caminho</Btn>
                    </span>
                  </div>
                  <div data-alvo="ciclo" className={`tt-bloco${p === 3 ? ' foco' : ''}`}>
                    <div className="tt-linha" style={{ gap: 6, alignItems: 'center' }}>
                      <Badge>Ciclo 1</Badge><strong style={{ fontSize: 11 }}>Adaptação</strong>
                    </div>
                    <Linha>
                      <Sel label="Tipo" valor="Confinamento" />
                      <Campo label="Dias" flex={0.6}>21</Campo>
                      <Campo label="GMD esperado (kg/dia)" flex={1.3}>1.2</Campo>
                      <Campo label="Mão de obra + estrutura (R$/kg produzido)" flex={2.4}>1,80</Campo>
                    </Linha>
                    <div data-alvo="dieta" className="tt-linha" style={{ justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #f5f5f4', paddingTop: 5 }}>
                      <span className="tt-mini">
                        <strong>Dieta</strong>
                        {p >= 4 ? ' · cópia de Adaptação 21 dias · 2.2% PV · 60% conc / 40% vol · R$ 1,32/kg MS' : ' · 0% PV · 100% conc / 0% vol'}
                      </span>
                      <Sel vazio="Copiar dieta cadastrada..." flex={0} foco={p === 4} />
                    </div>
                  </div>
                  {p >= 5 && (
                    <div className="tt-bloco" style={{ animation: 'tt-entra .35s ease-out' }}>
                      <div className="tt-linha" style={{ gap: 6, alignItems: 'center' }}>
                        <Badge>Ciclo 2</Badge><strong style={{ fontSize: 11 }}>Terminação</strong>
                      </div>
                      <Linha>
                        <Sel label="Tipo" valor="Confinamento" />
                        <Campo label="Dias" flex={0.6}>90</Campo>
                        <Campo label="GMD esperado (kg/dia)" flex={1.3}>1.6</Campo>
                        <Campo label="Mão de obra + estrutura (R$/kg produzido)" flex={2.4}>1,80</Campo>
                      </Linha>
                      <div className="tt-mini"><strong>Dieta</strong> · cópia de Terminação 80/20 · 2.4% PV · 80% conc / 20% vol · R$ 1,45/kg MS</div>
                    </div>
                  )}
                  <div style={{ marginTop: 6 }}><Btn sm ghost alvo="add-ciclo" ativo={p === 5}>+ Adicionar ciclo</Btn></div>
                </>
              )}
            </>
          )
        }
        const lucro = p >= 8
        const venda = p >= 10
        const linhas: ReactNode[][] = [
          ['Dias totais', '111', '210'],
          ['Peso final', '529,2 kg', '567,0 kg'],
          ['GMD médio', '1,524 kg/dia', '0,986 kg/dia'],
          ['Custo médio do kg produzido', 'R$ 11,41/kg', 'R$ 8,31/kg'],
          ['Custo total', 'R$ 6.070,00', 'R$ 5.860,00'],
          ...(lucro ? [
            [<strong>Lucro por cabeça</strong>, venda ? <strong style={{ color: '#2e7d32' }}>R$ 703,76</strong> : '—', venda ? <strong style={{ color: '#2e7d32' }}>R$ 1.397,60</strong> : '—'],
            ['Margem', venda ? '10,4%' : '—', venda ? '19,3%' : '—'],
          ] : []),
        ]
        return (
          <>
            {cab}
            <div className="tt-card sem-pad" data-alvo="comp">
              <div className="tt-linha" style={{ justifyContent: 'space-between', alignItems: 'center', padding: '6px 9px', borderBottom: '1px solid #f5f5f4' }}>
                <span style={{ fontSize: 11, fontWeight: 600 }}>Comparativo dos caminhos <span className="tt-mini">· valores por cabeça</span></span>
                <Btn sm ghost alvo="lucro" ativo={p === 8}>{lucro ? 'Ocultar projeção de lucro' : 'Mostrar projeção de lucro'}</Btn>
              </div>
              <Tabela cols={['Indicador', 'Confinamento direto', <span data-alvo="mais">Recria a pasto {venda && <Badge>Mais rentável</Badge>}</span>]}
                alinhar={['l', 'r', 'r']} destaque={venda ? [5] : []} linhas={linhas} />
            </div>
            {lucro && (
              <div data-alvo="venda" className={`tt-bloco${p === 9 ? ' foco' : ''}`} style={{ marginTop: 8 }}>
                <Linha>
                  <Campo label="Nome do caminho" flex={1.3}>Recria a pasto</Campo>
                  <Campo label="Venda (R$/kg vivo)" flex={1.2}><Digita texto="12,80" ativo={p >= 9} velocidade={120} /></Campo>
                  <Campo label="% comissão" flex={0.8}>0</Campo>
                  <Campo label="% encargos" flex={0.8}>0</Campo>
                  <Campo label="Rendimento de carcaça (%)" flex={1.7}>54</Campo>
                </Linha>
                <div className="tt-mini">Venda em peso vivo. O rendimento de carcaça é usado só no indicador de lucro por @.</div>
              </div>
            )}
          </>
        )
      }}
    </Mockup>
  )
}
