-- ============================================================================
-- PROPHET — Migration 0003 : Pricing Engine
-- pg_cron + pg_net + helpers + view "latest_prices"
-- ============================================================================

-- Extensions Cloud-only (Supabase Cloud les supporte nativement)
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net  with schema extensions;
grant usage on schema cron to postgres;

-- ---------------------------------------------------------------------------
-- Vue : dernier prix par actif (utilisée par le frontend et resolve_markets)
-- ---------------------------------------------------------------------------
create or replace view public.latest_prices as
select distinct on (asset_id)
  asset_id,
  price,
  change_24h,
  timestamp
from public.prices
order by asset_id, timestamp desc;

-- Lecture publique de la vue
grant select on public.latest_prices to anon, authenticated;

-- ---------------------------------------------------------------------------
-- RPC : record_price (insère un snapshot, appelée par l'Edge Function)
-- Réservée à service_role (Edge Function avec auth via service_role key)
-- ---------------------------------------------------------------------------
create or replace function public.record_price(
  p_asset_id text,
  p_price numeric,
  p_change_24h numeric default null
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  insert into prices (asset_id, price, change_24h, timestamp)
  values (p_asset_id, p_price, p_change_24h, now())
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.record_price(text, numeric, numeric) from anon, authenticated;
grant execute on function public.record_price(text, numeric, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- RPC : record_prices_batch (insère N snapshots en un seul appel)
-- ---------------------------------------------------------------------------
create or replace function public.record_prices_batch(p_prices jsonb)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_item jsonb;
begin
  for v_item in select * from jsonb_array_elements(p_prices)
  loop
    insert into prices (asset_id, price, change_24h, timestamp)
    values (
      v_item->>'asset_id',
      (v_item->>'price')::numeric,
      nullif(v_item->>'change_24h', '')::numeric,
      now()
    );
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke execute on function public.record_prices_batch(jsonb) from anon, authenticated;
grant execute on function public.record_prices_batch(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Cron : fetch_prices toutes les minutes
-- ⚠️ Avant que ça fonctionne, l'utilisateur doit créer 2 secrets dans Vault :
--   select vault.create_secret('https://guevmgdxznrvxcjvvzyu.supabase.co', 'project_url');
--   select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
-- (le service_role_key se trouve dans Dashboard Supabase → Project Settings → API)
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from cron.job where jobname = 'fetch_prices_1min') then
    perform cron.unschedule('fetch_prices_1min');
  end if;
end $$;

select cron.schedule(
  'fetch_prices_1min',
  '*/1 * * * *',
  $cron$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1) || '/functions/v1/fetch_prices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1)
    ),
    body := jsonb_build_object('source', 'cron')
  ) as request_id;
  $cron$
);

-- ---------------------------------------------------------------------------
-- Politique de rétention : garder 7 jours de prix max (réduit la taille DB)
-- ---------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from cron.job where jobname = 'prune_old_prices') then
    perform cron.unschedule('prune_old_prices');
  end if;
end $$;

select cron.schedule(
  'prune_old_prices',
  '0 3 * * *',
  $cron$ delete from public.prices where timestamp < now() - interval '7 days'; $cron$
);
