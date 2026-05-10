-- ============================================================================
-- PROPHET — Migration 0011 : Import des markets externes (Polymarket, Manifold)
-- Permet de placer des paris in-app sur des markets fetchés depuis APIs publiques
-- ============================================================================

-- 1. Schema : tracker la source externe
alter table public.markets
  add column if not exists external_id text,
  add column if not exists external_source text;

create unique index if not exists idx_markets_external
  on public.markets (external_source, external_id)
  where external_id is not null;

-- 2. RPC : importe un market externe à la demande (idempotent)
-- Appelée par le frontend quand l'utilisateur clique YES/NO sur un Polymarket/Manifold
create or replace function public.import_external_market(p_market jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_existing uuid;
  v_new_id uuid;
  v_external_id text := p_market->>'external_id';
  v_external_source text := p_market->>'external_source';
  v_close timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if v_external_id is null or v_external_source is null then
    raise exception 'external_id and external_source required';
  end if;
  if v_external_source not in ('polymarket', 'manifold') then
    raise exception 'Unknown external_source: %', v_external_source;
  end if;

  -- Déjà importé ? → renvoie l'UUID existant
  select id into v_existing
  from markets
  where external_source = v_external_source
    and external_id = v_external_id;
  if v_existing is not null then
    return v_existing;
  end if;

  -- Calcul stakes_close_at : 90% du chemin vers resolves_at (sinon 7j par défaut)
  v_close := coalesce((p_market->>'stakes_close_at')::timestamptz, now() + interval '7 days');

  -- Insertion nouvelle
  insert into markets (
    market_type, topic, question, outcome_label, image_emoji, subtitle,
    opens_at, stakes_close_at, resolves_at, status, sort_order,
    external_id, external_source,
    total_up_stakes, total_down_stakes
  ) values (
    'event',
    nullif(p_market->>'topic', ''),
    p_market->>'question',
    nullif(p_market->>'outcome_label', ''),
    nullif(p_market->>'image_emoji', ''),
    nullif(p_market->>'subtitle', ''),
    coalesce((p_market->>'opens_at')::timestamptz, now()),
    v_close,
    coalesce((p_market->>'resolves_at')::timestamptz, v_close + interval '7 days'),
    'open',
    coalesce((p_market->>'sort_order')::int, 50),
    v_external_id,
    v_external_source,
    -- Encode les odds réels comme stakes initiaux (1000 unités totales)
    coalesce((p_market->>'total_up_stakes')::numeric, 500),
    coalesce((p_market->>'total_down_stakes')::numeric, 500)
  )
  returning id into v_new_id;

  return v_new_id;
end;
$$;

grant execute on function public.import_external_market(jsonb) to authenticated;
