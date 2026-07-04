// ─── Parser simples de CSV (sem dependência externa) ──────────────────────────
// Formato esperado: duas colunas, "brinco" e "peso", separadas por vírgula ou
// ponto e vírgula. Cabeçalho é opcional (detectado automaticamente).

export interface LinhaAnimalCsv {
  brinco: string
  peso: number
}

export interface ResultadoParseCsv {
  linhas: LinhaAnimalCsv[]
  erros: string[]
}

export function parseCsvAnimais(conteudo: string): ResultadoParseCsv {
  const erros: string[] = []
  const linhas: LinhaAnimalCsv[] = []

  const linhasArquivo = conteudo
    .split(/\r\n|\n|\r/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (linhasArquivo.length === 0) {
    return { linhas, erros: ['Arquivo vazio'] }
  }

  const separador = linhasArquivo[0].includes(';') ? ';' : ','

  let inicio = 0
  const primeira = linhasArquivo[0].toLowerCase()
  if (primeira.includes('brinco') || primeira.includes('peso')) {
    inicio = 1
  }

  for (let i = inicio; i < linhasArquivo.length; i++) {
    const partes = linhasArquivo[i].split(separador).map(p => p.trim())
    if (partes.length < 2) {
      erros.push(`Linha ${i + 1}: esperado "brinco,peso", recebido "${linhasArquivo[i]}"`)
      continue
    }
    const brinco = partes[0].replace(/^["']|["']$/g, '')
    const pesoStr = partes[1].replace(/^["']|["']$/g, '').replace(',', '.')
    const peso = Number(pesoStr)
    if (!brinco) {
      erros.push(`Linha ${i + 1}: brinco vazio`)
      continue
    }
    if (isNaN(peso) || peso <= 0) {
      erros.push(`Linha ${i + 1}: peso inválido ("${partes[1]}")`)
      continue
    }
    linhas.push({ brinco, peso })
  }

  return { linhas, erros }
}
