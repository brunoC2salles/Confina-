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
  { legenda: 'Abra a aba "Templates base"', alvo: 'aba-base', clique: true, dur: 1500 },
  { legenda: 'Escolha um template e clique em "Usar como base"', alvo: 'usar', clique: true, dur: 1700 },
  { legenda: 'Dê um nome para a sua dieta', alvo: 'nome', dur: 2000 },
  { legenda: 'Confira o GMD esperado', alvo: 'gmd', dur: 1400 },
  { legenda: 'Ajuste consumo e % concentrado / volumoso', alvo: 'conc', dur: 1600 },
  { legenda: 'Revise a composição e os preços dos ingredientes', alvo: 'comp', dur: 2200 },
  { legenda: 'Clique em "Criar dieta"', alvo: 'criar', clique: true, dur: 1400 },
  { legenda: 'Dieta disponível para os ciclos dos lotes', alvo: 'card-nova', dur: 3000 },
]

export function MockDietas() {
  return (
    <Mockup pagina="Dietas" rota="/dietas" passos={P_DIETA}>
      {p => {
        const abaBase = p >= 2 && p < 8
        return (
          <>
            <Cab titulo="Dietas" acao={<Btn>+ Nova dieta</Btn>} />
            <Abas itens={[`Minhas dietas (${p >= 8 ? 1 : 0})`, 'Templates base (2)']} ativa={abaBase ? 1 : 0} alvos={[undefined, 'aba-base']} />
            {abaBase ? (
              <div className="tt-grade2">
                {[
                  { n: 'Adaptação', s: 'Adaptação · GMD est. 1.2 kg/dia', i: '5 ingredientes' },
                  { n: 'Terminação', s: 'Acabamento · GMD est. 1.6 kg/dia', i: '6 ingredientes' },
                ].map((t, i) => (
                  <div key={t.n} className="tt-card">
                    <div className="tt-card-titulo">{t.n}</div>
                    <div className="tt-mini">{t.s}</div>
                    <div className="tt-mini">{t.i}</div>
                    <Btn sm alvo={i === 0 ? 'usar' : undefined} ativo={p === 2 && i === 0}>Usar como base</Btn>
                  </div>
                ))}
              </div>
            ) : p >= 8 ? (
              <div className="tt-grade2">
                <div className="tt-card destaque" data-alvo="card-nova">
                  <div className="tt-card-titulo">Adaptação 21 dias <Badge>Adaptação</Badge></div>
                  <div className="tt-mini">GMD esperado 1.2 kg/dia · 60% concentrado</div>
                  <div className="tt-mini">5 ingredientes</div>
                </div>
              </div>
            ) : (
              <div className="tt-card tt-vazio">
                <div className="tt-vazio-titulo">Nenhuma dieta cadastrada</div>
                <div className="tt-mini">Crie uma dieta do zero ou use um template base como ponto de partida.</div>
              </div>
            )}
            {p >= 3 && p <= 7 && (
              <Modal titulo="Nova dieta" largura={470}>
                <Linha>
                  <Campo label="Nome da dieta" alvo="nome" foco={p === 3} flex={2}><Digita texto="Adaptação 21 dias" ativo={p >= 3} /></Campo>
                  <Campo label="GMD esperado (kg/dia)" alvo="gmd" foco={p === 4}>1.2</Campo>
                </Linha>
                <div className="tt-sec">Consumo e composição</div>
                <Linha>
                  <Campo label="Consumo diário (% PV em MS)">2.2</Campo>
                  <Campo label="% Concentrado" alvo="conc" foco={p === 5}>60</Campo>
                  <Campo label="% Volumoso">40</Campo>
                </Linha>
                <div data-alvo="comp" className={`tt-bloco${p === 6 ? ' foco' : ''}`}>
                  <div className="tt-bloco-titulo">Concentrado (60%)</div>
                  <Tabela cols={['Ingrediente', '% Part.', '% MS', 'R$/kg MN']} alinhar={['l', 'r', 'r', 'r']} linhas={[
                    ['Milho grão', '70', '88', '1,05'],
                    ['Farelo de soja', '25', '88', '2,10'],
                    ['Núcleo mineral', '5', '98', '4,80'],
                  ]} />
                </div>
                <div className="tt-acoes"><Btn ghost>Cancelar</Btn><Btn alvo="criar" ativo={p === 7}>Criar dieta</Btn></div>
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
