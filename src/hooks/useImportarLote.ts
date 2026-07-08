import { useState } from 'react'
import * as XLSX from 'xlsx'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { useLotes, useVendas, type CicloInput, type RegistrarVendaInput } from './useLotes'
import { gerarCodigoAnimal } from '@/lib/custoAnimal'
import type { Dieta } from './useDietas'
import type { TipoCiclo, CategoriaCustoOperacional } from '@/types'

// ═══════════════════════════════════════════════════════════════════════════
// Importação de lote a partir de uma planilha .xlsx de 6 abas
// (Lote, Compras, Animais, Pesagens, Vendas, Custos).
// Faz uma passada de validação completa ANTES de escrever qualquer coisa no
// banco — só começa a gravar se a planilha inteira estiver consistente.
// ═══════════════════════════════════════════════════════════════════════════

export interface ErroImportacao {
  aba: string
  linha: number // 1-indexed, contando o cabeçalho como linha 1
  mensagem: string
}

export interface ResultadoImportacao {
  loteId: string
  loteNome: string
  qtdAnimais: number
  qtdPesagens: number
  qtdVendas: number
  qtdCustos: number
}

const CATEGORIAS_VALIDAS: CategoriaCustoOperacional[] = ['sanitario', 'maquinario', 'mao_de_obra', 'medicamentos', 'outros']

function paraDataStr(v: any): string | null {
  if (v == null || v === '') return null
  if (v instanceof Date) {
    const y = v.getFullYear(), m = String(v.getMonth() + 1).padStart(2, '0'), d = String(v.getDate()).padStart(2, '0')
    return `${y}-${m}-${d}`
  }
  const s = String(v).trim()
  // aceita YYYY-MM-DD ou DD/MM/YYYY
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
  return null
}

function paraNumero(v: any): number | null {
  if (v == null || v === '') return null
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

function lerAba(wb: XLSX.WorkBook, nome: string): Record<string, any>[] {
  const ws = wb.Sheets[nome]
  if (!ws) return []
  return XLSX.utils.sheet_to_json(ws, { defval: null, raw: true })
}

export function useImportarLote() {
  const { user } = useAuth()
  const { criarLote, proximoNumeroLote } = useLotes()
  const { registrarVenda } = useVendas()
  const [importando, setImportando] = useState(false)
  const [progresso, setProgresso] = useState('')

  const importar = async (file: File, dietas: Dieta[]): Promise<{ errors?: ErroImportacao[]; error?: string; resultado?: ResultadoImportacao }> => {
    if (!user) return { error: 'Não autenticado' }
    setImportando(true)
    setProgresso('Lendo planilha...')
    const errors: ErroImportacao[] = []

    try {
      const buf = await file.arrayBuffer()
      const wb = XLSX.read(buf, { type: 'array', cellDates: true })

      const linhasLote = lerAba(wb, 'Lote')
      const linhasCompras = lerAba(wb, 'Compras')
      const linhasAnimais = lerAba(wb, 'Animais')
      const linhasPesagens = lerAba(wb, 'Pesagens')
      const linhasVendas = lerAba(wb, 'Vendas')
      const linhasCustos = lerAba(wb, 'Custos')

      // ─── Validar aba Lote ──────────────────────────────────────────────────
      if (linhasLote.length === 0) errors.push({ aba: 'Lote', linha: 1, mensagem: 'Aba "Lote" vazia ou ausente' })
      if (linhasLote.length > 1) errors.push({ aba: 'Lote', linha: 3, mensagem: 'Aba "Lote" deve ter só uma linha de dados' })

      const loteRow = linhasLote[0] ?? {}
      if (!loteRow.nome_lote) errors.push({ aba: 'Lote', linha: 2, mensagem: 'nome_lote é obrigatório' })
      if (!loteRow.prefixo) errors.push({ aba: 'Lote', linha: 2, mensagem: 'prefixo é obrigatório' })
      const dataCriacao = paraDataStr(loteRow.data_criacao)
      if (!dataCriacao) errors.push({ aba: 'Lote', linha: 2, mensagem: 'data_criacao inválida ou ausente (use AAAA-MM-DD)' })

      const dietasPorNome: Record<string, string> = {}
      for (const d of dietas) dietasPorNome[d.nome.trim().toLowerCase()] = d.id

      const ciclos: CicloInput[] = []
      for (let i = 1; i <= 8; i++) {
        const nome = loteRow[`ciclo${i}_nome`]
        if (!nome) continue
        const tipoRaw = String(loteRow[`ciclo${i}_tipo`] ?? '').trim().toLowerCase()
        if (tipoRaw !== 'pastagem' && tipoRaw !== 'confinamento') {
          errors.push({ aba: 'Lote', linha: 2, mensagem: `ciclo${i}_tipo deve ser "pastagem" ou "confinamento" (veio "${loteRow[`ciclo${i}_tipo`]}")` })
          continue
        }
        const dias = paraNumero(loteRow[`ciclo${i}_dias`])
        if (!dias || dias <= 0) {
          errors.push({ aba: 'Lote', linha: 2, mensagem: `ciclo${i}_dias inválido` })
          continue
        }
        let dietaId: string | null = null
        const dietaNome = loteRow[`ciclo${i}_dieta`]
        if (dietaNome) {
          dietaId = dietasPorNome[String(dietaNome).trim().toLowerCase()] ?? null
          if (!dietaId) errors.push({ aba: 'Lote', linha: 2, mensagem: `ciclo${i}_dieta "${dietaNome}" não corresponde a nenhuma dieta cadastrada` })
        }
        const gmd = paraNumero(loteRow[`ciclo${i}_gmd_esperado`])
        ciclos.push({ numero: i, nome: String(nome), tipo_ciclo: tipoRaw as TipoCiclo, dias_planejados: dias, dieta_id: dietaId, gmd_esperado: gmd })
      }
      if (ciclos.length === 0) errors.push({ aba: 'Lote', linha: 2, mensagem: 'Informe ao menos um ciclo (ciclo1_nome em diante)' })

      // ─── Validar aba Compras ───────────────────────────────────────────────
      const comprasPorId: Record<string, { fornecedor: string; data: string; preco_kg: number }> = {}
      linhasCompras.forEach((row, i) => {
        const linha = i + 2
        const id = row.id_compra ? String(row.id_compra).trim() : ''
        if (!id) { errors.push({ aba: 'Compras', linha, mensagem: 'id_compra vazio' }); return }
        if (comprasPorId[id]) { errors.push({ aba: 'Compras', linha, mensagem: `id_compra "${id}" duplicado` }); return }
        if (!row.fornecedor) errors.push({ aba: 'Compras', linha, mensagem: 'fornecedor vazio' })
        const data = paraDataStr(row.data)
        if (!data) errors.push({ aba: 'Compras', linha, mensagem: 'data inválida' })
        const preco = paraNumero(row.preco_kg)
        if (!preco || preco <= 0) errors.push({ aba: 'Compras', linha, mensagem: 'preco_kg inválido' })
        if (row.fornecedor && data && preco && preco > 0) {
          comprasPorId[id] = { fornecedor: String(row.fornecedor), data, preco_kg: preco }
        }
      })

      // ─── Validar aba Animais ───────────────────────────────────────────────
      interface AnimalRow { brinco: string; peso: number; data_entrada: string; raca: string | null; origem: string | null; id_compra: string }
      const animaisValidados: AnimalRow[] = []
      const brincosVistos = new Set<string>()
      linhasAnimais.forEach((row, i) => {
        const linha = i + 2
        const brinco = row.brinco ? String(row.brinco).trim() : ''
        if (!brinco) { errors.push({ aba: 'Animais', linha, mensagem: 'brinco vazio' }); return }
        if (brincosVistos.has(brinco)) { errors.push({ aba: 'Animais', linha, mensagem: `brinco "${brinco}" duplicado na planilha` }); return }
        const peso = paraNumero(row.peso_entrada)
        if (!peso || peso <= 0) { errors.push({ aba: 'Animais', linha, mensagem: 'peso_entrada inválido' }); return }
        const dataEntrada = paraDataStr(row.data_entrada)
        if (!dataEntrada) { errors.push({ aba: 'Animais', linha, mensagem: 'data_entrada inválida' }); return }
        const idCompra = row.id_compra ? String(row.id_compra).trim() : ''
        if (!idCompra || !comprasPorId[idCompra]) {
          errors.push({ aba: 'Animais', linha, mensagem: `id_compra "${row.id_compra ?? ''}" não encontrado na aba Compras` })
          return
        }
        brincosVistos.add(brinco)
        animaisValidados.push({ brinco, peso, data_entrada: dataEntrada, raca: row.raca ?? null, origem: row.origem ?? null, id_compra: idCompra })
      })
      if (animaisValidados.length === 0) errors.push({ aba: 'Animais', linha: 2, mensagem: 'Nenhum animal válido na planilha' })

      // ─── Validar aba Pesagens ──────────────────────────────────────────────
      interface PesagemRow { brinco: string; data: string; peso: number }
      const pesagensValidadas: PesagemRow[] = []
      linhasPesagens.forEach((row, i) => {
        const linha = i + 2
        const brinco = row.brinco ? String(row.brinco).trim() : ''
        if (!brinco || !brincosVistos.has(brinco)) { errors.push({ aba: 'Pesagens', linha, mensagem: `brinco "${row.brinco ?? ''}" não encontrado na aba Animais` }); return }
        const data = paraDataStr(row.data)
        if (!data) { errors.push({ aba: 'Pesagens', linha, mensagem: 'data inválida' }); return }
        const peso = paraNumero(row.peso)
        if (!peso || peso <= 0) { errors.push({ aba: 'Pesagens', linha, mensagem: 'peso inválido' }); return }
        pesagensValidadas.push({ brinco, data, peso })
      })

      // ─── Validar aba Vendas ────────────────────────────────────────────────
      interface VendaRow { brinco: string; data: string; peso: number; preco_kg: number; comissao_pct: number; encargo_pct: number }
      const vendasValidadas: VendaRow[] = []
      linhasVendas.forEach((row, i) => {
        const linha = i + 2
        const brinco = row.brinco ? String(row.brinco).trim() : ''
        if (!brinco || !brincosVistos.has(brinco)) { errors.push({ aba: 'Vendas', linha, mensagem: `brinco "${row.brinco ?? ''}" não encontrado na aba Animais` }); return }
        const data = paraDataStr(row.data)
        if (!data) { errors.push({ aba: 'Vendas', linha, mensagem: 'data inválida' }); return }
        const peso = paraNumero(row.peso_saida)
        if (!peso || peso <= 0) { errors.push({ aba: 'Vendas', linha, mensagem: 'peso_saida inválido' }); return }
        const precoKg = paraNumero(row.preco_kg)
        if (!precoKg || precoKg <= 0) { errors.push({ aba: 'Vendas', linha, mensagem: 'preco_kg inválido' }); return }
        vendasValidadas.push({
          brinco, data, peso, preco_kg: precoKg,
          comissao_pct: paraNumero(row.comissao_pct) ?? 0,
          encargo_pct: paraNumero(row.encargo_pct) ?? 0,
        })
      })

      // ─── Validar aba Custos ────────────────────────────────────────────────
      interface CustoRow { categoria: CategoriaCustoOperacional; valor: number; data: string; observacoes: string | null }
      const custosValidados: CustoRow[] = []
      linhasCustos.forEach((row, i) => {
        const linha = i + 2
        const categoria = String(row.categoria ?? '').trim().toLowerCase() as CategoriaCustoOperacional
        if (!CATEGORIAS_VALIDAS.includes(categoria)) {
          errors.push({ aba: 'Custos', linha, mensagem: `categoria "${row.categoria ?? ''}" inválida (use: ${CATEGORIAS_VALIDAS.join(', ')})` })
          return
        }
        const valor = paraNumero(row.valor)
        if (!valor || valor <= 0) { errors.push({ aba: 'Custos', linha, mensagem: 'valor inválido' }); return }
        const data = paraDataStr(row.data)
        if (!data) { errors.push({ aba: 'Custos', linha, mensagem: 'data inválida' }); return }
        custosValidados.push({ categoria, valor, data, observacoes: row.observacoes ?? null })
      })

      if (errors.length > 0) {
        setImportando(false)
        return { errors }
      }

      // ═══════════════════════════════════════════════════════════════════
      // Validação passou — agora grava de fato, na ordem correta
      // ═══════════════════════════════════════════════════════════════════

      setProgresso('Criando o lote...')
      const codigoLote = proximoNumeroLote()
      const resLote = await criarLote({
        nome_lote: String(loteRow.nome_lote),
        codigo_lote: codigoLote,
        prefixo: String(loteRow.prefixo),
        data_criacao: dataCriacao!,
        num_ciclos: ciclos.length,
        raca_predominante: loteRow.raca_predominante ?? undefined,
        ciclos,
      })
      if (resLote.error || !resLote.lote) {
        setImportando(false)
        return { error: `Falha ao criar o lote: ${resLote.error}` }
      }
      const loteId = resLote.lote.id

      // O fluxo padrão só marca data_inicio do ciclo 1 — os demais só ganham
      // data quando o usuário "avança o ciclo" manualmente na tela. Como aqui
      // o histórico inteiro já é conhecido, calculamos as datas de cada ciclo
      // de uma vez (soma acumulada dos dias_planejados), senão o motor de
      // custo atribuiria todos os dias ao ciclo 1 (ver encontrarCicloAtivo).
      {
        const { data: ciclosCriados, error: eCiclos } = await supabase
          .from('ciclos_lote').select('id, numero, dias_planejados').eq('lote_id', loteId).order('numero')
        if (eCiclos || !ciclosCriados) {
          setImportando(false)
          return { error: `Falha ao ler ciclos recém-criados: ${eCiclos?.message}` }
        }
        let cursor = new Date(dataCriacao! + 'T00:00:00')
        for (let i = 0; i < ciclosCriados.length; i++) {
          const c = ciclosCriados[i] as { id: string; numero: number; dias_planejados: number }
          const inicio = cursor.toISOString().slice(0, 10)
          const proximo = new Date(cursor)
          proximo.setDate(proximo.getDate() + c.dias_planejados)
          const ehUltimo = i === ciclosCriados.length - 1
          const { error: eUp } = await supabase.from('ciclos_lote').update({
            data_inicio: inicio, data_fim: ehUltimo ? null : proximo.toISOString().slice(0, 10),
          }).eq('id', c.id)
          if (eUp) {
            setImportando(false)
            return { error: `Falha ao ajustar datas do ciclo ${c.numero}: ${eUp.message}` }
          }
          cursor = proximo
        }
      }

      setProgresso('Cadastrando animais e compras...')
      const porCompra: Record<string, AnimalRow[]> = {}
      for (const a of animaisValidados) (porCompra[a.id_compra] ??= []).push(a)

      const prefixoLote = String(loteRow.prefixo)
      const brincoParaAnimalId: Record<string, string> = {}
      for (const [idCompra, animaisDaCompra] of Object.entries(porCompra)) {
        const compra = comprasPorId[idCompra]
        const dataEntradaLeva = animaisDaCompra[0].data_entrada
        const pesoTotal = animaisDaCompra.reduce((s, a) => s + a.peso, 0)

        // Cada leva de compra vira um registro em `compras`, igual ao fluxo manual
        // de "Adicionar animais" (ver criarAnimais em useLotes.ts) — replicado aqui
        // direto via supabase porque criarAnimais depende do estado `lotes` do
        // hook useLotes(), que ainda não reflete o lote recém-criado nesta mesma
        // chamada (closure obsoleta do React).
        const { data: compraRow, error: eCompra } = await supabase.from('compras').insert({
          lote_id: loteId, parceiro_id: null, origem_texto: compra.fornecedor,
          data: compra.data, preco_kg: compra.preco_kg,
          quantidade_animais: animaisDaCompra.length, peso_total: pesoTotal,
          valor_total: pesoTotal * compra.preco_kg, user_id: user.id,
        }).select().single()
        if (eCompra || !compraRow) {
          setImportando(false)
          return { error: `Falha ao criar compra "${idCompra}": ${eCompra?.message}` }
        }

        const rows = animaisDaCompra.map(a => ({
          codigo: gerarCodigoAnimal(prefixoLote, a.brinco), brinco: a.brinco,
          peso_entrada: a.peso, data_entrada: a.data_entrada,
          origem: a.origem, raca: a.raca, valor_compra: a.peso * compra.preco_kg,
          preco_kg_compra_no_lote: compra.preco_kg, compra_id: compraRow.id,
          lote_atual_id: loteId, status: 'ativo' as const, user_id: user.id,
        }))
        const { data: criados, error: e1 } = await supabase.from('animais').insert(rows).select('id, brinco')
        if (e1) {
          setImportando(false)
          return { error: `Falha ao criar animais da compra "${idCompra}": ${e1.message}` }
        }
        for (const c of (criados ?? []) as Array<{ id: string; brinco: string }>) brincoParaAnimalId[c.brinco] = c.id

        const movRows = (criados ?? []).map((a: { id: string }) => ({
          animal_id: a.id, tipo: 'entrada', lote_destino_id: loteId, data: dataEntradaLeva, user_id: user.id,
        }))
        const { error: e2 } = await supabase.from('movimentacoes_animais').insert(movRows)
        if (e2) {
          setImportando(false)
          return { error: `Animais da compra "${idCompra}" criados, mas falhou o registro de entrada: ${e2.message}` }
        }
      }

      setProgresso('Lançando pesagens...')
      if (pesagensValidadas.length > 0) {
        const rows = pesagensValidadas.map(p => ({
          animal_id: brincoParaAnimalId[p.brinco], peso: p.peso, data: p.data, user_id: user.id,
        }))
        const { error } = await supabase.from('pesagens').insert(rows)
        if (error) { setImportando(false); return { error: `Falha ao lançar pesagens: ${error.message}` } }
      }

      setProgresso('Lançando custos operacionais...')
      if (custosValidados.length > 0) {
        const rows = custosValidados.map(c => ({
          lote_id: loteId, categoria: c.categoria, descricao: c.observacoes, valor: c.valor,
          data_lancamento: c.data, user_id: user.id,
        }))
        const { error } = await supabase.from('custos_operacionais_lote').insert(rows)
        if (error) { setImportando(false); return { error: `Falha ao lançar custos: ${error.message}` } }
      }

      setProgresso('Registrando vendas...')
      const porVenda: Record<string, VendaRow[]> = {}
      for (const v of vendasValidadas) {
        const chave = `${v.data}|${v.comissao_pct}|${v.encargo_pct}`
        ;(porVenda[chave] ??= []).push(v)
      }
      for (const grupo of Object.values(porVenda)) {
        const input: RegistrarVendaInput = {
          tipo: 'venda', modo: 'peso_proprio', data: grupo[0].data,
          itens: grupo.map(v => ({ animal_id: brincoParaAnimalId[v.brinco], peso: v.peso, valor: v.peso * v.preco_kg })),
          comissoes: grupo[0].comissao_pct > 0 ? [{ tipo: 'outro', percentual: grupo[0].comissao_pct, descricao: 'Comissão' }] : [],
          encargos: grupo[0].encargo_pct > 0 ? [{ descricao: 'Encargos', base_calculo: 'receita_bruta', percentual: grupo[0].encargo_pct }] : [],
        }
        const res = await registrarVenda(input)
        if (res.error) {
          setImportando(false)
          return { error: `Lote criado, mas falhou ao registrar venda de ${grupo[0].data}: ${res.error}. Animais e pesagens já foram importados.` }
        }
      }

      setImportando(false)
      setProgresso('')
      return {
        resultado: {
          loteId, loteNome: String(loteRow.nome_lote),
          qtdAnimais: animaisValidados.length, qtdPesagens: pesagensValidadas.length,
          qtdVendas: vendasValidadas.length, qtdCustos: custosValidados.length,
        },
      }
    } catch (e: any) {
      setImportando(false)
      return { error: `Erro inesperado ao processar a planilha: ${e?.message ?? e}` }
    }
  }

  return { importar, importando, progresso }
}
