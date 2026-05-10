-- ============================================================================
-- PULSE PREDICT — Migration 0013 : AI Coach (table + RPCs)
-- Génération globale de 3 prédictions IA par jour, partagées par tous les users.
-- Le 1er user à ouvrir le dashboard sans prédictions du jour les génère localement
-- via son client IA configuré, puis les push via submit_ai_prediction.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. Table ai_predictions (manquait dans 0001 — créée ici, idempotent)
-- ---------------------------------------------------------------------------

create table if not exists public.ai_predictions (
  id uuid primary key default gen_random_uuid(),
  market_type text not null check (market_type in ('directional', 'event')),
  reference_id uuid not null,
  ai_pick text not null check (ai_pick in ('UP', 'DOWN', 'YES', 'NO')),
  ai_confidence int check (ai_confidence between 0 and 100),
  ai_reasoning text,
  outcome text check (outcome in ('correct', 'incorrect', 'pending')) default 'pending',
  created_at timestamptz default now()
);

create index if not exists idx_ai_predictions_outcome on public.ai_predictions(outcome, created_at desc);
create index if not exists idx_ai_predictions_ref on public.ai_predictions(reference_id);
create index if not exists idx_ai_predictions_today on public.ai_predictions(created_at desc) where outcome = 'pending';

alter table public.ai_predictions enable row level security;

-- RLS : lecture publique (chacun voit les prédictions de l'IA)
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'ai_predictions' and policyname = 'ai_predictions_read_all'
  ) then
    create policy "ai_predictions_read_all" on public.ai_predictions for select using (true);
  end if;
end $$;

-- Mutations bloquées côté client : tout passe par submit_ai_prediction RPC
revoke insert, update, delete on public.ai_predictions from anon, authenticated;

-- Realtime publication (pour mise à jour en direct du score IA)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'ai_predictions'
  ) then
    execute 'alter publication supabase_realtime add table public.ai_predictions';
  end if;
end $$;

alter table public.ai_predictions replica identity full;

-- ---------------------------------------------------------------------------
-- 1. Vue : prédictions du jour (≤ 3, status pending)
-- ---------------------------------------------------------------------------

create or replace view public.todays_ai_predictions as
select id, market_type, reference_id, ai_pick, ai_confidence, ai_reasoning, outcome, created_at
from public.ai_predictions
where created_at >= date_trunc('day', now())
order by created_at desc
limit 3;

grant select on public.todays_ai_predictions to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC : submit_ai_prediction (n'importe quel user authentifié peut soumettre)
-- Limite : 3 max par jour, pas de doublon sur le même reference_id
-- ---------------------------------------------------------------------------

create or replace function public.submit_ai_prediction(
  p_market_id uuid,
  p_pick text,
  p_confidence int,
  p_reasoning text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_market_type text;
  v_count int;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_pick not in ('UP', 'DOWN', 'YES', 'NO') then
    raise exception 'Invalid pick: %', p_pick;
  end if;
  if p_confidence is null or p_confidence < 0 or p_confidence > 100 then
    raise exception 'Confidence must be 0-100';
  end if;
  if length(coalesce(p_reasoning, '')) > 800 then
    raise exception 'Reasoning too long (max 800 chars)';
  end if;

  -- Vérifier que le marché existe et récupérer son type
  select market_type into v_market_type
  from markets where id = p_market_id;
  if v_market_type is null then
    raise exception 'Market not found';
  end if;

  -- Quota global : 3 prédictions par jour max
  select count(*) into v_count
  from ai_predictions
  where created_at >= date_trunc('day', now());
  if v_count >= 3 then
    raise exception 'Already 3 AI predictions submitted today';
  end if;

  -- Pas de doublon : même reference_id le même jour
  if exists (
    select 1 from ai_predictions
    where reference_id = p_market_id
      and created_at >= date_trunc('day', now())
  ) then
    raise exception 'AI prediction already exists for this market today';
  end if;

  insert into ai_predictions (market_type, reference_id, ai_pick, ai_confidence, ai_reasoning, outcome)
  values (v_market_type, p_market_id, p_pick, p_confidence, left(p_reasoning, 800), 'pending')
  returning id into v_id;

  return v_id;
end;
$$;

grant execute on function public.submit_ai_prediction(uuid, text, int, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC : resolve_ai_predictions (cron : marque correct/incorrect après résolution market)
-- ---------------------------------------------------------------------------

create or replace function public.resolve_ai_predictions()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pred record;
  v_outcome text;
  v_count int := 0;
begin
  for v_pred in
    select ap.id, ap.reference_id, ap.ai_pick, m.outcome as market_outcome
    from ai_predictions ap
    join markets m on m.id = ap.reference_id
    where ap.outcome = 'pending'
      and m.status = 'resolved'
      and m.outcome is not null
      and m.outcome != 'CANCELLED'
  loop
    if v_pred.ai_pick = v_pred.market_outcome then
      v_outcome := 'correct';
    else
      v_outcome := 'incorrect';
    end if;
    update ai_predictions set outcome = v_outcome where id = v_pred.id;
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.resolve_ai_predictions() from anon, authenticated;
grant execute on function public.resolve_ai_predictions() to service_role;

-- ---------------------------------------------------------------------------
-- 4. Cron : résoudre les prédictions IA chaque heure
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'resolve_ai_predictions_1h') then
    perform cron.unschedule('resolve_ai_predictions_1h');
  end if;
end $$;

select cron.schedule('resolve_ai_predictions_1h', '0 * * * *',
  $cron$ select public.resolve_ai_predictions(); $cron$);

-- ---------------------------------------------------------------------------
-- 5. RPC : ai_coach_stats — track record global de l'IA
-- ---------------------------------------------------------------------------

create or replace function public.ai_coach_stats()
returns jsonb
language sql
stable
as $$
  select jsonb_build_object(
    'total',     count(*),
    'correct',   count(*) filter (where outcome = 'correct'),
    'incorrect', count(*) filter (where outcome = 'incorrect'),
    'pending',   count(*) filter (where outcome = 'pending'),
    'accuracy',  case
      when count(*) filter (where outcome in ('correct','incorrect')) > 0
      then round(100.0 * count(*) filter (where outcome='correct') / count(*) filter (where outcome in ('correct','incorrect')), 1)
      else null
    end
  )
  from ai_predictions;
$$;

grant execute on function public.ai_coach_stats() to anon, authenticated;
