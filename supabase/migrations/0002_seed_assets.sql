-- ============================================================================
-- PROPHET — Migration 0002 : Seed des 52 actifs négociables
-- 20 cryptos · 20 actions · 5 indices · 3 commodities · 3 forex · 1 risk
-- ============================================================================

-- Cryptos (CoinGecko, gratuit sans clé)
insert into public.assets (id, name, symbol, category, api_source, api_id, min_level) values
  ('BTC',   'Bitcoin',         'BTC',   'crypto', 'cg', 'bitcoin',          1),
  ('ETH',   'Ethereum',        'ETH',   'crypto', 'cg', 'ethereum',         1),
  ('BNB',   'BNB',             'BNB',   'crypto', 'cg', 'binancecoin',      1),
  ('SOL',   'Solana',          'SOL',   'crypto', 'cg', 'solana',           1),
  ('XRP',   'XRP',             'XRP',   'crypto', 'cg', 'ripple',           1),
  ('ADA',   'Cardano',         'ADA',   'crypto', 'cg', 'cardano',          1),
  ('AVAX',  'Avalanche',       'AVAX',  'crypto', 'cg', 'avalanche-2',      1),
  ('DOGE',  'Dogecoin',        'DOGE',  'crypto', 'cg', 'dogecoin',         1),
  ('TRX',   'TRON',            'TRX',   'crypto', 'cg', 'tron',             1),
  ('DOT',   'Polkadot',        'DOT',   'crypto', 'cg', 'polkadot',         1),
  ('LINK',  'Chainlink',       'LINK',  'crypto', 'cg', 'chainlink',        1),
  ('MATIC', 'Polygon (MATIC)', 'MATIC', 'crypto', 'cg', 'matic-network',    1),
  ('TON',   'Toncoin',         'TON',   'crypto', 'cg', 'the-open-network', 1),
  ('SHIB',  'Shiba Inu',       'SHIB',  'crypto', 'cg', 'shiba-inu',        1),
  ('LTC',   'Litecoin',        'LTC',   'crypto', 'cg', 'litecoin',         1),
  ('BCH',   'Bitcoin Cash',    'BCH',   'crypto', 'cg', 'bitcoin-cash',     1),
  ('NEAR',  'NEAR Protocol',   'NEAR',  'crypto', 'cg', 'near',             1),
  ('UNI',   'Uniswap',         'UNI',   'crypto', 'cg', 'uniswap',          1),
  ('ATOM',  'Cosmos',          'ATOM',  'crypto', 'cg', 'cosmos',           1),
  ('APT',   'Aptos',           'APT',   'crypto', 'cg', 'aptos',            1);

-- Top 20 actions US (Finnhub)
insert into public.assets (id, name, symbol, category, api_source, api_id, min_level) values
  ('AAPL',  'Apple',                'AAPL',  'stock', 'fh', 'AAPL',  1),
  ('MSFT',  'Microsoft',            'MSFT',  'stock', 'fh', 'MSFT',  1),
  ('NVDA',  'NVIDIA',               'NVDA',  'stock', 'fh', 'NVDA',  1),
  ('GOOGL', 'Alphabet',             'GOOGL', 'stock', 'fh', 'GOOGL', 1),
  ('AMZN',  'Amazon',               'AMZN',  'stock', 'fh', 'AMZN',  1),
  ('META',  'Meta Platforms',       'META',  'stock', 'fh', 'META',  1),
  ('TSLA',  'Tesla',                'TSLA',  'stock', 'fh', 'TSLA',  1),
  ('JPM',   'JPMorgan Chase',       'JPM',   'stock', 'fh', 'JPM',   1),
  ('V',     'Visa',                 'V',     'stock', 'fh', 'V',     1),
  ('WMT',   'Walmart',              'WMT',   'stock', 'fh', 'WMT',   1),
  ('XOM',   'ExxonMobil',           'XOM',   'stock', 'fh', 'XOM',   1),
  ('AVGO',  'Broadcom',             'AVGO',  'stock', 'fh', 'AVGO',  1),
  ('MA',    'Mastercard',           'MA',    'stock', 'fh', 'MA',    1),
  ('COST',  'Costco',               'COST',  'stock', 'fh', 'COST',  1),
  ('NFLX',  'Netflix',              'NFLX',  'stock', 'fh', 'NFLX',  1),
  ('AMD',   'AMD',                  'AMD',   'stock', 'fh', 'AMD',   1),
  ('COIN',  'Coinbase',             'COIN',  'stock', 'fh', 'COIN',  1),
  ('PLTR',  'Palantir',             'PLTR',  'stock', 'fh', 'PLTR',  1),
  ('MSTR',  'MicroStrategy',        'MSTR',  'stock', 'fh', 'MSTR',  1),
  ('BA',    'Boeing',               'BA',    'stock', 'fh', 'BA',    1);

-- Indices boursiers (TwelveData)
insert into public.assets (id, name, symbol, category, api_source, api_id, min_level) values
  ('SPX', 'S&P 500',         'SPX', 'index', 'td', 'SPX', 1),
  ('NDX', 'Nasdaq 100',      'NDX', 'index', 'td', 'NDX', 1),
  ('DJI', 'Dow Jones',       'DJI', 'index', 'td', 'DJI', 1),
  ('DAX', 'DAX 40',          'DAX', 'index', 'td', 'DAX', 1),
  ('CAC', 'CAC 40',          'CAC', 'index', 'td', 'CAC', 1);

-- Matières premières (TwelveData) — débloqué niveau 5
insert into public.assets (id, name, symbol, category, api_source, api_id, min_level) values
  ('XAU', 'Or',           'XAU/USD', 'commodity', 'td', 'XAU/USD', 5),
  ('XAG', 'Argent',       'XAG/USD', 'commodity', 'td', 'XAG/USD', 5),
  ('WTI', 'Pétrole WTI',  'WTI/USD', 'commodity', 'td', 'WTI/USD', 5);

-- Forex (TwelveData)
insert into public.assets (id, name, symbol, category, api_source, api_id, min_level) values
  ('EURUSD', 'Euro / Dollar',     'EUR/USD', 'forex', 'td', 'EUR/USD', 1),
  ('GBPUSD', 'Livre / Dollar',    'GBP/USD', 'forex', 'td', 'GBP/USD', 1),
  ('USDJPY', 'Dollar / Yen',      'USD/JPY', 'forex', 'td', 'USD/JPY', 1);

-- Indicateur de risque (TwelveData) — débloqué niveau 5
insert into public.assets (id, name, symbol, category, api_source, api_id, min_level) values
  ('VIX', 'Volatility Index', 'VIX', 'risk', 'td', 'VIX', 5);

-- Saison initiale (Q2 2026)
insert into public.seasons (name, start_date, end_date, active) values
  ('Saison 1 — Genesis', '2026-04-01', '2026-06-30', true);
