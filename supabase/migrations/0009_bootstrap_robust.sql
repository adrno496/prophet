-- ============================================================================
-- PROPHET — Migration 0009 : Bootstrap robuste
-- Recycle les marchés expirés (lock + resolve) avant d'en ouvrir de nouveaux.
-- Cela rend bootstrap idempotent même après plusieurs heures.
-- ============================================================================

create or replace function public.bootstrap_with_prices(p_prices jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_seeded int := 0;
  v_locked int := 0;
  v_resolved int := 0;
  v_opened int := 0;
  v_item jsonb;
  v_asset_id text;
  v_price numeric;
  v_change numeric;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Seed les prix (filtre anti-injection : seuls les assets connus passent)
  for v_item in select * from jsonb_array_elements(p_prices)
  loop
    v_asset_id := v_item->>'asset_id';
    v_price := nullif(v_item->>'price', '')::numeric;
    v_change := nullif(v_item->>'change_24h', '')::numeric;

    if v_price is null or v_price <= 0 then continue; end if;
    if not exists (select 1 from assets where id = v_asset_id) then continue; end if;

    insert into prices (asset_id, price, change_24h, timestamp)
    values (v_asset_id, v_price, v_change, now());
    v_seeded := v_seeded + 1;
  end loop;

  -- 2. Verrouiller les marchés dont la fenêtre de stakes est passée
  v_locked := lock_due_markets();

  -- 3. Résoudre les marchés arrivés à échéance (utilise les prix qu'on vient de seed)
  v_resolved := resolve_due_markets();

  -- 4. Ouvrir les marchés directionnels manquants pour chaque (asset, timeframe)
  v_opened := open_directional_markets();

  return jsonb_build_object(
    'seeded', v_seeded,
    'locked', v_locked,
    'resolved', v_resolved,
    'opened', v_opened
  );
end;
$$;

grant execute on function public.bootstrap_with_prices(jsonb) to authenticated;
