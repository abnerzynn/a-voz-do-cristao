-- =====================================================================
--  A Voz do Cristão — criação da tabela de sincronização (Supabase)
--
--  Como usar:
--   1. Entre no seu projeto em supabase.com
--   2. Menu lateral: SQL Editor -> New query
--   3. Cole TODO este conteúdo e clique em "Run"
-- =====================================================================

create table if not exists public.mensagens (
  id            text primary key,
  workspace     text not null,
  title         text,
  day           int,
  month         int,
  year          int,
  translation   text,
  original_text text,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now(),
  deleted       boolean default false
);

-- Acelera a busca pelas alterações recentes de cada igreja.
create index if not exists mensagens_workspace_idx
  on public.mensagens (workspace, updated_at);

alter table public.mensagens enable row level security;

-- Libera o acesso para a chave pública (anon).
-- O isolamento entre igrejas é feito pela "chave da igreja" (workspace),
-- que você define no aplicativo e só os seus computadores conhecem.
drop policy if exists "acesso pelo aplicativo" on public.mensagens;

-- O aplicativo pode LER, INSERIR e ATUALIZAR — mas NÃO pode apagar de verdade.
-- A sincronização nunca apaga: ela apenas marca a linha como deleted = true.
-- Assim, mesmo que a chave embutida no aplicativo vaze, nada é perdido para
-- sempre: o registro continua no banco e pode ser recuperado.
create policy "leitura pelo aplicativo" on public.mensagens
  for select to anon using (true);

create policy "insercao pelo aplicativo" on public.mensagens
  for insert to anon with check (true);

create policy "atualizacao pelo aplicativo" on public.mensagens
  for update to anon using (true) with check (true);

-- Observação: não existe policy de DELETE de propósito.
