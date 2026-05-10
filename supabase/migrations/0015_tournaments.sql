-- ============================================================================
-- PULSE PREDICT — Migration 0015 : Tournaments mode
-- Tournois hebdo : entry fee virtuelle, prize pool, classement par PnL
-- pendant la fenêtre [start_at, end_at].
-- ============================================================================

create table if not exists public.tournaments (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  entry_fee numeric(15,2) not null check (entry_fee >= 0),
  start_at timestamptz not null,
  end_at timestamptz not null check (end_at > start_at),
  prize_pool numeric(15,2) default 0,
  status text default 'upcoming' check (status in ('upcoming', 'live', 'ended', 'cancelled')),
  created_at timestamptz default now()
);

create index if not exists idx_tournaments_status on public.tournaments(status, start_at);

create table if not exists public.tournament_entries (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  entered_at timestamptz default now(),
  pnl_at_entry numeric(15,2) default 0,
  current_pnl numeric(15,2) default 0,
  rank int,
  prize numeric(15,2) default 0,
  unique (tournament_id, user_id)
);

create index if not exists idx_tournament_entries_tournament on public.tournament_entries(tournament_id, current_pnl desc);
create index if not exists idx_tournament_entries_user on public.tournament_entries(user_id);

alter table public.tournaments         enable row level security;
alter table public.tournament_entries enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where tablename = 'tournaments' and policyname = 'tournaments_read_all') then
    create policy "tournaments_read_all" on public.tournaments for select using (true);
  end if;
  if not exists (select 1 from pg_policies where tablename = 'tournament_entries' and policyname = 'tournament_entries_read_all') then
    create policy "tournament_entries_read_all" on public.tournament_entries for select using (true);
  end if;
end $$;

revoke insert, update, delete on public.tournaments from anon, authenticated;
revoke insert, update, delete on public.tournament_entries from anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. RPC : enter_tournament — débite l'entry fee et inscrit le user
-- ---------------------------------------------------------------------------

create or replace function public.enter_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_tournament tournaments%rowtype;
  v_balance numeric;
  v_pnl_at_entry numeric;
  v_entry_id uuid;
  v_balance_after numeric;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_tournament from tournaments where id = p_tournament_id;
  if v_tournament.id is null then raise exception 'Tournament not found'; end if;
  if v_tournament.status not in ('upcoming', 'live') then
    raise exception 'Tournament % not joinable', v_tournament.status;
  end if;
  if v_tournament.end_at <= now() then
    raise exception 'Tournament already ended';
  end if;

  -- Vérifier qu'on n'est pas déjà inscrit
  if exists (select 1 from tournament_entries where tournament_id = p_tournament_id and user_id = v_user_id) then
    raise exception 'Already entered';
  end if;

  -- Débiter l'entry fee
  select balance, total_pnl into v_balance, v_pnl_at_entry
  from profiles where id = v_user_id for update;
  if v_balance < v_tournament.entry_fee then
    raise exception 'Insufficient balance for entry fee (%)', v_tournament.entry_fee;
  end if;

  update profiles set balance = balance - v_tournament.entry_fee where id = v_user_id
    returning balance into v_balance_after;

  -- Augmenter le prize pool
  update tournaments set prize_pool = prize_pool + v_tournament.entry_fee where id = p_tournament_id;

  -- Inscrire
  insert into tournament_entries (tournament_id, user_id, pnl_at_entry, current_pnl)
  values (p_tournament_id, v_user_id, v_pnl_at_entry, 0)
  returning id into v_entry_id;

  -- Log dans transactions
  insert into transactions (user_id, type, amount, balance_after)
  values (v_user_id, 'stake', -v_tournament.entry_fee, v_balance_after);

  return jsonb_build_object(
    'entered', true,
    'entry_id', v_entry_id,
    'balance_after', v_balance_after,
    'tournament_name', v_tournament.name
  );
end;
$$;

grant execute on function public.enter_tournament(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC : update_tournament_pnls — recalcule PnL de chaque participant
-- (cron toutes les 5 min)
-- ---------------------------------------------------------------------------

create or replace function public.update_tournament_pnls()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_t tournaments%rowtype;
  v_e record;
  v_period_pnl numeric;
begin
  for v_t in select * from tournaments where status in ('upcoming', 'live') loop
    -- Lance le tournoi si on est dans la fenêtre
    if v_t.status = 'upcoming' and v_t.start_at <= now() then
      update tournaments set status = 'live' where id = v_t.id;
    end if;

    -- Update PnL des participants
    for v_e in select * from tournament_entries where tournament_id = v_t.id loop
      select coalesce(sum(p.pnl), 0) into v_period_pnl
      from positions p
      where p.user_id = v_e.user_id
        and p.status in ('won', 'lost', 'liquidated', 'cancelled')
        and p.resolved_at >= v_t.start_at
        and p.resolved_at <= least(v_t.end_at, now());

      update tournament_entries
      set current_pnl = coalesce(v_period_pnl, 0)
      where id = v_e.id;
    end loop;

    -- Recalculer rank
    with ranked as (
      select id, row_number() over (order by current_pnl desc) as rk
      from tournament_entries
      where tournament_id = v_t.id
    )
    update tournament_entries te
    set rank = r.rk
    from ranked r where r.id = te.id;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.update_tournament_pnls() from anon, authenticated;
grant execute on function public.update_tournament_pnls() to service_role;

-- ---------------------------------------------------------------------------
-- 3. RPC : settle_tournament — distribue les prix top 3 quand fini
-- (cron toutes les heures)
-- ---------------------------------------------------------------------------

create or replace function public.settle_tournament(p_tournament_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t tournaments%rowtype;
  v_e record;
  v_payout numeric;
  v_balance_after numeric;
  v_distribution numeric[3] := array[0.6, 0.25, 0.15]; -- 60/25/15%
  v_distributed numeric := 0;
begin
  select * into v_t from tournaments where id = p_tournament_id for update;
  if v_t.id is null then raise exception 'Tournament not found'; end if;
  if v_t.status = 'ended' then return jsonb_build_object('already_settled', true); end if;
  if v_t.end_at > now() then raise exception 'Tournament not ended yet'; end if;

  -- Distribuer prize pool aux 3 premiers
  for v_e in
    select * from tournament_entries
    where tournament_id = p_tournament_id
    order by current_pnl desc
    limit 3
  loop
    v_payout := round(v_t.prize_pool * v_distribution[v_e.rank], 2);
    if v_payout > 0 then
      update profiles set balance = balance + v_payout where id = v_e.user_id
        returning balance into v_balance_after;
      update tournament_entries set prize = v_payout where id = v_e.id;
      insert into transactions (user_id, type, amount, balance_after)
      values (v_e.user_id, 'win', v_payout, v_balance_after);
      v_distributed := v_distributed + v_payout;
    end if;
  end loop;

  update tournaments set status = 'ended' where id = p_tournament_id;

  return jsonb_build_object(
    'settled', true,
    'distributed', v_distributed,
    'pool', v_t.prize_pool
  );
end;
$$;

revoke execute on function public.settle_tournament(uuid) from anon, authenticated;
grant execute on function public.settle_tournament(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. RPC : settle_due_tournaments (cron) — appelle settle_tournament pour
-- chaque tournoi terminé non encore settled
-- ---------------------------------------------------------------------------

create or replace function public.settle_due_tournaments()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_t record;
  v_count int := 0;
begin
  for v_t in
    select id from tournaments
    where status = 'live' and end_at <= now()
  loop
    perform settle_tournament(v_t.id);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.settle_due_tournaments() from anon, authenticated;
grant execute on function public.settle_due_tournaments() to service_role;

-- ---------------------------------------------------------------------------
-- 5. RPC : current_tournament — retourne le tournoi actif (live) ou prochain
-- ---------------------------------------------------------------------------

create or replace function public.current_tournament()
returns jsonb
language sql
stable
as $$
  select to_jsonb(t.*) from public.tournaments t
  where t.status in ('live', 'upcoming')
  order by case when t.status = 'live' then 0 else 1 end, t.start_at asc
  limit 1;
$$;

grant execute on function public.current_tournament() to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. RPC : tournament_leaderboard — top N d'un tournoi
-- ---------------------------------------------------------------------------

create or replace function public.tournament_leaderboard(p_tournament_id uuid, p_limit int default 50)
returns table (rank int, user_id uuid, username text, current_pnl numeric, prize numeric)
language sql
stable
as $$
  select
    coalesce(te.rank, 999) as rank,
    te.user_id,
    pr.username,
    te.current_pnl,
    te.prize
  from tournament_entries te
  join profiles pr on pr.id = te.user_id
  where te.tournament_id = p_tournament_id
  order by te.current_pnl desc
  limit p_limit;
$$;

grant execute on function public.tournament_leaderboard(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cron : update PnLs every 5 min, settle every hour
-- ---------------------------------------------------------------------------

do $$
declare j text;
begin
  for j in select unnest(array['update_tournament_pnls_5min', 'settle_tournaments_1h'])
  loop
    if exists (select 1 from cron.job where jobname = j) then perform cron.unschedule(j); end if;
  end loop;
end $$;

select cron.schedule('update_tournament_pnls_5min', '*/5 * * * *',
  $cron$ select public.update_tournament_pnls(); $cron$);

select cron.schedule('settle_tournaments_1h', '0 * * * *',
  $cron$ select public.settle_due_tournaments(); $cron$);

-- ---------------------------------------------------------------------------
-- 8. Seed : un tournoi hebdo de démo (entry €100, prize pool 0 au départ)
-- ---------------------------------------------------------------------------

insert into public.tournaments (name, description, entry_fee, start_at, end_at, status)
select
  'Tournoi Hebdo — Semaine ' || to_char(now(), 'WW'),
  'Top 3 : 60% / 25% / 15% du prize pool. €100 d''entry fee.',
  100,
  date_trunc('week', now()),
  date_trunc('week', now()) + interval '7 days',
  case when date_trunc('week', now()) <= now() then 'live' else 'upcoming' end
where not exists (
  select 1 from public.tournaments
  where start_at = date_trunc('week', now())
);
