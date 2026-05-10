-- ============================================================================
-- PULSE PREDICT — Migration 0014 : Phase E
-- - balance_history RPC (pour PnL graph profile)
-- - ai_predictions_resolved RPC (pour historique IA profile)
-- - period_leaderboard RPC (daily/weekly/monthly/alltime)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. RPC : my_balance_history (last 30 days, agrégé par jour)
-- ---------------------------------------------------------------------------

create or replace function public.my_balance_history(p_days int default 30)
returns table (ts timestamptz, balance numeric)
language sql
stable
security definer
set search_path = public
as $$
  with daily as (
    select
      date_trunc('day', created_at) as day,
      max(balance_after) as eod_balance
    from transactions
    where user_id = auth.uid()
      and created_at >= now() - (p_days || ' days')::interval
      and balance_after is not null
    group by 1
  )
  select day::timestamptz, eod_balance from daily
  order by day asc
  limit p_days + 1;
$$;

grant execute on function public.my_balance_history(int) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. RPC : ai_predictions_history (toutes les prédictions IA résolues récentes)
-- ---------------------------------------------------------------------------

create or replace function public.ai_predictions_history(p_limit int default 50)
returns setof public.ai_predictions
language sql
stable
as $$
  select * from public.ai_predictions
  where outcome in ('correct', 'incorrect')
  order by created_at desc
  limit p_limit;
$$;

grant execute on function public.ai_predictions_history(int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC : ai_accuracy_by_day (pour barres correct/incorrect par jour)
-- ---------------------------------------------------------------------------

create or replace function public.ai_accuracy_by_day(p_days int default 14)
returns table (date date, correct int, incorrect int)
language sql
stable
as $$
  select
    date_trunc('day', created_at)::date as date,
    count(*) filter (where outcome = 'correct')::int as correct,
    count(*) filter (where outcome = 'incorrect')::int as incorrect
  from public.ai_predictions
  where created_at >= now() - (p_days || ' days')::interval
    and outcome != 'pending'
  group by 1
  order by 1 asc;
$$;

grant execute on function public.ai_accuracy_by_day(int) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. RPC : period_leaderboard (daily/weekly/monthly/alltime)
-- ---------------------------------------------------------------------------

create or replace function public.period_leaderboard(
  p_period text default 'alltime',
  p_metric text default 'balance',
  p_limit int default 100
)
returns table (
  rank int,
  user_id uuid,
  username text,
  value numeric,
  total_trades int,
  wins int
)
language plpgsql
stable
set search_path = public
as $$
declare
  v_since timestamptz;
begin
  v_since := case p_period
    when 'daily'   then now() - interval '1 day'
    when 'weekly'  then now() - interval '7 days'
    when 'monthly' then now() - interval '30 days'
    else null
  end;

  if p_metric = 'pnl' then
    -- PnL réalisé sur la période
    return query
    with period_pnl as (
      select
        p.user_id,
        coalesce(sum(p.pnl), 0) as total_pnl,
        count(*) as trades_count,
        count(*) filter (where p.status = 'won') as wins_count
      from positions p
      where p.status in ('won', 'lost', 'liquidated', 'cancelled')
        and (v_since is null or p.resolved_at >= v_since)
      group by p.user_id
    )
    select
      row_number() over (order by pp.total_pnl desc nulls last)::int as rank,
      pr.id as user_id,
      pr.username,
      pp.total_pnl as value,
      pp.trades_count::int,
      pp.wins_count::int
    from period_pnl pp
    join profiles pr on pr.id = pp.user_id
    where pp.trades_count >= 1
    order by pp.total_pnl desc nulls last
    limit p_limit;

  elsif p_metric = 'winrate' then
    return query
    with period_winrate as (
      select
        p.user_id,
        count(*) as trades_count,
        count(*) filter (where p.status = 'won') as wins_count
      from positions p
      where p.status in ('won', 'lost', 'liquidated')
        and (v_since is null or p.resolved_at >= v_since)
      group by p.user_id
    )
    select
      row_number() over (order by (pw.wins_count::numeric / nullif(pw.trades_count, 0)) desc nulls last)::int as rank,
      pr.id,
      pr.username,
      round(pw.wins_count::numeric / nullif(pw.trades_count, 0) * 100, 1) as value,
      pw.trades_count::int,
      pw.wins_count::int
    from period_winrate pw
    join profiles pr on pr.id = pw.user_id
    where pw.trades_count >= 5
    order by (pw.wins_count::numeric / nullif(pw.trades_count, 0)) desc nulls last
    limit p_limit;

  else
    -- balance (défaut, pas de filtre temporel — c'est le solde courant)
    return query
    select
      row_number() over (order by pr.balance desc)::int as rank,
      pr.id,
      pr.username,
      pr.balance as value,
      pr.total_trades::int,
      pr.wins::int
    from profiles pr
    where pr.total_trades >= 1
    order by pr.balance desc
    limit p_limit;
  end if;
end;
$$;

grant execute on function public.period_leaderboard(text, text, int) to anon, authenticated;
