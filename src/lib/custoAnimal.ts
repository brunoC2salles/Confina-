// ─── Motor de peso e custo por animal (cálculo sob demanda) ───────────────────
//
// Reconstrói, para um único animal, o peso projetado e o custo acumulado
// (alimentação + operacional) até uma data qualquer, considerando:
//  - histórico de pesagens reais (reinicia a base de projeção quando existe)
//  - os lotes por onde o animal passou (via movimentacoes_animais)
//  - os ciclos de cada lote nesse período (dieta e GMD esperado vigentes)
//  - o custo por kg de MS vigente em cada dieta na data (dietas_historico_custo),
//    OU o custo manual da dieta (custo_manual_ativo/custo_manual_valor), quando
//    o produtor optar por informar um preço geral em vez de custear por insumo
//  - custos operacionais lançados no lote (sanitário, maquinário, mão de obra,
//    medicamentos, outros): o valor lançado é POR ANIMAL, ratado igualmente
//    por dia ao longo de TODOS os dias que o animal já viveu naquele lote
//    (todos os ciclos, não só o vigente na data exata do lançamento) — um
//    ciclo mais longo absorve proporcionalmente mais, mas nenhum ciclo já
//    vivido fica de fora, mesmo os anteriores à data do lançamento
//  - custo real de ração lançado pelo produtor no lote (recalibração): quando
//    existe, SUBSTITUI o custo de alimentação estimado por dieta a partir da
//    data do lançamento até o próximo lançamento (ou até hoje), rateado por
//    dia entre os animais ativos naquele dia (mesmo princípio do rateio
//    histórico acima, resolvido antes de chegar aqui)
//
// O cálculo é feito dia a dia (não há acumulação em background), conforme
// decisão de manter o custo histórico correto mesmo se o preço de uma dieta
// mudar depois.

export interface PeriodoLote {
  lote_id: string
  data_inicio: string       // yyyy-mm-dd, inclusive
  data_fim: string | null   // null = ainda está nesse lote
}

export interface CicloInfo {
  lote_id: string
  numero: number
  tipo_ciclo: 'pastagem' | 'confinamento' | 'misto'
  dieta_id: string | null
  gmd_esperado: number | null
  data_inicio: string | null
  data_fim: string | null
}

// ─── Troca de ciclo por animal (avanço individual/parcial) ────────────────────
// Quando um animal avança de ciclo separado do restante do lote (avanço
// parcial) ou junto com ele (avanço total, que também grava um evento por
// animal), fica registrado aqui: a partir de `data`, esse animal passa a
// usar a dieta/GMD do ciclo `ciclo_numero` daquele lote — independente da
// data_inicio/data_fim que ciclos_lote tem para o lote como um todo.
export interface CicloAnimalEvento {
  lote_id: string
  ciclo_numero: number
  // Em qual ciclo o animal estava ANTES desta troca — usado por
  // encontrarCicloAtivoParaAnimal pra saber que ciclo vale nos dias ANTES
  // desta data (ver comentário lá). Pode ser null em eventos antigos/
  // importados sem essa informação; nesse caso o motor cai no comportamento
  // anterior (data do lote) pros dias antes do evento.
  ciclo_numero_anterior: number | null
  data: string // yyyy-mm-dd
}

// ─── Troca de dieta dentro do mesmo ciclo (lote inteiro) ───────────────────────
// Diferente de CicloAnimalEvento (que troca o CICLO, por animal): aqui o
// ciclo continua o mesmo (mesmo numero, mesmo gmd_esperado, mesma etapa),
// só a dieta vigente a partir de `data` muda — pra todos os animais que
// estiverem nesse lote/ciclo naquele dia. Pode haver várias trocas no
// mesmo ciclo; ver resolverDietaIdNoDia logo abaixo.
export interface TrocaDietaCiclo {
  lote_id: string
  ciclo_numero: number
  dieta_id: string
  data: string // yyyy-mm-dd, a partir de quando essa dieta passa a valer
}

// Resolve qual dieta vale, num lote/ciclo específico, num dia específico: a
// troca mais recente com data <= dia manda; sem nenhuma troca até essa
// data, cai na dieta original configurada no ciclo (ciclos_lote.dieta_id).
function resolverDietaIdNoDia(
  loteId: string, cicloNumero: number, dia: number,
  dietaOriginal: string | null, trocas: TrocaDietaCiclo[],
): string | null {
  let vigente = dietaOriginal
  let melhorDia = -Infinity
  for (const t of trocas) {
    if (t.lote_id !== loteId || t.ciclo_numero !== cicloNumero) continue
    const d = toDay(t.data)
    if (d <= dia && d > melhorDia) { melhorDia = d; vigente = t.dieta_id }
  }
  return vigente
}

export interface HistoricoCustoPonto {
  custo_kg_ms: number | null
  vigente_desde: string
  vigente_ate: string | null
}

export interface DietaInfo {
  pct_consumo_pv_ms: number | null
  // % do consumo total que é concentrado, vindo da composição da dieta
  // (dietas.pct_concentrado) — usado só para quebrar consumoRacaoKg em
  // consumoConcentradoKg (kg do consumo total que foi concentrado), pro
  // cálculo de Conversão (consumo de concentrado / ganho de peso).
  pct_concentrado: number | null
  // GMD esperado atribuído especificamente ao concentrado (dietas.gmd_esperado_concentrado)
  // — usado como denominador da Conversão (consumoConcentradoKg / ganho
  // atribuído ao concentrado), em vez do ganho de peso total do ciclo.
  // Quando null (dieta antiga, campo não preenchido), o cálculo cai no
  // gmd_esperado TOTAL do ciclo como fallback (ver calcularAnimalNaData).
  gmd_esperado_concentrado: number | null
  historico: HistoricoCustoPonto[]
  // ─── Custo manual (opcional) ────────────────────────────────────────────────
  // Quando custoManualAtivo = true, o custo por kg de MS do dia usa
  // custoManualValorPorKg em vez de custoVigenteNoDia(historico). O valor aqui
  // já deve vir CONVERTIDO PARA R$/KG pelo chamador (ex.: se o produtor
  // cadastrou custo_manual_unidade = 'ton', dividir por 1000 antes de passar).
  custoManualAtivo?: boolean
  custoManualValorPorKg?: number | null
}

export interface PesagemPonto {
  data: string
  peso: number
}

export interface CustoOperacionalInfo {
  valor: number
  data_lancamento: string
  qtdAtivaNaData: number   // já resolvida: histórica no dia do lançamento, com fallback para a atual se não houver ninguém registrado naquele dia — usada só para exibir o total do lançamento (valor x qtdAtivaNaData), não entra na conta por animal (que é sempre o valor cheio)
}

// ─── Custo real de ração (recalibração) ────────────────────────────────────
// Já vem pré-resolvido por dia (rateio histórico feito em useLotes.ts, mesmo
// espírito do custo operacional, mas proporcional ao peso — animal mais
// pesado consome mais, então absorve mais do custo real do dia):
//  - valorTotalDia: quanto o grupo (lote inteiro, ou só o ciclo, se escopado)
//    gastou de ração real naquele dia (valor_total do lançamento dividido
//    pelos dias do intervalo de vigência)
//  - pesoTotalDia: soma do peso projetado dos animais do grupo naquele dia
//  - qtdAtivaDia: fallback para rateio igual por cabeça, usado só se
//    pesoTotalDia vier zerado (situação anômala, não deveria ocorrer em uso normal)
//  - cicloNumero: null = lançamento vale pro lote inteiro (comportamento
//    original); um número = vale só para os animais que estavam NAQUELE
//    ciclo naquele dia (avanço parcial pode deixar animais do mesmo lote em
//    ciclos diferentes — o lançamento de ração real de um ciclo não deve
//    ser diluído entre animais de outro ciclo, que comeram outra dieta)
// Quando um dia está presente neste mapa, o lançamento MAIS ESPECÍFICO para
// aquele animal (ciclo dele, senão o do lote inteiro) SUBSTITUI o cálculo por
// dieta (%MS x custo/kg) daquele dia — não soma.
export interface CustoRacaoRealDiaInfo {
  valorTotalDia: number
  pesoTotalDia: number
  qtdAtivaDia: number
  cicloNumero: number | null
}
export type CustoRacaoRealPorDia = Record<number, CustoRacaoRealDiaInfo[]> // dia (toDay) -> lançamentos vigentes naquele dia


export interface ResultadoAnimalNaData {
  peso: number
  custoAcumulado: number       // total = alimentação + operacional
  custoAlimentacao: number
  custoOperacional: number
  diasConfinamento: number
  gmdMedio: number
  // ─── Quebra por tipo de ciclo (pastagem x confinamento x misto) ───────────
  // Somam para os totais acima; adicionados sem alterar os campos existentes
  // para não quebrar quem já lê custoAcumulado/custoAlimentacao/etc. "Misto"
  // é um balde PRÓPRIO, não rateado entre os outros dois — um ciclo marcado
  // como misto (ração de confinamento + pasto ao mesmo tempo) não é nem
  // pastagem puro nem confinamento puro.
  diasEmPastagem: number
  diasEmConfinamento: number
  diasEmMisto: number
  ganhoPesoPastagem: number
  ganhoPesoConfinamento: number
  ganhoPesoMisto: number
  custoAlimentacaoPastagem: number
  custoAlimentacaoConfinamento: number
  custoAlimentacaoMisto: number
  custoOperacionalPastagem: number
  custoOperacionalConfinamento: number
  custoOperacionalMisto: number
  // ─── Consumo de ração em kg de MS (desde a entrada) ────────────────────────
  // Sempre estimado por peso x %MS da dieta vigente no dia, independente de
  // aquele dia ter custo real de ração lançado ou não — o custo real
  // (custos_racao_real_lote) só substitui o valor em R$, não existe kg
  // registrado nele. Ou seja: custo pode ser real, consumo em kg é sempre
  // a estimativa da dieta (decisão confirmada com o produtor).
  consumoRacaoKg: number
  // ─── Consumo de CONCENTRADO em kg de MS (subconjunto de consumoRacaoKg) ────
  // Mesma estimativa (peso x %MS da dieta), multiplicada pelo %concentrado da
  // dieta vigente no dia — usado no cálculo de Conversão (consumo de
  // concentrado / ganho de peso) do Comparativo de lotes.
  consumoConcentradoKg: number
  // ─── Ganho de peso atribuído ao concentrado (desde a entrada) ─────────────
  // Acumulado dia a dia usando dietas.gmd_esperado_concentrado da dieta
  // vigente naquele dia (só nos dias em que a dieta tem % de concentrado >
  // 0) — com fallback para o gmd_esperado TOTAL do ciclo quando a dieta não
  // tem gmd_esperado_concentrado preenchido. Usado como denominador da
  // Conversão (consumoConcentradoKg / ganhoPesoConcentrado) no Comparativo
  // de lotes — decisão tomada em conjunto com o produtor: o ganho atribuído
  // ao concentrado é medido pelo GMD esperado do concentrado, não pelo
  // ganho total do ciclo (que também inclui o volumoso/pasto).
  ganhoPesoConcentrado: number
  // ─── Quebra por etapa (ciclo individual, não só tipo pastagem/confinamento)
  // Chave = `${lote_id}#${numero_do_ciclo}` — usa lote_id no prefixo porque o
  // número do ciclo é reiniciado a cada lote (ciclo 1 do lote A não é o mesmo
  // período que ciclo 1 do lote B), e um animal pode ter passado por mais de
  // um lote (bifurcação/movimentação). Quando não há ciclo configurado num
  // dia (situação anômala), cai no bucket numero 0.
  porEtapa: Record<string, EtapaResultado>
}

export interface EtapaResultado {
  lote_id: string
  numero: number
  tipoCiclo: 'pastagem' | 'confinamento' | 'misto'
  dias: number
  ganhoPeso: number
  consumoRacaoKg: number
  consumoConcentradoKg: number
  // Ganho atribuído ao concentrado nesta etapa — ver comentário em
  // ResultadoAnimalNaData.ganhoPesoConcentrado (mesma lógica, escopada à etapa).
  ganhoPesoConcentrado: number
  custoAlimentacao: number
  custoOperacional: number
}

export interface MovimentoRelevante {
  tipo: string
  lote_origem_id: string | null
  lote_destino_id: string | null
  data: string
}

// ─── Helpers de data (dia inteiro desde epoch, evita drift de timezone) ───────

export function toDay(dateStr: string): number {
  return Math.floor(new Date(dateStr.slice(0, 10) + 'T00:00:00Z').getTime() / 86400000)
}

// ─── Reconstrói os períodos do animal em cada lote a partir do histórico ──────

const TIPOS_ENTRADA_LOTE = new Set(['entrada', 'transferencia_lote', 'bifurcacao'])
const TIPOS_SAIDA = new Set(['saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'])

export function construirPeriodosDeMovimentacoes(movs: MovimentoRelevante[]): PeriodoLote[] {
  const eventos = [...movs]
    .filter(m => TIPOS_ENTRADA_LOTE.has(m.tipo) || TIPOS_SAIDA.has(m.tipo))
    .sort((a, b) => toDay(a.data) - toDay(b.data))

  const periodos: PeriodoLote[] = []
  let atual: PeriodoLote | null = null

  for (const ev of eventos) {
    if (TIPOS_ENTRADA_LOTE.has(ev.tipo)) {
      if (atual) atual.data_fim = ev.data
      if (ev.lote_destino_id) {
        atual = { lote_id: ev.lote_destino_id, data_inicio: ev.data, data_fim: null }
        periodos.push(atual)
      } else {
        atual = null
      }
    } else {
      if (atual) atual.data_fim = ev.data
      atual = null
    }
  }
  return periodos
}

// ─── Lookups pontuais ──────────────────────────────────────────────────────────

export function encontrarLoteAtivo(dia: number, periodos: PeriodoLote[]): PeriodoLote | null {
  for (const p of periodos) {
    const inicio = toDay(p.data_inicio)
    const fim = p.data_fim ? toDay(p.data_fim) : null
    if (dia >= inicio && (fim === null || dia < fim)) return p
  }
  return null
}

function encontrarCicloAtivo(loteId: string, dia: number, ciclos: CicloInfo[]): CicloInfo | null {
  const doLote = ciclos.filter(c => c.lote_id === loteId).sort((a, b) => a.numero - b.numero)
  for (const c of doLote) {
    if (!c.data_inicio) continue
    const inicio = toDay(c.data_inicio)
    const fim = c.data_fim ? toDay(c.data_fim) : null
    if (dia >= inicio && (fim === null || dia < fim)) return c
  }
  // fallback: nenhum ciclo com data batendo — usa o de menor número como base
  return doLote[0] ?? null
}

// Versão ciente do animal: se ele tem algum evento de troca de ciclo
// registrado para este lote (avanço individual ou parcial), o evento mais
// recente com data <= dia manda — mesmo que a data_inicio/data_fim do
// ciclos_lote diga outra coisa (isso é o que permite animais do mesmo lote
// estarem em ciclos diferentes ao mesmo tempo). Sem nenhum evento pra esse
// animal nesse lote, cai exatamente no comportamento antigo (por data do lote).
//
// Nos dias ANTES do primeiro evento desse animal, ele ainda não tinha
// trocado de ciclo — então usamos o ciclo_numero_anterior desse primeiro
// evento, em vez de cair na data do ciclos_lote. Isso importa sempre que a
// data_inicio do ciclo seguinte no LOTE for anterior à data real do evento
// desse animal específico (ex.: lote avançou de ciclo numa data, mas esse
// animal em particular só foi pesado/confirmado bem depois) — sem isso, o
// animal "herdaria" o ciclo novo do lote antes da própria data real dele.
function encontrarCicloAtivoParaAnimal(
  loteId: string,
  dia: number,
  ciclos: CicloInfo[],
  eventosAnimal: CicloAnimalEvento[],
): CicloInfo | null {
  const eventosDoLote = eventosAnimal
    .filter(e => e.lote_id === loteId)
    .sort((a, b) => toDay(a.data) - toDay(b.data))

  let eventoVigente: CicloAnimalEvento | null = null
  for (const e of eventosDoLote) {
    if (toDay(e.data) <= dia) eventoVigente = e
    else break
  }

  if (eventoVigente) {
    const ciclo = ciclos.find(c => c.lote_id === loteId && c.numero === eventoVigente!.ciclo_numero)
    if (ciclo) return ciclo
  } else if (eventosDoLote.length > 0 && eventosDoLote[0].ciclo_numero_anterior != null) {
    // dia é anterior a qualquer evento conhecido, mas sabemos em que ciclo
    // o animal estava antes do primeiro deles.
    const ciclo = ciclos.find(c => c.lote_id === loteId && c.numero === eventosDoLote[0].ciclo_numero_anterior)
    if (ciclo) return ciclo
  }

  return encontrarCicloAtivo(loteId, dia, ciclos)
}

// Versão exportada que devolve só o número do ciclo (ou null) — usada fora
// deste arquivo (useLotes.ts) para saber, dia a dia, em qual ciclo cada
// animal estava, e assim ratear um lançamento de custo real de ração
// escopado a um ciclo só entre quem de fato esteve nele naquele dia.
export function cicloNumeroDoAnimalNoDia(
  loteId: string, dia: number, ciclos: CicloInfo[], eventosAnimal: CicloAnimalEvento[],
): number | null {
  return encontrarCicloAtivoParaAnimal(loteId, dia, ciclos, eventosAnimal)?.numero ?? null
}

// Versão exportada que devolve a DIETA vigente (id) de um animal num dia
// específico — mesma resolução usada internamente em calcularAnimalNaData
// (ciclo ativo do animal naquele dia + troca de dieta dentro do ciclo, se
// houver), exposta pra uso externo. Usada por custoRacaoGrupo.ts para saber,
// dia a dia, se um animal estava de fato na dieta associada a uma compra do
// grupo de consumo — sem isso, o rateio de uma compra vinculada à dieta X
// contaria também dias em que o animal já tinha mudado de dieta/ciclo, ou
// ainda não tinha entrado nela. Única fonte de verdade sobre "qual dieta o
// animal comia em tal dia" — nunca duplicar essa lógica em outro arquivo.
export function dietaVigenteDoAnimalNoDia(
  loteId: string, dia: number, ciclos: CicloInfo[],
  eventosAnimal: CicloAnimalEvento[], trocasDieta: TrocaDietaCiclo[],
): string | null {
  const ciclo = encontrarCicloAtivoParaAnimal(loteId, dia, ciclos, eventosAnimal)
  if (!ciclo) return null
  return resolverDietaIdNoDia(loteId, ciclo.numero, dia, ciclo.dieta_id, trocasDieta)
}

function custoVigenteNoDia(dia: number, historico: HistoricoCustoPonto[]): number | null {
  for (const h of historico) {
    const desde = toDay(h.vigente_desde)
    const ate = h.vigente_ate ? toDay(h.vigente_ate) : null
    if (dia >= desde && (ate === null || dia < ate)) return h.custo_kg_ms
  }
  return null
}

// Resolve o custo por kg de MS do dia: usa o valor manual da dieta quando
// ativado; caso contrário, usa o histórico de custo vigente na data.
function resolverCustoKgMsNoDia(dia: number, dietaInfo: DietaInfo): number | null {
  if (dietaInfo.custoManualAtivo) {
    return dietaInfo.custoManualValorPorKg ?? null
  }
  return custoVigenteNoDia(dia, dietaInfo.historico)
}

// ─── Suaviza o salto de uma pesagem real entre os dias desde a pesagem (ou
// entrada) anterior ──────────────────────────────────────────────────────
// Compartilhado por calcularAnimalNaData (peso, ganho por etapa e custo) e
// projetarPesoPorDia (só peso, usado por useLotes.ts e custoRacaoGrupo.ts
// para ratear custo operacional e custo real de ração entre os animais do
// grupo) — a pesagem real precisa dar acurácia ao peso E aos custos sempre,
// nos dois motores, não só num deles.
//
// Antes, a diferença entre o peso projetado e uma pesagem real inteira
// "caía" toda no único dia em que a pesagem foi lançada. Se esse dia
// coincidisse com (ou viesse logo após) uma troca de lote/ciclo, o ganho (ou
// o erro de projeção acumulado) do intervalo inteiro era atribuído ao ciclo
// vigente NAQUELE dia só — nunca ao(s) ciclo(s) anterior(es), mesmo que o
// animal tenha vivido a maior parte do intervalo neles. Resultado: ciclo que
// recebeu a pesagem ficava com ganho/GMD muito fora da realidade (pra mais
// ou pra menos), e o ciclo anterior nunca via a correção — e, em
// projetarPesoPorDia, o peso do grupo usado pra ratear custo (operacional e
// ração real) também saltava de uma vez, distorcendo a fatia de cada animal
// nos dias ao redor da pesagem de qualquer um deles.
//
// Agora a diferença é dividida em partes iguais por dia ao longo de TODO o
// intervalo, e cada dia soma ao ciclo que estava vigente NAQUELE dia — se o
// intervalo atravessa uma troca de ciclo, cada ciclo fica só com os dias (e
// a fração de ganho) que de fato viveu. O valor retornado em anchorPorDia
// permite ao chamador assinar o peso exatamente ao valor real no dia da
// pesagem, evitando deriva de arredondamento acumulada ao longo do intervalo
// suavizado.
function construirIncrementosDiarios(
  diaEntrada: number,
  diaLimiteExclusivo: number,
  pesoEntrada: number,
  pesagensOrdenadas: PesagemPonto[],
): { incrementoPorDia: Map<number, number>; anchorPorDia: Map<number, number> } {
  const anchorPorDia = new Map<number, number>()
  for (const p of pesagensOrdenadas) {
    const d = toDay(p.data)
    if (d <= diaEntrada || d >= diaLimiteExclusivo) continue
    if (!anchorPorDia.has(d)) anchorPorDia.set(d, p.peso)
  }
  const incrementoPorDia = new Map<number, number>()
  let anchorDia = diaEntrada
  let anchorPeso = pesoEntrada
  const pesagemNaEntrada = pesagensOrdenadas.find(p => toDay(p.data) === diaEntrada)
  if (pesagemNaEntrada && pesagemNaEntrada.peso !== pesoEntrada) {
    // Correção lançada no próprio dia de entrada: instantânea, não há dias
    // anteriores pra suavizar (o animal acabou de entrar).
    incrementoPorDia.set(diaEntrada, pesagemNaEntrada.peso - pesoEntrada)
    anchorPeso = pesagemNaEntrada.peso
  }
  for (const d of Array.from(anchorPorDia.keys()).sort((a, b) => a - b)) {
    const diasIntervalo = d - anchorDia
    if (diasIntervalo > 0) {
      const ganhoPorDia = (anchorPorDia.get(d)! - anchorPeso) / diasIntervalo
      for (let k = anchorDia; k < d; k++) incrementoPorDia.set(k, ganhoPorDia)
    }
    anchorDia = d
    anchorPeso = anchorPorDia.get(d)!
  }
  return { incrementoPorDia, anchorPorDia }
}

// ─── Cálculo principal ──────────────────────────────────────────────────────────

export function calcularAnimalNaData(
  dataAlvo: string,
  animal: { peso_entrada: number; data_entrada: string },
  pesagens: PesagemPonto[],
  periodos: PeriodoLote[],
  ciclos: CicloInfo[],
  dietas: Record<string, DietaInfo>,
  custosOperacionaisPorLote: Record<string, CustoOperacionalInfo[]> = {},
  custosRacaoRealPorLote: Record<string, CustoRacaoRealPorDia> = {},
  eventosCiclo: CicloAnimalEvento[] = [],
  trocasDieta: TrocaDietaCiclo[] = [],
): ResultadoAnimalNaData {
  const diaEntrada = toDay(animal.data_entrada)
  const diaAlvo = toDay(dataAlvo)

  if (diaAlvo <= diaEntrada) {
    return {
      peso: animal.peso_entrada, custoAcumulado: 0, custoAlimentacao: 0, custoOperacional: 0,
      diasConfinamento: 0, gmdMedio: 0,
      diasEmPastagem: 0, diasEmConfinamento: 0, diasEmMisto: 0,
      ganhoPesoPastagem: 0, ganhoPesoConfinamento: 0, ganhoPesoMisto: 0,
      custoAlimentacaoPastagem: 0, custoAlimentacaoConfinamento: 0, custoAlimentacaoMisto: 0,
      custoOperacionalPastagem: 0, custoOperacionalConfinamento: 0, custoOperacionalMisto: 0,
      consumoRacaoKg: 0, consumoConcentradoKg: 0, ganhoPesoConcentrado: 0, porEtapa: {},
    }
  }

  const pesagensOrdenadas = [...pesagens].sort((a, b) => toDay(a.data) - toDay(b.data))

  // ─── Suaviza o salto de uma pesagem real (ver comentário completo em
  // construirIncrementosDiarios, compartilhado com projetarPesoPorDia) ──────
  const { incrementoPorDia, anchorPorDia } = construirIncrementosDiarios(
    diaEntrada, diaAlvo, animal.peso_entrada, pesagensOrdenadas,
  )

  // ─── Dias vividos em cada lote (até diaAlvo) ───────────────────────────────
  // Usado para ratear cada lançamento de custo operacional igualmente por dia
  // ao longo de TODOS os ciclos que o animal já viveu naquele lote — não só o
  // ciclo vigente na data exata do lançamento. Ex.: lançamento feito no dia 5
  // (ciclo 1) mas o animal já está no dia 90 (ciclo 3): o valor é dividido
  // pelos 90 dias e absorvido proporcionalmente por todos os ciclos já
  // vividos até agora, inclusive os anteriores à data do próprio lançamento.
  const diasPorLote: Record<string, number> = {}
  for (const p of periodos) {
    const inicio = toDay(p.data_inicio)
    const fim = p.data_fim ? Math.min(toDay(p.data_fim), diaAlvo) : diaAlvo
    if (fim > inicio) diasPorLote[p.lote_id] = (diasPorLote[p.lote_id] ?? 0) + (fim - inicio)
  }

  // Peso é acumulado incrementalmente dia a dia (peso += gmd do ciclo vigente
  // NESSE dia), nunca recalculado como "base + tempo decorrido" — essa segunda
  // forma aplicaria retroativamente o GMD do ciclo mais recente a dias que
  // pertenceram a um ciclo anterior com GMD diferente, distorcendo o peso
  // sempre que o animal atravessa mais de um ciclo sem uma pesagem real no meio.
  let peso = animal.peso_entrada
  let custoAlimentacao = 0
  let custoOperacional = 0

  // Quebra por tipo de ciclo — puramente aditiva à lógica acima. O dia (ou o
  // ganho/custo daquele dia) é atribuído ao tipo do ciclo vigente NAQUELE dia;
  // um salto de pesagem real que cobre vários dias/tipos é atribuído ao tipo
  // vigente no dia em que a pesagem foi registrada (aproximação assumida).
  // "misto" é um balde à parte — não é dividido nem somado com os outros dois.
  let diasEmPastagem = 0
  let diasEmConfinamento = 0
  let diasEmMisto = 0
  let ganhoPesoPastagem = 0
  let ganhoPesoConfinamento = 0
  let ganhoPesoMisto = 0
  let custoAlimentacaoPastagem = 0
  let custoAlimentacaoConfinamento = 0
  let custoAlimentacaoMisto = 0
  let custoOperacionalPastagem = 0
  let custoOperacionalConfinamento = 0
  let custoOperacionalMisto = 0

  // ─── Consumo total em kg de MS e quebra por etapa (ciclo individual) ──────
  let consumoRacaoKg = 0
  let consumoConcentradoKg = 0
  let ganhoPesoConcentrado = 0
  const porEtapa: Record<string, EtapaResultado> = {}
  const obterEtapa = (loteId: string, numero: number, tipoCiclo: 'pastagem' | 'confinamento' | 'misto'): EtapaResultado => {
    const chave = `${loteId}#${numero}`
    if (!porEtapa[chave]) {
      porEtapa[chave] = {
        lote_id: loteId, numero, tipoCiclo,
        dias: 0, ganhoPeso: 0, consumoRacaoKg: 0, consumoConcentradoKg: 0, ganhoPesoConcentrado: 0,
        custoAlimentacao: 0, custoOperacional: 0,
      }
    }
    return porEtapa[chave]
  }

  for (let dia = diaEntrada; dia < diaAlvo; dia++) {
    const periodo = encontrarLoteAtivo(dia, periodos)
    const ciclo = periodo ? encontrarCicloAtivoParaAnimal(periodo.lote_id, dia, ciclos, eventosCiclo) : null
    const gmd = ciclo?.gmd_esperado ?? 0
    const tipoCiclo = ciclo?.tipo_ciclo ?? 'confinamento'
    const etapa = periodo ? obterEtapa(periodo.lote_id, ciclo?.numero ?? 0, tipoCiclo) : null

    if (tipoCiclo === 'pastagem') diasEmPastagem++
    else if (tipoCiclo === 'misto') diasEmMisto++
    else diasEmConfinamento++
    if (etapa) etapa.dias++

    const pesoAntes = peso
    // Incremento do dia: fatia suavizada de uma pesagem real futura (ver
    // bloco de suavização acima), senão a projeção normal pelo GMD esperado
    // do ciclo vigente (sem pesagem real nenhuma cobrindo este dia ainda).
    const incremento = incrementoPorDia.has(dia) ? incrementoPorDia.get(dia)! : (dia > diaEntrada ? gmd : 0)
    peso += incremento
    // Assina exatamente o valor real quando o próximo dia é uma pesagem —
    // evita deriva de arredondamento acumulada ao longo do intervalo suavizado.
    if (anchorPorDia.has(dia + 1)) peso = anchorPorDia.get(dia + 1)!
    const ganhoHoje = peso - pesoAntes
    if (tipoCiclo === 'pastagem') ganhoPesoPastagem += ganhoHoje
    else if (tipoCiclo === 'misto') ganhoPesoMisto += ganhoHoje
    else ganhoPesoConfinamento += ganhoHoje
    if (etapa) etapa.ganhoPeso += ganhoHoje

    // Consumo em kg de MS do dia: sempre estimado por peso x %MS da dieta
    // vigente, mesmo em dias cobertos por um lançamento de custo real de
    // ração (esse lançamento só substitui o valor em R$, não existe kg
    // registrado nele) — consumo em kg e custo em R$ são medidos separado.
    const dietaIdDia = periodo && ciclo
      ? resolverDietaIdNoDia(periodo.lote_id, ciclo.numero, dia, ciclo.dieta_id, trocasDieta)
      : (ciclo?.dieta_id ?? null)
    const dietaInfoDia = dietaIdDia ? dietas[dietaIdDia] : undefined
    if (dietaInfoDia?.pct_consumo_pv_ms != null) {
      const consumoHoje = peso * (dietaInfoDia.pct_consumo_pv_ms / 100)
      consumoRacaoKg += consumoHoje
      if (etapa) etapa.consumoRacaoKg += consumoHoje
      if (dietaInfoDia.pct_concentrado != null) {
        const concentradoHoje = consumoHoje * (dietaInfoDia.pct_concentrado / 100)
        consumoConcentradoKg += concentradoHoje
        if (etapa) etapa.consumoConcentradoKg += concentradoHoje

        // Ganho atribuído ao concentrado, só nos dias em que a dieta de fato
        // tem % de concentrado (>0) — dia de pastagem pura (0% concentrado)
        // não contribui aqui, mesmo que o ciclo tenha gmd_esperado_concentrado
        // preenchido por engano. Usa o GMD esperado do concentrado da dieta
        // vigente; se não estiver preenchido (dieta antiga), cai no GMD
        // esperado TOTAL do ciclo (mesmo `gmd` usado para o peso do dia) —
        // fallback combinado com o produtor.
        if (dietaInfoDia.pct_concentrado > 0) {
          const gmdConcentradoHoje = dietaInfoDia.gmd_esperado_concentrado ?? gmd
          ganhoPesoConcentrado += gmdConcentradoHoje
          if (etapa) etapa.ganhoPesoConcentrado += gmdConcentradoHoje
        }
      }
    }

    // Custo real de ração lançado pelo produtor, neste dia — pode ser um
    // lançamento pro lote inteiro (cicloNumero null) ou escopado a um ciclo
    // específico. Quando os dois existem pro mesmo dia, o mais específico
    // (o do ciclo em que este animal está) vence. Substitui o cálculo
    // estimado por dieta (%MS x custo/kg) — não soma aos dois. O valor do
    // dia é dividido proporcionalmente ao peso deste animal sobre o peso
    // total do grupo naquele dia (animal mais pesado consome mais, então
    // absorve mais do custo real) — cai no rateio igual por cabeça só se o
    // peso total do dia vier zerado (caso anômalo). Fora do período coberto
    // por um lançamento real, cai no cálculo estimado normal.
    const entradasRacaoRealHoje = periodo ? (custosRacaoRealPorLote[periodo.lote_id]?.[dia] ?? []) : []
    const infoRacaoRealHoje =
      entradasRacaoRealHoje.find(e => e.cicloNumero === (ciclo?.numero ?? null))
      ?? entradasRacaoRealHoje.find(e => e.cicloNumero === null)
    if (infoRacaoRealHoje != null) {
      const custoHoje = infoRacaoRealHoje.pesoTotalDia > 0
        ? infoRacaoRealHoje.valorTotalDia * (peso / infoRacaoRealHoje.pesoTotalDia)
        : infoRacaoRealHoje.valorTotalDia / Math.max(infoRacaoRealHoje.qtdAtivaDia, 1)
      custoAlimentacao += custoHoje
      if (tipoCiclo === 'pastagem') custoAlimentacaoPastagem += custoHoje
      else if (tipoCiclo === 'misto') custoAlimentacaoMisto += custoHoje
      else custoAlimentacaoConfinamento += custoHoje
      if (etapa) etapa.custoAlimentacao += custoHoje
    } else if (dietaInfoDia?.pct_consumo_pv_ms != null) {
      const custoKgMs = resolverCustoKgMsNoDia(dia, dietaInfoDia)
      if (custoKgMs != null) {
        const custoHoje = peso * (dietaInfoDia.pct_consumo_pv_ms / 100) * custoKgMs
        custoAlimentacao += custoHoje
        if (tipoCiclo === 'pastagem') custoAlimentacaoPastagem += custoHoje
        else if (tipoCiclo === 'misto') custoAlimentacaoMisto += custoHoje
        else custoAlimentacaoConfinamento += custoHoje
        if (etapa) etapa.custoAlimentacao += custoHoje
      }
    }

    if (periodo) {
      const custosDoLote = custosOperacionaisPorLote[periodo.lote_id] ?? []
      if (custosDoLote.length > 0) {
        const diasNoLote = diasPorLote[periodo.lote_id] ?? 1
        for (const c of custosDoLote) {
          // Só considera lançamentos já feitos até a data alvo (não traz
          // custo do futuro pra um cálculo "como estava em tal data").
          if (toDay(c.data_lancamento) > diaAlvo) continue
          // valor é por animal, ratado igualmente por dia ao longo de TODOS
          // os dias já vividos pelo animal naquele lote (todos os ciclos),
          // não só no dia exato do lançamento — ver diasPorLote acima.
          const custoDoAnimal = c.valor / Math.max(diasNoLote, 1)
          custoOperacional += custoDoAnimal
          if (tipoCiclo === 'pastagem') custoOperacionalPastagem += custoDoAnimal
          else if (tipoCiclo === 'misto') custoOperacionalMisto += custoDoAnimal
          else custoOperacionalConfinamento += custoDoAnimal
          if (etapa) etapa.custoOperacional += custoDoAnimal
        }
      }
    }
  }

  // peso na própria dataAlvo: usa pesagem real se houver exatamente nessa data,
  // senão o valor já acumulado corretamente pelo laço acima (peso ao início de diaAlvo)
  const pesagemNoDiaAlvo = pesagensOrdenadas.find(p => toDay(p.data) === diaAlvo)
  const pesoFinal = pesagemNoDiaAlvo ? pesagemNoDiaAlvo.peso : peso

  const diasConfinamento = diaAlvo - diaEntrada
  const gmdMedio = diasConfinamento > 0 ? (pesoFinal - animal.peso_entrada) / diasConfinamento : 0

  return {
    peso: pesoFinal,
    custoAcumulado: custoAlimentacao + custoOperacional,
    custoAlimentacao, custoOperacional,
    diasConfinamento, gmdMedio,
    diasEmPastagem, diasEmConfinamento, diasEmMisto,
    ganhoPesoPastagem, ganhoPesoConfinamento, ganhoPesoMisto,
    custoAlimentacaoPastagem, custoAlimentacaoConfinamento, custoAlimentacaoMisto,
    custoOperacionalPastagem, custoOperacionalConfinamento, custoOperacionalMisto,
    consumoRacaoKg, consumoConcentradoKg, ganhoPesoConcentrado, porEtapa,
  }
}

// ─── GMD real do último intervalo entre pesagens ──────────────────────────────
// Diferente de gmdMedio (que é a média desde a entrada até dataAlvo, sempre
// misturando estimativa com o que for real), esta função olha só para o
// último trecho coberto por duas pesagens REAIS — a entrada do animal conta
// como a primeira pesagem real, já que peso_entrada/data_entrada também é um
// registro real, não uma estimativa. Calculado sob demanda a partir do
// histórico, sem gravar nada novo no banco.
export interface GmdRealResultado {
  pesoAnterior: number
  pesoNovo: number
  dataAnterior: string
  dataNova: string
  dias: number
  gmdReal: number
}

export function calcularGmdRealUltimoIntervalo(
  animal: { peso_entrada: number; data_entrada: string },
  pesagens: PesagemPonto[],
): GmdRealResultado | null {
  const pontos: PesagemPonto[] = [{ data: animal.data_entrada, peso: animal.peso_entrada }, ...pesagens]
  const ordenados = [...pontos].sort((a, b) => toDay(a.data) - toDay(b.data))
  if (ordenados.length < 2) return null

  const novo = ordenados[ordenados.length - 1]
  const anterior = ordenados[ordenados.length - 2]
  const dias = toDay(novo.data) - toDay(anterior.data)
  if (dias <= 0) return null

  return {
    pesoAnterior: anterior.peso, pesoNovo: novo.peso,
    dataAnterior: anterior.data, dataNova: novo.data,
    dias, gmdReal: (novo.peso - anterior.peso) / dias,
  }
}

// ─── Projeção de peso dia a dia, num intervalo (sem custo) ────────────────────
// Usado por useLotes.ts e custoRacaoGrupo.ts para somar o peso total do
// lote/grupo em cada dia, quando existe custo operacional ou custo real de
// ração a ratear proporcionalmente ao peso. Mesma suavização de pesagem real
// (construirIncrementosDiarios) usada pelo laço principal de
// calcularAnimalNaData, unificada aqui — o peso usado pra ratear custo entre
// os animais do grupo precisa da mesma acurácia que o peso individual, sem
// os saltos que uma pesagem causava antes no dia exato em que foi lançada.
// Roda desde a entrada do animal (pra manter a base correta), mas só retorna
// os dias dentro de [diaInicial, diaFinalExclusivo).
export function projetarPesoPorDia(
  animal: { peso_entrada: number; data_entrada: string },
  pesagens: PesagemPonto[],
  periodos: PeriodoLote[],
  ciclos: CicloInfo[],
  diaInicial: number,
  diaFinalExclusivo: number,
  eventosCiclo: CicloAnimalEvento[] = [],
): Record<number, number> {
  const diaEntrada = toDay(animal.data_entrada)
  const resultado: Record<number, number> = {}
  if (diaFinalExclusivo <= diaEntrada) return resultado

  const pesagensOrdenadas = [...pesagens].sort((a, b) => toDay(a.data) - toDay(b.data))
  const { incrementoPorDia, anchorPorDia } = construirIncrementosDiarios(
    diaEntrada, diaFinalExclusivo, animal.peso_entrada, pesagensOrdenadas,
  )
  let peso = animal.peso_entrada

  for (let dia = diaEntrada; dia < diaFinalExclusivo; dia++) {
    const periodo = encontrarLoteAtivo(dia, periodos)
    const ciclo = periodo ? encontrarCicloAtivoParaAnimal(periodo.lote_id, dia, ciclos, eventosCiclo) : null
    const gmd = ciclo?.gmd_esperado ?? 0

    const incremento = incrementoPorDia.has(dia) ? incrementoPorDia.get(dia)! : (dia > diaEntrada ? gmd : 0)
    peso += incremento
    if (anchorPorDia.has(dia + 1)) peso = anchorPorDia.get(dia + 1)!
    if (dia >= diaInicial) resultado[dia] = peso
  }
  return resultado
}

// ─── Utilitário: gera código do animal a partir do prefixo do lote + brinco ───

export function gerarCodigoAnimal(prefixo: string, brinco: string): string {
  return `${prefixo}${brinco}`
}
