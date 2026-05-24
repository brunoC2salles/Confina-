-- ============================================================
-- CONFINA+ — Schema completo do banco de dados
-- Execute este arquivo no SQL Editor do Supabase
-- Project: fgmhgzekrihbozdrvtbm
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ─── TABELA: profiles ────────────────────────────────────────────────────────
-- Complementa a tabela auth.users do Supabase
CREATE TABLE public.profiles (
  id          UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome        TEXT,
  role        TEXT NOT NULL DEFAULT 'operador'
              CHECK (role IN ('admin', 'operador', 'consulta')),
  plano       TEXT NOT NULL DEFAULT 'free'
              CHECK (plano IN ('free', 'pro', 'master')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Trigger para criar profile automaticamente ao criar usuário
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, role, plano)
  VALUES (
    NEW.id,
    NEW.raw_user_meta_data->>'nome',
    'admin',
    'free'
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuário vê próprio perfil"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Usuário atualiza próprio perfil"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);


-- ─── TABELA: ciclos ──────────────────────────────────────────────────────────
CREATE TABLE public.ciclos (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  numero      INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 10),
  nome        TEXT NOT NULL,
  descricao   TEXT,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, numero)
);

ALTER TABLE public.ciclos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios ciclos" ON public.ciclos FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: lotes ───────────────────────────────────────────────────────────
CREATE TABLE public.lotes (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  codigo_lote     TEXT NOT NULL,
  nome_lote       TEXT NOT NULL,
  data_criacao    DATE NOT NULL DEFAULT CURRENT_DATE,
  ciclo_inicial   INTEGER NOT NULL CHECK (ciclo_inicial BETWEEN 1 AND 10),
  ciclo_atual     INTEGER NOT NULL CHECK (ciclo_atual BETWEEN 1 AND 10),
  status          TEXT NOT NULL DEFAULT 'ativo'
                  CHECK (status IN ('ativo', 'encerrado')),
  lote_origem_id  UUID REFERENCES public.lotes(id),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, codigo_lote)
);

CREATE INDEX idx_lotes_user_id   ON public.lotes(user_id);
CREATE INDEX idx_lotes_status    ON public.lotes(status);
CREATE INDEX idx_lotes_ciclo     ON public.lotes(ciclo_atual);

ALTER TABLE public.lotes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios lotes" ON public.lotes FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: animais ─────────────────────────────────────────────────────────
CREATE TABLE public.animais (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  identificacao    TEXT NOT NULL,
  peso_entrada     DECIMAL(10,2) NOT NULL CHECK (peso_entrada > 0),
  data_entrada     DATE NOT NULL,
  origem           TEXT,
  raca             TEXT,
  idade_estimada   INTEGER,
  valor_compra     DECIMAL(10,2) NOT NULL CHECK (valor_compra >= 0),
  lote_atual_id    UUID REFERENCES public.lotes(id),
  status           TEXT NOT NULL DEFAULT 'ativo'
                   CHECK (status IN ('ativo', 'vendido', 'abatido', 'morto', 'transferido')),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, identificacao)
);

CREATE INDEX idx_animais_user_id      ON public.animais(user_id);
CREATE INDEX idx_animais_lote_atual   ON public.animais(lote_atual_id);
CREATE INDEX idx_animais_status       ON public.animais(status);

ALTER TABLE public.animais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios animais" ON public.animais FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: movimentacoes_animais ───────────────────────────────────────────
CREATE TABLE public.movimentacoes_animais (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id         UUID NOT NULL REFERENCES public.animais(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL CHECK (tipo IN (
                      'entrada', 'transferencia_lote', 'bifurcacao',
                      'saida_venda', 'saida_abate', 'saida_transferencia', 'saida_morte'
                    )),
  lote_origem_id    UUID REFERENCES public.lotes(id),
  lote_destino_id   UUID REFERENCES public.lotes(id),
  data              DATE NOT NULL,
  peso              DECIMAL(10,2),
  motivo            TEXT,
  valor             DECIMAL(10,2),
  destino_tipo      TEXT CHECK (destino_tipo IN ('corretor', 'frigorifico', 'produtor')),
  destino_id        UUID,
  observacoes       TEXT,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_mov_animal_id  ON public.movimentacoes_animais(animal_id);
CREATE INDEX idx_mov_tipo       ON public.movimentacoes_animais(tipo);
CREATE INDEX idx_mov_data       ON public.movimentacoes_animais(data);

ALTER TABLE public.movimentacoes_animais ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias movimentações" ON public.movimentacoes_animais FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: pesagens ────────────────────────────────────────────────────────
CREATE TABLE public.pesagens (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id    UUID NOT NULL REFERENCES public.animais(id) ON DELETE CASCADE,
  data         DATE NOT NULL,
  peso         DECIMAL(10,2) NOT NULL CHECK (peso > 0),
  observacoes  TEXT,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pesagens_animal_id  ON public.pesagens(animal_id);
CREATE INDEX idx_pesagens_data       ON public.pesagens(data);

ALTER TABLE public.pesagens ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias pesagens" ON public.pesagens FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: componentes_alimentares ─────────────────────────────────────────
CREATE TABLE public.componentes_alimentares (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome         TEXT NOT NULL,
  preco_atual  DECIMAL(10,4) NOT NULL CHECK (preco_atual >= 0),
  unidade      TEXT NOT NULL DEFAULT 'kg',
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, nome)
);

ALTER TABLE public.componentes_alimentares ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios componentes" ON public.componentes_alimentares FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: dietas ──────────────────────────────────────────────────────────
-- componentes é um JSONB: [{ componente_id, nome, percentual_peso_corporal, preco_kg }]
CREATE TABLE public.dietas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome         TEXT NOT NULL,
  descricao    TEXT,
  componentes  JSONB NOT NULL DEFAULT '[]',
  gmd_esperado DECIMAL(5,3) NOT NULL CHECK (gmd_esperado > 0),
  is_template  BOOLEAN NOT NULL DEFAULT FALSE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dietas_user_id    ON public.dietas(user_id);
CREATE INDEX idx_dietas_template   ON public.dietas(is_template);

ALTER TABLE public.dietas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias dietas" ON public.dietas FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: dietas_lote ─────────────────────────────────────────────────────
CREATE TABLE public.dietas_lote (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_id      UUID NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  dieta_id     UUID NOT NULL REFERENCES public.dietas(id),
  ciclo        INTEGER NOT NULL CHECK (ciclo BETWEEN 1 AND 10),
  data_inicio  DATE NOT NULL,
  data_fim     DATE,
  ativa        BOOLEAN NOT NULL DEFAULT TRUE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_dietas_lote_lote_id  ON public.dietas_lote(lote_id);
CREATE INDEX idx_dietas_lote_ativa    ON public.dietas_lote(ativa);

ALTER TABLE public.dietas_lote ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias dietas_lote" ON public.dietas_lote FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: parceiros ───────────────────────────────────────────────────────
CREATE TABLE public.parceiros (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  nome         TEXT NOT NULL,
  cpf_cnpj     TEXT,
  tipo         TEXT NOT NULL CHECK (tipo IN ('fornecedor', 'corretor', 'frigorifico', 'produtor')),
  contato      TEXT,
  endereco     TEXT,
  observacoes  TEXT,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parceiros_user_id  ON public.parceiros(user_id);
CREATE INDEX idx_parceiros_tipo     ON public.parceiros(tipo);

ALTER TABLE public.parceiros ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios parceiros" ON public.parceiros FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: rendimento_faixas ───────────────────────────────────────────────
CREATE TABLE public.rendimento_faixas (
  id                     UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  peso_min               DECIMAL(10,2) NOT NULL,
  peso_max               DECIMAL(10,2) NOT NULL,
  rendimento_percentual  DECIMAL(5,2) NOT NULL CHECK (rendimento_percentual BETWEEN 0 AND 100),
  user_id                UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (peso_max > peso_min)
);

ALTER TABLE public.rendimento_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias rendimento_faixas" ON public.rendimento_faixas FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: bonus_faixas ────────────────────────────────────────────────────
CREATE TABLE public.bonus_faixas (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  peso_min     DECIMAL(10,2) NOT NULL,
  peso_max     DECIMAL(10,2) NOT NULL,
  bonus_por_kg DECIMAL(10,4) NOT NULL CHECK (bonus_por_kg >= 0),
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (peso_max > peso_min)
);

ALTER TABLE public.bonus_faixas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias bonus_faixas" ON public.bonus_faixas FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: custos_fixos_lote ───────────────────────────────────────────────
CREATE TABLE public.custos_fixos_lote (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lote_id          UUID NOT NULL REFERENCES public.lotes(id) ON DELETE CASCADE,
  descricao        TEXT NOT NULL,
  recorrencia      TEXT NOT NULL DEFAULT 'mensal'
                   CHECK (recorrencia IN ('unico', 'semanal', 'quinzenal', 'mensal')),
  valor            DECIMAL(10,2) NOT NULL CHECK (valor >= 0),
  data_lancamento  DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custos_fixos_lote_id  ON public.custos_fixos_lote(lote_id);

ALTER TABLE public.custos_fixos_lote ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios custos_fixos_lote" ON public.custos_fixos_lote FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: custos_variaveis_animal ─────────────────────────────────────────
CREATE TABLE public.custos_variaveis_animal (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  animal_id        UUID NOT NULL REFERENCES public.animais(id) ON DELETE CASCADE,
  descricao        TEXT NOT NULL,
  valor            DECIMAL(10,2) NOT NULL CHECK (valor >= 0),
  data_lancamento  DATE NOT NULL DEFAULT CURRENT_DATE,
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custos_var_animal_id  ON public.custos_variaveis_animal(animal_id);

ALTER TABLE public.custos_variaveis_animal ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios custos_variaveis_animal" ON public.custos_variaveis_animal FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: comissoes_venda ─────────────────────────────────────────────────
CREATE TABLE public.comissoes_venda (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movimentacao_id   UUID NOT NULL REFERENCES public.movimentacoes_animais(id) ON DELETE CASCADE,
  tipo              TEXT NOT NULL CHECK (tipo IN ('corretor', 'operador', 'outro')),
  parceiro_id       UUID REFERENCES public.parceiros(id),
  descricao         TEXT,
  percentual        DECIMAL(5,2) NOT NULL CHECK (percentual >= 0),
  valor_calculado   DECIMAL(10,2) NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.comissoes_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprias comissoes_venda" ON public.comissoes_venda FOR ALL USING (auth.uid() = user_id);


-- ─── TABELA: encargos_venda ──────────────────────────────────────────────────
CREATE TABLE public.encargos_venda (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  movimentacao_id   UUID NOT NULL REFERENCES public.movimentacoes_animais(id) ON DELETE CASCADE,
  descricao         TEXT NOT NULL,
  base_calculo      TEXT NOT NULL DEFAULT 'receita_bruta'
                    CHECK (base_calculo IN ('receita_bruta', 'valor_fixo')),
  percentual        DECIMAL(5,2),
  valor_fixo        DECIMAL(10,2),
  valor_calculado   DECIMAL(10,2) NOT NULL,
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.encargos_venda ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRUD próprios encargos_venda" ON public.encargos_venda FOR ALL USING (auth.uid() = user_id);


-- ─── DADOS PADRÃO: ciclos ────────────────────────────────────────────────────
-- Inserir ciclos padrão para novos usuários via função
CREATE OR REPLACE FUNCTION public.criar_ciclos_padrao(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.ciclos (numero, nome, descricao, user_id) VALUES
    (1, 'Adaptação',   'Animal se adaptando ao confinamento — GMD mais baixo', p_user_id),
    (2, 'Crescimento', 'GMD aumentando progressivamente',                       p_user_id),
    (3, 'Engorda',     'GMD no pico — fase principal de ganho',                 p_user_id),
    (4, 'Acabamento',  'Animal próximo ao peso ideal — GMD começa a reduzir',   p_user_id)
  ON CONFLICT (user_id, numero) DO NOTHING;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Inserir faixas de rendimento padrão
CREATE OR REPLACE FUNCTION public.criar_faixas_padrao(p_user_id UUID)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.rendimento_faixas (peso_min, peso_max, rendimento_percentual, user_id) VALUES
    (0,    400,  52, p_user_id),
    (401,  500,  54, p_user_id),
    (501,  600,  56, p_user_id),
    (601,  9999, 57, p_user_id);

  INSERT INTO public.bonus_faixas (peso_min, peso_max, bonus_por_kg, user_id) VALUES
    (0,    449,  0.00, p_user_id),
    (450,  500,  0.50, p_user_id),
    (501,  550,  1.00, p_user_id),
    (551,  600,  1.50, p_user_id),
    (601,  9999, 2.00, p_user_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger para criar dados padrão ao criar perfil
CREATE OR REPLACE FUNCTION public.handle_new_profile()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM public.criar_ciclos_padrao(NEW.id);
  PERFORM public.criar_faixas_padrao(NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_profile();


-- ─── FUNÇÃO: updated_at automático ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar em todas as tabelas com updated_at
CREATE TRIGGER set_updated_at_profiles
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_lotes
  BEFORE UPDATE ON public.lotes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_animais
  BEFORE UPDATE ON public.animais
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_dietas
  BEFORE UPDATE ON public.dietas
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_componentes
  BEFORE UPDATE ON public.componentes_alimentares
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER set_updated_at_parceiros
  BEFORE UPDATE ON public.parceiros
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
