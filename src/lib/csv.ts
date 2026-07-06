// ─── Parser simples de CSV (sem dependência externa) ──────────────────────────
// Formato esperado: "brinco,pesagem 1,pesagem 2" (cabeçalho opcional).
// A terceira coluna (pesagem 2) é opcional — tanto a coluna inteira quanto
// células individuais podem estar vazias.

export interface LinhaAnimalCsv {
  brinco: string
  peso1: number
  peso2: number | null
}

export interface ResultadoParseCsv {
  linhas: LinhaAnimalCsv[]
  erros: string[]
  temPeso2: boolean
}

export function parseCsvAnimais(conteudo: string): ResultadoParseCsv {
  const erros: string[] = []
  const linhas: LinhaAnimalCsv[] = []

  const linhasArquivo = conteudo
    .split(/\r\n|\n|\r/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (linhasArquivo.length === 0) {
    return { linhas, erros: ['Arquivo vazio'], temPeso2: false }
  }

  const separador = linhasArquivo[0].includes(';') ? ';' : ','

  let inicio = 0
  const primeira = linhasArquivo[0].toLowerCase()
  if (primeira.includes('brinco') || primeira.includes('pesagem') || primeira.includes('peso')) {
    inicio = 1
  }

  for (let i = inicio; i < linhasArquivo.length; i++) {
    const partes = linhasArquivo[i].split(separador).map(p => p.trim().replace(/^["']|["']$/g, ''))
    if (partes.length < 2) {
      erros.push(`Linha ${i + 1}: esperado "brinco,pesagem 1[,pesagem 2]", recebido "${linhasArquivo[i]}"`)
      continue
    }
    const brinco = partes[0]
    const peso1Str = (partes[1] ?? '').replace(',', '.')
    const peso2Str = (partes[2] ?? '').replace(',', '.')

    if (!brinco) { erros.push(`Linha ${i + 1}: brinco vazio`); continue }

    const peso1 = Number(peso1Str)
    if (!peso1Str || isNaN(peso1) || peso1 <= 0) {
      erros.push(`Linha ${i + 1}: pesagem 1 inválida ("${partes[1] ?? ''}")`)
      continue
    }

    let peso2: number | null = null
    if (peso2Str) {
      const p2 = Number(peso2Str)
      if (isNaN(p2) || p2 <= 0) {
        erros.push(`Linha ${i + 1}: pesagem 2 inválida ("${partes[2]}")`)
        continue
      }
      peso2 = p2
    }

    linhas.push({ brinco, peso1, peso2 })
  }

  return { linhas, erros, temPeso2: linhas.some(l => l.peso2 != null) }
}
