import { createClient } from '@supabase/supabase-js'

const url = (import.meta as any).env.VITE_SUPABASE_URL as string
const key = (import.meta as any).env.VITE_SUPABASE_ANON_KEY as string

if (!url || !key) throw new Error('Variáveis de ambiente Supabase não encontradas')

export const supabase = createClient(url, key)
