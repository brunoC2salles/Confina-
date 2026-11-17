import { useState, useEffect, useCallback, useRef, type Dispatch, type SetStateAction } from 'react'

// Cache em memória dos dados das telas: ao voltar a uma página (ou à aba),
// ela abre com o que já tinha e atualiza em segundo plano, sem a tela de
// carregamento. Vale só nesta aba e é limpo ao trocar de usuário ou sair.
const memoria = new Map<string, unknown>()
let dono: string | null = null

export function definirDonoCache(userId: string | null) {
  if (userId !== dono) { memoria.clear(); dono = userId }
}

export const temCache = (chave: string | null | undefined) => chave != null && memoria.has(chave)

// Como useState, mas guarda o valor na chave. Com a chave nula, não guarda.
export function useEstadoCache<T>(chave: string | null, inicial: T): [T, Dispatch<SetStateAction<T>>] {
  const inicialRef = useRef(inicial)
  const [valor, setValor] = useState<T>(() => (chave != null && memoria.has(chave) ? memoria.get(chave) as T : inicial))
  const chaveRef = useRef(chave)
  useEffect(() => {
    if (chaveRef.current === chave) return
    chaveRef.current = chave
    setValor(chave != null && memoria.has(chave) ? memoria.get(chave) as T : inicialRef.current)
  }, [chave])
  const set = useCallback<Dispatch<SetStateAction<T>>>(acao => {
    setValor(anterior => {
      const novo = typeof acao === 'function' ? (acao as (p: T) => T)(anterior) : acao
      if (chaveRef.current != null) memoria.set(chaveRef.current, novo)
      return novo
    })
  }, [])
  return [valor, set]
}

// Indicador de carregamento que só aparece na primeira carga da chave.
export function useCarregando(chave: string | null): [boolean, (v: boolean) => void] {
  const [carregando, setCarregando] = useState(() => !temCache(chave))
  const chaveRef = useRef(chave)
  chaveRef.current = chave
  const set = useCallback((v: boolean) => {
    if (v && temCache(chaveRef.current)) return
    setCarregando(v)
  }, [])
  return [carregando, set]
}
