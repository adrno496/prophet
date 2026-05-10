-- ============================================================================
-- PROPHET — Migration 0004 : Markets Engine
-- Ouverture / verrouillage / résolution automatiques des marchés directionnels
-- Cron : */1 * * * * pour lock + resolve, */15 * * * * pour open
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helper : récupère le dernier prix d'un actif (NULL si aucun)
-- ---------------------------------------------------------------------------
create or replace function public.get_latest_price(p_asset_id text)
returns numeric
language sql
stable
as $$
  select price from public.prices
  where asset_id = p_asset_id
  order by timestamp desc
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- open_directional_markets : crée les marchés manquants pour chaque (asset,timeframe)
-- ---------------------------------------------------------------------------
create or replace function public.open_directional_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_asset record;
  v_tf int;
  v_price numeric;
  v_window_pct numeric;
  v_now timestamptz := now();
  v_count int := 0;
  v_timeframes int[] := array[15, 30, 60, 240, 480, 1440];
begin
  for v_asset in
    select id, name, symbol, category from assets where active = true
  loop
    foreach v_tf in array v_timeframes
    loop
      -- Y a-t-il déjà un marché ouvert (status='open' ou 'locked') pour cet (asset, timeframe) ?
      if exists (
        select 1 from markets
        where asset_id = v_asset.id
          and timeframe_minutes = v_tf
          and status in ('open', 'locked')
          and resolves_at > v_now
      ) then
        continue;
      end if;

      v_price := get_latest_price(v_asset.id);
      if v_price is null or v_price <= 0 then
        -- Pas encore de prix pour cet actif (cron fetch_prices pas passé)
        continue;
      end if;

      -- Fenêtre de stakes = 20% du timeframe
      v_window_pct := 0.20;

      insert into markets (
        asset_id, market_type, timeframe_minutes, question,
        opens_at, stakes_close_at, resolves_at, price_open, status
      ) values (
        v_asset.id,
        'directional',
        v_tf,
        coalesce(v_asset.symbol, v_asset.id) || ' UP/DOWN ' || v_tf || 'min ?',
        v_now,
        v_now + (v_tf * v_window_pct || ' minutes')::interval,
        v_now + (v_tf || ' minutes')::interval,
        v_price,
        'open'
      );
      v_count := v_count + 1;
    end loop;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.open_directional_markets() from anon, authenticated;
grant execute on function public.open_directional_markets() to service_role;

-- ---------------------------------------------------------------------------
-- lock_due_markets : status='open' → 'locked' quand stakes_close_at est passé
-- ---------------------------------------------------------------------------
create or replace function public.lock_due_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  with locked as (
    update markets
    set status = 'locked'
    where status = 'open'
      and stakes_close_at <= now()
    returning id
  )
  select count(*) into v_count from locked;
  return coalesce(v_count, 0);
end;
$$;

revoke execute on function public.lock_due_markets() from anon, authenticated;
grant execute on function public.lock_due_markets() to service_role;

-- ---------------------------------------------------------------------------
-- resolve_due_markets : verrouillés → résolus + distribue PnL via resolve_position
-- ---------------------------------------------------------------------------
create or replace function public.resolve_due_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_market record;
  v_pos record;
  v_close numeric;
  v_outcome text;
  v_count int := 0;
begin
  for v_market in
    select id, asset_id, price_open, status
    from markets
    where status = 'locked'
      and resolves_at <= now()
    limit 200
  loop
    v_close := get_latest_price(v_market.asset_id);

    if v_close is null then
      -- Pas de prix → annulation, refund toutes les positions
      v_outcome := 'CANCELLED';
    elsif v_close > v_market.price_open then
      v_outcome := 'UP';
    elsif v_close < v_market.price_open then
      v_outcome := 'DOWN';
    else
      v_outcome := 'CANCELLED'; -- égalité = refund
    end if;

    update markets
    set status = 'resolved',
        outcome = v_outcome,
        price_close = v_close,
        resolved_at = now()
    where id = v_market.id;

    -- Résoudre toutes les positions ouvertes pour ce marché
    for v_pos in
      select id from positions where market_id = v_market.id and status = 'open'
    loop
      perform resolve_position(v_pos.id);
    end loop;

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.resolve_due_markets() from anon, authenticated;
grant execute on function public.resolve_due_markets() to service_role;

-- ---------------------------------------------------------------------------
-- bootstrap_markets : alias public pour ouvrir des marchés manuellement
-- (dispo en RPC pour authenticated → utile en dev / 1er lancement)
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  v_count := open_directional_markets();
  return v_count;
end;
$$;

grant execute on function public.bootstrap_markets() to authenticated;

-- ============================================================================
-- CRON SCHEDULES
-- ============================================================================

-- Drop existing
do $$
declare
  v_jobs text[] := array['open_markets_15min', 'lock_markets_1min', 'resolve_markets_1min'];
  v_job text;
begin
  foreach v_job in array v_jobs loop
    if exists (select 1 from cron.job where jobname = v_job) then
      perform cron.unschedule(v_job);
    end if;
  end loop;
end $$;

-- Toutes les 15 min : ouvrir les nouveaux marchés (cycles complets)
select cron.schedule('open_markets_15min', '*/15 * * * *',
  $cron$ select public.open_directional_markets(); $cron$);

-- Toutes les minutes : verrouiller ceux dont la fenêtre est passée
select cron.schedule('lock_markets_1min', '*/1 * * * *',
  $cron$ select public.lock_due_markets(); $cron$);

-- Toutes les minutes : résoudre ceux qui sont arrivés à échéance
select cron.schedule('resolve_markets_1min', '*/1 * * * *',
  $cron$ select public.resolve_due_markets(); $cron$);
