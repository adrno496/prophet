-- ============================================================================
-- PROPHET — Migration 0001 : Schéma initial
-- Tables, RLS, triggers, fonctions sécurisées (anti-cheat)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Extensions (gen_random_uuid disponible nativement en PG 13+ via pgcrypto)
-- ---------------------------------------------------------------------------
create extension if not exists pgcrypto;

-- ============================================================================
-- 1. TABLES
-- ============================================================================

-- Profils utilisateurs (étend auth.users)
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (
    length(username) between 3 and 12
    and username ~ '^[a-zA-Z0-9_]+$'
  ),
  balance numeric(15,2) default 1000.00 check (balance >= 0),
  level int default 1 check (level between 1 and 100),
  xp int default 0 check (xp >= 0),
  total_trades int default 0,
  wins int default 0,
  losses int default 0,
  liquidations_count int default 0,
  peak_balance numeric(15,2) default 1000.00,
  total_pnl numeric(15,2) default 0,
  country_code text check (country_code is null or length(country_code) = 2),
  is_premium boolean default false,
  preferred_lang text default 'auto' check (preferred_lang in ('auto','fr','en')),
  last_login timestamptz default now(),
  last_bonus_at timestamptz,
  created_at timestamptz default now()
);

-- Catalogue des actifs négociables (statique, seedé en 0002)
create table public.assets (
  id text primary key,
  name text not null,
  category text not null check (category in ('crypto','stock','index','commodity','forex','risk')),
  api_source text not null check (api_source in ('cg','fh','td','fmp','poly','fred')),
  api_id text not null,
  symbol text,
  active boolean default true,
  min_level int default 1
);
create index idx_assets_category on public.assets(category, active);

-- Snapshots de prix (insérés par edge function fetch_prices, Phase 2)
create table public.prices (
  id bigserial primary key,
  asset_id text not null references public.assets(id) on delete cascade,
  price numeric(20,8) not null check (price > 0),
  change_24h numeric(10,4),
  timestamp timestamptz default now()
);
create index idx_prices_asset_time on public.prices(asset_id, timestamp desc);

-- Marchés (directionnels avec timeframe ou événementiels)
create table public.markets (
  id uuid primary key default gen_random_uuid(),
  asset_id text references public.assets(id) on delete cascade,
  market_type text not null check (market_type in ('directional','event')),
  timeframe_minutes int check (timeframe_minutes is null or timeframe_minutes in (15,30,60,240,480,1440)),
  question text not null,
  opens_at timestamptz not null,
  stakes_close_at timestamptz not null,
  resolves_at timestamptz not null,
  price_open numeric(20,8),
  price_close numeric(20,8),
  outcome text check (outcome in ('UP','DOWN','YES','NO','CANCELLED')),
  status text default 'open' check (status in ('open','locked','resolved','cancelled')),
  total_up_stakes numeric(15,2) default 0,
  total_down_stakes numeric(15,2) default 0,
  resolved_at timestamptz,
  created_at timestamptz default now()
);
create index idx_markets_status on public.markets(status, resolves_at);
create index idx_markets_asset on public.markets(asset_id, status);
create index idx_markets_lock on public.markets(stakes_close_at) where status = 'open';
create index idx_markets_resolve on public.markets(resolves_at) where status = 'locked';

-- Positions (paris des utilisateurs)
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  market_id uuid not null references public.markets(id) on delete cascade,
  side text not null check (side in ('UP','DOWN','YES','NO')),
  stake numeric(15,2) not null check (stake >= 10),
  leverage int not null default 1 check (leverage between 1 and 10),
  entry_price numeric(20,8),
  exposure numeric(15,2) not null,
  exit_price numeric(20,8),
  move_pct numeric(10,4),
  pnl numeric(15,2),
  status text default 'open' check (status in ('open','won','lost','liquidated','cancelled')),
  created_at timestamptz default now(),
  resolved_at timestamptz
);
create index idx_positions_user on public.positions(user_id, created_at desc);
create index idx_positions_market on public.positions(market_id, status);
create index idx_positions_open on public.positions(market_id) where status = 'open';

-- Ledger des transactions (audit trail immuable)
create table public.transactions (
  id bigserial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in ('stake','win','loss','liquidation','bonus','reset','funding_fee')),
  amount numeric(15,2) not null,
  balance_after numeric(15,2),
  position_id uuid references public.positions(id) on delete set null,
  created_at timestamptz default now()
);
create index idx_transactions_user on public.transactions(user_id, created_at desc);

-- Saisons (trimestrielles, leaderboard reset)
create table public.seasons (
  id serial primary key,
  name text not null,
  start_date date not null,
  end_date date not null check (end_date > start_date),
  active boolean default false
);

-- Achievements (badges débloqués)
create table public.achievements (
  id serial primary key,
  user_id uuid not null references public.profiles(id) on delete cascade,
  code text not null,
  unlocked_at timestamptz default now(),
  unique (user_id, code)
);
create index idx_achievements_user on public.achievements(user_id);

-- Cache leaderboard (rebuild toutes les 5 min par edge function)
create table public.leaderboard_cache (
  rank_type text not null check (rank_type in ('balance','roi','winrate','sharpe')),
  rank int not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  username text not null,
  value numeric(15,4),
  updated_at timestamptz default now(),
  primary key (rank_type, rank)
);

-- ============================================================================
-- 2. ROW LEVEL SECURITY (RLS)
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.assets enable row level security;
alter table public.prices enable row level security;
alter table public.markets enable row level security;
alter table public.positions enable row level security;
alter table public.transactions enable row level security;
alter table public.seasons enable row level security;
alter table public.achievements enable row level security;
alter table public.leaderboard_cache enable row level security;

-- Profiles : lecture publique (leaderboard), écriture par owner uniquement
create policy "profiles_read_all" on public.profiles
  for select using (true);
create policy "profiles_update_self" on public.profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- Assets, markets, prices, seasons, achievements, leaderboard : lecture publique
create policy "assets_read_all" on public.assets for select using (true);
create policy "markets_read_all" on public.markets for select using (true);
create policy "prices_read_all" on public.prices for select using (true);
create policy "seasons_read_all" on public.seasons for select using (true);
create policy "achievements_read_all" on public.achievements for select using (true);
create policy "leaderboard_read_all" on public.leaderboard_cache for select using (true);

-- Positions : owner seul peut lire
create policy "positions_read_owner" on public.positions
  for select using (auth.uid() = user_id);

-- Transactions : owner seul peut lire
create policy "transactions_read_owner" on public.transactions
  for select using (auth.uid() = user_id);

-- ============================================================================
-- 3. COLUMN-LEVEL GRANTS (anti-cheat : balance/xp/level non mutables côté client)
-- ============================================================================

-- Profiles : interdiction totale d'INSERT/DELETE par client (trigger handle_new_user gère)
revoke insert, delete on public.profiles from anon, authenticated;
-- Profiles : UPDATE limité aux colonnes "safe" (username, country_code, preferred_lang)
revoke update on public.profiles from anon, authenticated;
grant update (username, country_code, preferred_lang) on public.profiles to authenticated;

-- Toutes les mutations sur positions/transactions/markets/prices/assets passent par RPC
revoke insert, update, delete on public.positions from anon, authenticated;
revoke insert, update, delete on public.transactions from anon, authenticated;
revoke insert, update, delete on public.markets from anon, authenticated;
revoke insert, update, delete on public.prices from anon, authenticated;
revoke insert, update, delete on public.assets from anon, authenticated;
revoke insert, update, delete on public.seasons from anon, authenticated;
revoke insert, update, delete on public.achievements from anon, authenticated;
revoke insert, update, delete on public.leaderboard_cache from anon, authenticated;

-- ============================================================================
-- 4. TRIGGERS UTILITAIRES
-- ============================================================================

-- Auto-create profile à la création d'un utilisateur auth (avec balance €1000)
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  -- Username basé sur l'UUID, garanti unique et conforme regex
  v_username := 'user_' || substring(replace(new.id::text, '-', ''), 1, 7);

  insert into public.profiles (id, username, balance, level, xp, last_login)
  values (new.id, v_username, 1000.00, 1, 0, now() - interval '1 day');
  -- last_login = hier permet au nouvel user de réclamer son bonus quotidien dès le 1er login

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Auto-update level quand xp change
create or replace function public.update_profile_level()
returns trigger
language plpgsql
as $$
begin
  new.level := case
    when new.xp >= 100000 then 50
    when new.xp >= 20000 then 20
    when new.xp >= 5000 then 10
    when new.xp >= 1000 then 5
    when new.xp >= 600 then 4
    when new.xp >= 300 then 3
    when new.xp >= 100 then 2
    else 1
  end;
  return new;
end;
$$;

create trigger trg_update_profile_level
  before update of xp on public.profiles
  for each row execute function public.update_profile_level();

-- Auto-update peak_balance quand balance augmente
create or replace function public.update_peak_balance()
returns trigger
language plpgsql
as $$
begin
  if new.balance > coalesce(old.peak_balance, 0) then
    new.peak_balance := new.balance;
  end if;
  return new;
end;
$$;

create trigger trg_update_peak_balance
  before update of balance on public.profiles
  for each row execute function public.update_peak_balance();

-- ============================================================================
-- 5. RPC : place_bet (ouvrir une position)
-- ============================================================================

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
  v_max_leverage int;
  v_position_id uuid;
begin
  -- Garde-fous d'authentification
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

  -- Vérifier le marché (statut + type cohérent avec side)
  select status, market_type, price_open
    into v_market_status, v_market_type, v_market_price
  from markets where id = p_market_id;

  if v_market_status is null then
    raise exception 'Market not found';
  end if;
  if v_market_status != 'open' then
    raise exception 'Market is %, cannot bet', v_market_status;
  end if;
  if v_market_type = 'directional' and p_side not in ('UP', 'DOWN') then
    raise exception 'Directional markets accept UP or DOWN only';
  end if;
  if v_market_type = 'event' and p_side not in ('YES', 'NO') then
    raise exception 'Event markets accept YES or NO only';
  end if;

  -- Lock de la balance (FOR UPDATE) et vérification levier ↔ niveau
  select
    balance,
    case when level >= 10 then 10 when level >= 5 then 5 else 2 end
    into v_balance, v_max_leverage
  from profiles where id = v_user_id for update;

  if v_balance < p_stake then
    raise exception 'Insufficient balance';
  end if;
  if p_leverage > v_max_leverage then
    raise exception 'Leverage % not unlocked at your level (max %)', p_leverage, v_max_leverage;
  end if;

  -- Insertion de la position
  insert into positions (user_id, market_id, side, stake, leverage, exposure, entry_price)
  values (v_user_id, p_market_id, p_side, p_stake, p_leverage, p_stake * p_leverage, v_market_price)
  returning id into v_position_id;

  -- Mise à jour des totaux du marché
  if p_side in ('UP', 'YES') then
    update markets set total_up_stakes = total_up_stakes + p_stake where id = p_market_id;
  else
    update markets set total_down_stakes = total_down_stakes + p_stake where id = p_market_id;
  end if;

  -- Déduction de la balance et incrément des compteurs
  update profiles
  set balance = balance - p_stake,
      total_trades = total_trades + 1,
      xp = xp + 10
  where id = v_user_id;

  -- Log audit trail
  insert into transactions (user_id, type, amount, balance_after, position_id)
  values (v_user_id, 'stake', -p_stake, v_balance - p_stake, v_position_id);

  return v_position_id;
end;
$$;

grant execute on function public.place_bet(uuid, text, numeric, int) to authenticated;

-- ============================================================================
-- 6. RPC : daily_bonus (+€10 une fois par jour calendaire UTC)
-- ============================================================================

create or replace function public.daily_bonus()
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_last_bonus timestamptz;
  v_balance numeric;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select last_bonus_at, balance
    into v_last_bonus, v_balance
  from profiles where id = v_user_id for update;

  -- Déjà réclamé aujourd'hui ?
  if v_last_bonus is not null
     and date_trunc('day', v_last_bonus) >= date_trunc('day', now()) then
    return 0;
  end if;

  update profiles
  set balance = balance + 10,
      last_bonus_at = now(),
      last_login = now()
  where id = v_user_id;

  insert into transactions (user_id, type, amount, balance_after)
  values (v_user_id, 'bonus', 10, v_balance + 10);

  return 10;
end;
$$;

grant execute on function public.daily_bonus() to authenticated;

-- ============================================================================
-- 7. RPC : reset_account (redémarrer à €1000 si balance < €100, cooldown 24h)
-- ============================================================================

create or replace function public.reset_account()
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_balance numeric;
  v_last_reset timestamptz;
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  select balance into v_balance
  from profiles where id = v_user_id for update;

  if v_balance > 100 then
    raise exception 'Reset only allowed when balance <= 100';
  end if;

  select max(created_at) into v_last_reset
  from transactions
  where user_id = v_user_id and type = 'reset';

  if v_last_reset is not null and v_last_reset > now() - interval '24 hours' then
    raise exception 'Reset cooldown active (24h between resets)';
  end if;

  update profiles
  set balance = 1000.00,
      liquidations_count = liquidations_count + 1
  where id = v_user_id;

  insert into transactions (user_id, type, amount, balance_after)
  values (v_user_id, 'reset', 1000.00 - v_balance, 1000.00);

  return true;
end;
$$;

grant execute on function public.reset_account() to authenticated;

-- ============================================================================
-- 8. RPC : resolve_position (système uniquement, utilisé par cron Phase 2+)
-- ============================================================================

create or replace function public.resolve_position(p_position_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pos record;
  v_market record;
  v_won boolean;
  v_pnl numeric;
  v_move_pct numeric;
  v_move_bonus numeric;
  v_balance numeric;
begin
  -- Récupérer position + marché
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
    return false; -- déjà résolue
  end if;

  -- Cas annulation (refund stake intégral)
  if v_pos.m_outcome = 'CANCELLED' then
    update profiles
    set balance = balance + v_pos.stake
    where id = v_pos.user_id;

    update positions
    set status = 'cancelled', resolved_at = now(), pnl = 0
    where id = p_position_id;

    select balance into v_balance from profiles where id = v_pos.user_id;
    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'win', v_pos.stake, v_balance, p_position_id);
    return true;
  end if;

  -- Calculer victoire et mouvement (%)
  v_won := (v_pos.side = v_pos.m_outcome);
  if v_pos.m_open > 0 and v_pos.m_close is not null then
    v_move_pct := (v_pos.m_close - v_pos.m_open) / v_pos.m_open * 100;
  else
    v_move_pct := 0;
  end if;

  if v_won then
    -- Bonus de mouvement : jusqu'à +50% du PnL si le mouvement dépasse 5%
    v_move_bonus := least(abs(v_move_pct) / 5.0, 1.0);
    v_pnl := round(v_pos.stake * v_pos.leverage * 0.95 * (1 + v_move_bonus * 0.5), 2);

    update profiles
    set balance = balance + v_pos.stake + v_pnl,
        wins = wins + 1,
        total_pnl = total_pnl + v_pnl,
        xp = xp + 25
    where id = v_pos.user_id;

    update positions
    set status = 'won', resolved_at = now(), exit_price = v_pos.m_close,
        move_pct = v_move_pct, pnl = v_pnl
    where id = p_position_id;

    select balance into v_balance from profiles where id = v_pos.user_id;
    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'win', v_pos.stake + v_pnl, v_balance, p_position_id);
  else
    -- Perte : la mise est déjà déduite, on logue juste le PnL négatif
    update profiles
    set losses = losses + 1,
        total_pnl = total_pnl - v_pos.stake
    where id = v_pos.user_id;

    update positions
    set status = 'lost', resolved_at = now(), exit_price = v_pos.m_close,
        move_pct = v_move_pct, pnl = -v_pos.stake
    where id = p_position_id;

    select balance into v_balance from profiles where id = v_pos.user_id;
    insert into transactions (user_id, type, amount, balance_after, position_id)
    values (v_pos.user_id, 'loss', -v_pos.stake, v_balance, p_position_id);
  end if;

  return true;
end;
$$;

revoke execute on function public.resolve_position(uuid) from anon, authenticated;
grant execute on function public.resolve_position(uuid) to service_role;

-- ============================================================================
-- 9. RPC : update_username (validation côté serveur)
-- ============================================================================

create or replace function public.update_username(p_username text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;
  if p_username !~ '^[a-zA-Z0-9_]{3,12}$' then
    raise exception 'Username must be 3-12 alphanumeric characters or underscore';
  end if;

  update profiles set username = p_username where id = v_user_id;
  return true;
exception
  when unique_violation then
    raise exception 'Username already taken';
end;
$$;

grant execute on function public.update_username(text) to authenticated;
