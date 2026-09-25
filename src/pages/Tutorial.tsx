// src/pages/Tutorial.tsx
// Página de tutorial de uso para novos usuários: passo a passo com mockups
// animados de cada tela, na ordem recomendada para começar na plataforma.

import { ReactNode, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import './tutorial.css'
import {
  MockIngredientes, MockDietas, MockLotes, MockAnimais, MockCsv,
  MockImportarLote, MockPesagens, MockComparativo, MockRanking, MockParceiros,
} from '@/components/tutorial/Mockups'

interface Secao {
  id: string
  titulo: string
  curto: string
  rota: string
  rotaLabel: string
  resumo: string
  dicas: string[]
  mockups: { titulo?: string; el: ReactNode }[]
}

const SECOES: Secao[] = [
  {
    id: 'ingredientes', titulo: 'Cadastrar ingredientes', curto: 'Ingredientes',
    rota: '/ingredientes', rotaLabel: 'Abrir Ingredientes',
    resumo: 'Os ingredientes são a base das dietas. Cadastre os que você usa e informe quanto paga por eles, para que o custo de alimentação seja calculado com os seus números.',
    dicas: [
      'Em "Meus ingredientes" ficam os ingredientes que não estão na base padrão.',
      'Em "Meus preços da base" você informa o seu preço para ingredientes que já existem na base.',
      'Sem a % de Matéria Seca, o custo por ingrediente não pode ser calculado. Ingredientes sem MS aparecem como "não informado" na tabela.',
    ],
    mockups: [{ el: <MockIngredientes /> }],
  },
  {
    id: 'dietas', titulo: 'Criar dietas', curto: 'Dietas',
    rota: '/dietas', rotaLabel: 'Abrir Dietas',
    resumo: 'Monte as dietas de cada fase. Você pode partir de um template base, que já traz ingredientes e parâmetros prontos para ajustar, ou criar uma dieta do zero.',
    dicas: [
      'Para usar um template, abra a aba "Templates base" e clique em "Usar como base". Para criar do zero, use "+ Nova dieta".',
      'Informe GMD esperado, consumo diário (% do peso vivo em MS) e a divisão entre concentrado e volumoso.',
      'Quando o preço da ração mudar, registre o novo valor com "Novo preço válido a partir de": o histórico de custo é preservado.',
      'Depois de criada, a dieta pode ser escolhida em cada ciclo do lote. Para mudar no meio do ciclo, use "Trocar dieta" dentro do lote.',
    ],
    mockups: [{ el: <MockDietas /> }],
  },
  {
    id: 'lotes', titulo: 'Criar os lotes', curto: 'Lotes',
    rota: '/lotes', rotaLabel: 'Abrir Lotes',
    resumo: 'O lote organiza os animais e define a estratégia: quantos ciclos, quantos dias em cada um, o tipo de cada ciclo e qual dieta será usada. A criação acontece em dois passos.',
    dicas: [
      'Passo 1: nome, código, prefixo dos animais (usado no código de cada animal), data de criação, raça e origem.',
      'Passo 2: até 8 ciclos. Cada ciclo pode ser Confinamento, Pastagem ou Misto (ração + pasto), com dias planejados, dieta e GMD esperado.',
      'Dias planejados são uma estimativa. Em "Editar ciclos" você ajusta a data de início real de cada ciclo, que é a que comanda o cálculo.',
      'Ao terminar, o sistema pergunta se você quer cadastrar os animais agora.',
    ],
    mockups: [{ el: <MockLotes /> }],
  },
  {
    id: 'animais', titulo: 'Adicionar os animais', curto: 'Animais',
    rota: '/lotes', rotaLabel: 'Abrir Lotes',
    resumo: 'Dentro do lote, clique em "+ Adicionar animais". Cada entrada é uma leva: tem data de entrada (1ª pesagem), fornecedor e preço de compra próprios.',
    dicas: [
      'Fornecedor e preço de compra por kg são obrigatórios em cada leva. Um mesmo lote pode reunir levas de fornecedores diferentes.',
      '"Faixa de brincos" gera vários animais de uma vez (até 2000) com o mesmo peso padrão. "Individual" adiciona um animal por vez.',
      'Sexo é opcional e pode ser definido para a faixa ou ajustado animal por animal na lista, antes de cadastrar.',
      'Brincos repetidos na lista impedem o cadastro. Corrija antes de confirmar.',
    ],
    mockups: [{ el: <MockAnimais /> }],
  },
  {
    id: 'importacao', titulo: 'Importação de animais', curto: 'Importação',
    rota: '/importar', rotaLabel: 'Abrir Importar',
    resumo: 'Existem duas formas de importar. O CSV adiciona animais a um lote que já existe. A página "Importar lote" cria um lote novo, com todo o histórico, a partir de uma planilha.',
    dicas: [
      'CSV (dentro de "Adicionar animais", modo "Importar CSV"): colunas brinco, pesagem 1 e pesagem 2. A segunda pesagem e o cabeçalho são opcionais.',
      'O CSV não traz o sexo. Ajuste na lista antes de cadastrar, se precisar.',
      'Importar lote (.xlsx): baixe o modelo e preencha as 6 abas: Lote, Compras, Animais, Pesagens, Vendas e Custos. Cada arquivo vira um lote novo.',
      'Os nomes de dieta da aba "Lote" precisam ser iguais aos de uma dieta já cadastrada. Se houver qualquer erro, nada é importado, e a tela mostra a aba e a linha de cada problema.',
    ],
    mockups: [
      { titulo: 'CSV dentro do lote', el: <MockCsv /> },
      { titulo: 'Importar lote completo (.xlsx)', el: <MockImportarLote /> },
    ],
  },
  {
    id: 'pesagens', titulo: 'Pesagens', curto: 'Pesagens',
    rota: '/pesagens', rotaLabel: 'Abrir Pesagens',
    resumo: 'As pesagens atualizam o desempenho de cada animal e alimentam GMD, ranking e comparativo. Na página Pesagens você busca pelo brinco e lança o peso direto, sem abrir o lote.',
    dicas: [
      'Marque "Incluir inativos" para encontrar animais que já saíram do lote.',
      'A data da pesagem não pode ser anterior à entrada do animal.',
      'Também é possível pesar pela lista de animais do lote, no ícone "Pesar" de cada linha.',
      'Pesagens lançadas podem ser editadas no histórico do animal.',
    ],
    mockups: [{ el: <MockPesagens /> }],
  },
  {
    id: 'comparativo', titulo: 'Análise no Comparativo', curto: 'Comparativo',
    rota: '/comparativo', rotaLabel: 'Abrir Comparativo',
    resumo: 'O Comparativo coloca lotes lado a lado: peso médio, GMD, conversão, custo por kg ganho, lucro e margem. Use-o para descobrir qual estratégia, dieta ou origem está dando mais resultado.',
    dicas: [
      'A aba "Com animais ativos" mostra números projetados. A aba "Com vendas registradas" mostra o resultado realizado.',
      'Informe preço esperado (R$/kg vivo), % comissão e % encargo para ver o lucro e a margem projetados.',
      'A conversão é calculada como concentrado consumido dividido pelo ganho de peso.',
      'Em "Agrupar por", escolha Fornecedor para comparar a origem dos animais. Em "Ver por ciclo", veja o custo e o ganho médios só daquele período.',
    ],
    mockups: [{ el: <MockComparativo /> }],
  },
  {
    id: 'ranking', titulo: 'Uso dos rankings', curto: 'Ranking',
    rota: '/ranking', rotaLabel: 'Abrir Ranking',
    resumo: 'O Ranking ordena os animais pelo critério que você escolher. Selecione os melhores ou os piores e exporte um PDF: é a lista para fazer o aparte no curral ou separar animais para venda.',
    dicas: [
      'Critérios: Lucro, Peso, Ganho de peso, Custo por kg ganho e Rendimento, com a opção "Maior primeiro" ou "Menor primeiro".',
      'Nos animais ativos, o critério Lucro exige o preço esperado.',
      'O PDF traz só os animais marcados, ordenados por brinco, para facilitar a conferência no curral.',
      'Para registrar a venda, selecione os animais em Lotes e use "Registrar saída" (Venda, Abate, Transferência ou Morte).',
    ],
    mockups: [{ el: <MockRanking /> }],
  },
  {
    id: 'fornecedores', titulo: 'Fornecedores', curto: 'Fornecedores',
    rota: '/parceiros', rotaLabel: 'Abrir Parceiros',
    resumo: 'Os fornecedores são cadastrados na página Parceiros, junto com frigoríficos, corretores e produtores. Com o fornecedor cadastrado, você acompanha o desempenho de cada origem.',
    dicas: [
      'Em "Tipo", escolha Fornecedor. Parceiros do tipo Fornecedor ou Produtor aparecem no campo "Fornecedor cadastrado" ao adicionar animais.',
      'Um fornecedor digitado em texto livre aparece como "Não informado" nos filtros do Ranking e do Comparativo. Cadastre-o para poder comparar.',
      'CPF/CNPJ, contato, endereço e observações são opcionais.',
    ],
    mockups: [{ el: <MockParceiros /> }],
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

export default function Tutorial() {
  const navigate = useNavigate()
  const [ativa, setAtiva] = useState(SECOES[0].id)

  // Destaca no índice a seção que está na tela.
  useEffect(() => {
    const els = SECOES.map(s => document.getElementById(`tut-${s.id}`)).filter((e): e is HTMLElement => !!e)
    const io = new IntersectionObserver(entries => {
      const visiveis = entries.filter(e => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
      if (visiveis[0]) setAtiva(visiveis[0].target.id.replace('tut-', ''))
    }, { rootMargin: '-15% 0px -70% 0px' })
    els.forEach(e => io.observe(e))
    return () => io.disconnect()
  }, [])

  const irPara = (id: string) => {
    document.getElementById(`tut-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="page tut-page">
      <header className="tut-hero">
        <div className="tut-hero-kicker">Tutorial de uso</div>
        <h1 className="tut-hero-titulo">Comece do jeito certo</h1>
        <p className="tut-hero-texto">
          Nove passos, na ordem em que a plataforma funciona melhor. Cada etapa mostra, em animação, como a tela é usada.
          Clique em qualquer passo da animação para vê-lo com calma.
        </p>
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
      </header>

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
                <span className="tut-secao-n">{String(i + 1).padStart(2, '0')}</span>
                <div className="tut-secao-info">
                  <h2>{s.titulo}</h2>
                  <p>{s.resumo}</p>
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
                {s.dicas.map(d => (
                  <li key={d}><IconeDica /><span>{d}</span></li>
                ))}
              </ul>
            </section>
          ))}

          <div className="tut-fim">
            <div>
              <h2>Pronto para começar</h2>
              <p>Comece pelos ingredientes. Você pode voltar a este tutorial quando quiser, pelo menu lateral.</p>
            </div>
            <button type="button" className="btn btn-primary" onClick={() => navigate('/ingredientes')}>Cadastrar ingredientes</button>
          </div>
        </div>
      </div>
    </div>
  )
}
