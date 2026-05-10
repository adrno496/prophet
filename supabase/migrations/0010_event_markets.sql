-- ============================================================================
-- PROPHET — Migration 0010 : Event markets (style Polymarket complet)
-- Ajoute : topic, outcome_label, image_emoji, sort_order, subtitle
-- Seed : 40+ marchés événementiels (Politique, Sport, IA, Tech, Climat, etc.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Schema : étendre markets pour event multi-outcome / multi-deadline
-- ---------------------------------------------------------------------------

alter table public.markets
  add column if not exists topic text,
  add column if not exists outcome_label text,
  add column if not exists image_emoji text,
  add column if not exists sort_order int default 0,
  add column if not exists subtitle text;

create index if not exists idx_markets_topic on public.markets(topic) where status in ('open', 'locked');

-- ---------------------------------------------------------------------------
-- 2. RPC : seed_demo_event_markets — 40+ marchés démo
-- Idempotent : skip les markets déjà existants pour le même (topic, outcome_label)
-- ---------------------------------------------------------------------------

create or replace function public.seed_demo_event_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
  v_now timestamptz := now();
begin
  insert into public.markets (
    market_type, topic, question, outcome_label, image_emoji, subtitle,
    opens_at, stakes_close_at, resolves_at, status, sort_order
  )
  select
    'event'::text,
    seed.topic,
    seed.question,
    seed.outcome_label,
    seed.image_emoji,
    seed.subtitle,
    v_now,
    v_now + (seed.days_to_resolve * interval '1 day') * 0.75,
    v_now + (seed.days_to_resolve * interval '1 day'),
    'open'::text,
    seed.sort_order
  from (values
    -- topic, question, outcome_label, image, days_to_resolve, subtitle, sort_order
    ('Trump 2028',           'Trump candidat présidentielle US 2028 ?',                   null,                    '🇺🇸', 900, null,                  100),
    ('Trump Chine',          'Trump visitera-t-il la Chine en 2026 ?',                    '30 juin',               '🐉',  50,  'd''ici 30 juin',      95),
    ('Trump Chine',          'Trump visitera-t-il la Chine en 2026 ?',                    '31 décembre',           '🐉',  230, 'd''ici 31 décembre', 95),
    ('Élection US 2028',     'Vainqueur élection US 2028',                                'JD Vance',              '🐘',  900, 'Républicain',         90),
    ('Élection US 2028',     'Vainqueur élection US 2028',                                'Gavin Newsom',          '🫏',  900, 'Démocrate',           90),
    ('Élection US 2028',     'Vainqueur élection US 2028',                                'Marco Rubio',           '🐘',  900, 'Républicain',         90),
    ('Élection US 2028',     'Vainqueur élection US 2028',                                'Kamala Harris',         '🫏',  900, 'Démocrate',           90),
    ('Iran',                 'Cessez-le-feu permanent USA-Iran d''ici fin 2026 ?',         '31 décembre',           '☮️',  230, null,                  80),
    ('Iran',                 'Cessez-le-feu permanent USA-Iran d''ici 30 juin ?',          '30 juin',               '☮️',  50,  null,                  80),
    ('Iran',                 'Iran arrête enrichissement uranium d''ici 31 mai ?',         null,                    '☢️',  20,  null,                  78),
    ('Iran',                 'Iran ferme l''espace aérien d''ici 31 mai ?',                '31 mai',                '✈️',  20,  null,                  76),
    ('Iran',                 'Trafic Détroit d''Ormuz revient normal d''ici fin mai ?',    null,                    '🚢',  22,  null,                  74),
    ('Ukraine',              'Cessez-le-feu Russie-Ukraine d''ici 30 juin 2026 ?',          null,                    '🕊️',  50,  null,                  85),
    ('Ukraine',              'L''Ukraine rejoint l''OTAN en 2026 ?',                       null,                    '🛡️',  230, null,                  60),
    ('NBA Champion 2026',    'Champion NBA 2026',                                          'Oklahoma City Thunder', '🏀',  60,  null,                  70),
    ('NBA Champion 2026',    'Champion NBA 2026',                                          'Boston Celtics',         '🏀',  60,  null,                  70),
    ('NBA Champion 2026',    'Champion NBA 2026',                                          'Denver Nuggets',         '🏀',  60,  null,                  70),
    ('NBA Champion 2026',    'Champion NBA 2026',                                          'Los Angeles Lakers',     '🏀',  60,  null,                  70),
    ('NBA Champion 2026',    'Champion NBA 2026',                                          'San Antonio Spurs',      '🏀',  60,  null,                  70),
    ('NBA Champion 2026',    'Champion NBA 2026',                                          'New York Knicks',        '🏀',  60,  null,                  70),
    ('NBA · Knicks vs 76ers','Knicks vs 76ers',                                            'New York Knicks',        '🏀',  1,   'NBA · 01:00',         65),
    ('NBA · Cavs vs Pistons','Cavaliers vs Pistons',                                       'Cleveland Cavaliers',    '🏀',  1,   'NBA · 01:00',         65),
    ('UFC · Strickland vs Chimaev','Strickland vs Chimaev',                                'Khamzat Chimaev',        '🥊',  2,   'UFC · Demain 19:00',  60),
    ('Coupe du Monde 2026',  'Vainqueur Coupe du Monde FIFA 2026',                         'France',                 '⚽',  120, null,                  85),
    ('Coupe du Monde 2026',  'Vainqueur Coupe du Monde FIFA 2026',                         'Espagne',                '⚽',  120, null,                  85),
    ('Coupe du Monde 2026',  'Vainqueur Coupe du Monde FIFA 2026',                         'Brésil',                 '⚽',  120, null,                  85),
    ('Coupe du Monde 2026',  'Vainqueur Coupe du Monde FIFA 2026',                         'Argentine',              '⚽',  120, null,                  85),
    ('Musk vs Altman',       'Elon Musk gagne son procès contre Sam Altman ?',             null,                    '⚖️',  180, null,                  55),
    ('AI 2026',              'OpenAI annonce GPT-5 d''ici fin 2026 ?',                     null,                    '🤖',  230, null,                  50),
    ('AI 2026',              'AGI atteint d''ici fin 2026 (poll experts) ?',               null,                    '🧠',  230, null,                  50),
    ('GameStop',             'GameStop acquiert eBay en 2026 ?',                           null,                    '🎮',  180, null,                  45),
    ('Bitcoin Targets',      'Bitcoin atteint 150 000 $ d''ici 30 juin 2026 ?',             '30 juin',               '₿',   50,  null,                  90),
    ('Bitcoin Targets',      'Bitcoin atteint 150 000 $ d''ici 31 déc. 2026 ?',             '31 décembre',           '₿',   230, null,                  90),
    ('Bitcoin Targets',      'Bitcoin atteint 200 000 $ d''ici 31 déc. 2026 ?',             '31 décembre',           '₿',   230, null,                  88),
    ('Ethereum Targets',     'Ethereum atteint 5 000 $ d''ici 31 déc. 2026 ?',              null,                    'Ξ',   230, null,                  80),
    ('Ethereum Targets',     'Ethereum atteint 10 000 $ d''ici 31 déc. 2026 ?',             null,                    'Ξ',   230, null,                  75),
    ('Fed',                  'Fed coupe les taux de 25bp à la prochaine FOMC ?',           null,                    '🏦',  40,  null,                  70),
    ('Fed',                  'Fed coupe les taux de 50bp à la prochaine FOMC ?',           null,                    '🏦',  40,  null,                  65),
    ('Économie',             'Récession officielle USA déclarée d''ici fin 2026 ?',         null,                    '📉',  230, null,                  55),
    ('Économie',             'Inflation US sous 2% d''ici fin 2026 ?',                     null,                    '📊',  230, null,                  50),
    ('Pandémie',             'Pandémie de hantavirus déclarée OMS en 2026 ?',              null,                    '🦠',  230, null,                  30),
    ('Pandémie',             'Nouvelle pandémie OMS d''ici fin 2026 ?',                    null,                    '🦠',  230, null,                  25),
    ('Climat',               'Année 2026 plus chaude que 2024 (record global) ?',          null,                    '🔥',  230, null,                  40),
    ('Eurovision 2026',      'Vainqueur Eurovision 2026',                                  'France',                 '🎤',  5,   null,                  50),
    ('Eurovision 2026',      'Vainqueur Eurovision 2026',                                  'Finlande',               '🎤',  5,   null,                  50),
    ('Eurovision 2026',      'Vainqueur Eurovision 2026',                                  'Italie',                 '🎤',  5,   null,                  50),
    ('Eurovision 2026',      'Vainqueur Eurovision 2026',                                  'Suède',                  '🎤',  5,   null,                  50),
    ('SpaceX',               'SpaceX réussit Starship orbital recovery en 2026 ?',         null,                    '🚀',  230, null,                  60),
    ('SpaceX',               'Starlink annonce IPO en 2026 ?',                             null,                    '🛰️',  230, null,                  45),
    ('Aliens',               'USA confirme officiellement existence d''aliens en 2026 ?',  null,                    '👽',  230, null,                  18)
  ) as seed (topic, question, outcome_label, image_emoji, days_to_resolve, subtitle, sort_order)
  where not exists (
    select 1 from public.markets m
    where m.market_type = 'event'
      and m.topic = seed.topic
      and coalesce(m.outcome_label, '') = coalesce(seed.outcome_label, '')
      and abs(extract(epoch from (m.resolves_at - (v_now + (seed.days_to_resolve * interval '1 day'))))) < 86400
  );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.seed_demo_event_markets() to authenticated;

-- ---------------------------------------------------------------------------
-- 3. RPC : enrich_directional_markets — ajoute topic + emoji aux directional
-- ---------------------------------------------------------------------------

create or replace function public.enrich_directional_markets()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int := 0;
begin
  update markets m
  set topic = coalesce(m.topic, 'Crypto Live'),
      image_emoji = coalesce(m.image_emoji, case
        when a.id = 'BTC' then '₿'
        when a.id = 'ETH' then 'Ξ'
        when a.id = 'SOL' then '◎'
        when a.id = 'DOGE' then '🐕'
        when a.id = 'SHIB' then '🐕'
        when a.category = 'crypto' then '🪙'
        when a.category = 'stock' then '📈'
        when a.category = 'index' then '📊'
        when a.category = 'commodity' then '🛢️'
        when a.category = 'forex' then '💱'
        when a.category = 'risk' then '⚡'
        else '📈'
      end),
      sort_order = case
        when a.id = 'BTC' then 99
        when a.id = 'ETH' then 95
        when a.id = 'SOL' then 90
        else coalesce(m.sort_order, 50)
      end
  from assets a
  where m.asset_id = a.id
    and m.market_type = 'directional'
    and (m.topic is null or m.image_emoji is null);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.enrich_directional_markets() to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Mise à jour bootstrap_with_prices : enrichit + seed events automatiquement
-- ---------------------------------------------------------------------------

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
  v_events int := 0;
  v_enriched int := 0;
  v_item jsonb;
  v_asset_id text;
  v_price numeric;
  v_change numeric;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 1. Seed prix
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

  -- 2. Lifecycle markets directionnels
  v_locked := lock_due_markets();
  v_resolved := resolve_due_markets();
  v_opened := open_directional_markets();
  v_enriched := enrich_directional_markets();

  -- 3. Seed event markets (40+)
  v_events := seed_demo_event_markets();

  return jsonb_build_object(
    'seeded', v_seeded,
    'locked', v_locked,
    'resolved', v_resolved,
    'opened', v_opened,
    'enriched', v_enriched,
    'events', v_events
  );
end;
$$;

grant execute on function public.bootstrap_with_prices(jsonb) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Mise à jour place_bet : autorise event markets sans price_open
-- (les events n'ont pas de prix ; entry_price reste null, exit_price aussi)
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
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_stake < 10 then
    raise exception 'Minimum stake is 10';
  end if;
  if p_leverage < 1 or p_leverage > 10 then
    raise exception 'Leverage must be between 1 and 10';
  end if;
  if p_side not in ('UP', 'DOWN', 'YES', 'NO') then
    raise exception 'Invalid side: %', p_side;
  end if;

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

  insert into positions (user_id, market_id, side, stake, leverage, exposure, entry_price)
  values (v_user_id, p_market_id, p_side, p_stake, p_leverage, p_stake * p_leverage, v_market_price)
  returning id into v_position_id;

  if p_side in ('UP', 'YES') then
    update markets set total_up_stakes = total_up_stakes + p_stake where id = p_market_id;
  else
    update markets set total_down_stakes = total_down_stakes + p_stake where id = p_market_id;
  end if;

  update profiles
  set balance = balance - p_stake,
      total_trades = total_trades + 1,
      xp = xp + 10
  where id = v_user_id;

  insert into transactions (user_id, type, amount, balance_after, position_id)
  values (v_user_id, 'stake', -p_stake, v_balance - p_stake, v_position_id);

  return v_position_id;
end;
$$;
