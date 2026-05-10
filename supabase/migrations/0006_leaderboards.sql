-- ============================================================================
-- PROPHET — Migration 0006 : Leaderboards + Achievements
-- update_leaderboards every 5 min · 4 ranking types
-- ============================================================================

-- ---------------------------------------------------------------------------
-- update_leaderboards : recalcule les 4 classements (balance / roi / winrate / sharpe)
-- ---------------------------------------------------------------------------
create or replace function public.update_leaderboards()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  -- Vider le cache
  delete from leaderboard_cache;

  -- 1. BALANCE : top par solde courant
  insert into leaderboard_cache (rank_type, rank, user_id, username, value, updated_at)
  select 'balance',
         row_number() over (order by p.balance desc),
         p.id,
         p.username,
         p.balance,
         now()
  from profiles p
  where p.total_trades >= 1
  order by p.balance desc
  limit 100;

  -- 2. ROI : (balance - 1000) / 1000 × 100, au moins 5 trades
  insert into leaderboard_cache (rank_type, rank, user_id, username, value, updated_at)
  select 'roi',
         row_number() over (order by (p.balance - 1000) / 1000.0 desc),
         p.id,
         p.username,
         round((p.balance - 1000) / 1000.0 * 100, 2),
         now()
  from profiles p
  where p.total_trades >= 5
  order by (p.balance - 1000) / 1000.0 desc
  limit 100;

  -- 3. WINRATE : wins / (wins+losses) × 100, au moins 10 trades résolus
  insert into leaderboard_cache (rank_type, rank, user_id, username, value, updated_at)
  select 'winrate',
         row_number() over (order by (p.wins::numeric / nullif(p.wins + p.losses, 0)) desc nulls last),
         p.id,
         p.username,
         round(p.wins::numeric / nullif(p.wins + p.losses, 0) * 100, 1),
         now()
  from profiles p
  where (p.wins + p.losses) >= 10
  order by (p.wins::numeric / nullif(p.wins + p.losses, 0)) desc nulls last
  limit 100;

  -- 4. SHARPE-LIKE : total_pnl / liquidations_count (proxy simple, à raffiner Phase 6+)
  insert into leaderboard_cache (rank_type, rank, user_id, username, value, updated_at)
  select 'sharpe',
         row_number() over (order by (p.total_pnl / greatest(p.liquidations_count, 1)) desc),
         p.id,
         p.username,
         round(p.total_pnl / greatest(p.liquidations_count, 1), 2),
         now()
  from profiles p
  where p.total_trades >= 20
  order by (p.total_pnl / greatest(p.liquidations_count, 1)) desc
  limit 100;

  select count(*) into v_count from leaderboard_cache;
  return v_count;
end;
$$;

revoke execute on function public.update_leaderboards() from anon, authenticated;
grant execute on function public.update_leaderboards() to service_role;

-- ---------------------------------------------------------------------------
-- check_achievements : déverrouille les badges éligibles pour l'utilisateur courant
-- ---------------------------------------------------------------------------
create or replace function public.check_achievements()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_p record;
  v_unlocked int := 0;
begin
  if v_user_id is null then return 0; end if;

  select id, balance, level, total_trades, wins, losses, peak_balance, total_pnl, liquidations_count
    into v_p
  from profiles where id = v_user_id;

  -- Badge "first_blood" : 1er trade
  if v_p.total_trades >= 1 and not exists (select 1 from achievements where user_id = v_user_id and code = 'first_blood') then
    insert into achievements (user_id, code) values (v_user_id, 'first_blood');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "centurion" : 100 trades
  if v_p.total_trades >= 100 and not exists (select 1 from achievements where user_id = v_user_id and code = 'centurion') then
    insert into achievements (user_id, code) values (v_user_id, 'centurion');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "first_win"
  if v_p.wins >= 1 and not exists (select 1 from achievements where user_id = v_user_id and code = 'first_win') then
    insert into achievements (user_id, code) values (v_user_id, 'first_win');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "win_streak_5" : 5 victoires (proxy via wins, pas vraie streak)
  if v_p.wins >= 5 and not exists (select 1 from achievements where user_id = v_user_id and code = 'win_5') then
    insert into achievements (user_id, code) values (v_user_id, 'win_5');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "high_roller" : peak_balance >= 5000
  if v_p.peak_balance >= 5000 and not exists (select 1 from achievements where user_id = v_user_id and code = 'high_roller') then
    insert into achievements (user_id, code) values (v_user_id, 'high_roller');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "millionaire" : peak_balance >= 1M
  if v_p.peak_balance >= 1000000 and not exists (select 1 from achievements where user_id = v_user_id and code = 'millionaire') then
    insert into achievements (user_id, code) values (v_user_id, 'millionaire');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "phoenix" : 1ère liquidation
  if v_p.liquidations_count >= 1 and not exists (select 1 from achievements where user_id = v_user_id and code = 'phoenix') then
    insert into achievements (user_id, code) values (v_user_id, 'phoenix');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "level_5"
  if v_p.level >= 5 and not exists (select 1 from achievements where user_id = v_user_id and code = 'level_5') then
    insert into achievements (user_id, code) values (v_user_id, 'level_5');
    v_unlocked := v_unlocked + 1;
  end if;

  -- Badge "level_10"
  if v_p.level >= 10 and not exists (select 1 from achievements where user_id = v_user_id and code = 'level_10') then
    insert into achievements (user_id, code) values (v_user_id, 'level_10');
    v_unlocked := v_unlocked + 1;
  end if;

  return v_unlocked;
end;
$$;

grant execute on function public.check_achievements() to authenticated;

-- ============================================================================
-- CRON
-- ============================================================================

do $$
begin
  if exists (select 1 from cron.job where jobname = 'update_leaderboards_5min') then
    perform cron.unschedule('update_leaderboards_5min');
  end if;
end $$;

select cron.schedule('update_leaderboards_5min', '*/5 * * * *',
  $cron$ select public.update_leaderboards(); $cron$);
