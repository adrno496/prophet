-- ============================================================================
-- PROPHET — Migration 0005 : Liquidation + Funding fees
-- check_liquidations every 5 min, apply_funding_fees every 1 hour
-- Liquidation : equity < 10% marge (mouvement défavorable de 90%/leverage)
-- Funding : -0.05%/h sur exposition, leverage >= 3x
-- ============================================================================

-- ---------------------------------------------------------------------------
-- check_liquidations : ferme les positions levier > 1x dont l'equity < 10% marge
-- ---------------------------------------------------------------------------
create or replace function public.check_liquidations()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos record;
  v_current_price numeric;
  v_move_pct numeric;
  v_equity_ratio numeric;
  v_count int := 0;
  v_balance numeric;
begin
  for v_pos in
    select p.id, p.user_id, p.market_id, p.side, p.stake, p.leverage, p.entry_price,
           m.asset_id, m.status as m_status
    from positions p
    join markets m on m.id = p.market_id
    where p.status = 'open'
      and p.leverage > 1
      and p.entry_price is not null
      and m.status in ('open', 'locked')
    limit 500
  loop
    v_current_price := get_latest_price(v_pos.asset_id);
    if v_current_price is null or v_pos.entry_price <= 0 then continue; end if;

    -- Mouvement (% du prix d'entrée)
    if v_pos.side in ('UP', 'YES') then
      v_move_pct := (v_current_price - v_pos.entry_price) / v_pos.entry_price;
    else
      v_move_pct := (v_pos.entry_price - v_current_price) / v_pos.entry_price;
    end if;

    -- Ratio d'equity restant : (1 + move_pct * leverage)
    -- Si <= 0.10, on liquide (90% de la marge perdue)
    v_equity_ratio := 1 + v_move_pct * v_pos.leverage;

    if v_equity_ratio <= 0.10 then
      -- Liquidation : la mise est déjà déduite, on enregistre la perte
      update positions
      set status = 'liquidated',
          resolved_at = now(),
          exit_price = v_current_price,
          move_pct = v_move_pct * 100,
          pnl = -v_pos.stake
      where id = v_pos.id;

      update profiles
      set losses = losses + 1,
          liquidations_count = liquidations_count + 1,
          total_pnl = total_pnl - v_pos.stake
      where id = v_pos.user_id;

      select balance into v_balance from profiles where id = v_pos.user_id;
      insert into transactions (user_id, type, amount, balance_after, position_id)
      values (v_pos.user_id, 'liquidation', -v_pos.stake, v_balance, v_pos.id);

      v_count := v_count + 1;
    end if;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.check_liquidations() from anon, authenticated;
grant execute on function public.check_liquidations() to service_role;

-- ---------------------------------------------------------------------------
-- apply_funding_fees : -0.05% × exposition par heure pour leverage >= 3x
-- ---------------------------------------------------------------------------
create or replace function public.apply_funding_fees()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos record;
  v_fee numeric;
  v_balance numeric;
  v_count int := 0;
begin
  for v_pos in
    select id, user_id, exposure, leverage from positions
    where status = 'open' and leverage >= 3
    limit 1000
  loop
    -- Fee = 0.05% de l'exposition, arrondi à 2 décimales
    v_fee := round(v_pos.exposure * 0.0005, 2);
    if v_fee <= 0 then continue; end if;

    -- Déduire de la balance utilisateur
    update profiles
    set balance = greatest(0, balance - v_fee)
    where id = v_pos.user_id
    returning balance into v_balance;

    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'funding_fee', -v_fee, v_balance, v_pos.id);

    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.apply_funding_fees() from anon, authenticated;
grant execute on function public.apply_funding_fees() to service_role;

-- ============================================================================
-- CRON SCHEDULES
-- ============================================================================

do $$
declare
  v_jobs text[] := array['check_liquidations_5min', 'apply_funding_fees_1h'];
  v_job text;
begin
  foreach v_job in array v_jobs loop
    if exists (select 1 from cron.job where jobname = v_job) then
      perform cron.unschedule(v_job);
    end if;
  end loop;
end $$;

select cron.schedule('check_liquidations_5min', '*/5 * * * *',
  $cron$ select public.check_liquidations(); $cron$);

select cron.schedule('apply_funding_fees_1h', '0 * * * *',
  $cron$ select public.apply_funding_fees(); $cron$);
