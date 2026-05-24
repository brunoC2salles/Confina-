# Confina+
Sistema de Gestão de Confinamento Bovino

## Setup

### 1. Instalar dependências
```bash
npm install
```

### 2. Rodar localmente
```bash
npm run dev
# Acesse http://localhost:5173
```

### 3. Banco de dados
Execute o arquivo `supabase/schema.sql` no SQL Editor do seu projeto Supabase.

### 4. Deploy no Vercel
1. Suba para o GitHub (o `.env` está no `.gitignore` — não vai junto)
2. Conecte o repositório no Vercel
3. Adicione as variáveis de ambiente:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`

## O que está implementado
- Autenticação completa (login, cadastro, logout)
- Dashboard com métricas reais e ações rápidas
- Lotes — criar, avançar ciclo, encerrar, bifurcar (por peso ou manual)
- Animais — entrada, pesagem, saída com comissionamentos + encargos + cálculo de lucro em tempo real
- Dietas — componentes, templates, calculadora de simulação
- Parceiros — CRUD completo
- Relatórios — 6 períodos, exportação CSV e PDF
- Configurações — faixas de rendimento e bônus editáveis

## Stack
React 18 + Vite + TypeScript + Supabase
