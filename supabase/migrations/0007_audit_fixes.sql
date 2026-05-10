-- ============================================================================
-- PROPHET — Migration 0007 : Audit fixes
-- 1. place_bet : check stakes_close_at <= now() (anti-race condition entre lock cron)
-- 2. Realtime publication : prices + positions + markets (sinon channels muets)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- FIX 1 : place_bet rejette les paris après stakes_close_at
-- (entre stakes_close_at et l'exécution du cron lock_due_markets, le statut
--  reste 'open' alors que la fenêtre est fermée — fenêtre ~60s à corriger)
-- ---------------------------------------------------------------------------

create or replace function public.place_bet(
  p_market_id uuid,
  p_side text,
  p_stake numeric,
  p_leverage int
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_market_status text;
  v_market_type text;
  v_market_price numeric;
  v_market_close_at timestamptz;
  v_max_leverage int;
  v_position_id uuid;
begin
  -- Auth
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- Validation paramètres
  if p_stake < 10 then
    raise exception 'Minimum stake is 10';
  end if;
  if p_leverage < 1 or p_leverage > 10 then
    raise exception 'Leverage must be between 1 and 10';
  end if;
  if p_side not in ('UP', 'DOWN', 'YES', 'NO') then
    raise exception 'Invalid side: %', p_side;
  end if;

  -- Marché : status + type + prix d'ouverture + fenêtre de stakes
  select status, market_type, price_open, stakes_close_at
    into v_market_status, v_market_type, v_market_price, v_market_close_at
  from markets where id = p_market_id;

  if v_market_status is null then
    raise exception 'Market not found';
  end if;
  if v_market_status != 'open' then
    raise exception 'Market is %, cannot bet', v_market_status;
  end if;
  if v_market_close_at is not null and v_market_close_at <= now() then
    raise exception 'Stakes window closed';
  end if;
  if v_market_type = 'directional' and p_side not in ('UP', 'DOWN') then
    raise exception 'Directional markets accept UP or DOWN only';
  end if;
  if v_market_type = 'event' and p_side not in ('YES', 'NO') then
    raise exception 'Event markets accept YES or NO only';
  end if;

  -- Lock balance + check niveau ↔ levier
  select
    balance,
    case when level >= 10 then 10 when level >= 5 then 5 else 2 end
    into v_balance, v_max_leverage
  from profiles where id = v_user_id for update;

  if v_balance is null then
    raise exception 'Profile not found';
  end if;
  if v_balance < p_stake then
    raise exception 'Insufficient balance';
  end if;
  if p_leverage > v_max_leverage then
    raise exception 'Leverage % not unlocked at your level (max %)', p_leverage, v_max_leverage;
  end if;

  -- Insert position
  insert into positions (user_id, market_id, side, stake, leverage, exposure, entry_price)
  values (v_user_id, p_market_id, p_side, p_stake, p_leverage, p_stake * p_leverage, v_market_price)
  returning id into v_position_id;

  -- Totaux du marché
  if p_side in ('UP', 'YES') then
    update markets set total_up_stakes = total_up_stakes + p_stake where id = p_market_id;
  else
    update markets set total_down_stakes = total_down_stakes + p_stake where id = p_market_id;
  end if;

  -- Balance + compteurs + xp
  update profiles
  set balance = balance - p_stake,
      total_trades = total_trades + 1,
      xp = xp + 10
  where id = v_user_id;

  -- Audit trail
  insert into transactions (user_id, type, amount, balance_after, position_id)
  values (v_user_id, 'stake', -p_stake, v_balance - p_stake, v_position_id);

  return v_position_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- FIX 2 : Activer Realtime sur les tables clés (idempotent)
-- ---------------------------------------------------------------------------

do $$
declare
  v_tables text[] := array['prices', 'positions', 'markets', 'profiles'];
  v_tbl text;
begin
  foreach v_tbl in array v_tables loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_tbl
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_tbl);
    end if;
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- FIX 3 : REPLICA IDENTITY FULL pour prices et positions
-- (sans ça, les payloads Realtime n'incluent que les colonnes qui ont changé)
-- ---------------------------------------------------------------------------

alter table public.prices    replica identity full;
alter table public.positions replica identity full;
alter table public.markets   replica identity full;
