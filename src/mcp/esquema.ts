// ─── Esquemas de entrada das ferramentas MCP e validação ──────────────────────
// Subconjunto de JSON Schema usado nas ferramentas (object, string, number,
// integer, boolean, array, enum). A validação roda antes de cada ferramenta,
// para devolver ao Claude/ChatGPT um erro claro em vez de gravar dado errado.

export interface Esquema {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array'
  description?: string
  enum?: Array<string | number | boolean | null>
  properties?: Record<string, Esquema>
  required?: string[]
  items?: Esquema
  minimum?: number
  maximum?: number
  minItems?: number
  format?: 'date'
  nullable?: boolean
  additionalProperties?: boolean
}

const DATA_RE = /^\d{4}-\d{2}-\d{2}$/

function validarValor(valor: unknown, esquema: Esquema, caminho: string, erros: string[]): void {
  if (valor === null) {
    if (esquema.nullable || (esquema.enum && esquema.enum.includes(null))) return
    erros.push(`${caminho}: não pode ser nulo`)
    return
  }
  if (esquema.enum && !esquema.enum.includes(valor as string)) {
    erros.push(`${caminho}: valor inválido (use ${esquema.enum.filter(v => v !== null).join(', ')})`)
    return
  }
  switch (esquema.type) {
    case 'string':
      if (typeof valor !== 'string') { erros.push(`${caminho}: deve ser texto`); return }
      if (esquema.format === 'date' && (!DATA_RE.test(valor) || Number.isNaN(Date.parse(valor + 'T00:00:00Z')))) {
        erros.push(`${caminho}: data no formato aaaa-mm-dd`)
      }
      return
    case 'number':
    case 'integer':
      if (typeof valor !== 'number' || !Number.isFinite(valor)) { erros.push(`${caminho}: deve ser número`); return }
      if (esquema.type === 'integer' && !Number.isInteger(valor)) erros.push(`${caminho}: deve ser número inteiro`)
      if (esquema.minimum != null && valor < esquema.minimum) erros.push(`${caminho}: mínimo ${esquema.minimum}`)
      if (esquema.maximum != null && valor > esquema.maximum) erros.push(`${caminho}: máximo ${esquema.maximum}`)
      return
    case 'boolean':
      if (typeof valor !== 'boolean') erros.push(`${caminho}: deve ser verdadeiro ou falso`)
      return
    case 'array':
      if (!Array.isArray(valor)) { erros.push(`${caminho}: deve ser uma lista`); return }
      if (esquema.minItems != null && valor.length < esquema.minItems) erros.push(`${caminho}: informe ao menos ${esquema.minItems} item(ns)`)
      if (esquema.items) valor.forEach((v, i) => validarValor(v, esquema.items as Esquema, `${caminho}[${i}]`, erros))
      return
    case 'object': {
      if (typeof valor !== 'object' || Array.isArray(valor)) { erros.push(`${caminho}: deve ser um objeto`); return }
      const obj = valor as Record<string, unknown>
      for (const campo of esquema.required ?? []) {
        if (obj[campo] === undefined) erros.push(`${caminho ? caminho + '.' : ''}${campo}: obrigatório`)
      }
      for (const [campo, sub] of Object.entries(esquema.properties ?? {})) {
        if (obj[campo] !== undefined) validarValor(obj[campo], sub, `${caminho ? caminho + '.' : ''}${campo}`, erros)
      }
      return
    }
    default:
      return
  }
}

export function validarEntrada(valor: unknown, esquema: Esquema): string[] {
  const erros: string[] = []
  validarValor(valor ?? {}, esquema, '', erros)
  return erros
}

// Atalhos para montar os esquemas das ferramentas.
export const s = {
  texto: (description: string, extra: Partial<Esquema> = {}): Esquema => ({ type: 'string', description, ...extra }),
  data: (description: string): Esquema => ({ type: 'string', format: 'date', description: `${description} (aaaa-mm-dd)` }),
  num: (description: string, extra: Partial<Esquema> = {}): Esquema => ({ type: 'number', description, ...extra }),
  int: (description: string, extra: Partial<Esquema> = {}): Esquema => ({ type: 'integer', description, ...extra }),
  bool: (description: string): Esquema => ({ type: 'boolean', description }),
  opcoes: (description: string, valores: Array<string | number>): Esquema => ({ type: 'string', enum: valores, description }),
  lista: (description: string, items: Esquema, extra: Partial<Esquema> = {}): Esquema => ({ type: 'array', description, items, ...extra }),
  obj: (properties: Record<string, Esquema>, required: string[] = [], description?: string): Esquema =>
    ({ type: 'object', properties, required, description, additionalProperties: false }),
  id: (description: string): Esquema => ({ type: 'string', description }),
  confirmar: (): Esquema => ({
    type: 'boolean',
    description: 'Envie true somente depois que o produtor confirmou explicitamente a exclusão nesta conversa.',
  }),
}
