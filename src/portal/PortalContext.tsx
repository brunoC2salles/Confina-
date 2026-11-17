import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react'
import { useEstadoCache, useCarregando } from '@/lib/cacheTela'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'
import { carregarVinculoCliente, type Fornecedor, type MembroFornecedor, type PapelMembro, type VinculoCliente } from '@/core/parceiros'

// Quem é o usuário no portal: administrador do Confina+, membro (gestor ou
// vendedor) de um fornecedor, ou cliente vinculado. O administrador escolhe
// o fornecedor e atua com os poderes de gestor.
interface PortalCtx {
  carregando: boolean
  admin: boolean
  fornecedores: Fornecedor[]
  fornecedor: Fornecedor | null
  papel: PapelMembro | null
  membro: MembroFornecedor | null
  vinculo: VinculoCliente | null
  escolherFornecedor: (id: string) => void
  recarregar: () => Promise<void>
}

const Ctx = createContext<PortalCtx | undefined>(undefined)
const CHAVE = 'portal-fornecedor'

export function PortalProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth()
  const _k = user ? `PortalProvider:${user.id}` : null
  const [carregando, setCarregando] = useCarregando(_k && `${_k}:carregadoPara`)
  const [admin, setAdmin] = useEstadoCache(_k && `${_k}:admin`, false)
  const [fornecedores, setFornecedores] = useEstadoCache<Fornecedor[]>(_k && `${_k}:fornecedores`, [])
  const [membros, setMembros] = useEstadoCache<MembroFornecedor[]>(_k && `${_k}:membros`, [])
  const [vinculo, setVinculo] = useEstadoCache<VinculoCliente | null>(_k && `${_k}:vinculo`, null)
  const [carregadoPara, setCarregadoPara] = useEstadoCache<string | null>(_k && `${_k}:carregadoPara`, null)
  const [escolhido, setEscolhido] = useState<string | null>(() => { try { return localStorage.getItem(CHAVE) } catch { return null } })

  const recarregar = useCallback(async () => {
    if (!user) { setCarregando(false); return }
    setCarregando(true)
    const [{ data: perfil }, { data: ms }, v] = await Promise.all([
      supabase.from('profiles').select('role').eq('id', user.id).maybeSingle(),
      supabase.from('fornecedor_membros').select('*').eq('user_id', user.id).eq('ativo', true),
      carregarVinculoCliente(user.id),
    ])
    const ehAdmin = perfil?.role === 'admin'
    const listaMembros = (ms ?? []) as MembroFornecedor[]
    const { data: fs } = ehAdmin
      ? await supabase.from('fornecedores').select('*').order('nome')
      : listaMembros.length > 0
        ? await supabase.from('fornecedores').select('*').in('id', listaMembros.map(m => m.fornecedor_id)).eq('ativo', true).order('nome')
        : { data: [] }
    setAdmin(ehAdmin)
    setMembros(listaMembros)
    setFornecedores((fs ?? []) as Fornecedor[])
    setVinculo(v)
    setCarregadoPara(user.id)
    setCarregando(false)
  }, [user])

  useEffect(() => { recarregar() }, [recarregar])

  const escolherFornecedor = (id: string) => {
    setEscolhido(id)
    try { localStorage.setItem(CHAVE, id) } catch { /* sem armazenamento */ }
  }

  const fornecedor = fornecedores.find(f => f.id === escolhido) ?? (admin ? null : fornecedores[0] ?? null)
  const membro = fornecedor ? membros.find(m => m.fornecedor_id === fornecedor.id) ?? null : null
  const papel: PapelMembro | null = fornecedor ? (membro?.papel ?? (admin ? 'gestor' : null)) : null

  return (
    <Ctx.Provider value={{ carregando: carregando || (!!user && carregadoPara !== user.id), admin, fornecedores, fornecedor, papel, membro, vinculo, escolherFornecedor, recarregar }}>
      {children}
    </Ctx.Provider>
  )
}

export function usePortal() {
  const c = useContext(Ctx)
  if (!c) throw new Error('usePortal fora do PortalProvider')
  return c
}
