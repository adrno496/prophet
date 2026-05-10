-- ============================================================================
-- PROPHET — Migration 0012 : Phase A — Audit fixes (P0/P1)
-- ============================================================================
-- Note : place_bet v3 (de migration 0010) reste l'active version. Cette migration
-- ne touche PAS place_bet. Elle ajoute des indexes, fix des race conditions sur
-- les balance_after dans transactions, et ajoute auto_refill_if_broke (spec PULSE).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Index manquant : check_liquidations() filtre WHERE status='open' AND leverage>1
--    Sans cet index, full table scan à chaque cron 5min sur positions ouvertes.
-- ---------------------------------------------------------------------------

create index if not exists idx_positions_leverage_open
  on public.positions(leverage)
  where status = 'open' and leverage > 1;

-- ---------------------------------------------------------------------------
-- 2. Index pour reset_account() qui cherche transactions type='reset' par user
--    Sans index composite, scan séquentiel à chaque clic Reset.
-- ---------------------------------------------------------------------------

create index if not exists idx_transactions_type_user
  on public.transactions(user_id, type, created_at desc);

-- ---------------------------------------------------------------------------
-- 3. Fix race condition `balance_after` dans resolve_position
--    Bug : entre l'UPDATE balance et le SELECT balance INTO v_balance suivant,
--    une autre transaction concurrente peut modifier la balance.
--    Fix : capturer balance directement via RETURNING dans l'UPDATE.
-- ---------------------------------------------------------------------------

create or replace function public.resolve_position(p_position_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos record;
  v_won boolean;
  v_pnl numeric;
  v_move_pct numeric;
  v_move_bonus numeric;
  v_balance numeric;
begin
  -- Récupérer position + marché en un seul SELECT joint
  select p.*, m.outcome as m_outcome, m.price_open as m_open,
         m.price_close as m_close, m.status as m_status
    into v_pos
  from positions p
  join markets m on m.id = p.market_id
  where p.id = p_position_id;

  if v_pos.id is null then
    raise exception 'Position not found';
  end if;
  if v_pos.status != 'open' then
    return false;
  end if;

  -- Annulation : refund stake intégral
  if v_pos.m_outcome = 'CANCELLED' then
    update profiles
      set balance = balance + v_pos.stake
      where id = v_pos.user_id
      returning balance into v_balance;

    update positions
    set status = 'cancelled', resolved_at = now(), pnl = 0
    where id = p_position_id;

    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'win', v_pos.stake, v_balance, p_position_id);
    return true;
  end if;

  v_won := (v_pos.side = v_pos.m_outcome);
  if v_pos.m_open > 0 and v_pos.m_close is not null then
    v_move_pct := (v_pos.m_close - v_pos.m_open) / v_pos.m_open * 100;
  else
    v_move_pct := 0;
  end if;

  if v_won then
    v_move_bonus := least(abs(v_move_pct) / 5.0, 1.0);
    v_pnl := round(v_pos.stake * v_pos.leverage * 0.95 * (1 + v_move_bonus * 0.5), 2);

    update profiles
      set balance = balance + v_pos.stake + v_pnl,
          wins = wins + 1,
          total_pnl = total_pnl + v_pnl,
          xp = xp + 25
      where id = v_pos.user_id
      returning balance into v_balance;

    update positions
    set status = 'won', resolved_at = now(), exit_price = v_pos.m_close,
        move_pct = v_move_pct, pnl = v_pnl
    where id = p_position_id;

    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'win', v_pos.stake + v_pnl, v_balance, p_position_id);
  else
    update profiles
      set losses = losses + 1,
          total_pnl = total_pnl - v_pos.stake
      where id = v_pos.user_id
      returning balance into v_balance;

    update positions
    set status = 'lost', resolved_at = now(), exit_price = v_pos.m_close,
        move_pct = v_move_pct, pnl = -v_pos.stake
    where id = p_position_id;

    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'loss', -v_pos.stake, v_balance, p_position_id);
  end if;

  return true;
end;
$$;

revoke execute on function public.resolve_position(uuid) from anon, authenticated;
grant execute on function public.resolve_position(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- 4. Fix apply_funding_fees : log même si la balance clipe à 0
-- ---------------------------------------------------------------------------

create or replace function public.apply_funding_fees()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos record;
  v_fee_intended numeric;
  v_fee_applied numeric;
  v_balance_before numeric;
  v_balance_after numeric;
  v_count int := 0;
begin
  for v_pos in
    select id, user_id, exposure, leverage from positions
    where status = 'open' and leverage >= 3
    limit 1000
  loop
    v_fee_intended := round(v_pos.exposure * 0.0005, 2);
    if v_fee_intended <= 0 then continue; end if;

    -- Lire la balance courante puis appliquer le fee (clamp à 0)
    select balance into v_balance_before from profiles where id = v_pos.user_id for update;
    v_fee_applied := least(v_fee_intended, v_balance_before);
    v_balance_after := v_balance_before - v_fee_applied;

    update profiles
      set balance = v_balance_after
      where id = v_pos.user_id;

    -- Log toujours, même si fee_applied < fee_intended (transparence audit)
    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'funding_fee', -v_fee_applied, v_balance_after, v_pos.id);

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.apply_funding_fees() from anon, authenticated;
grant execute on function public.apply_funding_fees() to service_role;

-- ---------------------------------------------------------------------------
-- 5. NEW RPC auto_refill_if_broke (spec PULSE PREDICT)
--    Si l'utilisateur a moins de €100, refill auto à €1000.
--    Cooldown 24h pour éviter farming via reset_account.
-- ---------------------------------------------------------------------------

create or replace function public.auto_refill_if_broke()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_target numeric := 1000;
  v_threshold numeric := 100;
  v_last_refill timestamptz;
  v_credit numeric;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select balance into v_balance from profiles where id = v_user_id for update;
  if v_balance is null then
    return jsonb_build_object('refilled', false, 'reason', 'profile_not_found');
  end if;
  if v_balance >= v_threshold then
    return jsonb_build_object('refilled', false, 'reason', 'above_threshold', 'coins', v_balance);
  end if;

  -- Cooldown : pas plus d'un refill par 24h
  select max(created_at) into v_last_refill
  from transactions
  where user_id = v_user_id and type = 'reset';
  if v_last_refill is not null and v_last_refill > now() - interval '24 hours' then
    return jsonb_build_object('refilled', false, 'reason', 'cooldown', 'next_at', v_last_refill + interval '24 hours');
  end if;

  v_credit := v_target - v_balance;
  update profiles set balance = v_target where id = v_user_id;
  insert into transactions (user_id, type, amount, balance_after)
  values (v_user_id, 'reset', v_credit, v_target);

  return jsonb_build_object('refilled', true, 'coins', v_target, 'credit', v_credit);
end;
$$;

grant execute on function public.auto_refill_if_broke() to authenticated;
